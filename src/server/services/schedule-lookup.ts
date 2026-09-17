import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { transaction } from "../db";
import { ApiError } from "../errors";
import { scheduleLookupSchema } from "../validators";
import type { ScheduleLookupResult } from "../../types";

export function lookupRateLimitKey(headers: Headers): string {
  // Only trust a header that the deployment's reverse proxy overwrites.
  // Without one, all callers share a bucket; arbitrary forwarded headers
  // must not let callers bypass the limiter.
  const header = process.env.SCHEDULE_LOOKUP_IP_HEADER;
  const value = header ? headers.get(header)?.trim() : undefined;
  let identity = "shared";
  if (value && isIP(value))
    identity =
      isIP(value) === 6 ? new URL(`http://[${value}]`).hostname : value;
  return createHash("sha256").update(identity).digest("hex");
}

export async function limitScheduleLookup(headers: Headers): Promise<void> {
  const key = lookupRateLimitKey(headers);
  const attempt = await transaction(async (db) => {
    await db.query("SET LOCAL statement_timeout = '5s'");
    await db.query(
      "DELETE FROM schedule_lookup_attempts WHERE window_start < now()-interval '1 minute'",
    );
    const {
      rows: [row],
    } = await db.query(
      `INSERT INTO schedule_lookup_attempts(key,attempts,window_start)
       VALUES($1,1,now()) ON CONFLICT(key) DO UPDATE
       SET attempts=least(schedule_lookup_attempts.attempts+1,11)
       RETURNING attempts,greatest(1,ceil(extract(epoch FROM
         window_start+interval '1 minute'-now())))::integer AS retry_after`,
      [key],
    );
    return row;
  });
  if (attempt.attempts > 10)
    throw new ApiError(
      429,
      "Too many searches. Please try again in a minute.",
      undefined,
      attempt.retry_after,
    );
}

export async function lookupSchedule(
  input: unknown,
): Promise<ScheduleLookupResult> {
  const { nim } = scheduleLookupSchema.parse(input);
  return transaction(async (db) => {
    await db.query("SET LOCAL statement_timeout = '5s'");
    const {
      rows: [schedule],
    } = await db.query(
      `SELECT to_char(interview_date,'YYYY-MM-DD') AS date,
        to_char(start_time,'HH24:MI') AS "startTime",
        to_char(end_time,'HH24:MI') AS "endTime"
       FROM submissions WHERE nim=$1 ORDER BY submitted_at DESC,id DESC LIMIT 1`,
      [nim],
    );
    if (!schedule) return { found: false };
    return {
      found: true,
      schedule: {
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      },
    };
  });
}
