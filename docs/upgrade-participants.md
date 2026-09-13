# Upgrade to the NIM participant whitelist

## Deploy the update

1. In your existing Supabase project, open **SQL Editor → New query**.
2. Copy all of `db/003_participant_nim.sql` into the query and click **Run**. This assumes the previous `002_participants.sql` migration is already installed.
3. Deploy the updated code to Vercel immediately afterward. The old application uses columns removed by this migration, so coordinate these steps during a quiet period.
4. Open **Admin → Participants**. Edit existing records marked **NIM needed** and enter each person's verified NIM. No NIMs are guessed or taken from public answers.

No new environment variables are required. For a fresh local installation, `npm run db:migrate` applies the migrations in order. Rerunning that command on an upgraded database skips the obsolete invitation migration.

## Database changes

- Adds unique `participants.nim` (text, 1–32 digits; leading zeros are preserved) and `updated_at` with an update trigger.
- Preserves old participants with a NULL NIM until an admin assigns one. They cannot submit without a registered NIM. New registrations and edits require a NIM.
- Removes `participants.email`, `invitation_token_hash`, and `disabled`.
- Retains `submissions.participant_id`, its foreign key, and its unique index: one response per participant.
- Removes the old unique constraint on `submissions.email_key`. Email remains a form answer, not an authorization or deduplication key. Historical values are preserved.
- Adds optional `form_configuration.nim_field_id` with a foreign key. An existing text question labeled NIM, Student ID, or Student Number is mapped and labeled NIM. If none exists, the public form shows a separate required NIM input. Admins can adjust this mapping under Form configuration.

Existing participant IDs, responses, answers, interview dates, times, and capacity are preserved. Existing participants who already responded remain associated with their responses after their NIM is assigned. Responses predating participant tracking remain available; review historical records when preparing the whitelist.

## Correct workflow

- Admins register **Full name + NIM**, and can search, edit, or delete participants with no responses. Participants with responses cannot be deleted.
- Everyone opens the same public form URL. No invitation, email delivery, private link, or access token is used.
- The submission API checks the submitted NIM against the admin-managed roster before reserving capacity. Unknown NIMs receive: **Your NIM is not registered for this interview.** Public submissions never create participants.
- The registered participant name is saved as the response identity. A name entered in the form is retained as an answer and does not authorize submission.
- Editing a participant keeps the same participant ID, so a participant who already responded cannot submit again after an edit.

## API

- `POST /api/admin/participants`: `{ fullName, nim }` → participant.
- `PUT /api/admin/participants/:id`: `{ fullName, nim }` → updated participant.
- `DELETE /api/admin/participants/:id`: deletes only participants without responses.
- `GET /api/admin/participants`: admin-only roster, including response status and legacy NIMs awaiting completion.
- `POST /api/submissions`: `{ nim, slotId, idempotencyKey, answers }`. If a dynamic NIM question is mapped, its answer must match `nim`.

The invitation endpoints have been removed. Response date/day/time filtering and sorting are unchanged.
