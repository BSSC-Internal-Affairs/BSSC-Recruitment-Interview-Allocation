# Upgrade: registered participants

Apply the database change **before deploying the updated application**. No new environment variables are required; keep the existing database connection, admin credentials, `SESSION_SECRET`, and `APP_ORIGIN`.

## 1. Update your existing Supabase database

1. Open the Supabase project used by this app.
2. Open **SQL Editor** and create a **New query**.
3. Open `db/002_participants.sql` in this repository and copy its entire contents into the editor.
4. Click **Run** and wait for success. Resolve any error before deploying.

Run only `002_participants.sql` for this upgrade. Do not recreate the database or run the seed. The migration runs in a transaction and is safe to rerun.

| Change                                                               | Purpose                                                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| New `participants` table                                             | ID, full name, unique normalized email, unique invitation token hash, disabled status, creation timestamp.          |
| New nullable `submissions.participant_id`                            | Connects responses to participants; nullable to preserve older responses.                                           |
| Foreign key and unique index on `submissions.participant_id`         | Prevents deleting linked participants and allows one response per participant.                                      |
| Interview date/time/submission time and participant creation indexes | Support sorting and listing.                                                                                        |
| Row Level Security on `participants`                                 | No public Data API access to the roster or invitation hashes. The app uses its existing server database connection. |

Existing responses, answers, dates, slots, and capacity are preserved. Older responses containing an email are added to the roster and linked to their earliest matching response. They appear as already responded and cannot receive a second invitation. Responses without an email remain in Responses, with no participant link.

Weekday and interview time use existing `submissions.interview_date`, `start_time`, and `end_time` columns; these are not new columns. For a fresh local database, `npm run db:migrate` applies all migrations in order.

## 2. Redeploy on Vercel

1. After the SQL query succeeds, commit and push the updated code to the branch connected to Vercel production.
2. Wait for the new deployment to show **Ready**. If automatic deployments are disabled, deploy that updated commit from Vercel.
3. Open the production site and sign in at `/admin`.

The old application retains its old access behavior until the new code is deployed. After the update, the homepage requires an invitation. Previously opened forms without an invitation cannot submit.

## 3. Register and invite participants

1. Open **Participants** in the admin sidebar.
2. Enter a full name and email, then click **Register participant**.
3. Copy the **Private invitation link** and send it privately using your usual communication channel. The app does not send email automatically.
4. The participant opens that link, completes the form, and chooses an interview time.
5. Their status changes to **Responded**. Opening the same link again displays their confirmation instead of another form.

Each email can be registered once, ignoring capitalization and surrounding spaces. The first email field, if present, is prefilled and must match the registered email. Registration is still required if the form has no email field.

Links contain a random 256-bit token in the URL fragment (`#invite=...`). Only its SHA-256 hash is stored. Treat the full link as private: anyone holding it can use that invitation. This is an invitation system, not email ownership verification.

The full link is shown after registration or replacement. Save it before leaving. If you lose a pending participant's link, click **Replace link**; the previous link immediately stops working. **Disable** blocks access and submission; **Enable** restores access. Completed participants cannot receive replacement links or submit again.

## 4. Filter responses

Open **Responses** to see interview weekday, date, and time range in WIB. Filter by date, weekday, or start time. Sort by submission time, interview date/time, or name. Search and filters apply to all matching responses, with 50 results per page.

## API changes

- `POST /api/submissions` requires `invitationToken` with the existing fields.
- `POST /api/invitations/verify` accepts `{ token }` and returns identity and any completed booking.
- Admin-only `GET/POST /api/admin/participants` lists/registers participants.
- Admin-only `PUT /api/admin/participants/:id` accepts `{ disabled }`.
- Admin-only `POST /api/admin/participants/:id/invitation` replaces a pending invitation.
- Admin-only `GET /api/admin/submissions` returns `{ items, total, page, pageSize, dates, times }` inside the standard `data` wrapper. Query parameters: `q`, `date`, `weekday` (0=Sunday through 6=Saturday), `time`, `sort`, `page`.

Sort values: `submitted_desc`, `submitted_asc`, `interview_asc`, `interview_desc`, `name_asc`.
