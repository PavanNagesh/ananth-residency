import { defineConfig, devices } from "@playwright/test";

// Load .env (owner login for the staff tests) when running locally.
try {
  process.loadEnvFile?.(".env");
} catch {
  /* no .env: tests that need it will say so */
}

/**
 * Cross-device compatibility suite: the real Chromium, Firefox and WebKit (Safari's engine)
 * emulating the phones, tablets and computers customers and staff actually use.
 * Runs against the dev server (development sign-in code must be enabled).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  outputDir: "./test-results/devices",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 4,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Phones
    { name: "Android small (Galaxy S9+, Chrome)", use: { ...devices["Galaxy S9+"] } },
    { name: "Android (Pixel 7, Chrome)", use: { ...devices["Pixel 7"] } },
    { name: "iPhone SE (Safari)", use: { ...devices["iPhone SE (3rd gen)"] } },
    { name: "iPhone 15 Pro Max (Safari)", use: { ...devices["iPhone 15 Pro Max"] } },
    { name: "iPhone landscape (Safari)", use: { ...devices["iPhone 13 landscape"] } },
    // Tablets
    { name: "Android tablet (Galaxy Tab S4, Chrome)", use: { ...devices["Galaxy Tab S4"] } },
    { name: "iPad Mini (Safari)", use: { ...devices["iPad Mini"] } },
    { name: "iPad landscape (Safari)", use: { ...devices["iPad (gen 7) landscape"] } },
    // Laptops and desktops
    { name: "Laptop 1366 (Chrome)", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } } },
    { name: "MacBook 1440 (Safari)", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
    { name: "Desktop 1920 (Firefox)", use: { ...devices["Desktop Firefox"], viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: {
    command: "bun scripts/dev.ts",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
