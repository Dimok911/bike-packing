import { defineConfig, devices } from "@playwright/test";

// Native IDB proof only: source modules are fulfilled by the spec. No build,
// global setup, application server, account or external API is used.
export default defineConfig({
  testDir: ".", testMatch: "**/admin-template-photo-tree-copy-store.spec.js",
  workers: 1, fullyParallel: false, forbidOnly: true, retries: 0,
  timeout: 60000, expect: { timeout: 10000 },
  reporter: [["list"], ["json", { outputFile: "test-results/admin-photo-tree-copy-store-native/report.json" }]],
  outputDir: "../../test-results/admin-photo-tree-copy-store-native",
  use: { locale: "ru-RU", serviceWorkers: "block", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 15"] } },
  ],
});
