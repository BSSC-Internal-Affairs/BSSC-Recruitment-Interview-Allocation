import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z, ZodError } from "zod";
import { pool, transaction } from "../db";
import { ApiError } from "../errors";
import { login, requireAdmin, cookieName } from "../auth";
import { getConfig, saveConfig } from "../repositories/config";
import {
  getSchedules,
  slotValues,
  setDateVisibility,
} from "../repositories/schedules";
import { submit, getSubmission } from "../services/submissions";
import { listSubmissions } from "../services/responses";
import {
  limitScheduleLookup,
  lookupSchedule,
} from "../services/schedule-lookup";
import {
  createParticipant,
  listParticipants,
  updateParticipant,
  deleteParticipant,
} from "../services/participants";
import {
  configSchema,
  dateSchema,
  dateVisibilitySchema,
  slotSchema,
} from "../validators";
export async function handle(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const route = path.join("/"),
      method = request.method;
    if (method !== "GET") {
      const origin = request.headers.get("origin");
      if (
        origin &&
        origin !== (process.env.APP_ORIGIN || new URL(request.url).origin)
      )
        throw new ApiError(403, "Request origin is not allowed.");
    }
    const body = async (maxLength = 250000) => {
      const raw = await request.text();
      if (raw.length > maxLength)
        throw new ApiError(413, "Request is too large.");
      try {
        return JSON.parse(raw);
      } catch {
        throw new ApiError(400, "Invalid JSON request.");
      }
    };
    const ok = (data: unknown, status = 200) =>
      NextResponse.json(
        { data },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    if (route === "form" && method === "GET") return ok(await getConfig());
    if (route === "schedules" && method === "GET")
      return ok(await getSchedules());
    if (route === "public/schedule-lookup" && method === "POST") {
      await limitScheduleLookup(request.headers);
      return ok(await lookupSchedule(await body(1024)));
    }
    if (route === "submissions" && method === "POST")
      return ok(await submit(await body()), 201);
    if (route === "admin/login" && method === "POST") {
      const b = z
        .object({
          username: z.string().max(200),
          password: z.string().max(500),
        })
        .parse(await body());
      await login(b.username, b.password);
      return ok({ success: true });
    }
    if (path[0] !== "admin") throw new ApiError(404, "Endpoint not found.");
    await requireAdmin();
    if (route === "admin/participants") {
      if (method === "GET") return ok(await listParticipants());
      if (method === "POST")
        return ok(await createParticipant(await body()), 201);
    }
    if (path[1] === "participants" && path.length === 3 && method === "PUT") {
      return ok(await updateParticipant(z.uuid().parse(path[2]), await body()));
    }
    if (
      path[1] === "participants" &&
      path.length === 3 &&
      method === "DELETE"
    ) {
      await deleteParticipant(z.uuid().parse(path[2]));
      return ok({ success: true });
    }
    if (route === "admin/logout" && method === "POST") {
      (await cookies()).delete(cookieName);
      return ok({ success: true });
    }
    if (route === "admin/submissions" && method === "GET")
      return ok(
        await listSubmissions(Object.fromEntries(request.nextUrl.searchParams)),
      );
    if (path[1] === "submissions" && path.length === 3 && method === "GET")
      return ok(await getSubmission(z.uuid().parse(path[2])));
    if (route === "admin/form") {
      if (method === "GET") return ok(await getConfig());
      if (method === "PUT") {
        const c = configSchema.parse(await body());
        return ok(await transaction((db) => saveConfig(c, db)));
      }
    }
    if (route === "admin/schedules" && method === "GET")
      return ok(await getSchedules({ includeHidden: true }));
    // Form fields are managed as one ordered collection so reordering is transactional.
    if (route === "admin/fields" && method === "PUT") {
      const fields = z
        .array((await import("../validators")).fieldSchema)
        .max(50)
        .parse(await body());
      return ok(
        await transaction(async (db) => {
          await db.query(
            "SELECT id FROM form_configuration WHERE id=1 FOR UPDATE",
          );
          const config = await getConfig(db);
          return saveConfig(configSchema.parse({ ...config, fields }), db);
        }),
      );
    }
    if (path[1] === "dates") {
      if (path.length === 3 && method === "PATCH") {
        const id = z.uuid().parse(path[2]);
        const { isVisible } = dateVisibilitySchema.parse(await body());
        await setDateVisibility(id, isVisible);
        return ok(await getSchedules({ includeHidden: true }));
      }
      if (path.length === 2 && method === "POST") {
        const b = dateSchema.parse(await body());
        await pool.query(
          "INSERT INTO interview_dates(id,date) VALUES ($1,$2)",
          [randomUUID(), b.date],
        );
        return ok(await getSchedules({ includeHidden: true }), 201);
      }
      if (path.length === 3 && (method === "PUT" || method === "DELETE")) {
        const id = z.uuid().parse(path[2]);
        const b = method === "PUT" ? dateSchema.parse(await body()) : null;
        await transaction(async (db) => {
          const r = await db.query(
            "SELECT id FROM interview_dates WHERE id=$1 FOR UPDATE",
            [id],
          );
          if (!r.rowCount) throw new ApiError(404, "Date not found.");
          const booked = await db.query(
            "SELECT id FROM interview_slots WHERE interview_date_id=$1 AND registered_count>0",
            [id],
          );
          if (booked.rowCount)
            throw new ApiError(
              409,
              "This date has registrations and cannot be changed or deleted.",
            );
          if (b)
            await db.query("UPDATE interview_dates SET date=$1 WHERE id=$2", [
              b.date,
              id,
            ]);
          else await db.query("DELETE FROM interview_dates WHERE id=$1", [id]);
        });
        return ok(await getSchedules({ includeHidden: true }));
      }
    }
    if (path[1] === "slots") {
      if (path.length === 2 && method === "POST") {
        const b = slotSchema.parse(await body());
        await pool.query(
          "INSERT INTO interview_slots(id,interview_date_id,start_time,end_time,capacity) VALUES ($1,$2,$3,$4,$5)",
          [randomUUID(), ...slotValues(b)],
        );
        return ok(await getSchedules({ includeHidden: true }), 201);
      }
      if (path.length === 3 && (method === "PUT" || method === "DELETE")) {
        const id = z.uuid().parse(path[2]);
        const b = method === "PUT" ? slotSchema.parse(await body()) : null;
        await transaction(async (db) => {
          const {
            rows: [s],
          } = await db.query(
            `SELECT *,to_char(start_time,'HH24:MI') AS start,to_char(end_time,'HH24:MI') AS finish FROM interview_slots WHERE id=$1 FOR UPDATE`,
            [id],
          );
          if (!s) throw new ApiError(404, "Time slot not found.");
          if (!b) {
            if (s.registered_count > 0)
              throw new ApiError(409, "A booked slot cannot be deleted.");
            await db.query("DELETE FROM interview_slots WHERE id=$1", [id]);
          } else {
            if (b.interviewDateId !== s.interview_date_id)
              throw new ApiError(
                422,
                "Create a new slot to move it to another date.",
              );
            if (b.capacity < s.registered_count)
              throw new ApiError(
                409,
                "Capacity cannot be lower than existing registrations.",
              );
            if (
              s.registered_count > 0 &&
              (b.startTime !== s.start || b.endTime !== s.finish)
            )
              throw new ApiError(
                409,
                "A booked interview time cannot be changed.",
              );
            await db.query(
              "UPDATE interview_slots SET start_time=$1,end_time=$2,capacity=$3 WHERE id=$4",
              [b.startTime, b.endTime, b.capacity, id],
            );
          }
        });
        return ok(await getSchedules({ includeHidden: true }));
      }
    }
    throw new ApiError(404, "Endpoint not found.");
  } catch (error) {
    let status = 500,
      message = "Something went wrong. Please try again.",
      fields: Record<string, string> | undefined;
    if (error instanceof ApiError) {
      status = error.status;
      message = error.message;
      fields = error.fields;
    } else if (error instanceof ZodError) {
      status = 422;
      message = error.issues.map((i) => i.message).join(" ");
    } else if ((error as { code?: string }).code === "23505") {
      status = 409;
      message =
        "This record already exists. Please check the details and try again.";
    } else if ((error as { code?: string }).code === "23503") {
      status = 409;
      message =
        "This record is in use or no longer exists. Refresh and try again.";
    } else console.error(error);
    return NextResponse.json(
      {
        error: {
          message,
          fields,
          code: error instanceof ApiError ? error.code : undefined,
        },
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(error instanceof ApiError && error.retryAfter
            ? { "Retry-After": String(error.retryAfter) }
            : {}),
        },
      },
    );
  }
}
