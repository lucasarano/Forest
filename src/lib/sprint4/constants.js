export const SPRINT4_STORAGE_PREFIX = 'forest-mvp-v2'
export const SPRINT4_INSTRUMENTATION_VERSION = 'mvp_v2_dynamic_mastery'

export const SPRINT4_PHASES = {
  SELF_REPORT: 'self_report',
  LEARNING: 'learning',
  EVALUATION: 'evaluation',
  SURVEY: 'survey',
  SUMMARY: 'summary',
}

export const SPRINT4_CONDITIONS = {
  GUIDED: 'guided_dynamic_map',
  CONTROL: 'freeform_control',
}

export const EVIDENCE_DIMENSIONS = [
  'explanation',
  'causalReasoning',
  'transfer',
  'misconceptionResistance',
]

export const PROMPT_KINDS = {
  ASSESS: 'assess',
  TEACH: 'teach',
  REASSESS: 'reassess',
  TRANSFER: 'transfer',
  RECALL: 'recall',
  MCQ: 'mcq',
  CHAINED: 'chained',
}

export const NODE_STATES = {
  LOCKED: 'locked',
  ACTIVE: 'active',
  PARTIAL: 'partial',
  SKIPPED: 'skipped',
  MASTERED_WITH_SUPPORT: 'mastered_with_support',
  MASTERED_INDEPENDENTLY: 'mastered_independently',
}

export const EVALUATION_PROMPT_IDS = {
  EXPLANATION: 'explanation',
  TRANSFER: 'transfer',
  MISCONCEPTION: 'misconception',
}

export const MODEL_BY_CONTEXT = {
  assessment: 'gpt-4.1',
  evaluation_score: 'gpt-4.1',
  mcq_generate: 'gpt-4.1',
  tutor: 'gpt-4.1-mini',
  teach: 'gpt-4.1-mini',
  planner: 'gpt-4.1-mini',
}

export const DEFAULT_TIME_BUDGET_MS = 15 * 60 * 1000

export const BUILTIN_STUDY_ID = 'builtin-gradient-descent'
export const BUILTIN_SEED_CONCEPT = 'How does gradient descent minimize loss in machine learning'

export const MAX_VISIBLE_HISTORY = 8

export const createEmptyDimensionScores = () => ({
  explanation: 0,
  causalReasoning: 0,
  transfer: 0,
  misconceptionResistance: 0,
})

export const isMasteredNodeState = (status) =>
  status === NODE_STATES.MASTERED_INDEPENDENTLY ||
  status === NODE_STATES.MASTERED_WITH_SUPPORT ||
  status === NODE_STATES.SKIPPED

export const getConditionLabel = (condition) =>
  condition === SPRINT4_CONDITIONS.GUIDED ? 'Guided dynamic map' : 'Free-form control'

export const createEmptyMetrics = () => ({
  explanationRequestCount: 0,
  speechResponseCount: 0,
  totalTabAwayMs: 0,
  nodeTimestamps: {},
})
