import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, transaction } from "../db";
import { ApiError } from "../errors";
import { participantSchema } from "../validators";
import type {
  Participant,
  ParticipantAccess,
  ParticipantInvitation,
} from "../../types";

export const hashInvitation = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const participantColumns = `p.id,p.full_name AS "fullName",p.email,p.disabled,p.created_at AS "createdAt",
  s.id AS "submissionId",s.submitted_at AS "submittedAt",
  CASE WHEN s.number IS NULL THEN NULL ELSE 'INT'||lpad(s.number::text,greatest(length(s.number::text),3),'0') END AS "formId"`;

export async function listParticipants(): Promise<Participant[]> {
  const { rows } = await pool.query(
    `SELECT ${participantColumns} FROM participants p LEFT JOIN submissions s ON s.participant_id=p.id ORDER BY p.created_at DESC,p.id`,
  );
  return rows;
}
async function getParticipant(
  id: string,
  db: PoolClient,
): Promise<Participant> {
  const {
    rows: [p],
  } = await db.query(
    `SELECT ${participantColumns} FROM participants p LEFT JOIN submissions s ON s.participant_id=p.id WHERE p.id=$1`,
    [id],
  );
  if (!p) throw new ApiError(404, "Participant not found.");
  return p;
}
export async function createParticipant(
  input: unknown,
): Promise<ParticipantInvitation> {
  const data = participantSchema.parse(input),
    id = randomUUID(),
    token = randomBytes(32).toString("hex");
  return transaction(async (db) => {
    const existing = await db.query(
      "SELECT id FROM submissions WHERE lower(btrim(email_key))=$1 LIMIT 1",
      [data.email],
    );
    if (existing.rowCount)
      throw new ApiError(
        409,
        "This email already has a response. A second registration is not allowed.",
      );
    try {
      await db.query(
        "INSERT INTO participants(id,full_name,email,invitation_token_hash) VALUES ($1,$2,$3,$4)",
        [id, data.fullName, data.email, hashInvitation(token)],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new ApiError(
          409,
          "This email is already registered in Participants.",
        );
      throw error;
    }
    return { participant: await getParticipant(id, db), token };
  });
}
export async function replaceInvitation(
  id: string,
): Promise<ParticipantInvitation> {
  return transaction(async (db) => {
    await db.query("SELECT id FROM participants WHERE id=$1 FOR UPDATE", [id]);
    const p = await getParticipant(id, db);
    if (p.formId)
      throw new ApiError(409, "This participant has already responded.");
    if (p.disabled)
      throw new ApiError(
        409,
        "Enable the participant before creating a new invitation.",
      );
    const token = randomBytes(32).toString("hex");
    await db.query(
      "UPDATE participants SET invitation_token_hash=$1 WHERE id=$2",
      [hashInvitation(token), id],
    );
    return { participant: p, token };
  });
}
export async function setParticipantDisabled(
  id: string,
  disabled: boolean,
): Promise<Participant> {
  return transaction(async (db) => {
    const r = await db.query(
      "UPDATE participants SET disabled=$1 WHERE id=$2 RETURNING id",
      [disabled, id],
    );
    if (!r.rowCount) throw new ApiError(404, "Participant not found.");
    return getParticipant(id, db);
  });
}
export async function verifyInvitation(
  token: string,
): Promise<ParticipantAccess> {
  if (!/^[0-9a-f]{64}$/.test(token))
    throw new ApiError(
      403,
      "This invitation is invalid. Ask the committee for your private link.",
    );
  const {
    rows: [r],
  } = await pool.query(
    `SELECT p.full_name AS "fullName",p.email,p.disabled,s.number::text,
    to_char(s.interview_date,'YYYY-MM-DD') AS date,to_char(s.start_time,'HH24:MI') AS "startTime",to_char(s.end_time,'HH24:MI') AS "endTime"
    FROM participants p LEFT JOIN submissions s ON s.participant_id=p.id WHERE p.invitation_token_hash=$1`,
    [hashInvitation(token)],
  );
  if (!r || r.disabled)
    throw new ApiError(
      403,
      "This invitation is invalid or disabled. Ask the committee for help.",
    );
  return {
    fullName: r.fullName,
    email: r.email,
    booking: r.number
      ? {
          formId: `INT${r.number.padStart(3, "0")}`,
          date: r.date,
          startTime: r.startTime,
          endTime: r.endTime,
        }
      : null,
  };
}
