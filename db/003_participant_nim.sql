-- Upgrade an existing installation after 002_participants.sql.
-- Existing identities and responses are preserved. Admins must assign their NIMs.
BEGIN;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS nim text
  CHECK (nim IS NULL OR nim ~ '^[0-9]{1,32}$');
ALTER TABLE participants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS participants_nim_unique ON participants(nim);

-- Old participants have no trusted NIM. Keep NULL until an admin edits them;
-- never infer whitelist membership from previously submitted answers.
ALTER TABLE participants DROP COLUMN IF EXISTS invitation_token_hash;
ALTER TABLE participants DROP COLUMN IF EXISTS email;
ALTER TABLE participants DROP COLUMN IF EXISTS disabled;
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_email_key_key;

CREATE OR REPLACE FUNCTION set_participant_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS participant_updated_at ON participants;
CREATE TRIGGER participant_updated_at BEFORE UPDATE ON participants
FOR EACH ROW EXECUTE FUNCTION set_participant_updated_at();

-- Reuse an existing NIM / Student ID question instead of asking for it twice.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='form_configuration'::regclass AND attname='nim_field_id' AND NOT attisdropped) THEN
    ALTER TABLE form_configuration ADD COLUMN nim_field_id uuid;
    UPDATE form_configuration SET nim_field_id=(
      SELECT id FROM form_fields WHERE type='text'
        AND id IS DISTINCT FROM form_configuration.name_field_id
        AND regexp_replace(lower(label),'[^a-z0-9]','','g') IN ('nim','studentid','studentnumber')
      ORDER BY sort_order,id LIMIT 1
    );
    UPDATE form_fields SET label='NIM',required=true
      WHERE id=(SELECT nim_field_id FROM form_configuration WHERE id=1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='form_nim_field_fk' AND conrelid='form_configuration'::regclass) THEN
    ALTER TABLE form_configuration ADD CONSTRAINT form_nim_field_fk
      FOREIGN KEY(nim_field_id) REFERENCES form_fields(id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
COMMIT;
