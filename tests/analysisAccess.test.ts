import assert from "node:assert/strict"
import test from "node:test"
import {
  isAnalysisAccessMode,
  isAnalysisLinkToken,
} from "../src/lib/analysisAccess"
import {
  generateAnalysisLinkToken,
  hashAnalysisLinkToken,
} from "../src/lib/analysisAccess.server"

test("analüüsi ligipääsurežiimid on piiratud kolme valikuga", () => {
  assert.equal(isAnalysisAccessMode("PUBLIC"), true)
  assert.equal(isAnalysisAccessMode("LINK_ONLY"), true)
  assert.equal(isAnalysisAccessMode("PRIVATE"), true)
  assert.equal(isAnalysisAccessMode("SECRET"), false)
  assert.equal(isAnalysisAccessMode(undefined), false)
})

test("analüüsilink kasutab juhuslikku 256-bitist tunnust ja salvestab räsi", () => {
  const first = generateAnalysisLinkToken()
  const second = generateAnalysisLinkToken()

  assert.equal(isAnalysisLinkToken(first), true)
  assert.equal(first.length, 43)
  assert.notEqual(first, second)
  assert.match(hashAnalysisLinkToken(first), /^[a-f0-9]{64}$/)
  assert.equal(hashAnalysisLinkToken(first), hashAnalysisLinkToken(first))
  assert.notEqual(hashAnalysisLinkToken(first), hashAnalysisLinkToken(second))
})

test("vigane tunnus ei jõua räsifunktsioonini", () => {
  assert.equal(isAnalysisLinkToken("liiga-lühike"), false)
  assert.equal(isAnalysisLinkToken("a".repeat(44)), false)
  assert.equal(isAnalysisLinkToken("a/b+c" + "d".repeat(38)), false)
  assert.throws(() => hashAnalysisLinkToken("liiga-lühike"))
})
