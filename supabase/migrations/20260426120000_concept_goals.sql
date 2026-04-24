-- ============================================================
-- Forest: Concept goals (requirements-for-understanding)
-- Teachers attach a list of specific learning targets to a
-- concept; agents use them to diagnose depth and students see
-- them while studying.
-- ============================================================

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS concept_goals text[] NOT NULL DEFAULT '{}';
