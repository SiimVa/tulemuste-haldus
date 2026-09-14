import { expect, test } from "@playwright/test"

// The test server listens on 127.0.0.1, as a self-hosted Next.js server does
// behind Railway. Its internal URL differs from the browser's Host header.
test("apex requests redirect to www before rendering or starting authentication", async ({ request }) => {
  for (const path of ["/", "/login", "/login?callbackUrl=%2Fdashboard", "/register/example?token=sample", "/api/auth/providers"]) {
    const response = await request.get(path, {
      headers: { host: "matkamang.ee" }, maxRedirects: 0,
    })
    expect(response.status()).toBe(308)
    expect(new URL(response.headers().location).href).toBe(`https://www.matkamang.ee${path}`)
    expect(response.headers()["set-cookie"]).toBeUndefined()
  }
  const response = await request.post("/api/auth/signin/google", {
    headers: { host: "matkamang.ee" }, maxRedirects: 0,
  })
  expect(response.status()).toBe(308)
  expect(response.headers().location).toBe("https://www.matkamang.ee/api/auth/signin/google")
  expect(response.headers()["set-cookie"]).toBeUndefined()
})

test("www and local login pages do not redirect, and lookalike hosts do not match", async ({ request }) => {
  for (const host of ["www.matkamang.ee", "127.0.0.1:3100", "matkamangXee", "matkamang.ee.evil.example"]) {
    const response = await request.get("/login", { headers: { host }, maxRedirects: 0 })
    expect(response.status()).toBe(200)
    expect(response.headers().location).toBeUndefined()
  }
})
