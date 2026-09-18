import assert from "node:assert/strict"
import test from "node:test"
import { leaderboardClassFilter, leaderboardGaps } from "../src/lib/leaderboard"

const row = (id: string, cls: string | null, total: number) => ({ team: { id, class: cls }, total })

test("klassivahed kasutavad sama klassi eelmist võistkonda, üldvahed üldpingerida", () => {
  const gaps = leaderboardGaps([row("a", "A", 10), row("b", "B", 12), row("c", "A", 15), row("d", "B", 18)])
  assert.deepEqual(gaps.get("a"), { classFirst: 0, classPrevious: null, overallFirst: 0, overallPrevious: null })
  assert.deepEqual(gaps.get("c"), { classFirst: 5, classPrevious: 5, overallFirst: 5, overallPrevious: 3 })
  assert.deepEqual(gaps.get("d"), { classFirst: 6, classPrevious: 6, overallFirst: 8, overallPrevious: 3 })
})

test("plusspunktide vahed on positiivsed ning võrdsed punktid annavad nulli", () => {
  const gaps = leaderboardGaps([row("a", "A", 20.1), row("b", "A", 20.1), row("c", null, 19.9)])
  assert.equal(gaps.get("b")?.overallPrevious, 0)
  assert.deepEqual(gaps.get("c"), { classFirst: null, classPrevious: null, overallFirst: 0.2, overallPrevious: 0.2 })
  assert.equal(leaderboardGaps([]).size, 0)
})

test("filtrit saab eemaldada ja valida mitu klassi ilma vahesid ümber arvutamata", () => {
  const rows = [row("a", "A", 10), row("b", "B", 12), row("c", "A", 15), row("d", null, 18)]
  const classes = ["A", "B", ""]
  const gaps = leaderboardGaps(rows)
  assert.deepEqual(rows.filter(r => leaderboardClassFilter("A", classes)(r.team)).map(r => gaps.get(r.team.id)?.overallPrevious), [null, 3])
  assert.equal(rows.filter(r => leaderboardClassFilter(undefined, classes)(r.team)).length, 4)
  assert.equal(rows.filter(r => leaderboardClassFilter("unknown", classes)(r.team)).length, 4)
  assert.equal(rows.filter(r => leaderboardClassFilter(["A", "B"], classes)(r.team)).length, 3)
  assert.deepEqual(rows.filter(r => leaderboardClassFilter("", classes)(r.team)).map(r => r.team.id), ["d"])
})
