import { defineConfig, devices } from "@playwright/test"

const baseURL = "http://127.0.0.1:3100"
const e2eDatabaseURL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/tulemuste_haldus?schema=e2e"
const e2eEnvironment = {
  ...process.env,
  DATABASE_URL: e2eDatabaseURL,
  ALLOW_E2E_DATABASE_RESET: "1",
  AUTH_SECRET: "e2e-auth-secret-used-only-by-playwright-tests",
  SETUP_SECRET: "e2e-setup-secret-used-only-by-playwright-tests",
  AUTH_URL: baseURL,
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run test:e2e:server",
    url: baseURL,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 300_000,
    env: e2eEnvironment,
    stdout: "pipe",
    stderr: "pipe",
  },
})
