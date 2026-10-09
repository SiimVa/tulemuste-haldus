# Isolated staging load test

For the optimized public pages, set `LOAD_TEST_PUBLIC_REFRESH_MODE=json`.
The default `rsc` mode reproduces the earlier implementation for comparisons.
JSON mode still opens the real SSR pages once, then polls the same public
snapshot endpoints as the browser every 30 seconds. Organizer views retain
their existing RSC refreshes. Judge requests exercise the save endpoint;
lost-response retries and version conflicts are covered separately by the
PostgreSQL/browser regression tests.

This harness uses an isolated synthetic fixture with 100 teams, 20 checkpoints,
and 2,000 existing results. Production `matkamang.ee` and all of its subdomains
are always forbidden. Never point it at a database containing real competition
or participant data.

Set the exact staging origin and hostname. The fixture's `baseUrl` must match.
The explicit write switch authorizes saves only to the synthetic judge fixture.

```sh
export LOAD_TEST_BASE_URL=https://your-staging-host.up.railway.app
export LOAD_TEST_ALLOWED_HOST=your-staging-host.up.railway.app
export LOAD_TEST_ALLOW_WRITES=1
export LOAD_TEST_FIXTURE="$PWD/scripts/load-test/fixture-manifest.json"
# Optional when k6 is downloaded outside PATH:
export LOAD_TEST_K6_BINARY=/private/tmp/k6

node scripts/load-test/run.mjs smoke --check
node scripts/load-test/run.mjs smoke
# Review the smoke report and database verification before increasing load.
node scripts/load-test/run.mjs staged
```

`--check` validates the host guard, fixture, and workload without sending requests.
The manifest contains private judge tokens and must remain untracked. Reports
are saved under `scripts/load-test/artifacts/<UTC time>-<profile>/` by default;
`LOAD_TEST_REPORT_DIR` can choose an alternative directory.

## Workload

- **Smoke:** 8 public spectators and 2 judges, 90 seconds, 10 users in total.
- **Staged:** 10 → 50 → 100 → 300 public spectators and 20 judges, 750 seconds.
  Each smaller level includes a ramp and hold totaling 120 seconds; the final
  300-viewer level has a 60-second ramp and a 300-second hold.
  A 30-second ramp to zero completes the run.
- **Contention:** optional 10 simultaneous saves to the same checkpoint, one
  per worker, with distinct teams and the same checkpoint-scoped judge token.
  Run `node scripts/load-test/run.mjs contention` only after the main run and
  at least 61 seconds for the shared write-rate bucket to expire. This bounded
  probe has a 30-second maximum and does not repair or recalculate the results.
- Half the spectators use the public leaderboard and half the public dashboard.
  Each opens the actual SSR page once, then sends the Next `router.refresh()`
  RSC request every 30 seconds. Refreshes are staggered across users.
- Each judge has one stable checkpoint and distinct access token, opens its real
  judge page, then saves a new team result every 30 seconds. Saves are staggered
  across the 30-second interval. Every checkpoint/team pair is used once per run.
  A slow response does not trigger a burst of catch-up saves.
- Twenty judges generate about **40 writes/minute** from one client IP, within
  the anonymous API-write limit of 60/minute. Tokens do not bypass that shared
  limit. Spectators refresh public pages rather than polling the API leaderboard,
  whose anonymous read limit is 240/minute. The API is read only at preflight and
  postflight to check the full fixture's data shape.
- Preflight confirms both SSR and RSC pages, 100 leaderboard teams, all 20
  checkpoint scores for every team, and the expected unfrozen scoring mode.
  If it fails, the test stops before judge saves.

This measures server HTTP work, including database queries, public page
rendering, audit writes, and judge-triggered full-checkpoint score recomputation.
It does not measure browser asset loading, client rendering, or the latency of
many separate mobile networks.

## Results and stopping rules

`summary.json` contains aggregate k6 metrics, named route and load-stage p95/p99,
raw counts for 5xx, 429, timeouts, other transport errors, and incorrect 200
responses. `report.html` provides a local readable report without external
dependencies. Each successful judge response must return the matching team,
checkpoint, and field values. Safe acknowledgment records in `summary.writes`
permit separate database verification without recalculating or repairing scores.
`summary.attempts` also retains each attempted payload, HTTP status, and response
timestamp, including failed or ambiguous saves (a failed response may have
already persisted its result before score recomputation failed).
New attempts are recorded before sending HTTP. An aborted request retains
`startedAt`, `status: null`, `respondedAt: null`, and `inFlight: true`, so final
database verification can account for a save that persisted without a response.

Latency targets are p95 below 3 seconds and p99 below 8 seconds. The run aborts
after the initial 30-second load evaluation window if request errors reach 5%, data
correctness falls to 99%, any 429 occurs, five 5xx responses accumulate, or three
timeouts accumulate. Judge-page failure stops immediately. Latency threshold
failure is recorded while the run continues to collect evidence.
The coordinated setup wait is added to the abort delay, so waiting for the common
start does not consume the 30-second load grace period.

The runner disables inherited k6 debug/output integrations and HTTP log output.
Metrics exclude request URLs and error text, which can contain judge tokens.
Reports contain no tokens, response bodies, or participant details.

## Four simultaneous competitions

Schema version 2 contains four competition fixture envelopes. Each has 20 judge
tokens, 10 distinct real organizer users scoped to that competition, and 100,
150, or 200 synthetic teams. Organizer users have system role `USER` and native
competition membership role `ORGANIZER`. The private manifest contains their
genuine encrypted NextAuth session cookies; it does not contain the app secret.

Run **four separate generators**, each selecting one competition with
`LOAD_TEST_COMPETITION_INDEX=0`, `1`, `2`, or `3`. Each generator must have an
independent real outbound IP path. Do not run all four from one local IP:
80 judges produce 160 writes/minute, exceeding the shared anonymous limit of 60.
Each generator produces 40 judge writes/minute. Separate Railway service names
alone do not prove separate egress IPs; confirm trusted request fingerprints or
actual outbound assignments before the event. No IP headers are spoofed.

```sh
export LOAD_TEST_FIXTURE=/private/path/event-fixture-manifest.json
export LOAD_TEST_COMPETITION_INDEX=0
node scripts/load-test/run.mjs event-smoke --check
node scripts/load-test/run.mjs event-smoke

# Use exactly the same future UTC timestamp on all four deployed generators.
export LOAD_TEST_PLANNED_START_AT=2026-10-08T22:00:00Z
node scripts/load-test/run.mjs event --check
node scripts/load-test/run.mjs event
```

Choose a future start timestamp after all four services can complete preflight.
Preflight validates all 40 organizer sessions and competition access across the
four generators. Each waits for that common UTC instant before starting its VUs;
if preflight misses the instant by more than two seconds, it aborts before saves.
`plannedStartAt` and actual `loadStartedAt` in the reports make overlap measurable.

- **Event smoke per competition:** 6 spectators, 2 judges, 2 organizers for 90
  seconds (10 active users). All 10 organizer identities are checked in preflight.
- **Event per competition:** 25 → 75 → 150 spectators, 20 judges, 10 organizers.
  The 25 and 75 levels each take 120 seconds including ramp. The 150 level has
  a 60-second ramp and a 300-second hold, followed by a 30-second ramp down.
  Total duration is 630 seconds; all four together target 600 spectators,
  80 judges, and 40 organizers, or 720 simultaneous users.
- Organizer VUs use distinct private session cookies, open the actual internal
  statistics, results leaderboard, or competition home page, and refresh with
  RSC every 60 seconds. Statistics uses the page's real automatic 60-second
  cadence; results/home model manual organizer refreshes at that cadence.
  Every response must show the correct competition and synthetic organizer,
  use the expected content type, and contain no login/not-found redirect.
  Organizer activity is read-only. Client pages requiring API hydration are
  outside this organizer model.

Each summary contains only its selected competition ID and safe aggregates;
organizer cookies, names, emails, app secrets, and response bodies are excluded.
The verifier accepts concurrent summaries for different competition IDs while
rejecting overlapping runs against the same fixture competition.

## Database verification

Use the dedicated database variables required by `seed.mjs`. The verifier
checks the same database hostname, database name, and staging origin and never
uses `DATABASE_URL`. Every query runs inside a PostgreSQL read-only transaction.
Choose a new report filename for each invocation; output is created privately
with mode `0600` and existing files are rejected.

```sh
# Before the first request: initial raw values and all 2,000 scores.
node scripts/load-test/verify.mjs --report /private/tmp/load-test-baseline.json

# After reusing one fixture for sequential runs, supply all completed summaries.
node scripts/load-test/verify.mjs \
  --harness-summary scripts/load-test/artifacts/<smoke-run>/summary.json \
  --harness-summary scripts/load-test/artifacts/<staged-run>/summary.json \
  --report /private/tmp/load-test-final.json
```

The verifier independently sorts each checkpoint's results by hits descending
and elapsed time ascending, including shared ranks for exact ties. It compares
every computed score, checks counts, provenance, missing or duplicate rows, and
confirms acknowledged values were persisted within the run's time bounds. It
also identifies persisted requests that returned failures. Sequential run
summaries use the latest acknowledgment for a reused key; overlapping runs or
repeated keys inside a run are rejected because response order cannot establish
database commit order. Include the contention summary if that profile is run.

Reports include aggregate PostgreSQL database and table counters, connection
waits and locks, and result-change audit status and latency distributions. Compare
baseline and final cumulative counters without resetting PostgreSQL statistics.
`--stats-only` collects fixture counts and statistics without checking individual
values. Verification never recalculates scores or repairs the observed state.
