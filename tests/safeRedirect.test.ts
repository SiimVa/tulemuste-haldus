import assert from "node:assert/strict"
import test from "node:test"
import { safeCallbackPath } from "../src/lib/safeRedirect"

test("login callback keeps same-origin paths", () => {
  assert.equal(safeCallbackPath("/invitations/abc?x=1#y"), "/invitations/abc?x=1#y")
  assert.equal(safeCallbackPath("/dashboard"), "/dashboard")
})

test("login callback rejects URLs that browsers resolve to another site", () => {
  for (const value of [
    null, "", "dashboard", "https://evil.example", "//evil.example",
    "/\\evil.example", "\\\\evil.example", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example",
  ]) {
    assert.equal(safeCallbackPath(value), "/dashboard", JSON.stringify(value))
  }
  // Each rejected value really does leave the origin when resolved by a browser-compatible URL parser.
  for (const value of ["/\\evil.example", "/\t/evil.example"]) {
    assert.equal(new URL(value, "https://www.matkamang.ee").host, "evil.example")
  }
})
