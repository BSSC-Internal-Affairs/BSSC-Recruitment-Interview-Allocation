import { createHash, randomUUID } from "node:crypto";
import { transaction, pool } from "../db";
import { getConfig } from "../repositories/config";
import { submissionSchema, validateAnswers } from "../validators";
import { ApiError } from "../errors";
import type { Booking, SubmissionDetail } from "../../types";
import { hashInvitation } from "./participants";
const formId = (n: string) => `INT${n.padStart(3, "0")}`;
export async function submit(input: unknown): Promise<Booking> {
  const data = submissionSchema.parse(input);
  return transaction(async (db) => {
    // Lock this identity through the entire reservation. Different request keys,
    // slots, browsers, or changed answers cannot create a second response.
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      data.idempotencyKey,
    ]);
    const {
      rows: [participant],
    } = await db.query(
      "SELECT id,email,disabled FROM participants WHERE invitation_token_hash=$1 FOR UPDATE",
      [hashInvitation(data.invitationToken)],
    );
    if (!participant || participant.disabled)
      throw new ApiError(
        403,
        "A valid private invitation is required. Please contact the committee.",
      );
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          participantId: participant.id,
          slot: data.slotId,
          answers: Object.entries(data.answers).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        }),
      )
      .digest("hex");
    const {
      rows: [existing],
    } = await db.query(
      `SELECT number::text,request_hash,to_char(interview_date,'YYYY-MM-DD') AS date,to_char(start_time,'HH24:MI') AS "startTime",to_char(end_time,'HH24:MI') AS "endTime" FROM submissions WHERE idempotency_key=$1`,
      [data.idempotencyKey],
    );
    if (existing) {
      if (existing.request_hash !== hash)
        throw new ApiError(
          409,
          "This request was already used. Start a new registration.",
        );
      return {
        formId: formId(existing.number),
        date: existing.date,
        startTime: existing.startTime,
        endTime: existing.endTime,
      };
    }
    const prior = await db.query(
      "SELECT id FROM submissions WHERE participant_id=$1 OR lower(btrim(email_key))=$2 LIMIT 1",
      [participant.id, participant.email],
    );
    if (prior.rowCount)
      throw new ApiError(
        409,
        "You have already submitted your response. Please contact the committee for changes.",
      );
    // Coordinate configuration edits with validation and answer snapshots.
    await db.query("SELECT id FROM form_configuration WHERE id=1 FOR SHARE");
    const config = await getConfig(db);
    if (!config.fields.length || !config.nameFieldId)
      throw new ApiError(409, "Registration is not open yet.");
    const errors = validateAnswers(config.fields, data.answers);
    const emailField = config.fields.find((field) => field.type === "email");
    if (
      emailField &&
      (data.answers[emailField.id] ?? "").trim().toLowerCase() !==
        participant.email
    ) {
      errors[emailField.id] =
        "Use the email address registered on your invitation.";
    }
    if (Object.keys(errors).length)
      throw new ApiError(422, "Please check your answers.", errors);
    // Lock the parent first, matching schedule edits/deletes, then claim capacity atomically.
    const {
      rows: [parent],
    } = await db.query(
      "SELECT interview_date_id FROM interview_slots WHERE id=$1",
      [data.slotId],
    );
    if (!parent)
      throw new ApiError(404, "This interview slot no longer exists.");
    const {
      rows: [date],
    } = await db.query(
      `SELECT to_char(date,'YYYY-MM-DD') AS date FROM interview_dates WHERE id=$1 AND date >= (now() AT TIME ZONE 'Asia/Jakarta')::date FOR SHARE`,
      [parent.interview_date_id],
    );
    if (!date)
      throw new ApiError(409, "This interview date is no longer available.");
    const {
      rows: [slot],
    } = await db.query(
      `UPDATE interview_slots SET registered_count=registered_count+1 WHERE id=$1 AND registered_count<capacity AND ($2::date+start_time) > (now() AT TIME ZONE 'Asia/Jakarta') RETURNING to_char(start_time,'HH24:MI') AS "startTime",to_char(end_time,'HH24:MI') AS "endTime"`,
      [data.slotId, date.date],
    );
    if (!slot)
      throw new ApiError(
        409,
        "That time is no longer available. Please choose another.",
      );
    const id = randomUUID();
    const {
      rows: [saved],
    } = await db.query(
      "INSERT INTO submissions(id,interview_slot_id,full_name,idempotency_key,request_hash,email_key,interview_date,start_time,end_time,participant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING number::text",
      [
        id,
        data.slotId,
        data.answers[config.nameFieldId].trim(),
        data.idempotencyKey,
        hash,
        participant.email,
        date.date,
        slot.startTime,
        slot.endTime,
        participant.id,
      ],
    );
    for (const f of config.fields)
      await db.query(
        "INSERT INTO submission_answers VALUES ($1,$2,$3,$4,$5,$6)",
        [id, f.id, f.label, f.type, (data.answers[f.id] ?? "").trim(), f.order],
      );
    return { formId: formId(saved.number), date: date.date, ...slot };
  });
}
export async function getSubmission(id: string): Promise<SubmissionDetail> {
  const {
    rows: [r],
  } = await pool.query(
    `SELECT id,number::text,full_name AS "fullName",submitted_at AS "submittedAt",to_char(interview_date,'YYYY-MM-DD') AS date,to_char(start_time,'HH24:MI') AS "startTime",to_char(end_time,'HH24:MI') AS "endTime" FROM submissions WHERE id=$1`,
    [id],
  );
  if (!r) throw new ApiError(404, "Response not found.");
  const { rows: answers } = await pool.query(
    'SELECT field_id AS "fieldId",label,value FROM submission_answers WHERE submission_id=$1 ORDER BY sort_order',
    [id],
  );
  return { ...r, formId: formId(r.number), answers };
}
