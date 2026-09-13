import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, transaction } from "../db";
import { ApiError } from "../errors";
import { participantSchema } from "../validators";
import type { Participant } from "../../types";
const columns = `p.id,p.full_name AS "fullName",p.nim,p.created_at AS "createdAt",p.updated_at AS "updatedAt",
 s.id AS "submissionId",s.submitted_at AS "submittedAt",
 CASE WHEN s.number IS NULL THEN NULL ELSE 'INT'||lpad(s.number::text,greatest(length(s.number::text),3),'0') END AS "formId"`;
export async function listParticipants(): Promise<Participant[]> {
  const { rows } = await pool.query(
    `SELECT ${columns} FROM participants p LEFT JOIN submissions s ON s.participant_id=p.id ORDER BY p.created_at DESC,p.id`,
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
    `SELECT ${columns} FROM participants p LEFT JOIN submissions s ON s.participant_id=p.id WHERE p.id=$1`,
    [id],
  );
  if (!p) throw new ApiError(404, "Participant not found.");
  return p;
}
function uniqueNim(error: unknown): never {
  if ((error as { code?: string }).code === "23505")
    throw new ApiError(409, "This NIM is already registered.");
  throw error;
}
export async function createParticipant(input: unknown): Promise<Participant> {
  const data = participantSchema.parse(input),
    id = randomUUID();
  return transaction(async (db) => {
    try {
      await db.query(
        "INSERT INTO participants(id,full_name,nim) VALUES($1,$2,$3)",
        [id, data.fullName, data.nim],
      );
    } catch (error) {
      uniqueNim(error);
    }
    return getParticipant(id, db);
  });
}
export async function updateParticipant(
  id: string,
  input: unknown,
): Promise<Participant> {
  const data = participantSchema.parse(input);
  return transaction(async (db) => {
    // Shares the identity lock with submissions and deletion.
    const locked = await db.query(
      "SELECT id FROM participants WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!locked.rowCount) throw new ApiError(404, "Participant not found.");
    try {
      await db.query(
        "UPDATE participants SET full_name=$1,nim=$2 WHERE id=$3",
        [data.fullName, data.nim, id],
      );
    } catch (error) {
      uniqueNim(error);
    }
    return getParticipant(id, db);
  });
}
export async function deleteParticipant(id: string): Promise<void> {
  return transaction(async (db) => {
    const locked = await db.query(
      "SELECT id FROM participants WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!locked.rowCount) throw new ApiError(404, "Participant not found.");
    const linked = await db.query(
      "SELECT id FROM submissions WHERE participant_id=$1 LIMIT 1",
      [id],
    );
    if (linked.rowCount)
      throw new ApiError(
        409,
        "Participants with a response cannot be deleted.",
      );
    await db.query("DELETE FROM participants WHERE id=$1", [id]);
  });
}
