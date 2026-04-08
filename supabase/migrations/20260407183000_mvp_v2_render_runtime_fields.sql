ALTER TABLE mvp_v2_study_configs
  ADD COLUMN IF NOT EXISTS graph_model text NOT NULL DEFAULT 'legacy';

ALTER TABLE mvp_v2_sessions
  ALTER COLUMN started_at DROP NOT NULL;

ALTER TABLE mvp_v2_sessions
  DROP CONSTRAINT IF EXISTS mvp_v2_sessions_phase_check;

ALTER TABLE mvp_v2_sessions
  ADD CONSTRAINT mvp_v2_sessions_phase_check
  CHECK (phase IN ('self_report', 'learning', 'evaluation', 'survey', 'summary'));

ALTER TABLE mvp_v2_sessions
  ADD COLUMN IF NOT EXISTS self_report jsonb,
  ADD COLUMN IF NOT EXISTS metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS uploaded_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evaluation_overall_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evaluation_summary text NOT NULL DEFAULT '';

ALTER TABLE mvp_v2_graph_nodes
  ADD COLUMN IF NOT EXISTS node_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS simple_good_turn_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clarification_depth integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS derived_from_topic text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_mcq_at_attempt integer NOT NULL DEFAULT 0;
