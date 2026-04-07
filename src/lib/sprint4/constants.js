export const SPRINT4_STORAGE_PREFIX = 'forest-mvp-v2'
export const SPRINT4_INSTRUMENTATION_VERSION = 'mvp_v2_dynamic_mastery'

export const SPRINT4_PHASES = {
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
}

export const NODE_STATES = {
  LOCKED: 'locked',
  ACTIVE: 'active',
  PARTIAL: 'partial',
  MASTERED_WITH_SUPPORT: 'mastered_with_support',
  MASTERED_INDEPENDENTLY: 'mastered_independently',
}

export const EVALUATION_PROMPT_IDS = {
  EXPLANATION: 'explanation',
  TRANSFER: 'transfer',
  MISCONCEPTION: 'misconception',
}

export const DEFAULT_TIME_BUDGET_MS = 8 * 60 * 1000
export const MAX_VISIBLE_HISTORY = 8

export const createEmptyDimensionScores = () => ({
  explanation: 0,
  causalReasoning: 0,
  transfer: 0,
  misconceptionResistance: 0,
})

export const isMasteredNodeState = (status) =>
  status === NODE_STATES.MASTERED_INDEPENDENTLY || status === NODE_STATES.MASTERED_WITH_SUPPORT

export const getConditionLabel = (condition) =>
  condition === SPRINT4_CONDITIONS.GUIDED ? 'Guided dynamic map' : 'Free-form control'

