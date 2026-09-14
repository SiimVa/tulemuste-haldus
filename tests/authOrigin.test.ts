import assert from "node:assert/strict"
import test from "node:test"
import { canonicalAuthRedirect } from "../src/lib/authOrigin"

test("OAuth starts on the configured callback host, retaining path and query", () => {
  assert.equal(canonicalAuthRedirect("https://matkamang.ee/login?callbackUrl=%2Fdashboard", "https://www.matkamang.ee")?.href,
    "https://www.matkamang.ee/login?callbackUrl=%2Fdashboard")
  assert.equal(canonicalAuthRedirect("https://www.matkamang.ee/login", "https://www.matkamang.ee"), null)
})

test("canonical redirect cannot interpret a path as an external host and leaves local hosts alone", () => {
  assert.equal(canonicalAuthRedirect("https://matkamang.ee//evil.example/path", "https://www.matkamang.ee")?.hostname, "www.matkamang.ee")
  assert.equal(canonicalAuthRedirect("http://localhost:3100/login", "https://www.matkamang.ee"), null)
  assert.equal(canonicalAuthRedirect("https://matkamang.ee/login"), null)
})
