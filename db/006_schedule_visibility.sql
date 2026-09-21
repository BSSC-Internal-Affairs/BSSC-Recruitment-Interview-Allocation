BEGIN;

ALTER TABLE interview_dates
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

COMMIT;
