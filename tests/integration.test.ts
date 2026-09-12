import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
// Each run gets an isolated schema in the configured PostgreSQL database.
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(process.env.DATABASE_URL!).hostname,
  )
)
  throw new Error("Integration tests require a local PostgreSQL database.");
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
const {
  createParticipant,
  verifyInvitation,
  replaceInvitation,
  setParticipantDisabled,
} = await import("../src/server/services/participants");
const { listSubmissions } = await import("../src/server/services/responses");
await pool.query(await readFile("db/001_initial.sql", "utf8"));
const legacyDate = randomUUID(),
  legacySlot = randomUUID(),
  legacyWithEmail = randomUUID(),
  legacyWithoutEmail = randomUUID();
await pool.query("INSERT INTO interview_dates VALUES($1,'2099-09-20')", [
  legacyDate,
]);
await pool.query(
  "INSERT INTO interview_slots VALUES($1,$2,'08:00','08:30',2,2)",
  [legacySlot, legacyDate],
);
for (const [id, email] of [
  [legacyWithEmail, "legacy@example.com"],
  [legacyWithoutEmail, null],
]) {
  await pool.query(
    "INSERT INTO submissions(id,interview_slot_id,full_name,idempotency_key,request_hash,email_key,interview_date,start_time,end_time) VALUES($1,$2,'Legacy Participant',$3,'legacy',$4,'2099-09-20','08:00','08:30')",
    [id, legacySlot, randomUUID(), email],
  );
}
const migration = await readFile("db/002_participants.sql", "utf8");
await pool.query(migration);
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
const payload = async (
  slotId: string,
  email = `${randomUUID()}@example.com`,
) => ({
  invitationToken: (
    await createParticipant({ fullName: "Test Participant", email })
  ).token,
  slotId,
  idempotencyKey: randomUUID(),
  answers: { [nameId]: "Test Participant", [emailId]: email },
});
try {
  await test("migration preserves historical responses and safely links existing email identities", async () => {
    await pool.query(migration);
    const { rows } = await pool.query(
      "SELECT id,participant_id FROM submissions WHERE id=ANY($1::uuid[])",
      [[legacyWithEmail, legacyWithoutEmail]],
    );
    assert.equal(rows.length, 2);
    assert.ok(rows.find((row) => row.id === legacyWithEmail).participant_id);
    assert.equal(
      rows.find((row) => row.id === legacyWithoutEmail).participant_id,
      null,
    );
    await assert.rejects(
      createParticipant({ fullName: "Again", email: " LEGACY@example.com " }),
      (e) => (e as InstanceType<typeof ApiError>).status === 409,
    );
    const {
      rows: [table],
    } = await pool.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid='participants'::regclass",
    );
    assert.equal(table.relrowsecurity, true);
    const {
      rows: [slot],
    } = await pool.query(
      "SELECT registered_count FROM interview_slots WHERE id=$1",
      [legacySlot],
    );
    assert.equal(slot.registered_count, 2);
  });
  await test("20 concurrent requests cannot overbook a 3-person slot", async () => {
    const id = await newSlot(3);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, async () => submit(await payload(id))),
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
      data = await payload(id);
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
  await test("one participant cannot resubmit using a new request key or altered email", async () => {
    const id = await newSlot(5, "11:00", "11:30");
    const email = "duplicate@example.com";
    const data = await payload(id, email);
    await submit(data);
    await assert.rejects(
      submit({
        ...data,
        idempotencyKey: randomUUID(),
        answers: { ...data.answers, [emailId]: "another@example.com" },
      }),
      (e) => (e as InstanceType<typeof ApiError>).status === 409,
    );
    await assert.rejects(
      createParticipant({ fullName: "Again", email }),
      (e) => (e as InstanceType<typeof ApiError>).status === 409,
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
    const data = await payload(id);
    await assert.rejects(
      submit({ ...data, answers: { ...data.answers, [emailId]: "bad" } }),
      (e) => (e as InstanceType<typeof ApiError>).status === 422,
    );
    await assert.rejects(
      submit({ ...data, slotId: randomUUID() }),
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
  await test("invalid, disabled and replaced invitations cannot submit or consume capacity", async () => {
    const id = await newSlot(3, "13:00", "13:30");
    const data = await payload(id);
    await assert.rejects(
      submit({ ...data, invitationToken: "0".repeat(64) }),
      (e) => (e as InstanceType<typeof ApiError>).status === 403,
    );
    const {
      rows: [p],
    } = await pool.query("SELECT id FROM participants WHERE email=$1", [
      data.answers[emailId],
    ]);
    await setParticipantDisabled(p.id, true);
    await assert.rejects(
      submit(data),
      (e) => (e as InstanceType<typeof ApiError>).status === 403,
    );
    await assert.rejects(
      verifyInvitation(data.invitationToken),
      (e) => (e as InstanceType<typeof ApiError>).status === 403,
    );
    await setParticipantDisabled(p.id, false);
    const replacement = await replaceInvitation(p.id);
    await assert.rejects(
      submit(data),
      (e) => (e as InstanceType<typeof ApiError>).status === 403,
    );
    const valid = { ...data, invitationToken: replacement.token };
    await assert.rejects(
      submit({
        ...valid,
        answers: { ...valid.answers, [emailId]: "unregistered@example.com" },
      }),
      (e) => (e as InstanceType<typeof ApiError>).status === 422,
    );
    const {
      rows: [s],
    } = await pool.query(
      "SELECT registered_count FROM interview_slots WHERE id=$1",
      [id],
    );
    assert.equal(s.registered_count, 0);
    assert.equal(
      (await verifyInvitation(replacement.token)).email,
      data.answers[emailId],
    );
    await submit(valid);
    assert.ok((await verifyInvitation(replacement.token)).booking);
  });
  await test("simultaneous requests for one participant across two slots reserve only one place", async () => {
    const first = await newSlot(5, "14:00", "14:30"),
      second = await newSlot(5, "15:00", "15:30"),
      data = await payload(first);
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, index) =>
        submit({
          ...data,
          slotId: index % 2 ? first : second,
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const {
      rows: [count],
    } = await pool.query(
      "SELECT sum(registered_count)::integer AS count FROM interview_slots WHERE id=ANY($1::uuid[])",
      [[first, second]],
    );
    assert.equal(count.count, 1);
  });
  await test("response filters and sorting use interview snapshots including legacy responses", async () => {
    const legacy = await listSubmissions({
      q: "Legacy",
      date: "2099-09-20",
      time: "08:00",
      weekday: new Date("2099-09-20T00:00:00Z").getUTCDay(),
      sort: "interview_asc",
    });
    assert.equal(legacy.total, 2);
    assert.equal(legacy.items[0].date, "2099-09-20");
    assert.equal(legacy.items[0].startTime, "08:00");
    assert.equal(
      (await listSubmissions({ q: "Legacy", time: "09:00" })).total,
      0,
    );
    const sorted = await listSubmissions({ sort: "interview_desc" });
    const times = sorted.items.map((row) => `${row.date} ${row.startTime}`);
    assert.deepEqual(times, [...times].sort().reverse());
    await assert.rejects(listSubmissions({ sort: "DROP TABLE submissions" }));
  });
  await test("pagination returns matches across the 50-record page boundary", async () => {
    const slot = await newSlot(51, "16:00", "16:30");
    await pool.query(
      "INSERT INTO submissions(id,interview_slot_id,full_name,idempotency_key,request_hash,interview_date,start_time,end_time) SELECT gen_random_uuid(),$1,'Pagination '||lpad(i::text,3,'0'),gen_random_uuid(),'fixture','2099-09-21','16:00','16:30' FROM generate_series(1,51) i",
      [slot],
    );
    await pool.query(
      "UPDATE interview_slots SET registered_count=51 WHERE id=$1",
      [slot],
    );
    const first = await listSubmissions({ q: "Pagination", sort: "name_asc" }),
      second = await listSubmissions({
        q: "Pagination",
        sort: "name_asc",
        page: 2,
      });
    assert.equal(first.total, 51);
    assert.equal(first.items.length, 50);
    assert.equal(second.items.length, 1);
    assert.equal(second.items[0].fullName, "Pagination 051");
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
  await test("removing the email field still requires an invitation and prevents a second response", async () => {
    const slot = await newSlot(3, "17:00", "17:30"),
      data = await payload(slot);
    const config = await getConfig();
    const input = {
      ...data,
      answers: { [config.nameFieldId!]: "No email field" },
    };
    await assert.rejects(submit({ ...input, invitationToken: undefined }));
    await submit(input);
    await assert.rejects(
      submit({ ...input, idempotencyKey: randomUUID() }),
      (e) => (e as InstanceType<typeof ApiError>).status === 409,
    );
    const {
      rows: [s],
    } = await pool.query(
      "SELECT registered_count FROM interview_slots WHERE id=$1",
      [slot],
    );
    assert.equal(s.registered_count, 1);
  });
} finally {
  await pool.end();
  await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin.end();
}
