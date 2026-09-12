CREATE TABLE IF NOT EXISTS form_configuration (
  id integer PRIMARY KEY CHECK (id = 1), title text NOT NULL, description text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '', name_field_id uuid
);
INSERT INTO form_configuration(id,title,description,instructions) VALUES (1,'Your next chapter starts here.','A little about you. A time that works. Let’s meet and discover what we can build together.','Choose a time you can attend. Please arrive 10 minutes before your interview. All times are in Western Indonesia Time (WIB).') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS form_fields (
  id uuid PRIMARY KEY, label text NOT NULL, type text NOT NULL CHECK (type IN ('text','email','tel','number','textarea','select')),
  required boolean NOT NULL DEFAULT false, sort_order integer NOT NULL, options jsonb NOT NULL DEFAULT '[]'
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='form_name_field_fk' AND conrelid='form_configuration'::regclass) THEN
    ALTER TABLE form_configuration ADD CONSTRAINT form_name_field_fk FOREIGN KEY(name_field_id)
      REFERENCES form_fields(id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS interview_dates (id uuid PRIMARY KEY, date date NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS interview_slots (
  id uuid PRIMARY KEY, interview_date_id uuid NOT NULL REFERENCES interview_dates(id) ON DELETE CASCADE,
  start_time time NOT NULL, end_time time NOT NULL, capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 10000),
  registered_count integer NOT NULL DEFAULT 0 CHECK (registered_count >= 0 AND registered_count <= capacity),
  CHECK (end_time > start_time), UNIQUE(interview_date_id,start_time,end_time)
);
CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY, number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  interview_slot_id uuid NOT NULL REFERENCES interview_slots(id) ON DELETE RESTRICT,
  full_name text NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key uuid NOT NULL UNIQUE, request_hash text NOT NULL,
  email_key text UNIQUE, interview_date date NOT NULL, start_time time NOT NULL, end_time time NOT NULL
);
CREATE INDEX IF NOT EXISTS submissions_slot_idx ON submissions(interview_slot_id);
CREATE INDEX IF NOT EXISTS submissions_date_idx ON submissions(submitted_at DESC);
CREATE TABLE IF NOT EXISTS submission_answers (
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  field_id uuid NOT NULL, label text NOT NULL, field_type text NOT NULL, value text NOT NULL, sort_order integer NOT NULL,
  PRIMARY KEY(submission_id,field_id)
);
CREATE TABLE IF NOT EXISTS login_attempts (key text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL);
