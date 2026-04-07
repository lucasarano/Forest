-- ============================================================
-- Forest MVP V2 Dynamic Mastery Prototype
-- ============================================================

CREATE TABLE IF NOT EXISTS mvp_v2_study_configs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_concept          text NOT NULL,
  concept_summary       text NOT NULL DEFAULT '',
  time_budget_ms        integer NOT NULL,
  planner_graph         jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluation_bundle     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mvp_v2_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_config_id       uuid NOT NULL REFERENCES mvp_v2_study_configs(id) ON DELETE CASCADE,
  session_token_hash    text NOT NULL UNIQUE,
  condition             text NOT NULL CHECK (condition IN ('guided_dynamic_map', 'freeform_control')),
  phase                 text NOT NULL DEFAULT 'learning'
                        CHECK (phase IN ('learning', 'evaluation', 'survey', 'summary')),
  status                text NOT NULL DEFAULT 'active',
  current_node_id       text,
  turn_index            integer NOT NULL DEFAULT 0,
  started_at            timestamptz NOT NULL DEFAULT now(),
  learning_completed_at timestamptz,
  evaluation_completed_at timestamptz,
  survey_completed_at   timestamptz,
  time_budget_ms        integer NOT NULL,
  instrumentation_version text,
  last_active_at        timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mvp_v2_graph_nodes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES mvp_v2_sessions(id) ON DELETE CASCADE,
  node_id               text NOT NULL,
  title                 text NOT NULL,
  summary               text NOT NULL DEFAULT '',
  parent_ids            jsonb NOT NULL DEFAULT '[]'::jsonb,
  depth                 integer NOT NULL DEFAULT 0,
  order_index           integer NOT NULL DEFAULT 0,
  status                text NOT NULL,
  prompt_kind           text NOT NULL,
  support_level         integer NOT NULL DEFAULT 0,
  with_support_used     boolean NOT NULL DEFAULT false,
  successful_recall_count integer NOT NULL DEFAULT 0,
  recall_scheduled_at_turn integer,
  best_scores           jsonb NOT NULL DEFAULT '{}'::jsonb,
  misconception_streak  integer NOT NULL DEFAULT 0,
  attempts              integer NOT NULL DEFAULT 0,
  last_assessment_summary text NOT NULL DEFAULT '',
  rubric                jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_pack           jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_root               boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, node_id)
);

CREATE TABLE IF NOT EXISTS mvp_v2_evidence_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES mvp_v2_sessions(id) ON DELETE CASCADE,
  evidence_id           text NOT NULL,
  node_id               text NOT NULL,
  turn_index            integer NOT NULL,
  prompt_kind           text NOT NULL,
  scores                jsonb NOT NULL DEFAULT '{}'::jsonb,
  misconception_detected boolean NOT NULL DEFAULT false,
  misconception_label   text NOT NULL DEFAULT '',
  misconception_reason  text NOT NULL DEFAULT '',
  missing_concepts      jsonb NOT NULL DEFAULT '[]'::jsonb,
  strengths             jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale             text NOT NULL DEFAULT '',
  support_used          boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS mvp_v2_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES mvp_v2_sessions(id) ON DELETE CASCADE,
  message_id            text NOT NULL,
  node_id               text,
  role                  text NOT NULL CHECK (role IN ('user', 'assistant')),
  content               text NOT NULL,
  visible_to_student    boolean NOT NULL DEFAULT true,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, message_id)
);

CREATE TABLE IF NOT EXISTS mvp_v2_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES mvp_v2_sessions(id) ON DELETE CASCADE,
  event_id              text NOT NULL,
  event_type            text NOT NULL,
  payload               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, event_id)
);

CREATE TABLE IF NOT EXISTS mvp_v2_evaluation_answers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES mvp_v2_sessions(id) ON DELETE CASCADE,
  prompt_id             text NOT NULL,
  answer                text NOT NULL DEFAULT '',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, prompt_id)
);

CREATE TABLE IF NOT EXISTS mvp_v2_evaluation_scores (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES mvp_v2_sessions(id) ON DELETE CASCADE,
  prompt_id             text NOT NULL,
  score                 integer NOT NULL DEFAULT 0,
  rationale             text NOT NULL DEFAULT '',
  strengths             jsonb NOT NULL DEFAULT '[]'::jsonb,
  gaps                  jsonb NOT NULL DEFAULT '[]'::jsonb,
  overall_score         integer NOT NULL DEFAULT 0,
  summary               text NOT NULL DEFAULT '',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, prompt_id)
);

CREATE TABLE IF NOT EXISTS mvp_v2_survey_responses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            uuid NOT NULL REFERENCES mvp_v2_sessions(id) ON DELETE CASCADE UNIQUE,
  responses             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mvp_v2_study_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_v2_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_v2_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_v2_evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_v2_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_v2_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_v2_evaluation_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_v2_evaluation_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE mvp_v2_survey_responses ENABLE ROW LEVEL SECURITY;

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
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mvp_v2_study_configs_updated_at'
  ) THEN
    CREATE TRIGGER trg_mvp_v2_study_configs_updated_at
      BEFORE UPDATE ON mvp_v2_study_configs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mvp_v2_sessions_updated_at'
  ) THEN
    CREATE TRIGGER trg_mvp_v2_sessions_updated_at
      BEFORE UPDATE ON mvp_v2_sessions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mvp_v2_graph_nodes_updated_at'
  ) THEN
    CREATE TRIGGER trg_mvp_v2_graph_nodes_updated_at
      BEFORE UPDATE ON mvp_v2_graph_nodes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mvp_v2_evaluation_answers_updated_at'
  ) THEN
    CREATE TRIGGER trg_mvp_v2_evaluation_answers_updated_at
      BEFORE UPDATE ON mvp_v2_evaluation_answers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mvp_v2_evaluation_scores_updated_at'
  ) THEN
    CREATE TRIGGER trg_mvp_v2_evaluation_scores_updated_at
      BEFORE UPDATE ON mvp_v2_evaluation_scores
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mvp_v2_survey_responses_updated_at'
  ) THEN
    CREATE TRIGGER trg_mvp_v2_survey_responses_updated_at
      BEFORE UPDATE ON mvp_v2_survey_responses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_mvp_v2_sessions_study_config
  ON mvp_v2_sessions(study_config_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mvp_v2_sessions_condition
  ON mvp_v2_sessions(condition, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mvp_v2_graph_nodes_session_status
  ON mvp_v2_graph_nodes(session_id, status);

CREATE INDEX IF NOT EXISTS idx_mvp_v2_evidence_records_session_turn
  ON mvp_v2_evidence_records(session_id, turn_index DESC);

CREATE INDEX IF NOT EXISTS idx_mvp_v2_events_session_created
  ON mvp_v2_events(session_id, created_at DESC);

