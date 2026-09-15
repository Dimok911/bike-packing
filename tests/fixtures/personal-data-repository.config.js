import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "../e2e", testMatch: "personal-data-repository.spec.js", workers: 2, retries: 0,
  reporter: "list", use: { serviceWorkers: "block", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] },
    { name: "mobile-webkit", use: devices["iPhone 15"] }]
});
