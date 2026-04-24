-- ============================================================
-- MVP V2 — lock down all tables to service_role only.
--
-- RLS is already enabled on every mvp_v2_* table, but no policies
-- were defined. That means:
--   - anon / authenticated keys are already denied (no policy = deny).
--   - service_role bypasses RLS implicitly, so the Render server works.
--
-- This migration makes the intent explicit: only the service_role
-- (used by server/sprint4Server.js via SUPABASE_SERVICE_ROLE_KEY) may
-- read/write mvp_v2_* data. The client-side anon key cannot touch
-- these tables directly — all access is mediated by the Node server.
-- ============================================================

DO $$
DECLARE
  tbl text;
  action text;
  tables text[] := ARRAY[
    'mvp_v2_study_configs',
    'mvp_v2_sessions',
    'mvp_v2_graph_nodes',
    'mvp_v2_evidence_records',
    'mvp_v2_messages',
    'mvp_v2_events',
    'mvp_v2_evaluation_answers',
    'mvp_v2_evaluation_scores',
    'mvp_v2_survey_responses'
  ];
  actions text[] := ARRAY['select', 'insert', 'update', 'delete'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOREACH action IN ARRAY actions LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I',
        'service_role_' || action || '_' || tbl,
        tbl
      );
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO service_role USING (true)',
      'service_role_select_' || tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT TO service_role WITH CHECK (true)',
      'service_role_insert_' || tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE TO service_role USING (true) WITH CHECK (true)',
      'service_role_update_' || tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE TO service_role USING (true)',
      'service_role_delete_' || tbl, tbl
    );
  END LOOP;
END;
$$;
