import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { NextRequest } from "next/server";
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
  updateParticipant,
  deleteParticipant,
  listParticipants,
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
await pool.query(await readFile("db/002_participants.sql", "utf8"));
const oldPendingId = randomUUID();
await pool.query(
  "INSERT INTO participants(id,full_name,email,invitation_token_hash,disabled) VALUES($1,'Old Pending','old@example.com',$2,true)",
  [oldPendingId, "a".repeat(64)],
);
const migration = await readFile("db/003_participant_nim.sql", "utf8");
await pool.query(migration);
const lookupMigration = await readFile("db/004_schedule_lookup.sql", "utf8");
await pool.query(lookupMigration);
const statusMigration = await readFile("db/005_form_status.sql", "utf8");
await pool.query(statusMigration);
const visibilityMigration = await readFile(
  "db/006_schedule_visibility.sql",
  "utf8",
);
await pool.query(visibilityMigration);
const { getSchedules, setDateVisibility } =
  await import("../src/server/repositories/schedules");
const { lookupSchedule, limitScheduleLookup, lookupRateLimitKey } =
  await import("../src/server/services/schedule-lookup");
const { handle } = await import("../src/server/controllers/api");
const nameId = randomUUID(),
  emailId = randomUUID(),
  dateId = randomUUID();
await transaction((db) =>
  saveConfig(
    {
      title: "Test",
      isActive: true,
      closedMessage: "Registration for the interview has been closed.",
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
let nextNim = 26010000;
const payload = async (
  slotId: string,
  email = `${randomUUID()}@example.com`,
) => {
  const p = await createParticipant({
    fullName: "Test Participant",
    nim: String(nextNim++),
  });
  return {
    nim: p.nim!,
    slotId,
    idempotencyKey: randomUUID(),
    answers: { [nameId]: "Test Participant", [emailId]: email },
  };
};
try {
  await test("hidden dates reject new bookings but preserve existing responses and lookup", async () => {
    const before = await getSchedules();
    assert.ok(before.every((date) => date.isVisible));
    assert.ok(before.some((date) => date.id === legacyDate));
    const slot = await newSlot(2, "05:00", "05:30");
    const booked = await payload(slot),
      pending = await payload(slot);
    const booking = await submit(booked);
    try {
      await setDateVisibility(dateId, false);
      await pool.query(visibilityMigration);
      const publicResponse = await handle(
        new NextRequest("http://localhost/api/schedules?includeHidden=true"),
        { params: Promise.resolve({ path: ["schedules"] }) },
      );
      const publicDates = (await publicResponse.json()).data;
      assert.ok(
        !publicDates.some((date: { id: string }) => date.id === dateId),
      );
      assert.equal(publicResponse.headers.get("cache-control"), "no-store");
      const hidden = (await getSchedules({ includeHidden: true })).find(
        (date) => date.id === dateId,
      )!;
      assert.equal(hidden.isVisible, false);
      assert.equal(hidden.slots.find((s) => s.id === slot)!.registeredCount, 1);
      const rejected = await handle(
        new NextRequest("http://localhost/api/submissions", {
          method: "POST",
          body: JSON.stringify(pending),
        }),
        { params: Promise.resolve({ path: ["submissions"] }) },
      );
      assert.equal(rejected.status, 409);
      assert.deepEqual((await rejected.json()).error, {
        code: "SCHEDULE_UNAVAILABLE",
        message: "This interview schedule is no longer available.",
      });
      assert.equal(
        (
          await pool.query(
            "SELECT registered_count FROM interview_slots WHERE id=$1",
            [slot],
          )
        ).rows[0].registered_count,
        1,
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS count FROM submissions WHERE nim=$1",
            [pending.nim],
          )
        ).rows[0].count,
        0,
      );
      assert.deepEqual(await submit(booked), booking); // Successful retries do not create a new booking.
      const participant = (await listParticipants()).find(
        (p) => p.nim === booked.nim,
      )!;
      assert.equal(
        (await getSubmission(participant.submissionId!)).formId,
        booking.formId,
      );
      assert.ok(
        (await listSubmissions({})).items.some(
          (s) => s.formId === booking.formId,
        ),
      );
      assert.deepEqual(await lookupSchedule({ nim: booked.nim }), {
        found: true,
        schedule: {
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
        },
      });
      await setDateVisibility(dateId, true);
      await submit(pending);
      assert.ok((await getSchedules()).some((date) => date.id === dateId));
      assert.equal(
        (
          await pool.query(
            "SELECT registered_count FROM interview_slots WHERE id=$1",
            [slot],
          )
        ).rows[0].registered_count,
        2,
      );
    } finally {
      await setDateVisibility(dateId, true);
    }
    await assert.rejects(
      setDateVisibility(randomUUID(), false),
      (e) => (e as InstanceType<typeof ApiError>).status === 404,
    );
  });
  await test("closed status persists, blocks submissions first, and leaves lookup and admin data available", async () => {
    const original = await getConfig();
    assert.equal(original.isActive, true);
    const slot = await newSlot(3, "06:00", "06:30");
    const booked = await payload(slot);
    const booking = await submit(booked);
    const pending = await payload(slot);
    const closedMessage =
      "Interview registration is now closed.\nThank you for your interest.";
    try {
      await transaction((db) =>
        saveConfig({ ...original, isActive: false, closedMessage }, db),
      );
      // Re-running the migration must preserve the admin's settings.
      await pool.query(statusMigration);
      const response = await handle(
        new NextRequest("http://localhost/api/form"),
        { params: Promise.resolve({ path: ["form"] }) },
      );
      const config = (await response.json()).data;
      assert.equal(config.isActive, false);
      assert.equal(config.closedMessage, closedMessage);
      assert.equal(response.headers.get("cache-control"), "no-store");
      // Covers valid requests, retries, unknown NIMs, and malformed submissions.
      for (const input of [
        pending,
        booked,
        { ...pending, nim: "999999999" },
        {},
      ]) {
        const rejected = await handle(
          new NextRequest("http://localhost/api/submissions", {
            method: "POST",
            body: JSON.stringify(input),
          }),
          { params: Promise.resolve({ path: ["submissions"] }) },
        );
        assert.equal(rejected.status, 403);
        assert.deepEqual((await rejected.json()).error, {
          code: "FORM_CLOSED",
          message: closedMessage,
        });
      }
      assert.equal(
        (
          await pool.query(
            "SELECT registered_count FROM interview_slots WHERE id=$1",
            [slot],
          )
        ).rows[0].registered_count,
        1,
      );
      const roster = await listParticipants();
      const participant = roster.find((p) => p.nim === booked.nim)!;
      assert.equal(
        (await getSubmission(participant.submissionId!)).formId,
        booking.formId,
      );
      assert.deepEqual(await lookupSchedule({ nim: booked.nim }), {
        found: true,
        schedule: {
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
        },
      });
      const added = await createParticipant({
        fullName: "While closed",
        nim: String(nextNim++),
      });
      await updateParticipant(added.id, {
        fullName: "Updated while closed",
        nim: added.nim!,
      });
      await deleteParticipant(added.id);
      await transaction((db) => saveConfig({ ...original, closedMessage }, db));
      await submit(pending);
      assert.equal(
        (
          await pool.query(
            "SELECT registered_count FROM interview_slots WHERE id=$1",
            [slot],
          )
        ).rows[0].registered_count,
        2,
      );
    } finally {
      await transaction((db) => saveConfig(original, db));
    }
  });
  await test("migration removes onboarding fields, preserves identities, and requires admin NIM assignment", async () => {
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
    const roster = await listParticipants();
    assert.equal(roster.find((p) => p.id === oldPendingId)?.nim, null);
    assert.equal(roster.find((p) => p.id === legacyWithEmail)?.nim, null);
    const { rows: columns } = await pool.query(
      "SELECT attname FROM pg_attribute WHERE attrelid='participants'::regclass AND attnum>0 AND NOT attisdropped",
    );
    assert.deepEqual(
      columns.map((c) => c.attname).sort(),
      ["id", "full_name", "nim", "created_at", "updated_at"].sort(),
    );
    const old = await updateParticipant(legacyWithEmail, {
      fullName: "Legacy Participant",
      nim: "00000001",
    });
    assert.ok(old.submissionId);
    await assert.rejects(
      submit({
        nim: "00000001",
        slotId: legacySlot,
        idempotencyKey: randomUUID(),
        answers: {},
      }),
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
  await test("lookup migration recovers linked and unlinked legacy NIMs without creating whitelist entries", async () => {
    const before = (await listParticipants()).length;
    await pool.query(
      "INSERT INTO submission_answers VALUES($1,$2,'NIM','text',' 00000002 ',0)",
      [legacyWithoutEmail, randomUUID()],
    );
    await pool.query(lookupMigration);
    await pool.query(lookupMigration);
    for (const nim of ["00000001", "00000002"]) {
      assert.deepEqual(await lookupSchedule({ nim }), {
        found: true,
        schedule: { date: "2099-09-20", startTime: "08:00", endTime: "08:30" },
      });
    }
    assert.equal((await listParticipants()).length, before);
    await pool.query("UPDATE participants SET nim='00000003' WHERE id=$1", [
      legacyWithEmail,
    ]);
    await pool.query(lookupMigration);
    assert.equal((await lookupSchedule({ nim: "00000001" })).found, true);
    assert.deepEqual(await lookupSchedule({ nim: "00000003" }), {
      found: false,
    });
  });
  await test("public endpoint exposes only schedule snapshots and treats unknown and pending NIMs alike", async () => {
    const pending = await createParticipant({
      fullName: "Pending",
      nim: "00000004",
    });
    const call = (body: unknown) =>
      handle(
        new NextRequest("http://localhost:3011/api/public/schedule-lookup", {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }),
        { params: Promise.resolve({ path: ["public", "schedule-lookup"] }) },
      );
    const found = await call({ nim: " 00000002 " });
    assert.equal(found.status, 200);
    assert.equal(found.headers.get("cache-control"), "no-store");
    assert.deepEqual(await found.json(), {
      data: {
        found: true,
        schedule: { date: "2099-09-20", startTime: "08:00", endTime: "08:30" },
      },
    });
    for (const nim of [pending.nim, "999999999999", "2", "0000000"]) {
      const response = await call({ nim });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { data: { found: false } });
    }
    for (const nim of ["", "12abc", "1".repeat(33), 12345, "' OR 1=1--"]) {
      assert.equal((await call({ nim })).status, 422);
    }
    const limited = await call({ nim: "00000002" });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    assert.equal(limited.headers.get("cache-control"), "no-store");
    await pool.query("DELETE FROM schedule_lookup_attempts");
  });
  await test("lookup limiter is atomic, isolates trusted IPs, and expires counters", async () => {
    const previous = process.env.SCHEDULE_LOOKUP_IP_HEADER;
    process.env.SCHEDULE_LOOKUP_IP_HEADER = "x-test-client-ip";
    try {
      const headers = new Headers({ "x-test-client-ip": "192.0.2.1" });
      const outcomes = await Promise.allSettled(
        Array.from({ length: 15 }, () => limitScheduleLookup(headers)),
      );
      assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 10);
      for (const r of outcomes)
        if (r.status === "rejected") assert.equal(r.reason.status, 429);
      await limitScheduleLookup(
        new Headers({ "x-test-client-ip": "192.0.2.2" }),
      );
      await pool.query(
        "UPDATE schedule_lookup_attempts SET window_start=now()-interval '2 minutes'",
      );
      await limitScheduleLookup(headers);
      const { rows } = await pool.query(
        "SELECT attempts FROM schedule_lookup_attempts",
      );
      assert.deepEqual(rows, [{ attempts: 1 }]);
      assert.equal(
        lookupRateLimitKey(
          new Headers({ "x-test-client-ip": "2001:0db8:0:0:0:0:0:1" }),
        ),
        lookupRateLimitKey(new Headers({ "x-test-client-ip": "2001:db8::1" })),
      );
      delete process.env.SCHEDULE_LOOKUP_IP_HEADER;
      assert.equal(
        lookupRateLimitKey(new Headers({ "x-forwarded-for": "192.0.2.1" })),
        lookupRateLimitKey(new Headers({ "x-forwarded-for": "192.0.2.2" })),
      );
    } finally {
      if (previous === undefined) delete process.env.SCHEDULE_LOOKUP_IP_HEADER;
      else process.env.SCHEDULE_LOOKUP_IP_HEADER = previous;
      await pool.query("DELETE FROM schedule_lookup_attempts");
    }
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
      createParticipant({ fullName: "Again", nim: data.nim }),
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
  await test("unknown NIM cannot submit, consume capacity, or create a participant", async () => {
    const id = await newSlot(3, "13:00", "13:30"),
      data = await payload(id);
    const before = (await listParticipants()).length;
    await assert.rejects(
      submit({ ...data, nim: "99999999" }),
      (e) =>
        (e as InstanceType<typeof ApiError>).status === 422 &&
        (e as Error).message ===
          "Your NIM is not registered for this interview.",
    );
    await assert.rejects(
      submit({ ...data, nim: undefined, invitationToken: "a".repeat(64) }),
    );
    assert.equal((await listParticipants()).length, before);
    const {
      rows: [slot],
    } = await pool.query(
      "SELECT registered_count FROM interview_slots WHERE id=$1",
      [id],
    );
    assert.equal(slot.registered_count, 0);
  });
  await test("admin CRUD enforces unique NIM and protects participants with responses", async () => {
    const p = await createParticipant({
      fullName: "Original",
      nim: " 00123456 ",
    });
    await assert.rejects(
      createParticipant({ fullName: "Duplicate", nim: "00123456" }),
      (e) => (e as InstanceType<typeof ApiError>).status === 409,
    );
    const updated = await updateParticipant(p.id, {
      fullName: "Trusted Name",
      nim: "00123457",
    });
    assert.equal(updated.nim, "00123457");
    assert.ok(new Date(updated.updatedAt) >= new Date(p.updatedAt));
    const other = await createParticipant({
      fullName: "Other",
      nim: "00123458",
    });
    await assert.rejects(
      updateParticipant(other.id, { fullName: "Other", nim: "00123457" }),
      (e) => (e as InstanceType<typeof ApiError>).status === 409,
    );
    await deleteParticipant(other.id);
    const id = await newSlot(2, "13:30", "14:00");
    const input = {
      nim: "00123457",
      slotId: id,
      idempotencyKey: randomUUID(),
      answers: { [nameId]: "Untrusted Name", [emailId]: "shared@example.com" },
    };
    await assert.rejects(
      submit({ ...input, nim: "00123456" }),
      (e) => (e as InstanceType<typeof ApiError>).status === 422,
    );
    await submit(input);
    assert.deepEqual(await lookupSchedule({ nim: " 00123457 " }), {
      found: true,
      schedule: { date: "2099-09-21", startTime: "13:30", endTime: "14:00" },
    });
    const {
      rows: [s],
    } = await pool.query(
      "SELECT id,participant_id,full_name FROM submissions WHERE participant_id=$1",
      [p.id],
    );
    assert.equal(s.full_name, "Trusted Name");
    assert.equal(s.participant_id, p.id);
    assert.equal(
      (await getSubmission(s.id)).answers.find((a) => a.fieldId === nameId)
        ?.value,
      "Untrusted Name",
    );
    await assert.rejects(
      deleteParticipant(p.id),
      (e) => (e as InstanceType<typeof ApiError>).status === 409,
    );
    await assert.rejects(
      pool.query("DELETE FROM participants WHERE id=$1", [p.id]),
    );
    await updateParticipant(p.id, {
      fullName: "Corrected Name",
      nim: "00123459",
    });
    await assert.rejects(
      submit({ ...input, nim: "00123459", idempotencyKey: randomUUID() }),
      (e) => (e as InstanceType<typeof ApiError>).status === 409,
    );
    // Email is an answer, not an identity or whitelist requirement.
    await submit(await payload(id, "shared@example.com"));
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
  await test("mapped NIM answers must match the whitelist identity", async () => {
    const original = await getConfig(),
      nimId = randomUUID(),
      slot = await newSlot(2, "18:00", "18:30");
    try {
      await transaction((db) =>
        saveConfig(
          {
            ...original,
            nimFieldId: nimId,
            fields: [
              ...original.fields,
              {
                id: nimId,
                label: "NIM",
                type: "text",
                required: true,
                order: 2,
                options: [],
              },
            ],
          },
          db,
        ),
      );
      const data = await payload(slot);
      await assert.rejects(
        submit({ ...data, answers: { ...data.answers, [nimId]: "99999999" } }),
        (e) => (e as InstanceType<typeof ApiError>).status === 422,
      );
      await submit({
        ...data,
        answers: { ...data.answers, [nimId]: data.nim },
      });
    } finally {
      await transaction((db) => saveConfig(original, db));
    }
  });
  await test("concurrent deletion and submission cannot create an orphan response", async () => {
    const slot = await newSlot(2, "19:00", "19:30"),
      data = await payload(slot);
    const p = (await listParticipants()).find((p) => p.nim === data.nim)!;
    const results = await Promise.allSettled([
      submit(data),
      deleteParticipant(p.id),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const {
      rows: [state],
    } = await pool.query(
      "SELECT registered_count,(SELECT count(*)::integer FROM submissions WHERE participant_id=$2) AS responses FROM interview_slots WHERE id=$1",
      [slot, p.id],
    );
    assert.equal(state.registered_count, state.responses);
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
  await test("removing the email field still requires a registered NIM and prevents a second response", async () => {
    const slot = await newSlot(3, "17:00", "17:30"),
      data = await payload(slot);
    const config = await getConfig();
    const input = {
      ...data,
      answers: { [config.nameFieldId!]: "No email field" },
    };
    await assert.rejects(submit({ ...input, nim: undefined }));
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
