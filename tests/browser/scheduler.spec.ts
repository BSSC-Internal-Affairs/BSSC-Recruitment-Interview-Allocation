import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { FormConfig, InterviewDate } from "../../src/types";
// Uses the local app and removes only this run's records after verification.
test("public booking, protected admin CRUD, full slots, snapshots and responsive layout", async ({
  page,
  request,
}) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
    await expect(page.getByLabel("Full name", { exact: false })).toBeVisible();
    await page.screenshot({
      path: ".local/public-desktop.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Choose interview time" }).click();
    await expect(page.getByText("Full name is required.")).toBeVisible();
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
    original = (await (await admin.get("/api/admin/form")).json()).data;
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
    await page
      .getByLabel("Full name", { exact: false })
      .fill("Browser Test Applicant");
    const email = `browser-${randomUUID()}@example.com`;
    await page.getByLabel("Email address", { exact: false }).fill(email);
    await page
      .getByLabel("Phone number", { exact: false })
      .fill("+62 812 3456 7890");
    await page.getByLabel("Student ID", { exact: false }).fill("TEST-001");
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
      page.getByRole("heading", { name: "See you at your interview!" }),
    ).toBeVisible();
    await page.screenshot({ path: ".local/confirmation.png", fullPage: true });
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
        f.type === "email"
          ? `full-${randomUUID()}@example.com`
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
          data: { slotId: slot.id, idempotencyKey: randomUUID(), answers },
        })
      ).status(),
    ).toBe(409);
    await page.getByLabel("Full name", { exact: false }).fill("Full slot test");
    await page
      .getByLabel("Email address", { exact: false })
      .fill(`full-${randomUUID()}@example.com`);
    await page
      .getByLabel("Phone number", { exact: false })
      .fill("+6281234567890");
    await page.getByLabel("Student ID", { exact: false }).fill("TEST-002");
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
    expect(errors).toEqual([]);
  } finally {
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
    await pool.end();
  }
});
