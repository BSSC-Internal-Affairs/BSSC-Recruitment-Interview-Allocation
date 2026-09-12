import { pool } from "../db";
import type { InterviewDate, Slot } from "../../types";
export async function getSchedules(): Promise<InterviewDate[]> {
  const { rows } =
    await pool.query(`SELECT d.id,to_char(d.date,'YYYY-MM-DD') AS date,
    COALESCE(json_agg(json_build_object('id',s.id,'interviewDateId',d.id,'startTime',to_char(s.start_time,'HH24:MI'),'endTime',to_char(s.end_time,'HH24:MI'),'capacity',s.capacity,'registeredCount',s.registered_count) ORDER BY s.start_time) FILTER (WHERE s.id IS NOT NULL),'[]') AS slots
    FROM interview_dates d LEFT JOIN interview_slots s ON s.interview_date_id=d.id GROUP BY d.id ORDER BY d.date`);
  return rows;
}
export const slotValues = (s: Omit<Slot, "id" | "registeredCount">) => [
  s.interviewDateId,
  s.startTime,
  s.endTime,
  s.capacity,
];
