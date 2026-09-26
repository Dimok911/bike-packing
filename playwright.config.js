import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.js",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://bike-packing.localhost:${process.env.PLAYWRIGHT_PORT || 4173}`,
    locale: "ru-RU",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile-webkit",
      testMatch: ["**/inventory-preparation.spec.js","**/stock-locations.spec.js","**/rich-notes.spec.js","**/admin-plan-snapshot-storage.spec.js","**/view-scroll-tabs.spec.js","**/manufacturer-bag-catalog.spec.js","**/photo-lightbox-sizing.spec.js","**/photo-durable-storage.spec.js","**/photo-batch-storage.spec.js","**/personal-guest-storage.spec.js","**/experiment-transport.spec.js","**/experiment-release.spec.js","**/experiment-canonical-session.spec.js","**/list-operation-queue.spec.js","**/personal-access-client.spec.js","**/admin-template-client.spec.js","**/admin-template-save-ui.spec.js","**/admin-template-photo-append.spec.js","**/admin-template-photo-copy.spec.js","**/admin-template-photo-tree-copy-store.spec.js","**/admin-template-photo-whole-copy-store.spec.js","**/admin-template-photo-replace.spec.js","**/admin-template-photo-create.spec.js","**/personal-save-ui.spec.js","**/photo-lightbox-safari.spec.js","**/photo-preview-loading.spec.js","**/personal-ordinary-recovery.spec.js","**/personal-legacy-photo-save.spec.js"],
      use: { ...devices["iPhone 15"] }
    }
  ]
});
