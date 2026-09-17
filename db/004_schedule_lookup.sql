-- Run after 003_participant_nim.sql, before deploying the lookup feature.
BEGIN;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS nim text
  CHECK (nim IS NULL OR nim ~ '^[0-9]{1,32}$');

-- Preserve known identities for existing submissions. This is migration-only;
-- public searches never consult the participant whitelist.
UPDATE submissions s SET nim=p.nim FROM participants p
WHERE s.participant_id=p.id AND s.nim IS NULL AND p.nim IS NOT NULL;

-- Recover unlinked legacy submissions only when their explicit NIM answers
-- agree. Never guess an identity from names, email, or unrelated answers.
WITH historical_nims AS (
  SELECT submission_id, min(btrim(value)) AS nim
  FROM submission_answers
  WHERE (field_id=(SELECT nim_field_id FROM form_configuration WHERE id=1)
    OR lower(btrim(label)) IN ('nim','student id','student number'))
    AND btrim(value) ~ '^[0-9]{1,32}$'
  GROUP BY submission_id HAVING count(DISTINCT btrim(value))=1
)
UPDATE submissions s SET nim=h.nim FROM historical_nims h
WHERE s.id=h.submission_id AND s.nim IS NULL;
CREATE INDEX IF NOT EXISTS submissions_nim_lookup_idx
  ON submissions(nim,submitted_at DESC,id DESC) WHERE nim IS NOT NULL;

CREATE TABLE IF NOT EXISTS schedule_lookup_attempts (
  key text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS schedule_lookup_attempts_window_idx
  ON schedule_lookup_attempts(window_start);
ALTER TABLE schedule_lookup_attempts ENABLE ROW LEVEL SECURITY;
COMMIT;
