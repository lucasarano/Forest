ALTER TABLE mvp_sessions
  ADD COLUMN IF NOT EXISTS instrumentation_version text,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_reason text,
  ADD COLUMN IF NOT EXISTS highest_phase_reached text,
  ADD COLUMN IF NOT EXISTS guided_outcome text,
  ADD COLUMN IF NOT EXISTS airplane_outcome text;

CREATE INDEX IF NOT EXISTS idx_mvp_sessions_instrumentation_version
  ON mvp_sessions(instrumentation_version);

CREATE INDEX IF NOT EXISTS idx_mvp_sessions_last_active_at
  ON mvp_sessions(last_active_at DESC);

CREATE TABLE IF NOT EXISTS mvp_event_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES mvp_sessions(id) ON DELETE CASCADE,
  phase       text,
  event_type  text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mvp_event_logs_session_created
  ON mvp_event_logs(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mvp_event_logs_type_created
  ON mvp_event_logs(event_type, created_at DESC);

ALTER TABLE mvp_event_logs ENABLE ROW LEVEL SECURITY;
