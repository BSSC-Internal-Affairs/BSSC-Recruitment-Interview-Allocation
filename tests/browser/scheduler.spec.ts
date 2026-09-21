import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { FormConfig, InterviewDate } from "../../src/types";
// Uses the local app and removes only this run's records after verification.
test("public NIM booking, protected admin CRUD, response filters and responsive layout", async ({
  page,
  request,
}) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    throw new Error("Browser tests require the local database.");
  const participantIds: string[] = [];
  const email = `browser-${randomUUID()}@example.com`;
  const nim = `26${Date.now()}`,
    secondNim = `27${Date.now()}`;
  let dateId = "",
    extraDateId = "",
    original: FormConfig | undefined;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    expect((await request.get("/api/admin/submissions")).status()).toBe(401);
    const redirect = await request.get("/admin", { maxRedirects: 0 });
    expect(redirect.status()).toBe(307);
    await page.goto("/");
    await expect(page.getByLabel("NIM", { exact: false })).toBeVisible();
    await expect(page.getByLabel("Full name", { exact: false })).toBeVisible();
    expect((await request.get("/api/admin/participants")).status()).toBe(401);
    await page.screenshot({
      path: ".local/public-desktop.png",
      fullPage: true,
    });
    await page.goto("/admin/login");
    await page.getByLabel("Username").fill(process.env.ADMIN_USERNAME!);
    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Meet your applicants." }),
    ).toBeVisible();
    const admin = page.request;
    await page.getByRole("link", { name: "Participants", exact: true }).click();
    await page
      .getByLabel("Full name", { exact: true })
      .fill("Browser Test Applicant");
    await page.getByLabel("NIM", { exact: true }).fill(nim);
    const createdResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/participants") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Register participant", exact: true })
      .click();
    const created = (await (await createdResponse).json()).data;
    participantIds.push(created.id);
    expect(created.nim).toBe(nim);
    expect(created.token).toBeUndefined();
    await expect(
      page.getByRole("cell", { name: nim, exact: true }),
    ).toBeVisible();
    expect(
      (
        await admin.post("/api/admin/participants", {
          data: { fullName: "Again", nim },
        })
      ).status(),
    ).toBe(409);
    await page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: nim, exact: true }) })
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await page
      .getByLabel("Full name", { exact: true })
      .fill("Browser Test Applicant");
    await page
      .getByRole("button", { name: "Save participant", exact: true })
      .click();
    await expect(
      page.getByText("Participant updated.", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/participants-desktop.png",
      fullPage: true,
    });
    original = (await (await admin.get("/api/admin/form")).json()).data;
    // Form availability and the custom message persist through the existing save flow.
    await page.goto("/admin/configuration");
    await page.getByRole("switch", { name: "Interview form active" }).uncheck();
    await page
      .getByLabel("Closed form message")
      .fill("Applications are closed for this round.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Your public form is up to date.",
    );
    await page.reload();
    await expect(
      page.getByRole("switch", { name: "Interview form active" }),
    ).not.toBeChecked();
    await expect(page.getByLabel("Closed form message")).toHaveValue(
      "Applications are closed for this round.",
    );
    await page.screenshot({
      path: ".local/admin-form-status.png",
      fullPage: true,
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Interview Registration Closed" }),
    ).toBeVisible();
    await expect(
      page.getByText("Applications are closed for this round."),
    ).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    const closed = await request.post("/api/submissions", { data: {} });
    expect(closed.status()).toBe(403);
    expect((await closed.json()).error.code).toBe("FORM_CLOSED");
    expect(
      (await request.put("/api/admin/form", { data: original })).status(),
    ).toBe(401);
    await page.goto("/admin/configuration");
    await page.getByRole("switch", { name: "Interview form active" }).check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Your public form is up to date.",
    );
    await page.goto("/");
    await expect(page.getByLabel("NIM", { exact: false })).toBeVisible();
    await page.goto("/admin/configuration");
    const crossOrigin = await admin.post("/api/admin/dates", {
      headers: { Origin: "https://invalid.example" },
      data: { date: "2098-09-21" },
    });
    expect(crossOrigin.status()).toBe(403);
    await page
      .getByRole("link", { name: "Interview schedule", exact: true })
      .click();
    await page.getByLabel("New interview date").fill("2098-09-21");
    await page.getByRole("button", { name: "Add date", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "21 September 2098", exact: true }),
    ).toBeVisible();
    let dates: InterviewDate[] = (
      await (await admin.get("/api/admin/schedules")).json()
    ).data;
    dateId = dates.find((d) => d.date === "2098-09-21")!.id;
    expect(dates.find((d) => d.id === dateId)!.isVisible).toBe(true);
    const dateCard = page
      .locator("details.date-panel")
      .filter({
        has: page.getByRole("heading", {
          name: "21 September 2098",
          exact: true,
        }),
      });
    await expect(dateCard.locator("summary")).toContainText(
      "0 slots · 0/0 registered · 0 remaining",
    );
    await expect(
      dateCard.getByRole("button", { name: "Add time", exact: true }),
    ).toBeHidden();
    await dateCard.locator("summary").click();
    await page.getByRole("button", { name: "Add time", exact: true }).click();
    await expect(page.getByText("0 registered", { exact: true })).toBeVisible();
    dates = (await (await admin.get("/api/admin/schedules")).json()).data;
    const slot = dates.find((d) => d.id === dateId)!.slots[0];
    expect(
      (
        await admin.put(`/api/admin/slots/${slot.id}`, {
          data: { ...slot, capacity: 1 },
        })
      ).status(),
    ).toBe(200);
    await page.screenshot({
      path: ".local/admin-schedules.png",
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Form configuration", exact: true })
      .click();
    await page.getByRole("button", { name: "Add field", exact: true }).click();
    await page
      .getByLabel("Field 7 label", { exact: true })
      .fill("Favorite activity");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByText("Your public form is up to date."),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/admin-configuration.png",
      fullPage: true,
    });
    await page.goto("/");
    await expect(page.getByLabel("Favorite activity")).toBeVisible();
    await expect(
      page.getByLabel("Email address", { exact: false }),
    ).toHaveValue("");
    await page
      .getByLabel("Full name", { exact: false })
      .fill("Browser Test Applicant");
    await page.getByLabel("Email address", { exact: false }).fill(email);
    await page
      .getByLabel("Phone number", { exact: false })
      .fill("+62 812 3456 7890");
    await page.getByLabel("NIM", { exact: false }).fill("9999999999999999");
    await page
      .getByLabel("Preferred division", { exact: false })
      .selectOption("Human Resources");
    await page
      .getByLabel("Favorite activity", { exact: false })
      .fill("Community service");
    await page.getByRole("button", { name: "Choose interview time" }).click();
    await page.getByRole("button", { name: "21 September 2098" }).click();
    await page
      .getByRole("button", { name: "09:00 – 09:30 1 place left" })
      .click();
    await page.screenshot({
      path: ".local/schedule-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Confirm interview" }).click();
    await expect(
      page.getByText("Your NIM is not registered for this interview.").first(),
    ).toBeVisible();
    await page.getByLabel("NIM", { exact: false }).fill(nim);
    await page.getByRole("button", { name: "Choose interview time" }).click();
    await page.getByRole("button", { name: "Confirm interview" }).click();
    await expect(
      page.getByRole("heading", { name: "See you at your interview!" }),
    ).toBeVisible();
    await page.screenshot({ path: ".local/confirmation.png", fullPage: true });
    // Hiding a booked date changes new selection only, including after reload.
    await page.goto("/admin/schedules");
    await expect(dateCard.locator("summary")).toContainText(
      "1 slot · 1/1 registered · 0 remaining",
    );
    await expect(dateCard.locator("summary")).toContainText("Visible");
    await dateCard.locator("summary").focus();
    await page.keyboard.press("Enter");
    const visibility = dateCard.getByRole("switch", {
      name: "Visible to participants: 21 September 2098",
    });
    await visibility.click();
    await expect(visibility).not.toBeChecked();
    await expect(page.getByRole("status")).toContainText("Schedule updated.");
    await page.reload();
    await expect(dateCard.locator("summary")).toContainText("Hidden");
    await expect(
      dateCard.getByRole("button", { name: "Add time", exact: true }),
    ).toBeHidden();
    expect(
      (await (await request.get("/api/schedules")).json()).data.some(
        (d: InterviewDate) => d.id === dateId,
      ),
    ).toBe(false);
    expect(
      (await (await admin.get("/api/admin/schedules")).json()).data.find(
        (d: InterviewDate) => d.id === dateId,
      ).isVisible,
    ).toBe(false);
    expect(
      (
        await (
          await request.post("/api/public/schedule-lookup", { data: { nim } })
        ).json()
      ).data.found,
    ).toBe(true);
    expect(
      (
        await request.patch(`/api/admin/dates/${dateId}`, {
          data: { isVisible: true },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await admin.patch(`/api/admin/dates/${dateId}`, {
          data: { isVisible: "false" },
        })
      ).status(),
    ).toBe(422);
    expect(
      (
        await admin.patch(`/api/admin/dates/${randomUUID()}`, {
          data: { isVisible: false },
        })
      ).status(),
    ).toBe(404);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: ".local/schedules-collapsed-mobile.png",
      fullPage: true,
    });
    await dateCard.locator("summary").click();
    await visibility.click();
    await expect(visibility).toBeChecked();
    await page.setViewportSize({ width: 1280, height: 900 });
    expect(
      (
        await admin.put(`/api/admin/slots/${slot.id}`, {
          data: { ...slot, capacity: 0 },
        })
      ).status(),
    ).toBe(422);
    expect((await admin.delete(`/api/admin/slots/${slot.id}`)).status()).toBe(
      409,
    );
    expect((await admin.delete(`/api/admin/dates/${dateId}`)).status()).toBe(
      409,
    );
    expect(
      (
        await admin.put(`/api/admin/dates/${dateId}`, {
          data: { date: "2098-09-22" },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await admin.put(`/api/admin/slots/${slot.id}`, {
          data: { ...slot, capacity: 1, startTime: "08:00" },
        })
      ).status(),
    ).toBe(409);
    await page.goto("/admin");
    await page
      .getByRole("combobox", { name: "Interview date", exact: true })
      .selectOption("2098-09-21");
    await page
      .getByRole("combobox", { name: "Start time · WIB", exact: true })
      .selectOption("09:00");
    await page
      .getByRole("combobox", { name: "Day of week", exact: true })
      .selectOption(String(new Date("2098-09-21T00:00:00Z").getUTCDay()));
    await page
      .getByRole("combobox", { name: "Sort by", exact: true })
      .selectOption("interview_asc");
    await expect(
      page.getByRole("button", { name: "Refresh responses" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("cell", { name: "09:00 – 09:30", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: "Browser Test Applicant", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/responses-filters.png",
      fullPage: true,
    });
    await page
      .getByRole("cell", { name: "Browser Test Applicant", exact: true })
      .click();
    await expect(
      page.getByText("Community service", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "21 September 2098" }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/response-detail.png",
      fullPage: true,
    });
    // Empty schedule CRUD remains reversible; edits/deletes must return the new collection.
    let added: InterviewDate[] = (
      await (
        await admin.post("/api/admin/dates", { data: { date: "2098-10-01" } })
      ).json()
    ).data;
    extraDateId = added.find((d) => d.date === "2098-10-01")!.id;
    expect(
      (
        await admin.put(`/api/admin/dates/${extraDateId}`, {
          data: { date: "2098-10-02" },
        })
      ).status(),
    ).toBe(200);
    added = (
      await (
        await admin.post("/api/admin/slots", {
          data: {
            interviewDateId: extraDateId,
            startTime: "10:00",
            endTime: "10:30",
            capacity: 2,
          },
        })
      ).json()
    ).data;
    const emptySlot = added.find((d) => d.id === extraDateId)!.slots[0];
    expect(
      (
        await admin.put(`/api/admin/slots/${emptySlot.id}`, {
          data: { ...emptySlot, endTime: "11:00", capacity: 4 },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await admin.delete(`/api/admin/slots/${emptySlot.id}`)).status(),
    ).toBe(200);
    expect(
      (await admin.delete(`/api/admin/dates/${extraDateId}`)).status(),
    ).toBe(200);
    extraDateId = "";
    await page.setViewportSize({ width: 390, height: 844 });
    const secondEmail = `full-${randomUUID()}@example.com`;
    const second = (
      await (
        await admin.post("/api/admin/participants", {
          data: { fullName: "Full slot test", nim: secondNim },
        })
      ).json()
    ).data;
    participantIds.push(second.id);
    await page.goto("/");
    await expect(page.getByLabel("Full name", { exact: false })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: ".local/public-mobile.png", fullPage: true });
    const config: FormConfig = (await (await admin.get("/api/form")).json())
      .data;
    const answers = Object.fromEntries(
      config.fields.map((f) => [
        f.id,
        f.id === config.nimFieldId
          ? secondNim
          : f.type === "email"
            ? secondEmail
            : f.type === "tel"
              ? "+6281234567890"
              : f.type === "select"
                ? f.options[0]
                : "Test",
      ]),
    );
    expect(
      (
        await request.post("/api/submissions", {
          data: {
            slotId: slot.id,
            idempotencyKey: randomUUID(),
            answers,
            nim: secondNim,
          },
        })
      ).status(),
    ).toBe(409);
    await page.getByLabel("Full name", { exact: false }).fill("Full slot test");
    await page.getByLabel("Email address", { exact: false }).fill(secondEmail);
    await page
      .getByLabel("Phone number", { exact: false })
      .fill("+6281234567890");
    await page.getByLabel("NIM", { exact: false }).fill(secondNim);
    await page
      .getByLabel("Preferred division", { exact: false })
      .selectOption("Human Resources");
    await page.getByRole("button", { name: "Choose interview time" }).click();
    await page.getByRole("button", { name: "21 September 2098" }).click();
    await expect(
      page.getByRole("button", { name: "09:00 – 09:30 Full" }),
    ).toBeDisabled();
    await page.screenshot({
      path: ".local/schedule-mobile-full.png",
      fullPage: true,
    });
    // Old onboarding endpoints are gone, and submitted participants cannot be deleted.
    expect(
      (
        await admin.post(`/api/admin/participants/${second.id}/invitation`, {
          data: {},
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.post("/api/invitations/verify", {
          data: { token: "a".repeat(64) },
        })
      ).status(),
    ).toBe(404);
    expect(
      (await admin.delete(`/api/admin/participants/${created.id}`)).status(),
    ).toBe(409);
    await page.goto("/admin/participants");
    await page.getByLabel("Search participants").fill(nim);
    await expect(
      page.getByRole("link", { name: /Responded · INT/ }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/participants-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: nim, exact: true }) })
        .getByRole("button", { name: "Delete", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Search participants").fill(secondNim);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: secondNim, exact: true }) })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(
      page.getByText("Participant deleted.", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    test.setTimeout(test.info().timeout + 15000);
    if (original) await page.request.put("/api/admin/form", { data: original });
    if (dateId) {
      await pool.query(
        "DELETE FROM submissions WHERE interview_slot_id IN (SELECT id FROM interview_slots WHERE interview_date_id=$1)",
        [dateId],
      );
      await pool.query("DELETE FROM interview_dates WHERE id=$1", [dateId]);
    }
    if (extraDateId)
      await pool.query("DELETE FROM interview_dates WHERE id=$1", [
        extraDateId,
      ]);
    if (participantIds.length)
      await pool.query("DELETE FROM participants WHERE id=ANY($1::uuid[])", [
        participantIds,
      ]);
    await pool.end();
  }
});
