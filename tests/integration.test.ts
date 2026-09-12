import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
// Each run gets an isolated schema in the configured PostgreSQL database.
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const schema = `test_${randomUUID().replaceAll("-", "")}`;
await admin.query(`CREATE SCHEMA "${schema}"`);
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.toString();
const { pool, transaction } = await import("../src/server/db");
const { submit, getSubmission } =
  await import("../src/server/services/submissions");
const { getConfig, saveConfig } =
  await import("../src/server/repositories/config");
const { ApiError } = await import("../src/server/errors");
await pool.query(await readFile("db/001_initial.sql", "utf8"));
const nameId = randomUUID(),
  emailId = randomUUID(),
  dateId = randomUUID();
await transaction((db) =>
  saveConfig(
    {
      title: "Test",
      description: "",
      instructions: "",
      nameFieldId: nameId,
      fields: [
        {
          id: nameId,
          label: "Full name",
          type: "text",
          required: true,
          order: 0,
          options: [],
        },
        {
          id: emailId,
          label: "Email",
          type: "email",
          required: true,
          order: 1,
          options: [],
        },
      ],
    },
    db,
  ),
);
await pool.query("INSERT INTO interview_dates VALUES ($1,'2099-09-21')", [
  dateId,
]);
const newSlot = async (capacity: number, start = "09:00", end = "09:30") => {
  const id = randomUUID();
  await pool.query(
    "INSERT INTO interview_slots(id,interview_date_id,start_time,end_time,capacity) VALUES($1,$2,$3,$4,$5)",
    [id, dateId, start, end, capacity],
  );
  return id;
};
const payload = (slotId: string, email = `${randomUUID()}@example.com`) => ({
  slotId,
  idempotencyKey: randomUUID(),
  answers: { [nameId]: "Test Participant", [emailId]: email },
});
try {
  await test("20 concurrent requests cannot overbook a 3-person slot", async () => {
    const id = await newSlot(3);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => submit(payload(id))),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
    for (const r of results)
      if (r.status === "rejected")
        assert.equal((r.reason as InstanceType<typeof ApiError>).status, 409);
    const {
      rows: [s],
    } = await pool.query(
      "SELECT registered_count,(SELECT count(*)::integer FROM submissions WHERE interview_slot_id=$1) AS actual FROM interview_slots WHERE id=$1",
      [id],
    );
    assert.equal(s.registered_count, 3);
    assert.equal(s.actual, 3);
  });
  await test("concurrent identical retries create one submission and reserve one place", async () => {
    const id = await newSlot(3, "10:00", "10:30"),
      data = payload(id);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => submit(data)),
    );
    assert.equal(new Set(results.map((r) => r.formId)).size, 1);
    const {
      rows: [s],
    } = await pool.query(
      "SELECT registered_count FROM interview_slots WHERE id=$1",
      [id],
    );
    assert.equal(s.registered_count, 1);
    await assert.rejects(
      submit({ ...data, answers: { ...data.answers, [nameId]: "Changed" } }),
      (e) => (e as InstanceType<typeof ApiError>).status === 409,
    );
  });
  await test("duplicate email rolls back capacity and answers", async () => {
    const id = await newSlot(5, "11:00", "11:30");
    const email = "duplicate@example.com";
    await submit(payload(id, email));
    await assert.rejects(
      submit(payload(id, email)),
      (e) => (e as { code: string }).code === "23505",
    );
    const {
      rows: [s],
    } = await pool.query(
      "SELECT registered_count FROM interview_slots WHERE id=$1",
      [id],
    );
    assert.equal(s.registered_count, 1);
  });
  await test("database rejects capacity below registrations and deletion of booked slots", async () => {
    const {
      rows: [s],
    } = await pool.query(
      "SELECT id FROM interview_slots WHERE registered_count=3",
    );
    await assert.rejects(
      pool.query("UPDATE interview_slots SET capacity=2 WHERE id=$1", [s.id]),
    );
    await assert.rejects(
      pool.query("DELETE FROM interview_slots WHERE id=$1", [s.id]),
    );
  });
  await test("invalid answers and nonexistent slots do not reserve capacity", async () => {
    const id = await newSlot(2, "12:00", "12:30");
    const data = payload(id);
    await assert.rejects(
      submit({ ...data, answers: { ...data.answers, [emailId]: "bad" } }),
      (e) => (e as InstanceType<typeof ApiError>).status === 422,
    );
    await assert.rejects(
      submit(payload(randomUUID())),
      (e) => (e as InstanceType<typeof ApiError>).status === 404,
    );
    const {
      rows: [s],
    } = await pool.query(
      "SELECT registered_count FROM interview_slots WHERE id=$1",
      [id],
    );
    assert.equal(s.registered_count, 0);
  });
  await test("historical labels and answers survive deleting and renaming fields", async () => {
    const {
      rows: [s],
    } = await pool.query("SELECT id FROM submissions LIMIT 1");
    const before = await getSubmission(s.id);
    const config = await getConfig();
    await transaction((db) =>
      saveConfig(
        { ...config, fields: [{ ...config.fields[0], label: "Renamed" }] },
        db,
      ),
    );
    const after = await getSubmission(s.id);
    assert.deepEqual(after.answers, before.answers);
  });
} finally {
  await pool.end();
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
}
