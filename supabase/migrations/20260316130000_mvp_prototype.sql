-- ============================================================
-- Forest MVP Prototype Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS mvp_sessions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_name         text NOT NULL,
  participant_email        text NOT NULL,
  session_token_hash       text NOT NULL,
  current_phase            text NOT NULL DEFAULT 'entry'
                           CHECK (current_phase IN ('entry', 'diagnostic_notice', 'guided_water', 'freeform_airplane', 'assessment', 'survey', 'summary')),
  status                   text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'completed', 'abandoned')),
  diagnostic_acknowledged_at timestamptz,
  water_started_at         timestamptz,
  water_completed_at       timestamptz,
  airplane_started_at      timestamptz,
  airplane_completed_at    timestamptz,
  assessment_completed_at  timestamptz,
  survey_completed_at      timestamptz,
  water_time_ms            integer,
  airplane_time_budget_ms  integer,
  total_quiz_score         integer NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mvp_sessions_token_hash
  ON mvp_sessions(session_token_hash);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mvp_sessions_active_email
  ON mvp_sessions((lower(participant_email)))
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS mvp_node_progress (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES mvp_sessions(id) ON DELETE CASCADE,
  node_key          text NOT NULL,
  status            text NOT NULL DEFAULT 'locked'
                    CHECK (status IN ('locked', 'active', 'mastered', 'skipped')),
  attempt_count     integer NOT NULL DEFAULT 0,
  interaction_count integer NOT NULL DEFAULT 0,
  started_at        timestamptz,
  completed_at      timestamptz,
  duration_ms       integer,
  last_answer       text DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, node_key)
);

CREATE TABLE IF NOT EXISTS mvp_chat_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES mvp_sessions(id) ON DELETE CASCADE,
  client_message_id text NOT NULL,
  role              text NOT NULL CHECK (role IN ('user', 'assistant')),
  content           text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, client_message_id)
);

CREATE TABLE IF NOT EXISTS mvp_assessment_answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      uuid NOT NULL REFERENCES mvp_sessions(id) ON DELETE CASCADE,
  question_key    text NOT NULL,
  topic           text NOT NULL,
  selected_option text NOT NULL,
  is_correct      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, question_key)
);

CREATE TABLE IF NOT EXISTS mvp_survey_responses (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                uuid NOT NULL REFERENCES mvp_sessions(id) ON DELETE CASCADE UNIQUE,
  better_experience         text NOT NULL,
  clearer_explanations      text NOT NULL,
  preferred_moderate_topic  text NOT NULL,
  comment                   text DEFAULT '',
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mvp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_node_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_assessment_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_survey_responses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mvp_sessions_updated_at'
  ) THEN
    CREATE TRIGGER trg_mvp_sessions_updated_at
      BEFORE UPDATE ON mvp_sessions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mvp_node_progress_updated_at'
  ) THEN
    CREATE TRIGGER trg_mvp_node_progress_updated_at
      BEFORE UPDATE ON mvp_node_progress
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mvp_assessment_answers_updated_at'
  ) THEN
    CREATE TRIGGER trg_mvp_assessment_answers_updated_at
      BEFORE UPDATE ON mvp_assessment_answers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mvp_survey_responses_updated_at'
  ) THEN
    CREATE TRIGGER trg_mvp_survey_responses_updated_at
      BEFORE UPDATE ON mvp_survey_responses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;
