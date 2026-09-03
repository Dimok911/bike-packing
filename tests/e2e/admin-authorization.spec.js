import { expect, test } from "@playwright/test";

test("confirmed Bike admin authorization keeps the reports menu available", async ({ page }) => {
  const requests = [];
  await page.route("**/letters-vniipo/api/**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    if (url.pathname.endsWith("/auth/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          user: { id: "admin-e2e", email: "admin@example.test", displayName: "Admin" },
          session: { expiresAt: "2030-01-01T00:00:00.000Z" }
        })
      });
      return;
    }
    if (url.pathname.endsWith("/bike-packing/authorization")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          authorization: {
            version: 1,
            role: "admin",
            capabilities: ["templates:write"]
          }
        })
      });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code: "e2e_no_storage", message: "Storage is outside this UI contract test" })
    });
  });

  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/\bapp-ready\b/, { timeout: 15_000 });
  await page.locator("#menuBtn").click();
  await expect(page.locator("#adminReportsBtn")).toBeVisible();
  expect(requests.some((path) => path.endsWith("/auth/me"))).toBe(true);
  expect(requests.some((path) => path.endsWith("/bike-packing/authorization"))).toBe(true);
});
