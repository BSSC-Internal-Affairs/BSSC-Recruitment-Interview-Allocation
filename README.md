# BSSC Interview Scheduler

A two-step interview registration form and protected committee dashboard built with Next.js, React, TypeScript, Tailwind CSS, and PostgreSQL.

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

Open [the participant form](http://localhost:3011) or [committee login](http://localhost:3011/admin). The app uses port 3011 to avoid other local services. The optional seed creates six example fields in the database, only when no fields exist. Add interview dates and times through the dashboard; schedules are not hardcoded.

This workspace was initialized with a Git-ignored `.env.local` containing randomly generated admin credentials. Use those credentials for local committee access.

## Features

- Editable header, instructions, dynamic fields, required status, dropdown options, and field ordering.
- Explicit full-name field mapping for the response table.
- Inline validation, disabled full/past slots, availability refresh every 10 seconds and on window focus, and printable confirmation.
- Protected response list (latest 1,000), search, and complete answer details.
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

The database enforces `0 <= registered_count <= capacity`, foreign keys, unique dates/time ranges, and unique request keys. Remaining capacity is calculated, never stored. The first nonempty email answer is normalized and unique across registrations. If no email is supplied, deduplication uses the request key only. Keep the intended email field first in field order when using multiple email fields.

Labels, field types, order, answers, and appointment details are snapshotted. Editing or deleting a field preserves historical responses. Snapshot field IDs intentionally have no live-field foreign key.

## REST API

Success: `{ "data": ... }`. Error: `{ "error": { "message": "...", "fields": { "fieldId": "..." } } }`, with optional `fields`.

| Method      | Path                         | Purpose                                                     |
| ----------- | ---------------------------- | ----------------------------------------------------------- |
| GET         | `/api/form`                  | Header and ordered fields                                   |
| GET         | `/api/schedules`             | Dates, slots, capacity and registered counts                |
| POST        | `/api/submissions`           | `{ slotId, idempotencyKey, answers: { [fieldId]: value } }` |
| POST        | `/api/admin/login`           | `{ username, password }`                                    |
| POST        | `/api/admin/logout`          | Clear session                                               |
| GET         | `/api/admin/submissions`     | Latest 1,000 responses                                      |
| GET         | `/api/admin/submissions/:id` | Full response and answer snapshots                          |
| GET, PUT    | `/api/admin/form`            | Read/replace header, name mapping and fields atomically     |
| PUT         | `/api/admin/fields`          | Replace ordered field collection atomically                 |
| GET         | `/api/admin/schedules`       | Schedule management data                                    |
| POST        | `/api/admin/dates`           | `{ date: "YYYY-MM-DD" }`                                    |
| PUT, DELETE | `/api/admin/dates/:id`       | Update/remove unbooked date                                 |
| POST        | `/api/admin/slots`           | `{ interviewDateId, startTime, endTime, capacity }`         |
| PUT, DELETE | `/api/admin/slots/:id`       | Update/remove slot with booking guards                      |

Times use `HH:mm`. Field types: `text`, `email`, `tel`, `number`, `textarea`, `select`. Fields contain `id`, `label`, `type`, `required`, `order`, and `options`. `nameFieldId` references a required text field. Send the complete ordered collection to add/edit/delete/reorder fields. Errors use appropriate 4xx/5xx statuses.

## Authentication and production

Admin pages and API operations enforce authentication on the server. Sessions expire after eight hours, using an HMAC-signed, HttpOnly, SameSite=Strict cookie; production adds Secure. Mutations check browser Origin against `APP_ORIGIN`. PostgreSQL limits login attempts to 10 per 15 minutes for the shared admin account; successful login clears the counter. Rotate the session secret to invalidate all sessions.

For production, set environment variables through your host, use the exact HTTPS origin for `APP_ORIGIN`, configure persistent PostgreSQL, run migrations, then:

```sh
npm run build
npm start
```

The app requires a Node.js server; it is not a static export. Use HTTPS for secure admin cookies and back up PostgreSQL. External hosting is not configured.

## Verification

```sh
npm run typecheck
npm test
npm run test:integration
npm run build
# With the app running and Chrome installed:
node --env-file=.env.local node_modules/@playwright/test/cli.js test --timeout=120000
```

Integration tests create and clean up an isolated PostgreSQL schema. They cover concurrent reservations, idempotent retries, duplicate email rollback, invalid answers, database guards, and answer history. Browser tests cover the participant journey, protected admin CRUD, dynamic fields, full slots, and mobile layout; they restore configuration and remove their own records. Run browser tests against a local database, not a live recruitment event.

References: [Next.js route handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route), [PostgreSQL row locking](https://www.postgresql.org/docs/17/explicit-locking.html).
