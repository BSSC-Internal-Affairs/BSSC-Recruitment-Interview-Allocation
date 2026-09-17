# BSSC Interview Scheduler

A two-step interview registration form with an admin-managed NIM whitelist and a protected committee dashboard built with Next.js, React, TypeScript, Tailwind CSS, and PostgreSQL.

**Already deployed?** Run `db/003_participant_nim.sql` in Supabase before redeploying. Follow the [participant upgrade guide](docs/upgrade-participants.md) for exact steps and schema changes.

For public schedule lookup, also run `db/004_schedule_lookup.sql` before deploying this version. It snapshots existing submission NIMs using linked participants, then unambiguous historical NIM answers. Records with no known NIM remain unsearchable until their submission NIM is assigned. New submissions save their NIM directly; subsequent roster edits do not change that snapshot.

## Run locally

Requires Node.js 22.13+ and Docker (or an existing PostgreSQL 17 database).

```sh
npm install
docker compose up -d db
```

Copy `.env.example` to `.env.local`. Set `ADMIN_USERNAME`, a strong `ADMIN_PASSWORD`, and a random `SESSION_SECRET` of at least 32 characters:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The Docker database listens on **localhost:55432**. Its example password is for local development; use separate database credentials in production.

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Open [committee login](http://localhost:3011/admin). Add interview dates and times, then register names and NIMs in **Participants**. Participants use the public form URL. The app uses port 3011 to avoid other local services. The optional seed creates six example fields only when no fields exist; schedules are managed through the dashboard.

This workspace was initialized with a Git-ignored `.env.local` containing randomly generated admin credentials. Use those credentials for local committee access.

## Features

- Editable header, instructions, dynamic fields, required status, dropdown options, and field ordering.
- Public `/schedule-check` page: exact NIM lookup with only interview date and time, no login or whitelist check.
- Dynamic full-name and NIM question mapping; the registered name identifies each response.
- Inline validation, disabled full/past slots, availability refresh every 10 seconds and on window focus, and printable confirmation.
- Admin participant registration by NIM, editing, safe deletion, name/NIM search, and one response per participant.
- Protected responses with date, weekday, and time filters, sorting, pagination, search, and complete answer details.
- Date/slot CRUD and total, registered, and remaining capacity.
- Booked dates/times cannot be moved or deleted. Capacity cannot fall below existing registrations.
- All appointments and timestamps use **Asia/Jakarta (WIB, UTC+7)**.

## Structure

```text
src/app/                  Pages, protected layout, REST route adapter
src/components/           Participant and admin UI
src/hooks/                Schedule refresh behavior
src/services/             Typed browser API functions
src/types/                Shared types
src/utils/                Date/time helpers
src/server/controllers/   REST routing, access checks, error responses
src/server/services/      Reservation transaction and response retrieval
src/server/repositories/  Configuration and schedule persistence
src/server/validators.ts  Shared input and dynamic answer validation
src/server/auth.ts        Environment credentials and signed sessions
db/                       PostgreSQL schema
scripts/                  Migration and optional seed
tests/                    Validation, PostgreSQL, and browser tests
```

## Reservation consistency

Each reservation runs in one transaction. An advisory lock serializes retries with the same idempotency key. A shared configuration lock keeps validation and answer snapshots consistent with edits. The date is locked against concurrent removal; a conditional slot update increments registrations only when capacity remains and the interview has not started. The submission and all answers commit together. Any failure rolls back capacity too.

The database enforces `0 <= registered_count <= capacity`, foreign keys, unique dates/time ranges, unique request keys, and one response per participant. Remaining capacity is calculated, never stored. A registered NIM is required on every submission. A participant row lock serializes simultaneous submissions, edits, and deletion. The registered name is the trusted response identity. Public inputs never create participants; email answers do not grant access.

Labels, field types, order, answers, and appointment details are snapshotted. Editing or deleting a field preserves historical responses. Snapshot field IDs intentionally have no live-field foreign key.

## REST API

Success: `{ "data": ... }`. Error: `{ "error": { "message": "...", "fields": { "fieldId": "..." } } }`, with optional `fields`.

| Method      | Path                          | Purpose                                                                                                         |
| ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| GET         | `/api/form`                   | Header and ordered fields                                                                                       |
| GET         | `/api/schedules`              | Dates, slots, capacity and registered counts                                                                    |
| POST        | `/api/public/schedule-lookup` | `{ nim }` → `{ data: { found: false } }` or `{ data: { found: true, schedule: { date, startTime, endTime } } }` |
| POST        | `/api/submissions`            | `{ nim, slotId, idempotencyKey, answers: { [fieldId]: value } }`                                                |
| POST        | `/api/admin/login`            | `{ username, password }`                                                                                        |
| POST        | `/api/admin/logout`           | Clear session                                                                                                   |
| GET         | `/api/admin/submissions`      | Filtered and paginated responses                                                                                |
| GET         | `/api/admin/submissions/:id`  | Full response and answer snapshots                                                                              |
| GET, PUT    | `/api/admin/form`             | Read/replace header, name mapping and fields atomically                                                         |
| PUT         | `/api/admin/fields`           | Replace ordered field collection atomically                                                                     |
| GET         | `/api/admin/schedules`        | Schedule management data                                                                                        |
| POST        | `/api/admin/dates`            | `{ date: "YYYY-MM-DD" }`                                                                                        |
| PUT, DELETE | `/api/admin/dates/:id`        | Update/remove unbooked date                                                                                     |
| POST        | `/api/admin/slots`            | `{ interviewDateId, startTime, endTime, capacity }`                                                             |
| PUT, DELETE | `/api/admin/slots/:id`        | Update/remove slot with booking guards                                                                          |

Times use `HH:mm`. Field types: `text`, `email`, `tel`, `number`, `textarea`, `select`. Fields contain `id`, `label`, `type`, `required`, `order`, and `options`. `nameFieldId` references a required text field. Send the complete ordered collection to add/edit/delete/reorder fields. Errors use appropriate 4xx/5xx statuses.

## Authentication and production

Schedule lookup accepts trimmed NIMs containing 1–32 digits (preserving leading zeros), sends NIM in a POST body, and never caches responses. It reads only submission snapshots. A PostgreSQL counter allows 10 searches per minute per trusted IP across app instances, including invalid requests, with HTTP 429 and `Retry-After` thereafter. Expired counters are cleaned up on subsequent requests. Queries have a five-second statement timeout; the browser times out after 15 seconds.

For per-IP limits, set `SCHEDULE_LOOKUP_IP_HEADER` to a header containing one client IP that your reverse proxy **overwrites**, and prevent direct access bypassing that proxy. Do not trust a client-supplied forwarding header. When unconfigured or invalid, callers share one bucket (10 searches/minute total).

Admin pages and API operations enforce authentication on the server. Sessions expire after eight hours, using an HMAC-signed, HttpOnly, SameSite=Strict cookie; production adds Secure. Mutations check browser Origin against `APP_ORIGIN`. PostgreSQL limits login attempts to 10 per 15 minutes for the shared admin account; successful login clears the counter. Rotate the session secret to invalidate all sessions.

For production, set environment variables through your host, use the exact HTTPS origin for `APP_ORIGIN`, configure persistent PostgreSQL, run migrations, then:

```sh
npm run build
npm start
```

The app requires a Node.js server; it is not a static export. Use HTTPS for secure admin cookies and back up PostgreSQL. See the [deployed database upgrade guide](docs/upgrade-participants.md) before deploying this update to Vercel.

## Verification

```sh
npm run typecheck
npm test
npm run test:integration
npm run build
# With the app running and Chrome installed:
node --env-file=.env.local node_modules/@playwright/test/cli.js test --timeout=120000
```

Integration tests create and clean up an isolated PostgreSQL schema. They cover concurrent reservations, idempotent retries, unknown NIM rejection, participant CRUD, duplicate response rollback, invalid answers, database guards, and answer history. Browser tests cover the participant journey, protected admin CRUD, dynamic fields, full slots, and mobile layout; they restore configuration and remove their own records. Run browser tests against a local database, not a live recruitment event.

References: [Next.js route handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route), [PostgreSQL row locking](https://www.postgresql.org/docs/17/explicit-locking.html).
