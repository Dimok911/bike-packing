import { defineConfig, devices } from "@playwright/test";

// Dedicated local acceptance; this suite explicitly builds isolated ON/OFF
// bundles. The normal release profile continues to leave replacement disabled.
export default defineConfig({
  testDir: ".", testMatch: "**/admin-template-photo-replace.spec.js", workers: 1,
  fullyParallel: false, forbidOnly: true, retries: 0, timeout: 45000,
  reporter: [["list"]], outputDir: "../../test-results/admin-photo-replace-acceptance",
  use: { locale: "ru-RU", serviceWorkers: "block", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 15"] } }],
});
