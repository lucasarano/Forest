import { supabase } from './supabase'

// ── Helpers ──────────────────────────────────────────────────

/** Convert a node from React state shape → DB row shape */
const nodeToRow = (node, treeId) => ({
  id: node.id,
  tree_id: treeId,
  label: node.label || '',
  parent_id: node.parentId || null,
  position: node.position || { x: 0, y: 0 },
  context_anchor: node.contextAnchor || '',
  highlights: node.highlights || [],
  messages: node.messages || [],
})

/** Convert a DB row → React state node shape */
const rowToNode = (row) => ({
  id: row.id,
  label: row.label,
  parentId: row.parent_id || null,
  position: row.position,
  contextAnchor: row.context_anchor || '',
  highlights: row.highlights || [],
  messages: row.messages || [],
  // Legacy fields kept for compatibility
  question: '',
  aiResponse: '',
})

/** Convert an edge from React state shape → DB row shape */
const edgeToRow = (edge, treeId) => ({
  id: edge.id,
  tree_id: treeId,
  source_id: edge.sourceId,
  target_id: edge.targetId,
})

/** Convert a DB row → React state edge shape */
const rowToEdge = (row) => ({
  id: row.id,
  sourceId: row.source_id,
  targetId: row.target_id,
})

// ── Tree CRUD ────────────────────────────────────────────────

/** Create a new tree for the given user. Returns { data: tree, error }. */
export async function createTree(userId, name = 'Untitled Tree') {
  const { data, error } = await supabase
    .from('learning_trees')
    .insert({ user_id: userId, name })
    .select()
    .single()
  return { data, error }
}

/** List all trees for a user, ordered by most recently updated. */
export async function listTrees(userId) {
  const { data, error } = await supabase
    .from('learning_trees')
    .select(`
      id,
      name,
      created_at,
      updated_at,
      tree_nodes ( id )
    `)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  // Attach a nodeCount for each tree
  const trees = (data || []).map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    nodeCount: t.tree_nodes?.length || 0,
  }))

  return { data: trees, error }
}

/** Load a full tree (metadata + nodes + edges). */
export async function loadTree(treeId) {
  // Fetch tree metadata, nodes, and edges in parallel
  const [treeRes, nodesRes, edgesRes] = await Promise.all([
    supabase
      .from('learning_trees')
      .select('id, name, user_id, created_at, updated_at')
      .eq('id', treeId)
      .single(),
    supabase
      .from('tree_nodes')
      .select('*')
      .eq('tree_id', treeId),
    supabase
      .from('tree_edges')
      .select('*')
      .eq('tree_id', treeId),
  ])

  if (treeRes.error) return { data: null, error: treeRes.error }

  return {
    data: {
      tree: treeRes.data,
      nodes: (nodesRes.data || []).map(rowToNode),
      edges: (edgesRes.data || []).map(rowToEdge),
    },
    error: nodesRes.error || edgesRes.error || null,
  }
}

/**
 * Save (sync) the full node/edge state to Supabase.
 * Upserts current nodes/edges and deletes any that were removed.
 */
export async function saveTree(treeId, nodes, edges) {
  // 1. Touch the tree's updated_at
  const touchPromise = supabase
    .from('learning_trees')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', treeId)

  // 2. Upsert all current nodes
  const nodeRows = nodes.map((n) => nodeToRow(n, treeId))
  const upsertNodesPromise = nodeRows.length > 0
    ? supabase.from('tree_nodes').upsert(nodeRows, { onConflict: 'id' })
    : Promise.resolve({ error: null })

  // 3. Upsert all current edges
  const edgeRows = edges.map((e) => edgeToRow(e, treeId))
  const upsertEdgesPromise = edgeRows.length > 0
    ? supabase.from('tree_edges').upsert(edgeRows, { onConflict: 'id' })
    : Promise.resolve({ error: null })

  // 4. Fetch existing IDs so we can delete removed rows
  const existingNodesPromise = supabase
    .from('tree_nodes')
    .select('id')
    .eq('tree_id', treeId)
  const existingEdgesPromise = supabase
    .from('tree_edges')
    .select('id')
    .eq('tree_id', treeId)

  const [touchRes, upsertNodesRes, upsertEdgesRes, existNodesRes, existEdgesRes] =
    await Promise.all([
      touchPromise,
      upsertNodesPromise,
      upsertEdgesPromise,
      existingNodesPromise,
      existingEdgesPromise,
    ])

  // 5. Delete nodes/edges that no longer exist in state
  const currentNodeIds = new Set(nodes.map((n) => n.id))
  const staleNodeIds = (existNodesRes.data || [])
    .map((r) => r.id)
    .filter((id) => !currentNodeIds.has(id))

  const currentEdgeIds = new Set(edges.map((e) => e.id))
  const staleEdgeIds = (existEdgesRes.data || [])
    .map((r) => r.id)
    .filter((id) => !currentEdgeIds.has(id))

  const deletePromises = []
  if (staleNodeIds.length > 0) {
    deletePromises.push(
      supabase.from('tree_nodes').delete().in('id', staleNodeIds)
    )
  }
  if (staleEdgeIds.length > 0) {
    deletePromises.push(
      supabase.from('tree_edges').delete().in('id', staleEdgeIds)
    )
  }
  await Promise.all(deletePromises)

  const error = touchRes.error || upsertNodesRes.error || upsertEdgesRes.error || null
  return { error }
}

/** Delete a tree (cascade deletes nodes + edges). */
export async function deleteTree(treeId) {
  const { error } = await supabase
    .from('learning_trees')
    .delete()
    .eq('id', treeId)
  return { error }
}

/** Rename a tree. */
export async function renameTree(treeId, name) {
  const { error } = await supabase
    .from('learning_trees')
    .update({ name })
    .eq('id', treeId)
  return { error }
}
