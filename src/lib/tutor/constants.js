// Recursive Mastery Graph — shared constants (client + server).
// Everything is policy, nothing is topic-specific.

export const STORAGE_PREFIX = 'forest'

// The four goal phases, in the order a node progresses through them.
export const PHASES = {
  EXPLANATION: 'explanation',
  CAUSALITY: 'causality',
  TRANSFER: 'transfer',
  RECALL: 'recall',
}

export const PHASE_ORDER = [
  PHASES.EXPLANATION,
  PHASES.CAUSALITY,
  PHASES.TRANSFER,
  PHASES.RECALL,
]

export const PHASE_LABELS = {
  [PHASES.EXPLANATION]: 'Explanation',
  [PHASES.CAUSALITY]: 'Causality',
  [PHASES.TRANSFER]: 'Transfer',
  [PHASES.RECALL]: 'Recall',
}

// Per-phase state shown in the right panel. Visible backward movement requires
// distinct states for reopened vs. needs_review so we can render the jump.
export const PHASE_STATES = {
  LOCKED: 'locked',
  ACTIVE: 'active',
  IN_PROGRESS: 'in_progress',
  PASSED: 'passed',
  NEEDS_REVIEW: 'needs_review',
  REOPENED: 'reopened',
  SKIPPED: 'skipped',
  DEFERRED: 'deferred',
}

// Per-node state shown on the concept graph.
export const NODE_STATES = {
  LOCKED: 'locked',
  ACTIVE: 'active',
  IN_PROGRESS: 'in_progress',
  MASTERED: 'mastered',
  SKIPPED: 'skipped',
  NEEDS_REVIEW: 'needs_review',
}

// Orchestrator actions. The Phase Router must pick exactly one of these.
export const ACTIONS = {
  CONTINUE: 'continue',          // keep asking within current phase
  REMEDIATE: 'remediate',        // reteach on a clear misconception (narrow)
  GUIDE: 'guide',                // scaffold a worked example forward, step-by-step
  ADVANCE: 'advance',            // move to next phase in this node
  REOPEN: 'reopen',              // jump backwards to an earlier phase in this node
  OPEN_SUBTOPIC: 'open_subtopic',// push a child concept onto the stack
  RETURN: 'return',              // pop the stack back to the parent
  SCHEDULE_RECALL: 'schedule_recall', // queue recall for later
  COMPLETE_NODE: 'complete_node', // all phases passed and recall satisfied
}

// Conversation roles used in per-node message logs.
export const MESSAGE_ROLES = {
  TUTOR: 'tutor',
  STUDENT: 'student',
  SYSTEM: 'system',
}

// Stable id helpers for nodes.
export const ROOT_NODE_ID = 'root'

// Passing thresholds. Structured evaluator outputs expose a 0..1 confidence;
// the Phase Router compares against these. Tuning lives here, not in agents.
export const PASS_THRESHOLDS = {
  [PHASES.EXPLANATION]: 0.7,
  [PHASES.CAUSALITY]: 0.7,
  [PHASES.TRANSFER]: 0.65,
  [PHASES.RECALL]: 0.65,
}

// Max children opened from a single node, and max recursion depth.
// Keeps runaway recursion under control without being topic-specific.
export const MAX_CHILDREN_PER_NODE = 3
export const MAX_STACK_DEPTH = 4

// Recall is scheduled after N *other* turns have passed since the node
// was first tentatively mastered.
export const RECALL_INTERFERENCE_TURNS = 3

// Default session time budget.
export const DEFAULT_TIME_BUDGET_MS = 20 * 60 * 1000

// Model to use for every agent call. One global lever.
export const DEFAULT_MODEL = 'gpt-5.4-mini'
