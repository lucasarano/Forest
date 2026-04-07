ALTER TABLE mvp_sessions
  ADD COLUMN IF NOT EXISTS guided_quiz_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freeform_quiz_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS guided_confidence_before smallint CHECK (guided_confidence_before BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS guided_confidence_after smallint CHECK (guided_confidence_after BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS freeform_confidence_before smallint CHECK (freeform_confidence_before BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS freeform_confidence_after smallint CHECK (freeform_confidence_after BETWEEN 1 AND 5);

ALTER TABLE mvp_survey_responses
  ADD COLUMN IF NOT EXISTS clarity_rating smallint CHECK (clarity_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS engagement_rating smallint CHECK (engagement_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS effectiveness_rating smallint CHECK (effectiveness_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS guided_usefulness smallint CHECK (guided_usefulness BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS freeform_usefulness smallint CHECK (freeform_usefulness BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS clearer_system text,
  ADD COLUMN IF NOT EXISTS preferred_system text,
  ADD COLUMN IF NOT EXISTS positive_aspect_guided text DEFAULT '',
  ADD COLUMN IF NOT EXISTS positive_aspect_freeform text DEFAULT '';
