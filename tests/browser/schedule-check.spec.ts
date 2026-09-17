import { test, expect } from "@playwright/test";

test("public lookup validates NIM, disables repeats, and handles found, empty, and failed searches", async ({
  page,
}) => {
  let calls = 0;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/public/schedule-lookup", async (route) => {
    calls++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().url()).not.toContain("26012345");
    expect(route.request().postDataJSON()).toEqual({ nim: "26012345" });
    if (calls === 1) {
      await pending;
      await route.fulfill({
        json: {
          data: {
            found: true,
            schedule: {
              date: "2026-09-21",
              startTime: "19:10",
              endTime: "19:55",
            },
          },
        },
      });
    } else if (calls === 2) {
      await route.fulfill({ json: { data: { found: false } } });
    } else if (calls === 3) {
      await route.fulfill({
        status: 429,
        json: {
          error: {
            message: "Too many searches. Please try again in a minute.",
          },
        },
      });
    } else {
      await route.abort("failed");
    }
  });
  await page.goto("/schedule-check");
  await expect(
    page.getByRole("heading", { name: "Check your interview schedule" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Enter a valid NIM",
  );
  await page.getByLabel("NIM", { exact: true }).fill("12abc");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  expect(calls).toBe(0);
  await page.getByLabel("NIM", { exact: true }).fill(" 26012345 ");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: "Searching…" })).toBeDisabled();
  await expect(page.getByLabel("NIM", { exact: true })).toBeDisabled();
  release();
  await expect(
    page.getByText("Interview schedule found", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "21 September 2026" }),
  ).toBeVisible();
  await expect(
    page.getByText("19:10 – 19:55 WIB", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await page.screenshot({
    path: ".local/schedule-check-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("NIM", { exact: true }).fill("26012345");
  await expect(
    page.getByText("Interview schedule found", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "No interview schedule found for this NIM.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Too many searches",
  );
  await expect(
    page.getByRole("heading", {
      name: "No interview schedule found for this NIM.",
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "We couldn’t check your schedule",
  );
  await expect(
    page.getByRole("button", { name: "Search", exact: true }),
  ).toBeEnabled();
});

test("public form links to a mobile-friendly lookup without authentication", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("link", {
      name: /Already submitted\? Check your interview schedule/,
    })
    .click();
  await expect(page).toHaveURL(/\/schedule-check$/);
  await expect(page.getByLabel("NIM", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/schedule-check-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Interview form", exact: true }).click();
  await expect(page).toHaveURL("/");
});
