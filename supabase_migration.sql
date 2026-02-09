-- ============================================================
-- Forest Learning Tree — Supabase Migration
-- Run this in your Supabase SQL Editor (SQL tab in the dashboard)
-- ============================================================

-- 1. learning_trees: one row per tree, owned by a user
CREATE TABLE IF NOT EXISTS learning_trees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT 'Untitled Tree',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_learning_trees_user_id ON learning_trees(user_id);

-- 2. tree_nodes: one row per node inside a tree
CREATE TABLE IF NOT EXISTS tree_nodes (
  id              text PRIMARY KEY,
  tree_id         uuid NOT NULL REFERENCES learning_trees(id) ON DELETE CASCADE,
  label           text NOT NULL DEFAULT '',
  parent_id       text,
  position        jsonb NOT NULL DEFAULT '{"x":0,"y":0}',
  context_anchor  text DEFAULT '',
  highlights      jsonb DEFAULT '[]',
  messages        jsonb DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tree_nodes_tree_id ON tree_nodes(tree_id);

-- 3. tree_edges: one row per edge inside a tree
CREATE TABLE IF NOT EXISTS tree_edges (
  id          text PRIMARY KEY,
  tree_id     uuid NOT NULL REFERENCES learning_trees(id) ON DELETE CASCADE,
  source_id   text NOT NULL,
  target_id   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tree_edges_tree_id ON tree_edges(tree_id);

-- ============================================================
-- Row Level Security
-- ============================================================

-- Enable RLS on all three tables
ALTER TABLE learning_trees ENABLE ROW LEVEL SECURITY;
ALTER TABLE tree_nodes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tree_edges     ENABLE ROW LEVEL SECURITY;

-- learning_trees: users can only see/modify their own trees
CREATE POLICY "Users can view own trees"
  ON learning_trees FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own trees"
  ON learning_trees FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own trees"
  ON learning_trees FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own trees"
  ON learning_trees FOR DELETE
  USING (user_id = auth.uid());

-- tree_nodes: users can only access nodes belonging to their trees
CREATE POLICY "Users can view own nodes"
  ON tree_nodes FOR SELECT
  USING (tree_id IN (SELECT id FROM learning_trees WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own nodes"
  ON tree_nodes FOR INSERT
  WITH CHECK (tree_id IN (SELECT id FROM learning_trees WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own nodes"
  ON tree_nodes FOR UPDATE
  USING (tree_id IN (SELECT id FROM learning_trees WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own nodes"
  ON tree_nodes FOR DELETE
  USING (tree_id IN (SELECT id FROM learning_trees WHERE user_id = auth.uid()));

-- tree_edges: users can only access edges belonging to their trees
CREATE POLICY "Users can view own edges"
  ON tree_edges FOR SELECT
  USING (tree_id IN (SELECT id FROM learning_trees WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own edges"
  ON tree_edges FOR INSERT
  WITH CHECK (tree_id IN (SELECT id FROM learning_trees WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own edges"
  ON tree_edges FOR UPDATE
  USING (tree_id IN (SELECT id FROM learning_trees WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own edges"
  ON tree_edges FOR DELETE
  USING (tree_id IN (SELECT id FROM learning_trees WHERE user_id = auth.uid()));

-- ============================================================
-- Auto-update updated_at on learning_trees and tree_nodes
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_learning_trees_updated_at
  BEFORE UPDATE ON learning_trees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_tree_nodes_updated_at
  BEFORE UPDATE ON tree_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
