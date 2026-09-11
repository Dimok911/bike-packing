import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".", globalSetup: process.env.BIKE_RELEASE_REUSE === "1" ? undefined : "./global-setup.js", fullyParallel: false, workers: 1,
  retries: 0, forbidOnly: true, reporter: [["list"]], timeout: 45000,
  outputDir: "../../test-results/experiment-release-acceptance",
  use: { baseURL: "https://experiment.vniipo-help.ru", locale: "ru-RU", serviceWorkers: "block",
    trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 15"] } }],
});
