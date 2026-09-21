BEGIN;

ALTER TABLE form_configuration
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS closed_message text NOT NULL DEFAULT 'Registration for the interview has been closed.'
    CHECK (length(btrim(closed_message)) BETWEEN 1 AND 2000);

COMMIT;
