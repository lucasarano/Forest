// State model for the Recursive Mastery Graph.
//
// The whole session is a single JSON object. It holds:
//   - concept graph: every node ever entered, with per-phase state
//   - concept stack: ordered list of node ids currently active
//   - recall queue: deferred recall checks
//   - message log per node
//   - telemetry events
//
// The model is concept-agnostic — no topic knowledge leaks in here.

import {
  PHASES,
  PHASE_ORDER,
  PHASE_STATES,
  NODE_STATES,
  ROOT_NODE_ID,
  MESSAGE_ROLES,
} from './constants.js'

const nowIso = () => new Date().toISOString()

export const uuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

// Create the four phase records for a fresh node. Explanation starts active,
// the rest start locked. Recall is always deferred (scheduled, not done inline).
export const createPhaseRecords = () => {
  const records = {}
  for (const phase of PHASE_ORDER) {
    records[phase] = {
      phase,
      state: phase === PHASES.EXPLANATION ? PHASE_STATES.ACTIVE : PHASE_STATES.LOCKED,
      attempts: 0,
      passes: 0,
      reopenCount: 0,
      confidence: 0,
      evidence: [],      // list of { turnIndex, score, rationale, tag }
      lastProbe: null,   // last question the tutor asked inside this phase
      passedAt: null,
    }
  }
  records[PHASES.RECALL].state = PHASE_STATES.DEFERRED
  return records
}

export const createNode = ({
  id,
  title,
  question,
  parentId = null,
  isRoot = false,
  reason = '',
  skippable = true,
  depth = 0,
}) => ({
  id,
  title: title || '',
  question: question || '',
  parentId,
  isRoot,
  skippable: isRoot ? false : !!skippable,
  reason,        // why this node was opened (from subtopic inference)
  depth,
  status: isRoot ? NODE_STATES.ACTIVE : NODE_STATES.LOCKED,
  phases: createPhaseRecords(),
  currentPhase: PHASES.EXPLANATION,
  createdAt: nowIso(),
  masteredAt: null,
  returnBlockedAt: null, // phase that was active when this child was opened
  returnBlockedFromParent: null,
  messages: [], // { id, role, content, phase, createdAt }
  childIds: [],
})

export const createInitialState = ({ concept }) => {
  const rootTitle = concept?.title || 'Root concept'
  const rootQuestion = concept?.seedQuestion || rootTitle
  const rawGoals = Array.isArray(concept?.conceptGoals) ? concept.conceptGoals : []
  const conceptGoals = rawGoals
    .map((g) => `${g}`.trim())
    .filter(Boolean)
  const root = createNode({
    id: ROOT_NODE_ID,
    title: rootTitle,
    question: rootQuestion,
    isRoot: true,
    depth: 0,
  })
  return {
    version: 1,
    conceptId: concept?.id || '',
    conceptSummary: concept?.conceptSummary || '',
    conceptGoals,
    goalsCovered: conceptGoals.map(() => false),
    nodes: { [ROOT_NODE_ID]: root },
    stack: [ROOT_NODE_ID],
    recallQueue: [],   // [{ nodeId, readyAtTurn, reason }]
    turnIndex: 0,
    startedAt: nowIso(),
    lastTurnAt: null,
    completed: false,
    status: 'active',
    offer: null,       // pending subtopic offer awaiting student choice
    events: [],        // lightweight event log
  }
}

// Mark one or more goal indices as covered. No-op if goals are not tracked
// or the state has no goals configured.
export const markGoalsCovered = (state, indices) => {
  if (!Array.isArray(state.conceptGoals) || state.conceptGoals.length === 0) return state
  const ints = (Array.isArray(indices) ? indices : [])
    .map((i) => Number(i))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < state.conceptGoals.length)
  if (!ints.length) return state
  const current = Array.isArray(state.goalsCovered) && state.goalsCovered.length === state.conceptGoals.length
    ? state.goalsCovered
    : state.conceptGoals.map(() => false)
  let changed = false
  const next = current.slice()
  for (const i of ints) {
    if (!next[i]) { next[i] = true; changed = true }
  }
  return changed ? { ...state, goalsCovered: next } : state
}

// Immutable update helper: return a shallow-cloned state with the given node replaced.
export const withNode = (state, nodeId, updater) => {
  const existing = state.nodes[nodeId]
  if (!existing) return state
  const next = updater(existing)
  if (next === existing) return state
  return { ...state, nodes: { ...state.nodes, [nodeId]: next } }
}

export const getActiveNodeId = (state) => state.stack[state.stack.length - 1] || null

export const getActiveNode = (state) => {
  const id = getActiveNodeId(state)
  return id ? state.nodes[id] : null
}

export const getStackNodes = (state) => state.stack.map((id) => state.nodes[id]).filter(Boolean)

export const appendMessage = (state, nodeId, { role, content, phase, metadata = {} }) => {
  if (!content) return state
  return withNode(state, nodeId, (node) => ({
    ...node,
    messages: [
      ...node.messages,
      {
        id: uuid(),
        role,
        content,
        phase: phase || node.currentPhase,
        createdAt: nowIso(),
        metadata,
      },
    ],
  }))
}

export const logEvent = (state, type, payload = {}) => ({
  ...state,
  events: [...state.events, { id: uuid(), type, payload, createdAt: nowIso() }],
})

export const setPhaseState = (state, nodeId, phase, phaseState, patch = {}) =>
  withNode(state, nodeId, (node) => ({
    ...node,
    phases: {
      ...node.phases,
      [phase]: {
        ...node.phases[phase],
        ...patch,
        state: phaseState,
      },
    },
  }))

export const recordEvidence = (state, nodeId, phase, entry) =>
  withNode(state, nodeId, (node) => {
    const prevPhase = node.phases[phase]
    const nextEvidence = [...prevPhase.evidence, { ...entry, turnIndex: state.turnIndex }]
    // Displayed confidence is the running mean of all evaluator scores
    // for this phase. Routing still consumes the raw per-turn `evaluation.confidence`;
    // this field is for the UI so a single high or low spike can't dominate.
    const scores = nextEvidence
      .map((e) => (typeof e.confidence === 'number' ? e.confidence : e.score))
      .filter((n) => typeof n === 'number' && Number.isFinite(n))
    const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
    return {
      ...node,
      phases: {
        ...node.phases,
        [phase]: {
          ...prevPhase,
          evidence: nextEvidence,
          attempts: prevPhase.attempts + 1,
          confidence: mean,
          lastProbe: entry.probe || prevPhase.lastProbe,
        },
      },
    }
  })

export const markNodeStatus = (state, nodeId, status) =>
  withNode(state, nodeId, (node) => ({ ...node, status }))

export const pushSubtopic = (state, {
  title,
  question,
  reason,
  parentId,
  blockedPhase,
  skippable = true,
}) => {
  const depth = state.stack.length
  const newId = uuid()
  const child = createNode({
    id: newId,
    title,
    question,
    parentId,
    isRoot: false,
    reason,
    skippable,
    depth,
  })
  child.returnBlockedAt = blockedPhase
  child.returnBlockedFromParent = parentId

  const parentPatched = { ...state.nodes[parentId] }
  parentPatched.childIds = [...parentPatched.childIds, newId]

  return {
    ...state,
    nodes: { ...state.nodes, [newId]: child, [parentId]: parentPatched },
    stack: [...state.stack, newId],
    offer: null,
  }
}

export const popStack = (state) => {
  if (state.stack.length <= 1) return state
  return { ...state, stack: state.stack.slice(0, -1) }
}

export const setOffer = (state, offer) => ({ ...state, offer })

export const scheduleRecall = (state, nodeId, readyAtTurn, reason = 'delayed_recall') => ({
  ...state,
  recallQueue: [
    ...state.recallQueue.filter((entry) => entry.nodeId !== nodeId),
    { nodeId, readyAtTurn, reason },
  ],
})

export const clearRecall = (state, nodeId) => ({
  ...state,
  recallQueue: state.recallQueue.filter((entry) => entry.nodeId !== nodeId),
})

// Helper: produce a lightweight, client-safe snapshot.
// (Strips nothing sensitive today but isolates the shape the frontend expects.)
export const snapshotForClient = (state) => ({
  conceptId: state.conceptId,
  conceptSummary: state.conceptSummary || '',
  conceptGoals: Array.isArray(state.conceptGoals) ? state.conceptGoals : [],
  goalsCovered: Array.isArray(state.goalsCovered) ? state.goalsCovered : [],
  turnIndex: state.turnIndex,
  startedAt: state.startedAt,
  lastTurnAt: state.lastTurnAt,
  completed: state.completed,
  status: state.status,
  activeNodeId: getActiveNodeId(state),
  stack: state.stack,
  recallQueue: state.recallQueue,
  offer: state.offer,
  nodes: state.nodes,
})

export { MESSAGE_ROLES }
