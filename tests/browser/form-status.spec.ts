import { test, expect } from "@playwright/test";
import type { FormConfig } from "../../src/types";

const config: FormConfig = {
  title: "Interview registration",
  description: "Join us.",
  instructions: "",
  isActive: true,
  closedMessage: "Registration has ended.\nThank you for your interest.",
  nameFieldId: "44238d62-8ec1-45c0-a712-c9ab07ad860d",
  nimFieldId: null,
  fields: [
    {
      id: "44238d62-8ec1-45c0-a712-c9ab07ad860d",
      label: "Full name",
      type: "text",
      required: true,
      order: 0,
      options: [],
    },
  ],
};

test("closed form hides registration and keeps schedule lookup accessible on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/form", (route) =>
    route.fulfill({ json: { data: { ...config, isActive: false } } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Interview Registration Closed" }),
  ).toBeVisible();
  await expect(page.getByText(config.closedMessage)).toBeVisible();
  await expect(
    page.locator("form, input, select, button[type=submit]"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/form-closed-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Check your interview schedule", exact: false })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your interview schedule" }),
  ).toBeVisible();
  await expect(page.getByLabel("NIM", { exact: true })).toBeVisible();
});

test("closing registration during a booking replaces the stale form with the server message", async ({
  page,
}) => {
  await page.route("**/api/form", (route) =>
    route.fulfill({ json: { data: config } }),
  );
  await page.route("**/api/schedules", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "date",
            date: "2099-09-21",
            slots: [
              {
                id: "slot",
                interviewDateId: "date",
                startTime: "09:00",
                endTime: "09:30",
                capacity: 2,
                registeredCount: 0,
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route("**/api/submissions", (route) =>
    route.fulfill({
      status: 403,
      json: {
        error: {
          code: "FORM_CLOSED",
          message: "The committee has just closed registration.",
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Full name", { exact: false }).fill("Participant");
  await page.getByLabel("NIM", { exact: false }).fill("26012345");
  await page.getByRole("button", { name: "Choose interview time" }).click();
  await page.getByRole("button", { name: "21 September 2099" }).click();
  await page.getByRole("button", { name: /09:00 – 09:30/ }).click();
  await page.getByRole("button", { name: "Confirm interview" }).click();
  await expect(
    page.getByRole("heading", { name: "Interview Registration Closed" }),
  ).toBeFocused();
  await expect(
    page.getByText("The committee has just closed registration."),
  ).toBeVisible();
  await expect(page.locator("form")).toHaveCount(0);
});
