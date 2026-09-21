import { pool } from "../db";
import type { InterviewDate, Slot } from "../../types";
import { ApiError } from "../errors";
export async function getSchedules({ includeHidden = false } = {}): Promise<
  InterviewDate[]
> {
  const { rows } = await pool.query(
    `SELECT d.id,to_char(d.date,'YYYY-MM-DD') AS date,d.is_visible AS "isVisible",
    COALESCE(json_agg(json_build_object('id',s.id,'interviewDateId',d.id,'startTime',to_char(s.start_time,'HH24:MI'),'endTime',to_char(s.end_time,'HH24:MI'),'capacity',s.capacity,'registeredCount',s.registered_count) ORDER BY s.start_time) FILTER (WHERE s.id IS NOT NULL),'[]') AS slots
    FROM interview_dates d LEFT JOIN interview_slots s ON s.interview_date_id=d.id
    WHERE ($1::boolean OR d.is_visible) GROUP BY d.id ORDER BY d.date`,
    [includeHidden],
  );
  return rows;
}
export async function setDateVisibility(id: string, isVisible: boolean) {
  // The update waits for in-flight bookings holding a shared date lock.
  const result = await pool.query(
    "UPDATE interview_dates SET is_visible=$1 WHERE id=$2",
    [isVisible, id],
  );
  if (!result.rowCount) throw new ApiError(404, "Date not found.");
}
export const slotValues = (s: Omit<Slot, "id" | "registeredCount">) => [
  s.interviewDateId,
  s.startTime,
  s.endTime,
  s.capacity,
];
