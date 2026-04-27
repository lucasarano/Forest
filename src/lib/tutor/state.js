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
      // Number of system-initiated subtopic offers shown for this phase on
      // this node. Used by the phase routers to cap detour-offer loops —
      // after one detour offer per phase, further struggle teaches inline.
      subtopicOfferCount: 0,
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
  detourKind = null,
  prerequisiteTerm = '',
  depth = 0,
}) => ({
  id,
  title: title || '',
  question: question || '',
  parentId,
  isRoot,
  skippable: isRoot ? false : !!skippable,
  reason,        // why this node was opened (from subtopic inference)
  detourKind,    // e.g. quick_prerequisite for "what is X?" vocabulary detours
  prerequisiteTerm,
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
  const emptyCoverage = () => conceptGoals.map(() => false)
  return {
    version: 1,
    conceptId: concept?.id || '',
    conceptSummary: concept?.conceptSummary || '',
    conceptGoals,
    // Flat coverage kept for backward compat; derived from explanation-phase coverage.
    goalsCovered: emptyCoverage(),
    // New per-phase coverage: each goal must be demonstrated in each of the first
    // three phases (explanation, causality, transfer) before that phase can advance.
    goalsCoveredByPhase: {
      [PHASES.EXPLANATION]: emptyCoverage(),
      [PHASES.CAUSALITY]: emptyCoverage(),
      [PHASES.TRANSFER]: emptyCoverage(),
    },
    // Recall plan built when recall phase starts — 3 simple questions per goal.
    recallPlan: null,
    nodes: { [ROOT_NODE_ID]: root },
    stack: [ROOT_NODE_ID],
    recallQueue: [],   // [{ nodeId, readyAtTurn, reason }]
    turnIndex: 0,
    startedAt: nowIso(),
    lastTurnAt: null,
    completed: false,
    status: 'active',
    offer: null,       // pending subtopic offer awaiting student choice
    restartAvailable: false, // set when student is invited to restart from recall
    events: [],        // lightweight event log
  }
}

// Mark one or more goal indices as covered for a given phase. Keeps the flat
// `state.goalsCovered` in sync with the explanation phase so existing UI still
// shows goal progress while new per-phase tracking drives the phase routers.
export const markGoalsCovered = (state, indices, phase = PHASES.EXPLANATION) => {
  if (!Array.isArray(state.conceptGoals) || state.conceptGoals.length === 0) return state
  const ints = (Array.isArray(indices) ? indices : [])
    .map((i) => Number(i))
    .filter((i) => Number.isInteger(i) && i >= 0 && i < state.conceptGoals.length)
  if (!ints.length) return state

  const coverageByPhase = state.goalsCoveredByPhase && typeof state.goalsCoveredByPhase === 'object'
    ? state.goalsCoveredByPhase
    : {
      [PHASES.EXPLANATION]: state.conceptGoals.map(() => false),
      [PHASES.CAUSALITY]: state.conceptGoals.map(() => false),
      [PHASES.TRANSFER]: state.conceptGoals.map(() => false),
    }
  const phaseArr = Array.isArray(coverageByPhase[phase]) && coverageByPhase[phase].length === state.conceptGoals.length
    ? coverageByPhase[phase]
    : state.conceptGoals.map(() => false)

  let changed = false
  const nextPhaseArr = phaseArr.slice()
  for (const i of ints) {
    if (!nextPhaseArr[i]) { nextPhaseArr[i] = true; changed = true }
  }
  if (!changed) return state

  const nextCoverageByPhase = { ...coverageByPhase, [phase]: nextPhaseArr }

  // The flat `state.goalsCovered` is the ANY-phase union — a goal counts as
  // covered in the UI as soon as the student demonstrates it in any of the
  // explanation, causality, or transfer phases. Without this, goals shown to
  // the student stay "uncovered" even after they were addressed in causality
  // or transfer, which makes progress feel broken.
  const explArr = nextCoverageByPhase[PHASES.EXPLANATION] || state.conceptGoals.map(() => false)
  const causArr = nextCoverageByPhase[PHASES.CAUSALITY] || state.conceptGoals.map(() => false)
  const tranArr = nextCoverageByPhase[PHASES.TRANSFER] || state.conceptGoals.map(() => false)
  const nextFlat = state.conceptGoals.map((_, i) => explArr[i] === true || causArr[i] === true || tranArr[i] === true)

  return { ...state, goalsCovered: nextFlat, goalsCoveredByPhase: nextCoverageByPhase }
}

// Are all goals covered for the given phase?
export const allGoalsCoveredForPhase = (state, phase) => {
  if (!Array.isArray(state.conceptGoals) || state.conceptGoals.length === 0) return true
  const arr = state.goalsCoveredByPhase?.[phase]
  if (!Array.isArray(arr) || arr.length !== state.conceptGoals.length) return false
  return arr.every(Boolean)
}

// Bump the per-phase subtopic-offer counter on a node. Called when a
// system-initiated detour offer is shown so phase routers can cap repeated
// "I think we need a quick detour" messages on the same phase.
export const bumpSubtopicOfferCount = (state, nodeId, phase) =>
  withNode(state, nodeId, (node) => ({
    ...node,
    phases: {
      ...node.phases,
      [phase]: {
        ...node.phases[phase],
        subtopicOfferCount: (node.phases[phase]?.subtopicOfferCount || 0) + 1,
      },
    },
  }))

export const setRecallPlan = (state, recallPlan) => ({ ...state, recallPlan })

export const setRestartAvailable = (state, available) => ({ ...state, restartAvailable: !!available })

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
  detourKind = null,
  prerequisiteTerm = '',
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
    detourKind,
    prerequisiteTerm,
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
  goalsCoveredByPhase: state.goalsCoveredByPhase || null,
  recallPlan: state.recallPlan || null,
  restartAvailable: !!state.restartAvailable,
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
