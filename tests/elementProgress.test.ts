import assert from "node:assert/strict"
import test from "node:test"
import { elementProgress, isWithdrawnAtElement } from "../src/lib/elementProgress"

const teams = [{ id: "active", dnfFromElementOrder: null }, { id: "withdrawn", dnfFromElementOrder: 2 }]

test("katkestamine mõjutab katkestamise elementi ja järgmisi, mitte varasemaid", () => {
  assert.equal(isWithdrawnAtElement(teams[1], 1), false)
  assert.equal(isWithdrawnAtElement(teams[1], 2), true)
  assert.equal(isWithdrawnAtElement(teams[1], 3), true)
  assert.deepEqual(elementProgress(teams, 1, ["active"]), { entered: 1, total: 2, withdrawn: 0 })
  assert.deepEqual(elementProgress(teams, 2, ["active"]), { entered: 1, total: 1, withdrawn: 1 })
})

test("olemasolev tulemus ei loe katkestanut topelt ning korduvad kirjed loetakse üks kord", () => {
  assert.deepEqual(elementProgress(teams, 2, ["active", "active", "withdrawn", "unknown"]), { entered: 1, total: 1, withdrawn: 1 })
  assert.deepEqual(elementProgress(teams, 1, ["active", "withdrawn"]), { entered: 2, total: 2, withdrawn: 0 })
})

test("katkestamise eemaldamine taastab oodatava tulemuse ning null on kehtiv katkestamiskoht", () => {
  assert.deepEqual(elementProgress(teams.map(team => ({ ...team, dnfFromElementOrder: null })), 2, ["active"]), { entered: 1, total: 2, withdrawn: 0 })
  assert.deepEqual(elementProgress([{ id: "a", dnfFromElementOrder: 0 }], 0, []), { entered: 0, total: 0, withdrawn: 1 })
  assert.deepEqual(elementProgress([], 0, []), { entered: 0, total: 0, withdrawn: 0 })
})
