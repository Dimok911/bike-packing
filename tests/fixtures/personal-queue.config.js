import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "../e2e", testMatch: ["protocol-core-rename.spec.js", "personal-offline-queue.spec.js"],
  workers: 1, retries: 0, reporter: "list",
  use: { serviceWorkers: "block", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] },
    { name: "mobile-webkit", use: devices["iPhone 15"] }]
});
