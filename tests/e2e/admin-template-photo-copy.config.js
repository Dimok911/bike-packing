import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "**/admin-template-photo-copy.spec.js", workers: 1, fullyParallel: false, forbidOnly: true,
  retries: 0, timeout: 120000, expect: { timeout: 30000 }, reporter: [["list"]], outputDir: "../../test-results/admin-photo-copy-acceptance",
  use: { locale: "ru-RU", serviceWorkers: "block", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }, { name: "mobile-webkit", use: { ...devices["iPhone 15"] } }]
});
