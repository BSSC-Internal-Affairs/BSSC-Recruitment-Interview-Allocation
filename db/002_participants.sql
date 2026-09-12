-- Run this file ONCE on the existing database before deploying the new app.
-- Safe to rerun; existing responses, answers, dates, and capacity are preserved.
BEGIN;

CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY,
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 200),
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
  invitation_token_hash text UNIQUE CHECK (invitation_token_hash IS NULL OR invitation_token_hash ~ '^[0-9a-f]{64}$'),
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS participant_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='submissions_participant_fk' AND conrelid='submissions'::regclass) THEN
    ALTER TABLE submissions ADD CONSTRAINT submissions_participant_fk
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS submissions_participant_unique ON submissions(participant_id);
CREATE INDEX IF NOT EXISTS submissions_interview_sort_idx ON submissions(interview_date,start_time,submitted_at);
CREATE INDEX IF NOT EXISTS participants_created_idx ON participants(created_at DESC);

-- Existing email-bearing responses become already-responded participants.
-- Legacy responses without email remain untouched, with a NULL participant_id.
INSERT INTO participants(id,full_name,email,created_at)
SELECT DISTINCT ON (lower(btrim(email_key))) id, left(full_name,200), lower(btrim(email_key)), submitted_at
FROM submissions
WHERE email_key IS NOT NULL AND length(btrim(email_key)) BETWEEN 3 AND 254
ORDER BY lower(btrim(email_key)), submitted_at, id
ON CONFLICT DO NOTHING;

UPDATE submissions s SET participant_id=p.id
FROM participants p
WHERE s.participant_id IS NULL AND lower(btrim(s.email_key))=p.email
  AND NOT EXISTS (SELECT 1 FROM submissions linked WHERE linked.participant_id=p.id)
  AND s.id=(SELECT oldest.id FROM submissions oldest WHERE lower(btrim(oldest.email_key))=p.email ORDER BY oldest.submitted_at,oldest.id LIMIT 1);

-- Supabase Data API must not expose the participant roster or invitation hashes.
-- The app connects as postgres; no public/anon policies are needed.
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
COMMIT;
