import { computeDynamicMapLayout } from './sprint4/layout'
import {
  DEFAULT_TIME_BUDGET_MS,
  NODE_STATES,
  SPRINT4_STORAGE_PREFIX,
} from './sprint4/constants'

const SESSION_TOKEN_PREFIX = `${SPRINT4_STORAGE_PREFIX}:session:`
const SERVER_BASE = (import.meta.env.VITE_SPRINT4_SERVER_URL || 'http://localhost:4001/api/sprint4').replace(/\/$/, '')

const callServer = async (path, body = {}, method = 'POST') => {
  const response = await fetch(`${SERVER_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `Request failed (${response.status})`)
  }

  return data
}

const withLayout = (snapshot) => {
  if (!snapshot?.session) return snapshot
  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      graphNodes: computeDynamicMapLayout(snapshot.session.graphNodes || []),
    },
  }
}

const getSessionStorageKey = (studyConfigId) => `${SESSION_TOKEN_PREFIX}${studyConfigId}`

export const getStoredV2Token = (studyConfigId) => localStorage.getItem(getSessionStorageKey(studyConfigId)) || ''
export const storeV2Token = (studyConfigId, token) => localStorage.setItem(getSessionStorageKey(studyConfigId), token)
export const clearStoredV2Token = (studyConfigId) => localStorage.removeItem(getSessionStorageKey(studyConfigId))

export const createStudyConfig = async ({ seedConcept, timeBudgetMs = DEFAULT_TIME_BUDGET_MS, password }) =>
  callServer('/create-study-config', {
    password,
    seedConcept,
    timeBudgetMs,
  })

export const fetchV2AdminSummary = async (password) =>
  callServer('/admin-summary', { password })

export const startSession = async ({ studyConfigId }) => {
  const storedToken = getStoredV2Token(studyConfigId)
  if (storedToken) {
    try {
      const restored = await getSession(storedToken)
      if (restored?.snapshot?.session?.id) {
        return restored
      }
    } catch {
      clearStoredV2Token(studyConfigId)
    }
  }

  const started = await callServer('/start-session', { studyConfigId })
  storeV2Token(studyConfigId, started.sessionToken)

  return {
    sessionToken: started.sessionToken,
    snapshot: withLayout(started.snapshot),
  }
}

export const getSession = async (token) => {
  const loaded = await callServer('/get-session', { token })
  return {
    sessionToken: token,
    snapshot: withLayout(loaded.snapshot),
  }
}

export const submitTurn = async ({ token, activeNodeId, userMessage, helpRequested = false }) => {
  const response = await callServer('/submit-turn', {
    token,
    activeNodeId,
    userMessage,
    helpRequested,
  })

  return {
    ...response,
    snapshot: withLayout(response.snapshot),
  }
}

export const getTimeRemainingMs = (session) => {
  if (!session?.startedAt || !session?.timeBudgetMs || session.phase !== 'learning') {
    return 0
  }

  const elapsed = Date.now() - new Date(session.startedAt).getTime()
  return Math.max(0, session.timeBudgetMs - elapsed)
}

export const advancePhase = async ({ token, phase }) => {
  const response = await callServer('/advance-phase', { token, phase })
  return {
    sessionToken: token,
    snapshot: withLayout(response.snapshot),
  }
}

export const submitEvaluation = async ({ token, answers }) => {
  const response = await callServer('/submit-evaluation', { token, answers })
  return {
    sessionToken: token,
    snapshot: withLayout(response.snapshot),
  }
}

export const submitSurvey = async ({ token, survey }) => {
  const response = await callServer('/submit-survey', { token, survey })
  return {
    sessionToken: token,
    snapshot: withLayout(response.snapshot),
  }
}

export const getActiveNode = (snapshot) =>
  (snapshot?.session?.graphNodes || []).find((node) => node.id === snapshot?.session?.currentNodeId) || null

export const getGuidedProgress = (snapshot) => {
  const nodes = snapshot?.session?.graphNodes || []
  const mastered = nodes.filter((node) =>
    node.status === NODE_STATES.MASTERED_INDEPENDENTLY || node.status === NODE_STATES.MASTERED_WITH_SUPPORT
  ).length
  return {
    mastered,
    total: nodes.length,
  }
}

