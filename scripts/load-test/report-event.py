#!/usr/bin/env python3
"""Build a public, allowlisted report from the four-competition load artifacts.

This script reads local JSON only. It never reads the private fixture manifest,
connects to the application/database, or includes request payloads or identities.
"""

import argparse
import html
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path


ROUTES = {
    "overview_ssr": "Avalik ülevaade · SSR",
    "overview_rsc": "Avalik ülevaade · RSC",
    "overview_json": "Avalik ülevaade · JSON värskendus",
    "leaderboard_ssr": "Edetabel · SSR",
    "leaderboard_rsc": "Edetabel · RSC",
    "leaderboard_json": "Edetabel · JSON värskendus",
    "judge_page": "Kohtuniku leht",
    "judge_save": "Tulemuse salvestus",
    "organizer_session": "Korraldaja sessiooni kontroll",
    "organizer_overview_ssr": "Korraldaja ülevaade · SSR",
    "organizer_overview_rsc": "Korraldaja ülevaade · RSC",
    "organizer_leaderboard_ssr": "Korraldaja edetabel · SSR",
    "organizer_leaderboard_rsc": "Korraldaja edetabel · RSC",
    "organizer_home_ssr": "Korraldaja avaleht · SSR",
    "organizer_home_rsc": "Korraldaja avaleht · RSC",
    "leaderboard_verify": "Edetabeli õigsuse kontroll",
}
STAGES = {"smoke": "Eeltest", "25": "25 vaatajat", "75": "75 vaatajat",
          "150": "150 vaatajat (tõus + hoidmine)", "cooldown": "Koormuse vähendamine"}
ISSUES = {
    "result_count", "computed_score_count", "duplicate_result", "foreign_result_identity",
    "unexpected_result_exception", "wrong_judge_provenance", "duplicate_computed_score",
    "orphan_computed_score", "missing_result", "missing_computed_score", "computed_score_value",
    "acknowledged_result_missing", "acknowledged_values_not_persisted",
    "acknowledged_write_outside_run_window", "changed_without_success_acknowledgment",
    "baseline_values_changed", "incomplete_result_audit",
}
SCORE_ISSUES = {"result_count", "computed_score_count", "duplicate_result", "duplicate_computed_score",
                "orphan_computed_score", "missing_result", "missing_computed_score", "computed_score_value"}
COUNTERS = {"requests": "http_reqs", "http5xx": "responses_5xx", "http429": "responses_429",
            "timeouts": "request_timeouts", "transportErrors": "transport_errors",
            "incorrect200": "correctness_failures", "fixtureValidationFailures": "fixture_validation_failures"}
DB_COUNTERS = ("xact_commit", "xact_rollback", "blks_read", "blks_hit", "tup_returned", "tup_fetched",
               "tup_inserted", "tup_updated", "tup_deleted", "conflicts", "temp_files", "temp_bytes", "deadlocks")


def number(value):
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def integer(value, default=None):
    value = number(value)
    return int(value) if value is not None and value >= 0 and value.is_integer() else default


def boolean(value):
    return value if isinstance(value, bool) else None


def instant(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except ValueError:
        return None


def timestamp(value):
    parsed = instant(value)
    return parsed.isoformat().replace("+00:00", "Z") if parsed else None


def load(path):
    if not path.is_file():
        return None
    with path.open(encoding="utf-8") as source:
        data = json.load(source)
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object in {path.name}")
    return data


def trend(metric):
    values = metric.get("values", {}) if isinstance(metric, dict) else {}
    return {key: number(values.get(source)) for key, source in
            (("p95Ms", "p(95)"), ("p99Ms", "p(99)"), ("averageMs", "avg"), ("maxMs", "max"))}


def measured_trend(metric):
    """Threshold-created empty k6 trends have zeros but no observations."""
    return any(value is not None and value > 0 for value in trend(metric).values())


def safe_thresholds(metrics):
    result = []
    allowed = set(COUNTERS.values()) | {"http_req_duration", "request_errors", "data_correct", "request_duration"}
    for name, metric in metrics.items():
        match = re.fullmatch(r"([a-z_]+)(?:\{(route|stage|phase):([a-z_0-9]+)\})?", name)
        if not match or not isinstance(metric, dict):
            continue
        base, kind, label = match.groups()
        if base not in allowed or (kind == "route" and label not in ROUTES) or (kind == "stage" and label not in STAGES) or (kind == "phase" and label != "load"):
            continue
        for expression, status in metric.get("thresholds", {}).items():
            if isinstance(status, dict) and status.get("ok") is False and re.fullmatch(r"(?:p\(\d+\)|count|rate|avg|max|min|value)\s*(?:<=|>=|==|<|>)\s*\d+(?:\.\d+)?", expression):
                result.append(f"{name}: {expression}")
    return sorted(result)


def summarize_run(raw, exit_raw, phase, index, baseline):
    expected_profile = "event-smoke" if phase == "smoke" else "event"
    metrics = raw.get("metrics", {})
    fixture = raw.get("fixture", {})
    plan = raw.get("plan", {})
    issues = []
    if raw.get("schemaVersion") != 2 or raw.get("profile") != expected_profile or fixture.get("competitionIndex") != index:
        issues.append("unexpected_fixture_or_profile")
    expected_roles = {"spectators": 6, "judges": 2, "organizers": 2} if phase == "smoke" else {"spectators": 150, "judges": 20, "organizers": 10}
    if any(integer(plan.get(key)) != value for key, value in expected_roles.items()) or any(integer(fixture.get(key)) != value for key, value in {"teams": 100, "elements": 20, "organizers": 10}.items()):
        issues.append("workload_or_fixture_counts_differ_from_scope")
    if baseline and raw.get("fixture", {}).get("runId") != baseline.get("runId"):
        issues.append("fixture_run_mismatch")
    start, finish = instant(raw.get("loadStartedAt")), instant(raw.get("finishedAt"))
    if start is None or finish is None or finish < start:
        issues.append("missing_or_invalid_load_timing")
    baseline_time = instant((baseline or {}).get("verifiedAt"))
    if start and baseline_time and start < baseline_time:
        issues.append("run_precedes_fresh_baseline")
    if not exit_raw:
        issues.append("missing_execution_inventory")
    elif exit_raw.get("duplicateExecutions") is True or len(exit_raw.get("loadStarted", [])) != 1 or len(exit_raw.get("ready", [])) != 1:
        issues.append("execution_inventory_not_single")
    stages = []
    for item in plan.get("stages", []):
        if isinstance(item, dict) and item.get("label") in STAGES:
            stages.append({"startSeconds": number(item.get("start")), "endSeconds": number(item.get("end")), "label": item["label"]})
    planned_seconds = max((item["endSeconds"] or 0 for item in stages), default=0)
    if planned_seconds != (90 if phase == "smoke" else 630):
        issues.append("planned_duration_differs_from_scope")
    if integer(plan.get("refreshSeconds")) != 30 or integer(plan.get("organizerRefreshSeconds")) != 60:
        issues.append("refresh_cadence_differs_from_scope")
    actual_seconds = (finish - start).total_seconds() if start and finish and finish >= start else None
    roles = {key: integer(plan.get(key)) for key in ("spectators", "judges", "organizers")}
    target = sum(roles.values()) if all(value is not None for value in roles.values()) else None
    peak = integer(metrics.get("vus", {}).get("values", {}).get("max"))
    routes, stage_metrics = {}, {}
    for name, metric in metrics.items():
        matched = re.fullmatch(r"request_duration\{(route|stage):([a-z_0-9]+)\}", name)
        if matched:
            kind, label = matched.groups()
            if kind == "route" and label in ROUTES and measured_trend(metric):
                routes[label] = trend(metric)
            elif kind == "stage" and label in STAGES and measured_trend(metric):
                stage_metrics[label] = trend(metric)
    attempts = raw.get("attempts", []) if isinstance(raw.get("attempts"), list) else []
    writes = raw.get("writes", []) if isinstance(raw.get("writes"), list) else []
    counts = {key: integer(metrics.get(metric, {}).get("values", {}).get("count")) for key, metric in COUNTERS.items()}
    counts.update({"acknowledgedSaves": len(writes), "saveAttempts": len(attempts),
                   "inFlightSaves": sum(item.get("inFlight") is True for item in attempts if isinstance(item, dict)),
                   "failedSaveResponses": sum(isinstance(item, dict) and item.get("status") not in (None, 200) for item in attempts)})
    status_counts = {}
    for item in attempts:
        if not isinstance(item, dict):
            continue
        key = "inFlight" if item.get("status") is None and item.get("inFlight") is True else str(item.get("status"))
        if key == "inFlight" or re.fullmatch(r"(?:0|[1-5]\d{2})", key):
            status_counts[key] = status_counts.get(key, 0) + 1
    refresh_mode = plan.get("publicRefreshMode")
    if refresh_mode not in ("json", "rsc"):
        observed_modes = {mode for mode in ("json", "rsc") if any(key.endswith("_" + mode) and not key.startswith("organizer_") for key in routes)}
        refresh_mode = next(iter(observed_modes)) if len(observed_modes) == 1 else None
    return {"competitionIndex": index, "phase": phase, "validForCapacity": not issues, "artifactIssues": issues,
            "passedThresholds": boolean(raw.get("passed")), "k6ExitCode": integer((exit_raw or {}).get("k6ExitCode")),
            "loadStartedAt": timestamp(raw.get("loadStartedAt")), "finishedAt": timestamp(raw.get("finishedAt")),
            "actualLoadSeconds": actual_seconds, "plannedLoadSeconds": planned_seconds or None,
            "durationConsistentWithPlan": actual_seconds is not None and planned_seconds > 0 and actual_seconds >= planned_seconds - 2,
            "durationIncludesPostflight": True, "continuousHoldProven": False,
            "plannedRoles": roles, "plannedUsers": target, "actualVusMax": peak,
            "publicRefreshMode": refresh_mode,
            "targetPeakObserved": peak is not None and target is not None and peak >= target,
            "fixtureCounts": {key: integer(fixture.get(key)) for key in ("teams", "elements", "organizers")},
            "counts": counts, "saveResponseStatusCounts": status_counts,
            "routes": routes, "stages": stage_metrics, "stagePlan": stages,
            "httpWaiting": trend(metrics.get("http_req_waiting")), "httpReceiving": trend(metrics.get("http_req_receiving")),
            "loadRequestDuration": trend(metrics.get("http_req_duration{phase:load}")),
            "receivedBytes": integer(metrics.get("data_received", {}).get("values", {}).get("count")),
            "failedThresholds": safe_thresholds(metrics)}


def summarize_phase(artifacts, phase, baseline):
    runs, missing = [], []
    for index in range(4):
        folder = artifacts / phase / f"c{index}"
        raw = load(folder / "summary.json")
        if raw is None:
            missing.append(index)
        else:
            runs.append(summarize_run(raw, load(folder / "exit-code.json"), phase, index, baseline))
    starts = [instant(run["loadStartedAt"]) for run in runs if run["loadStartedAt"]]
    synchronized_seconds = (max(starts) - min(starts)).total_seconds() if len(starts) == 4 else None
    counts = {key: sum(run["counts"][key] or 0 for run in runs) if runs and all(run["counts"][key] is not None for run in runs) else None
              for key in (*COUNTERS, "acknowledgedSaves", "saveAttempts", "inFlightSaves", "failedSaveResponses")}
    valid = len(runs) == 4 and all(run["validForCapacity"] for run in runs)
    completed = valid and all(run["durationConsistentWithPlan"] for run in runs)
    peaks = valid and all(run["targetPeakObserved"] for run in runs)
    return {"runs": runs, "missingCompetitions": missing, "validForCapacity": valid,
            "startSpreadSeconds": synchronized_seconds, "allDurationsConsistentWithPlan": completed,
            "allIndividualTargetsObserved": peaks, "synchronizedWithinTwoSeconds": synchronized_seconds is not None and synchronized_seconds <= 2,
            "simultaneousUserPeak": None, "simultaneousPeakEvidence": "No VU time series; individual maxima are not added.",
            "counts": counts}


def verification(raw):
    if raw is None:
        return {"available": False}
    counts = {key: integer(raw.get("counts", {}).get(key)) for key in
              ("competitions", "organizers", "organizerRoleAssignments", "teams", "elements", "judgeTokens", "results", "computedScores")}
    issue_counts = {key: integer(value) for key, value in raw.get("issueCounts", {}).items() if key in ISSUES}
    unknown_count = sum(integer(value, 0) for key, value in raw.get("issueCounts", {}).items() if key not in ISSUES)
    if unknown_count:
        issue_counts["other_verification_issues"] = unknown_count
    checked = integer(raw.get("checkedScores"))
    expected = counts["teams"] * 20 if counts["teams"] is not None else None
    numeric_correct = raw.get("mode") in ("baseline", "final") and expected is not None and checked == expected and counts["results"] == expected and counts["computedScores"] == expected and not unknown_count and not any(issue_counts.get(key, 0) for key in SCORE_ISSUES)
    scope_counts_match = all(counts.get(key) == value for key, value in {"competitions": 4, "teams": 400, "elements": 80, "judgeTokens": 80, "organizers": 40, "organizerRoleAssignments": 40, "results": 8000, "computedScores": 8000}.items())
    ack = raw.get("acknowledgmentVerification", {})
    ack_safe = {key: integer(ack.get(key)) for key in ("runCount", "attemptedRequests", "acknowledgedRequests", "acknowledgedWrites", "acknowledgedValuesChecked", "failedAttemptsPersisted", "inFlightAttemptsPersisted", "clockToleranceMs")}
    ack_safe["available"] = boolean(ack.get("available"))
    ack_safe["failedAttemptStatuses"] = {str(key): integer(value) for key, value in ack.get("failedAttemptStatuses", {}).items() if re.fullmatch(r"(?:0|[1-5]\d{2})", str(key))}
    identities = raw.get("statistics", {}).get("judgeClientIdentities", {})
    clients = {key: (boolean(identities.get(key)) if key in ("allCompetitionsObserved", "sharedAcrossCompetitions", "distinctClientsForAllCompetitions") else integer(identities.get(key))) for key in ("observedClientCount", "competitionsObserved", "allCompetitionsObserved", "sharedClientCountAcrossCompetitions", "sharedAcrossCompetitions", "distinctClientsForAllCompetitions")}
    audits = []
    for item in raw.get("statistics", {}).get("resultChangeAudit", []):
        if item.get("outcome") in ("SUCCEEDED", "FAILED", "STARTED", "DENIED", "RATE_LIMITED"):
            audits.append({"outcome": item["outcome"], **{key: number(item.get(key)) for key in ("status", "events", "timed_events", "mean_duration_ms", "p95_duration_ms", "p99_duration_ms", "max_duration_ms")}})
    organizers = {key: integer(raw.get("organizerVerification", {}).get(key)) for key in ("users", "members", "organizerRoleAssignments", "checkedAssignments")}
    return {"available": True, "passed": boolean(raw.get("passed")), "readOnly": boolean(raw.get("readOnly")),
            "verifiedAt": timestamp(raw.get("verifiedAt")), "counts": counts, "checkedScores": checked,
            "numericScoresCorrect": numeric_correct, "scopeCountsMatch": scope_counts_match, "changedResults": integer(raw.get("changedResults")),
            "issueCounts": issue_counts, "acknowledgments": ack_safe, "organizers": organizers,
            "judgeClientIdentities": clients, "resultChangeAudit": audits}


def resource(raw):
    if raw is None:
        return None
    cpu, memory = raw.get("cpu", {}), raw.get("memory", {})
    maximum, limit = number(cpu.get("max")), number(cpu.get("limit"))
    return {"window": {key: timestamp(raw.get("window", {}).get(key)) for key in ("since", "until")},
            "cpuAverageVcpu": number(cpu.get("average")), "cpuMaxVcpu": maximum, "cpuLimitVcpu": limit,
            "cpuMaxPercentOfLimit": maximum / limit * 100 if maximum is not None and limit else None,
            "memoryAverageMb": number(memory.get("average_mb")), "memoryMaxMb": number(memory.get("max_mb")), "memoryLimitMb": number(memory.get("limit_mb"))}


def source_evidence(raw):
    raw = raw or {}
    commit = raw.get("sourceCommit")
    return {"sourceCommit": commit if isinstance(commit, str) and re.fullmatch(r"[a-f0-9]{40}", commit) else None,
            "productionSourceParityVerified": boolean(raw.get("productionSourceParityVerified")),
            "applicationInstances": integer(raw.get("applicationInstances")),
            "applicationRegion": raw["applicationRegion"].lower() if isinstance(raw.get("applicationRegion"), str) and re.fullmatch(r"[a-zA-Z][a-zA-Z0-9-]{1,47}", raw["applicationRegion"]) else None,
            "generatorInstances": integer(raw.get("generatorInstances")),
            "syntheticDataOnly": boolean(raw.get("syntheticDataOnly"))}


def scope(metadata, phases):
    evidence = source_evidence(metadata)
    expected = (metadata or {}).get("expectedWorkload", {})
    # Workload defaults describe the authorized plan, never an achieved result.
    fields = {"competitionCount": ("competitions", 4), "teamsPerCompetition": ("teamsPerCompetition", 100),
              "checkpointsPerCompetition": ("checkpointsPerCompetition", 20),
              "viewersPerCompetition": ("viewersPerCompetition", 150), "judgesPerCompetition": ("judgesPerCompetition", 20),
              "organizersPerCompetition": ("organizersPerCompetition", 10)}
    result = {key: integer(expected.get(source), default) for key, (source, default) in fields.items()}
    count = result["competitionCount"]
    result.update({"expectedScores": count * result["teamsPerCompetition"] * result["checkpointsPerCompetition"],
                   "viewers": count * result["viewersPerCompetition"], "judges": count * result["judgesPerCompetition"],
                   "organizers": count * result["organizersPerCompetition"],
                   "publicRefreshSeconds": 30, "judgeWritesPerMinute": count * result["judgesPerCompetition"] * 2,
                   "organizerReadSeconds": 60, "generatorCount": evidence["generatorInstances"],
                   "appInstances": evidence["applicationInstances"], "appRegion": evidence["applicationRegion"],
                   "sourceRevision": evidence["sourceCommit"][:7] if evidence["sourceCommit"] else None})
    result["targetUsers"] = result["viewers"] + result["judges"] + result["organizers"]
    modes = {run["publicRefreshMode"] for phase in phases for run in phase["runs"] if run["publicRefreshMode"]}
    declared_mode = (metadata or {}).get("publicRefreshMode")
    if declared_mode in ("json", "rsc"):
        modes.add(declared_mode)
    result["publicRefreshMode"] = next(iter(modes)) if len(modes) == 1 else "mixed" if modes else None
    result["matchesAuthorizedWorkload"] = all(result[key] == default for key, (_, default) in fields.items())
    return result


def compare_previous(previous, current):
    if previous is None:
        return {"available": False}
    old_scope = previous.get("scope", {})
    fields = ("competitionCount", "teamsPerCompetition", "checkpointsPerCompetition", "targetUsers", "viewers", "judges", "organizers", "publicRefreshSeconds", "judgeWritesPerMinute", "organizerReadSeconds")
    old_scope_safe = {key: integer(old_scope.get(key)) for key in fields}
    revision = old_scope.get("sourceRevision")
    old_scope_safe["sourceRevision"] = revision if isinstance(revision, str) and re.fullmatch(r"[a-f0-9]{7,40}", revision) else None
    rows = []
    observed_modes = set()
    for run in previous.get("main", {}).get("runs", []):
        if run.get("competitionIndex") not in range(4):
            continue
        routes = {}
        for key, values in run.get("routes", {}).items():
            if key in ROUTES:
                routes[key] = {name: number(values.get(name)) for name in ("p95Ms", "p99Ms", "maxMs")}
                if key in ("overview_rsc", "leaderboard_rsc"):
                    observed_modes.add("rsc")
                if key in ("overview_json", "leaderboard_json"):
                    observed_modes.add("json")
        rows.append({"competitionIndex": run["competitionIndex"], "actualVusMax": integer(run.get("actualVusMax")),
                     "actualLoadSeconds": number(run.get("actualLoadSeconds")),
                     "passedThresholds": boolean(run.get("passedThresholds")),
                     "loadRequestDuration": {key: number(run.get("loadRequestDuration", {}).get(key)) for key in ("p95Ms", "p99Ms")},
                     "receivedBytes": integer(run.get("receivedBytes")), "routes": routes})
    declared = old_scope.get("publicRefreshMode")
    if declared in ("json", "rsc"):
        observed_modes.add(declared)
    old_mode = next(iter(observed_modes)) if len(observed_modes) == 1 else None
    old_scope_safe["publicRefreshMode"] = old_mode
    prior_counts = {key: integer(previous.get("main", {}).get("counts", {}).get(key)) for key in (*COUNTERS, "acknowledgedSaves", "saveAttempts", "inFlightSaves", "failedSaveResponses")}
    final = previous.get("finalVerification", {})
    return {"available": True, "samePlannedWorkload": all(old_scope_safe[key] is not None and old_scope_safe[key] == current["scope"].get(key) for key in fields),
            "samePublicRefreshProtocol": old_mode == current["scope"]["publicRefreshMode"] if old_mode and current["scope"]["publicRefreshMode"] in ("json", "rsc") else None,
            "scope": old_scope_safe, "runs": rows, "mainCounts": prior_counts,
            "finalVerification": {"passed": boolean(final.get("passed")), "numericScoresCorrect": boolean(final.get("numericScoresCorrect")),
                                  "checkedScores": integer(final.get("checkedScores")),
                                  "issueCounts": {key: integer(value) for key, value in final.get("issueCounts", {}).items() if key in ISSUES},
                                  "inFlightAttemptsPersisted": integer(final.get("acknowledgments", {}).get("inFlightAttemptsPersisted"))}}


def interior_resources(raw):
    result = []
    for item in (raw or {}).get("resources", []):
        if item.get("role") not in ("app", "database", "generator-1", "generator-2", "generator-3", "generator-4"):
            continue
        buckets = item.get("completeInteriorBuckets", {})
        result.append({"role": item["role"], "cpuAverageVcpu": number(buckets.get("cpuAverageVcpu")),
                       "bucketCount": integer(buckets.get("count")), "firstBucketAt": timestamp(buckets.get("first")),
                       "lastBucketAt": timestamp(buckets.get("last"))})
    return result


def database_delta(before, after):
    a = (before or {}).get("statistics", {}).get("database", {})
    b = (after or {}).get("statistics", {}).get("database", {})
    if not a or not b:
        return {"available": False}
    if a.get("stats_reset") != b.get("stats_reset"):
        return {"available": False, "reason": "statistics_reset_changed"}
    values = {}
    for key in DB_COUNTERS:
        first, final = integer(a.get(key)), integer(b.get(key))
        if first is not None and final is not None:
            if final < first:
                return {"available": False, "reason": "counter_decreased"}
            values[key] = final - first
    return {"available": bool(values), "values": values}


def cleanup(raw):
    if raw is None:
        return {"available": False}
    result = {"available": True}
    for key in ("completed", "temporaryVolumeDeleted", "temporaryEnvironmentDeleted", "productionLinkRestored", "productionDeploymentUnchanged", "productionHttpFollowsRedirects"):
        result[key] = boolean(raw.get(key))
    for key in ("temporaryServicesDeleted", "productionInitialHttpStatus", "productionHttpStatus"):
        result[key] = integer(raw.get(key))
    return result


def build(artifacts, comparison_path=None):
    baseline_raw = load(artifacts / "baseline.json")
    final_raw = load(artifacts / "final-verification.json")
    metadata = load(artifacts / "metadata.json")
    smoke = summarize_phase(artifacts, "smoke", baseline_raw)
    main_phase = summarize_phase(artifacts, "main", baseline_raw)
    result = {"schemaVersion": 1, "generatedAt": datetime.now(timezone.utc).isoformat(),
              "scope": scope(metadata, (smoke, main_phase)),
              "smoke": smoke, "main": main_phase,
              "baseline": verification(baseline_raw),
              "smokeVerification": verification(load(artifacts / "smoke-verification.json")),
              "finalVerification": verification(final_raw),
              "sourceEvidence": source_evidence(metadata),
              "databaseCounterDelta": database_delta(baseline_raw, final_raw),
              "resources": {service: {stage: resource(load(artifacts / f"{service}-{stage}.json")) for stage in ("before", "during", "final")} for service in ("app", "database")},
              "generatorResourcesFinal": [resource(item) for item in (load(artifacts / "generators-final.json") or {}).get("generators", [])[:4]],
              "interiorResourceObservations": interior_resources(load(artifacts / "observations-final.json")),
              "cleanup": cleanup(load(artifacts / "cleanup.json")),
              "excludedInvalidSmoke": (artifacts / "invalid-smoke-duplicate").exists()}
    final_ack = result["finalVerification"].get("acknowledgments", {})
    summaries = [run for phase in ("smoke", "main") for run in result[phase]["runs"]]
    client_attempts = sum(run["counts"]["saveAttempts"] for run in summaries)
    client_acks = sum(run["counts"]["acknowledgedSaves"] for run in summaries)
    result["acknowledgmentCoverage"] = {"summaryCount": len(summaries), "summaryAttempts": client_attempts, "summaryAcknowledgments": client_acks,
        "verifierIncludesAllSummaries": final_ack.get("available") is True and final_ack.get("runCount") == len(summaries) and final_ack.get("attemptedRequests") == client_attempts and final_ack.get("acknowledgedRequests") == client_acks}
    result["comparison"] = compare_previous(load(comparison_path) if comparison_path else None, result)
    return result


def esc(value):
    return html.escape(str(value))


def fmt(value, digits=0):
    if value is None:
        return "—"
    return f"{value:,.{digits}f}".replace(",", " ").replace(".", ",")


def yes(value):
    return "jah" if value is True else "ei" if value is False else "—"


def table(headers, rows):
    return '<div class="table-wrap"><table><thead><tr>' + "".join(f"<th>{esc(cell)}</th>" for cell in headers) + '</tr></thead><tbody>' + "".join("<tr>" + "".join(f"<td>{esc(cell)}</td>" for cell in row) + "</tr>" for row in rows) + '</tbody></table></div>'


def phase_html(phase, label):
    pieces = [f"<h2>{esc(label)}</h2>"]
    if not phase["runs"]:
        return "".join(pieces) + "<p>Kehtivad mõõtefailid puuduvad.</p>"
    rows = []
    for run in phase["runs"]:
        c = run["counts"]
        rows.append([f"Võistlus {run['competitionIndex'] + 1}", fmt(run["plannedUsers"]), fmt(run["actualVusMax"]),
                     fmt(run["actualLoadSeconds"], 1), f"{yes(run['durationConsistentWithPlan'])} / {yes(run['passedThresholds'])}",
                     fmt(c["requests"]), fmt(c["acknowledgedSaves"]), f"{fmt(c['http5xx'])} / {fmt(c['http429'])} / {fmt(c['timeouts'])}"])
    pieces.append(table(["Võistlus", "Plaan VU", "Mõõdetud VU max", "Mõõteintervall s", "Kestus plaaniga kooskõlas / lävendid", "HTTP", "Salvestusi 200", "5xx / 429 / aegumine"], rows))
    c = phase["counts"]
    pieces.append(f"<p>Olemasolevates kokkuvõtetes {fmt(c['requests'])} HTTP päringut, {fmt(c['acknowledgedSaves'])} kinnitatud salvestust; "
                  f"5xx {fmt(c['http5xx'])}, 429 {fmt(c['http429'])}, aegumisi {fmt(c['timeouts'])}, "
                  f"muid ühendusvigu {fmt(c['transportErrors'])}, vigase sisuga 200 vastuseid {fmt(c['incorrect200'])}. "
                  f"Alguste vahe {fmt(phase['startSpreadSeconds'], 3)} s.</p>")
    pieces.append(f"<p>Salvestuste katseid {fmt(c['saveAttempts'])}: kinnitatud 200 vastuseid {fmt(c['acknowledgedSaves'])}, "
                  f"kliendini jõudnud tõrkevastuseid {fmt(c['failedSaveResponses'])}, katkestamisel vastuseta pooleliolevaid katseid {fmt(c['inFlightSaves'])}. "
                  "Pooleliolev katse ei ole API tõrkevastus; selle lõplik püsimine kontrollitakse andmebaasis.</p>")
    if c["timeouts"] and c["failedSaveResponses"] == 0:
        pieces.append("<p>Registreeritud aegumised olid lugemispäringutes; kliendi kokkuvõttes lõpetatud salvestuskatsetel tõrkevastuseid ei olnud.</p>")
    if phase["allDurationsConsistentWithPlan"] and phase["allIndividualTargetsObserved"] and phase["synchronizedWithinTwoSeconds"]:
        pieces.append("<p>Nelja jooksu mõõteintervall vastab plaanitud kestusele ja igas võistluses mõõdeti plaanitud kasutajate tipp. "
                      "Lõpukontroll sisaldub intervallis; pideva hoidmise aegrea puudumisel ei liideta üksikuid tippe mõõdetud samaaegseks kogukoormuseks.</p>")
    else:
        pieces.append("<p>Nelja võistluse täielik sihtkoormus ei ole nende failidega tõendatud. Üksikute võistluste tippe ei liideta samaaegseks kogutipuks.</p>")
    if phase["runs"] and phase["runs"][0]["phase"] == "main" and all("75" in run["stages"] and "150" not in run["stages"] for run in phase["runs"]):
        pieces.append("<p class='warn'>Kõik jooksud katkestati 25 → 75 vaataja tõusus. 75 vaataja täielikku hoidmist ega 150 vaataja etappi ei läbitud. "
                      "Lävenditest tekkinud tühjad etapi mõõdikud on välja jäetud; mõõtmata etapp ei ole 0 ms tulemus.</p>")
    invalid = [f"võistlus {run['competitionIndex'] + 1}: {', '.join(run['artifactIssues'])}" for run in phase["runs"] if run["artifactIssues"]]
    if phase["missingCompetitions"]:
        invalid.append("puuduvad võistlused " + ", ".join(str(index + 1) for index in phase["missingCompetitions"]))
    if invalid:
        pieces.append(f"<p class='warn'>Andmestiku piirang: {esc('; '.join(invalid))}.</p>")
    for kind, labels in (("routes", ROUTES), ("stages", STAGES)):
        measured = [key for key in labels if any(key in run[kind] for run in phase["runs"])]
        if not measured:
            continue
        rows = []
        by_index = {run["competitionIndex"]: run for run in phase["runs"]}
        for key in measured:
            row = [labels[key]]
            for index in range(4):
                value = by_index.get(index, {}).get(kind, {}).get(key, {})
                row.append(f"{fmt(value.get('p95Ms'))} / {fmt(value.get('p99Ms'))}")
            rows.append(row)
        pieces.append(f"<h3>{'Teekonnad' if kind == 'routes' else 'Etapid'} · p95 / p99, ms</h3>")
        pieces.append(table(["Vaade" if kind == "routes" else "Vaatajate etapp", "Võistlus 1", "Võistlus 2", "Võistlus 3", "Võistlus 4"], rows))
    rows = [[f"Võistlus {run['competitionIndex'] + 1}", f"{fmt(run['loadRequestDuration']['p95Ms'])} / {fmt(run['loadRequestDuration']['p99Ms'])}",
             fmt(run["httpWaiting"]["p95Ms"]), fmt(run["httpReceiving"]["p99Ms"]), fmt(run["receivedBytes"] / 1_000_000 if run["receivedBytes"] is not None else None, 1)] for run in phase["runs"]]
    pieces.append(table(["Ülekande diagnostika", "Ainult koormusfaas p95 / p99, ms", "HTTP waiting p95, ms", "HTTP receiving p99, ms", "Vastuvõetud MB"], rows))
    failed = [(f"Võistlus {run['competitionIndex'] + 1}", "; ".join(run["failedThresholds"])) for run in phase["runs"] if run["failedThresholds"]]
    if failed:
        pieces.append("<details><summary>Ebaõnnestunud lävendid</summary>" + table(["Võistlus", "Lävend"], failed) + "</details>")
    return "".join(pieces)


def comparison_html(result):
    comparison = result["comparison"]
    if not comparison["available"]:
        return ""
    old, current = comparison["scope"], result["scope"]
    pieces = ["<h2>Võrdlus varasema testiga</h2>",
              f"<p>Varasem lähtekood {esc(old.get('sourceRevision') or '—')}; praegune {esc(current.get('sourceRevision') or '—')}. "
              f"Sama plaanitud võistluste, tiimide, rollide ja värskendussageduste koormus: {yes(comparison['samePlannedWorkload'])}. "
              f"Sama avaliku värskenduse protokoll: {yes(comparison['samePublicRefreshProtocol'])}.</p>"]
    if old["publicRefreshMode"] == "rsc" and current["publicRefreshMode"] == "json":
        pieces.append("<p>Varasem test laadis avaliku vaate RSC värskendusi; uus kasutab kompaktset JSON värskendust. "
                      "Kasutaja tegevus ja 30 s värskendusrütm on samad, kuid HTTP protokoll ja vastuse maht on muutunud. "
                      "See on muudetud rakenduse kasutuskoormuse võrdlus, mitte sama võrgupäringu kordusmõõtmine.</p>")
    elif current["publicRefreshMode"] is None:
        pieces.append("<p>Uue jooksu värskendusprotokoll ja tulemus ootavad metadata ning mõõtefaile; paranemist ei saa veel kinnitada.</p>")
    rows = []
    for label, counts in (("Varasem põhitest", comparison["mainCounts"]), ("Uus põhitest", result["main"]["counts"])):
        rows.append([label, fmt(counts.get("requests")), fmt(counts.get("acknowledgedSaves")), fmt(counts.get("inFlightSaves")),
                     f"{fmt(counts.get('http5xx'))} / {fmt(counts.get('http429'))} / {fmt(counts.get('timeouts'))}"])
    pieces.append(table(["Jooks", "HTTP päringuid", "Salvestusi 200", "Vastuseta katseid", "5xx / 429 / aegumine"], rows))
    old_runs = {run["competitionIndex"]: run for run in comparison["runs"]}
    new_runs = {run["competitionIndex"]: run for run in result["main"]["runs"]}
    rows = []
    for index in range(4):
        before, after = old_runs.get(index, {}), new_runs.get(index, {})
        rows.append([f"Võistlus {index + 1}", fmt(before.get("actualVusMax")), fmt(after.get("actualVusMax")),
                     f"{fmt(before.get('loadRequestDuration', {}).get('p95Ms'))} / {fmt(before.get('loadRequestDuration', {}).get('p99Ms'))}",
                     f"{fmt(after.get('loadRequestDuration', {}).get('p95Ms'))} / {fmt(after.get('loadRequestDuration', {}).get('p99Ms'))}"])
    pieces.append(table(["Võistlus", "Varasem VU max", "Uus VU max", "Varasem koormus p95 / p99, ms", "Uus koormus p95 / p99, ms"], rows))
    final = comparison["finalVerification"]
    pieces.append(f"<p>Varasemas testis sõltumatult kontrollitud punkte {fmt(final['checkedScores'])}, arvväärtused õiged {yes(final['numericScoresCorrect'])}, "
                  f"kõik kinnituspõhised kontrollid läbisid {yes(final['passed'])}; vastuseta katsetest püsinud kirjutusi {fmt(final['inFlightAttemptsPersisted'])}. "
                  "Vastuseta kirjutus ja vigane punktiarvutus on eri küsimused; uue jooksu lõppkontroll on esitatud eraldi.</p>")
    return "".join(pieces)


def render(result):
    final, smoke = result["finalVerification"], result["smokeVerification"]
    main = result["main"]
    tested_scope = result["scope"]
    refresh_mode = tested_scope["publicRefreshMode"]
    if refresh_mode == "json":
        public_workload = f"Avaliku lehe esimene laadimine on SSR; seejärel kompaktne JSON värskendus iga {fmt(tested_scope['publicRefreshSeconds'])} s."
    elif refresh_mode == "rsc":
        public_workload = f"Avalikud SSR lehed ja RSC värskendus iga {fmt(tested_scope['publicRefreshSeconds'])} s."
    else:
        public_workload = "Avaliku värskenduse protokoll ootab mõõtefailide kinnitust." if refresh_mode is None else "Mõõtefailides on eri avaliku värskenduse protokollid."
    successful_run = main["validForCapacity"] and main["allDurationsConsistentWithPlan"] and main["allIndividualTargetsObserved"] and all(run["passedThresholds"] is True and run["k6ExitCode"] == 0 for run in main["runs"]) and tested_scope["matchesAuthorizedWorkload"] and refresh_mode in ("json", "rsc") and result["baseline"].get("passed") is True and final.get("passed") is True and final.get("scopeCountsMatch") is True and smoke.get("judgeClientIdentities", {}).get("distinctClientsForAllCompetitions") is True and result["acknowledgmentCoverage"]["verifierIncludesAllSummaries"]
    if main["validForCapacity"] and not main["allIndividualTargetsObserved"]:
        headline = "Sihtkoormus jäi saavutamata"
        outcome = "Põhitesti mõõdetud tipud jäid igas võistluses alla 180 kasutaja. Lõppseisu punktid ja kirjutuste püsimine kontrollitakse eraldi."
    elif not final["available"] or not main["runs"]:
        headline = "Lõpptulemus ootab mõõtefaile"
        outcome = "Raport näitab olemasolevaid andmeid; lõpetamata kontrolli ei käsitleta edukana."
    elif successful_run:
        headline = "Neli koormusprofiili ja andmekontroll läbisid testi"
        outcome = "Iga võistluse plaanitud 180 kasutaja profiil lõpetati. Tulemuste koondhinnang kehtib allpool kirjeldatud HTTP töökoormusele."
    else:
        headline = "Koormustest tuvastas piiranguid"
        outcome = "Lävendite, koormusprofiili ja andmekontrolli tulemused on allpool eraldi, et osaline edu ei varjaks tõrkeid."
    pieces = ["<!doctype html><html lang='et'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
              "<title>Matkamäng · nelja võistluse koormustest</title><style>"
              "body{font:16px/1.55 system-ui,sans-serif;margin:0;background:#f5f7fa;color:#172638}main{max-width:1180px;margin:32px auto;padding:24px;background:white;border-radius:12px}"
              "h1{font-size:30px;line-height:1.2}h2{margin-top:34px;font-size:23px}h3{font-size:17px;margin-top:24px}.lead{font-size:18px}.muted{color:#526276}.warn{color:#984619}"
              ".table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}th,td{text-align:right;padding:9px;border-bottom:1px solid #dfe5ed;vertical-align:top}"
              "th:first-child,td:first-child{text-align:left}th{background:#edf2f8}details{margin:18px 0}footer{margin-top:30px;color:#526276;font-size:13px}li{margin:8px 0}@media(max-width:600px){main{margin:0;padding:18px;border-radius:0}h1{font-size:25px}td,th{min-width:85px}}"
              "</style></head><body><main><h1>Matkamäng: neli samaaegset võistlust</h1>",
              f"<p class='lead'><strong>{esc(headline)}.</strong> {esc(outcome)}</p>",
              f"<p>Testitud lähtekood {esc(tested_scope['sourceRevision'] or '—')}; Railway rakendusinstantse {fmt(tested_scope['appInstances'])}, "
              f"piirkond {esc(tested_scope['appRegion'] or '—')}, eraldi sünteetiline andmebaas. "
              f"Plaanitud võistlusi {fmt(tested_scope['competitionCount'])}, igaühes {fmt(tested_scope['teamsPerCompetition'])} tiimi ja "
              f"{fmt(tested_scope['checkpointsPerCompetition'])} kontrollpunkti: kokku {fmt(tested_scope['expectedScores'])} tulemust ning arvutatud punktisummat.</p>",
              f"<p>Siht: {fmt(tested_scope['viewers'])} vaatajat, {fmt(tested_scope['judges'])} kohtunikku ja {fmt(tested_scope['organizers'])} korraldajat "
              f"({fmt(tested_scope['targetUsers'])} kasutajat). Võistluse kohta {fmt(tested_scope['viewersPerCompetition'])} + "
              f"{fmt(tested_scope['judgesPerCompetition'])} + {fmt(tested_scope['organizersPerCompetition'])}. {esc(public_workload)} "
              f"Iga kohtunik salvestab kaks korda minutis (kokku {fmt(tested_scope['judgeWritesPerMinute'])}/min). "
              f"Korraldaja olemasoleva sessiooniga lugemisvaated iga {fmt(tested_scope['organizerReadSeconds'])} s; sisselogimise ega korraldaja muutmiste koormust ei mõõdetud. "
              f"Piirkondlikke generaatoreid {fmt(tested_scope['generatorCount'])}, üks võistlus generaatori kohta, ilma kliendi IP päiste võltsimiseta.</p>",
              "<p class='muted'>VU on k6 aktiivne virtuaalkasutaja, sealhulgas päringute vahel ootav kasutaja. Koormuse kestus on loadStartedAt → finishedAt; "
              "käivituse sünkroonvärava ooteaeg on välja jäetud. Intervall sisaldab lõpus päringute lõpetamist ja edetabeli õigsuse järelkontrolli; "
              "see ei ole katkematu tippkoormuse hoidmise tõend. "
              "HTTP koguarvud ning teekonna ja ülekande protsentiilid sisaldavad ka eel- ja järelkontrolli. "
              "Ainult koormusfaasi p95/p99 on eraldi; etapimõõdikud on koormusfaasist. "
              "Päringukiirust ei arvutata sünkroonvärava ooteaega sisaldavast k6 keskmisest. "
              "p95/p99 on iga võistluse eraldi jaotuse protsentiilid; neid ei keskmistata.</p>"]
    if result["excludedInvalidSmoke"]:
        pieces.append("<p class='muted'>Esimene eeltest jäeti koormusjäreldustest välja: igal generaatoril jäi alles teine konteiner, mistõttu koormus dubleerus. "
                      "See jooks arhiveeriti eraldi ning sünteetiline andmestik lähtestati enne uut eeltesti.</p>")
    pieces.extend([phase_html(result["smoke"], "Eeltest"), phase_html(main, "Põhitest"), comparison_html(result)])
    pieces.append("<h2>Andmete sõltumatu kontroll</h2>")
    rows = []
    for label, report in (("Algseis", result["baseline"]), ("Eeltesti järel", smoke), ("Lõppseis", final)):
        c = report.get("counts", {})
        rows.append([label, fmt(c.get("results")), fmt(c.get("computedScores")), fmt(report.get("checkedScores")), yes(report.get("numericScoresCorrect")), yes(report.get("passed"))])
    pieces.append(table(["Kontroll", "Tulemusi", "Punktiridu", "Sõltumatult arvutatud", "Arvväärtused õiged", "Kõik kontrollid läbisid"], rows))
    identities = smoke.get("judgeClientIdentities", {})
    pieces.append(f"<p>Eeltesti serveriaudit: eristuvaid kliendiidentiteete {fmt(identities.get('observedClientCount'))}; "
                  f"kõik neli võistlust nähtud {yes(identities.get('allCompetitionsObserved'))}; võistluste vahel jagatud identiteet "
                  f"{yes(identities.get('sharedAcrossCompetitions'))}; eraldi kliendid kõigil neljal {yes(identities.get('distinctClientsForAllCompetitions'))}. "
                  "Kontroll kasutab Railway serva tegelikust IP-st arvutatud serveripoolset pseudonüümi; IP-sid ega sõrmejälgi raportis ei avaldata.</p>")
    if final["available"]:
        ack = final["acknowledgments"]
        pieces.append(f"<p>Lõppkontroll: HTTP katseid {fmt(ack.get('attemptedRequests'))}, kliendi kinnitatud salvestusi {fmt(ack.get('acknowledgedRequests'))}, "
                      f"kontrollitud viimaseid kinnitatud väärtusi {fmt(ack.get('acknowledgedValuesChecked'))}; "
                      f"ebaõnnestunud vastusega siiski andmebaasi jõudnud katseid {fmt(ack.get('failedAttemptsPersisted'))}, "
                      f"vastuseta pooleliolevate katsete väärtusi {fmt(ack.get('inFlightAttemptsPersisted'))}. "
                      f"Kõik värsked kokkuvõtted lõppkontrollis {yes(result['acknowledgmentCoverage']['verifierIncludesAllSummaries'])}. "
                      "Arvväärtuste kontroll arvutab suhtelise järjestuse kõigist lõplikest toorväärtustest uuesti; andmeid ei parandata ega arvutata rakenduse kaudu ümber.</p>")
        if final["issueCounts"]:
            pieces.append(table(["Kontrolli kõrvalekalle", "Arv"], [(key, fmt(value)) for key, value in sorted(final["issueCounts"].items())]))
        if final["resultChangeAudit"]:
            pieces.append(table(["Salvestuse serveriaudit", "HTTP", "Kirjeid", "p95, ms", "p99, ms"],
                                [[item["outcome"], fmt(item["status"]), fmt(item["events"]), fmt(item["p95_duration_ms"]), fmt(item["p99_duration_ms"])] for item in final["resultChangeAudit"]]))
        if (ack.get("inFlightAttemptsPersisted") or 0) > 0:
            pieces.append(f"<p>Katkestamise hetkel vastuseta olnud katsetest jõudis {fmt(ack['inFlightAttemptsPersisted'])} kirjutust andmebaasi. "
                          "Kliendi eduka vastuse kinnitus puudub, kuid lõplikud toorväärtused on andmebaasis olemas. "
                          "Seetõttu jääb range kinnituspõhine kontroll ebaõnnestunuks; see ei muuda sõltumatu punktiarvutuse tulemust. "
                          "Serveriauditi 400 vastuste täpset põhjust olemasolevad andmed ei tõenda.</p>")
        if (ack.get("failedAttemptsPersisted") or 0) > 0:
            pieces.append("<p class='warn'>Osa API tõrkevastusega salvestusi muutis siiski toorväärtusi. Hilisem tõrkevastusega kirjutus võib varasema kinnitatud väärtuse üle kirjutada; "
                          "selline lõppseisu erinevus ei tõenda, et varasem edukas salvestus jäi tegemata.</p>")
        if final.get("issueCounts", {}).get("changed_without_success_acknowledgment", 0):
            pieces.append("<p class='warn'>Leiti muutusi ilma kliendi eduka vastuse kinnituseta. Testi katkestamisel võib pooleliolev päring serveris lõpetada; "
                          "kliendi kokkuvõte üksi ei tõenda selle muutuse põhjust ega andmeriket.</p>")
        org = final.get("organizers", {})
        pieces.append(f"<p>Korraldajad: kasutajaid {fmt(org.get('users'))}, liikmeid {fmt(org.get('members'))}, ORGANIZER rolle {fmt(org.get('organizerRoleAssignments'))}, "
                      f"kontrollitud seoseid {fmt(org.get('checkedAssignments'))}. Isikuandmed ja sessioonid on välja jäetud.</p>")
    pieces.append("<h2>Ressursid ja piirangud</h2>")
    rows = []
    for service, label in (("app", "Rakendus"), ("database", "Andmebaas")):
        for stage, stage_label in (("before", "enne"), ("during", "põhitesti osaken"), ("final", "põhitesti täisaken")):
            item = result["resources"][service][stage]
            if item:
                rows.append([f"{label} · {stage_label}", fmt(item["cpuMaxVcpu"], 3), fmt(item["cpuMaxPercentOfLimit"], 1), fmt(item["memoryMaxMb"], 1), fmt(item["memoryLimitMb"], 0)])
    for index, item in enumerate(result["generatorResourcesFinal"]):
        if item:
            rows.append([f"Generaator {index + 1} · põhitesti täisaken", fmt(item["cpuMaxVcpu"], 3), fmt(item["cpuMaxPercentOfLimit"], 1), fmt(item["memoryMaxMb"], 1), fmt(item["memoryLimitMb"], 0)])
    pieces.append(table(["Mõõteaken", "CPU max, vCPU", "CPU max / limiit, %", "Mälu max, MB", "Mälu limiit, MB"], rows) if rows else "<p>Ressursimõõtefailid puuduvad.</p>")
    full_window = result["resources"]["app"]["final"]
    if full_window:
        pieces.append(f"<p>Põhitesti ressursiaken: {esc(full_window['window']['since'])} → {esc(full_window['window']['until'])}. "
                      "Railway mõõtmised on 30 s sammuga: tabelis on valimipõhised tipud. CLI keskmist lahjendavad akna piiril olevad nullväljundid; "
                      "seda ei kasutata koormuse keskmisena. Väike osakaal eraldatud CPU limiidist ei välista Node peamise lõime küllastumist "
                      "ega välista andmebaasi I/O, luku või ühenduspuuli ootamist.</p>")
    delta = result["databaseCounterDelta"]
    if delta.get("available"):
        values = delta["values"]
        pieces.append(f"<p>PostgreSQL loendurite muutus algseisust lõppu: tagasipööratud tehinguid {fmt(values.get('xact_rollback'))}, "
                      f"ummikuid {fmt(values.get('deadlocks'))}, ajutisi faile {fmt(values.get('temp_files'))}. Loendurid on kogu andmebaasi kohta.</p>")
        pieces.append("<p class='muted'>PostgreSQL kumulatiivne muutus sisaldab eeltesti, soojendust, eel- ja järelkontrolli ning sõltumatu kirjutuskaitstud kontrolli päringuid, "
                      "sealhulgas Railway korduskäivitusi. See ei ole ainult põhitesti koormuse mõõdik. Ressursitabeli põhitesti täisaken lõpeb enne hilisemat kontrolljuurutust.</p>")
    pieces.append("<p>See on lehtede HTTP laadimiste, värskenduste ja salvestuste test kontrollitud serverigeneraatoritest. "
                  "Brauseri varade laadimine, JavaScripti käivitus, renderdamine ning eri mobiilsidevõrkude levi ja kiirus on mõõtmata. "
                  "Neli piirkondlikku väljumispunkti ei esinda 720 sõltumatut mobiiliühendust. Mõõdetud tipud ei määra rakenduse absoluutset mahupiiri.</p>")
    pieces.append("<p>Kohtunikud kirjutavad igaüks oma kontrollpunkti. Sama kontrollpunkti samaaegsete kirjutuste taluvust see profiil ei kinnita.</p>")
    pieces.append("<p>HTTP waiting ja receiving eristavad vastuse ootamist ning vastuse vastuvõtmist. Pikk receiving võib viidata suure vastuse või voogedastuse probleemile; "
                  "see ei tõenda võrgu ega serveri konkreetset algpõhjust.</p>")
    if successful_run:
        pieces.append("<p>Kirjeldatud HTTP koormusprofiilid ja sõltumatu andmekontroll läbisid testi. "
                      "Brauseri varade laadimine, renderdamine ning tegelike mobiilsidevõrkude tingimused jäävad selle kinnituse ulatusest välja.</p>")
    else:
        pieces.append("<p>Piirangute täpsustamiseks tuleb profileerida edetabeli SSR, JSON ja RSC vastuste mahtu ning serveri tööd, "
                      "seejärel korrata koormustesti ja mõõta päris mobiilibrauserit.</p>")
    if final.get("acknowledgments", {}).get("failedAttemptsPersisted", 0) or (main["counts"].get("http5xx") or 0):
        pieces.append("<p>Salvestuste tõrgete korral tuleb kontrollida sama kontrollpunkti samaaegseid ümberarvutusi. "
                      "Paranduse suund on salvestuse ja punktiarvutuse atomaarne tehing koos kontrollpunkti kaupa sünkroonimisega, "
                      "ning vea korral kogu toimingu tagasipööramine. Mõõtefailid üksi ei kinnita tõrke täpset põhjust.</p>")
    clean = result["cleanup"]
    pieces.append("<h2>Testkeskkonna lõpetamine</h2>")
    if clean["available"]:
        pieces.append(f"<p>Koristus lõpetatud {yes(clean.get('completed'))}; ajutisi teenuseid kustutatud {fmt(clean.get('temporaryServicesDeleted'))}; "
                      f"andmeketas kustutatud {yes(clean.get('temporaryVolumeDeleted'))}; keskkond kustutatud {yes(clean.get('temporaryEnvironmentDeleted'))}; "
                      f"tootmisprojekti seos taastatud {yes(clean.get('productionLinkRestored'))}; tootmise juurutus muutumatu {yes(clean.get('productionDeploymentUnchanged'))}; "
                      f"tootmise HTTP {fmt(clean.get('productionHttpStatus'))}.</p>")
    else:
        pieces.append("<p>Koristuse kinnitusfail puudub; lõpetatust ei saa veel kinnitada.</p>")
    pieces.append(f"<footer>Koostatud {esc(result['generatedAt'])}. Allikad: käesoleva jooksu smoke ja main kokkuvõtted, metadata, "
                  "kirjutuskaitstud andmekontrollid, Railway ressursimõõdikud ning koristuse kinnitus. Raport ei sisalda pääsukoode, sessiooniküpsiseid, isikuandmeid ega SQL päringuteksti.</footer></main></body></html>")
    return "".join(pieces)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts", type=Path, default=Path(__file__).resolve().parent / "artifacts" / "performance")
    parser.add_argument("--output-dir", type=Path, help="Defaults to the selected artifact directory")
    parser.add_argument("--compare", type=Path, default=Path(__file__).resolve().parent / "artifacts" / "event" / "results.json", help="Read-only prior results for comparison")
    args = parser.parse_args()
    result = build(args.artifacts, args.compare)
    output = args.output_dir or args.artifacts
    output.mkdir(parents=True, exist_ok=True)
    (output / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "report.html").write_text(render(result), encoding="utf-8")
    print(json.dumps({"action": "event report generated", "mainSummaries": len(result["main"]["runs"]),
                      "finalVerificationAvailable": result["finalVerification"]["available"],
                      "finalVerificationPassed": result["finalVerification"].get("passed"),
                      "cleanupCompleted": result["cleanup"].get("completed")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
