ALTER TABLE mvp_node_progress
  ADD COLUMN IF NOT EXISTS mastery_score integer NOT NULL DEFAULT 0;
