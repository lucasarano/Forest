-- ============================================================
-- Forest: Courses / Homeworks / Concepts hierarchy
-- Replaces the single-seed mvp_v2_study_configs model with a
-- teacher-authored tree: course -> homework -> concept.
-- mvp_v2_study_configs stays in place (historical FK) but is no
-- longer written. mvp_v2_sessions gains concept_id + student_name
-- and drops condition (single-condition app now).
-- ============================================================

CREATE TABLE IF NOT EXISTS courses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS homeworks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  order_index  integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_homeworks_course
  ON homeworks(course_id, order_index);

CREATE TABLE IF NOT EXISTS concepts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id       uuid NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  title             text NOT NULL,
  seed_question     text NOT NULL,
  concept_summary   text NOT NULL DEFAULT '',
  time_budget_ms    integer NOT NULL DEFAULT 900000,
  graph_model       text NOT NULL DEFAULT 'root_dynamic',
  planner_graph     jsonb NOT NULL DEFAULT '[]'::jsonb,
  evaluation_bundle jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_index       integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_concepts_homework
  ON concepts(homework_id, order_index);

-- Sessions now link to concepts; condition goes away; study_config_id nullable.
ALTER TABLE mvp_v2_sessions
  ADD COLUMN IF NOT EXISTS concept_id uuid REFERENCES concepts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS student_name text NOT NULL DEFAULT '';

ALTER TABLE mvp_v2_sessions
  ALTER COLUMN study_config_id DROP NOT NULL;

ALTER TABLE mvp_v2_sessions
  DROP COLUMN IF EXISTS condition;

DROP INDEX IF EXISTS idx_mvp_v2_sessions_condition;
CREATE INDEX IF NOT EXISTS idx_mvp_v2_sessions_concept
  ON mvp_v2_sessions(concept_id, created_at DESC);

-- RLS + service_role policies (match existing pattern).
ALTER TABLE courses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE homeworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepts  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
  action text;
  tables text[] := ARRAY['courses', 'homeworks', 'concepts'];
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

-- updated_at triggers (function already defined in the mvp_v2 migration).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_courses_updated_at') THEN
    CREATE TRIGGER trg_courses_updated_at
      BEFORE UPDATE ON courses
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_homeworks_updated_at') THEN
    CREATE TRIGGER trg_homeworks_updated_at
      BEFORE UPDATE ON homeworks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_concepts_updated_at') THEN
    CREATE TRIGGER trg_concepts_updated_at
      BEFORE UPDATE ON concepts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;
