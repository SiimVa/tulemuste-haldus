import assert from "node:assert/strict"
import test from "node:test"
import { parseQrOptions, renderAccessQrExport } from "../src/lib/accessQrExport"

test("QR export validates audience and page limits", () => {
  assert.deepEqual(parseQrOptions(new URLSearchParams()), { audience: "ALL", perPage: 6 })
  for (const count of ["0", "13", "1.5", "NaN", ""]) {
    assert.equal(parseQrOptions(new URLSearchParams({ perPage: count })), null)
  }
  assert.equal(parseQrOptions(new URLSearchParams({ audience: "ADMIN" })), null)
  assert.deepEqual(parseQrOptions(new URLSearchParams({ audience: "ATHLETE", perPage: "12" })), { audience: "ATHLETE", perPage: 12 })
})

test("print export paginates, embeds QR codes and escapes names and links", async () => {
  const entries = Array.from({ length: 13 }, () => ({
    name: '<script>alert("x")</script>', role: "Võistkond", subject: "A & B",
    link: 'https://example.com/athlete/test?x=1&y=2',
  }))
  const html = await renderAccessQrExport("Võistlus <2026>", entries, 12)
  assert.equal((html.match(/class="page"/g) ?? []).length, 2)
  assert.equal((html.match(/<svg/g) ?? []).length, 13)
  assert.equal((html.match(/<article>/g) ?? []).length, 13)
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes("Võistlus &lt;2026&gt;"))
  assert.ok(html.includes("A &amp; B"))
  assert.ok(html.includes('href="https://example.com/athlete/test?x=1&amp;y=2"'))
  await assert.rejects(renderAccessQrExport("Test", [], 13))
})
