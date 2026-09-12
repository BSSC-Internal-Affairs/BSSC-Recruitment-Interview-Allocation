import { pool } from "../db";
import { responseFiltersSchema } from "../validators";
import type { ResponseList } from "../../types";
export async function listSubmissions(
  input: unknown = {},
): Promise<ResponseList> {
  const filters = responseFiltersSchema.parse(input),
    pageSize = 50;
  const values: unknown[] = [],
    conditions: string[] = [];
  const where = (sql: string, value: unknown) => {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  };
  if (filters.q)
    where(
      `position(lower(?) in lower(full_name||' INT'||lpad(number::text,greatest(length(number::text),3),'0')))>0`,
      filters.q,
    );
  if (filters.date) where("interview_date=?::date", filters.date);
  if (filters.weekday !== undefined)
    where("extract(dow from interview_date)=?::integer", filters.weekday);
  if (filters.time) where("start_time=?::time", filters.time);
  const clause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orders = {
    submitted_desc: "submitted_at DESC,id DESC",
    submitted_asc: "submitted_at ASC,id ASC",
    interview_asc: "interview_date ASC,start_time ASC,submitted_at ASC,id ASC",
    interview_desc:
      "interview_date DESC,start_time DESC,submitted_at DESC,id DESC",
    name_asc: "lower(full_name) ASC,submitted_at DESC,id DESC",
  };
  const {
    rows: [count],
  } = await pool.query(
    `SELECT count(*)::integer AS total FROM submissions ${clause}`,
    values,
  );
  const page = Math.min(
    filters.page,
    Math.max(1, Math.ceil(count.total / pageSize)),
  );
  const [
    { rows },
    {
      rows: [options],
    },
  ] = await Promise.all([
    pool.query(
      `SELECT id,number::text,full_name AS "fullName",submitted_at AS "submittedAt",
      to_char(interview_date,'YYYY-MM-DD') AS date,to_char(start_time,'HH24:MI') AS "startTime",to_char(end_time,'HH24:MI') AS "endTime"
      FROM submissions ${clause} ORDER BY ${orders[filters.sort]} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, (page - 1) * pageSize],
    ),
    pool.query(`SELECT COALESCE(array_agg(DISTINCT to_char(interview_date,'YYYY-MM-DD') ORDER BY to_char(interview_date,'YYYY-MM-DD')),'{}') AS dates,
      COALESCE(array_agg(DISTINCT to_char(start_time,'HH24:MI') ORDER BY to_char(start_time,'HH24:MI')),'{}') AS times FROM submissions`),
  ]);
  return {
    items: rows.map((row) => ({
      ...row,
      formId: `INT${row.number.padStart(3, "0")}`,
    })),
    total: count.total,
    page,
    pageSize,
    ...options,
  };
}
