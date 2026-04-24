import { computeDynamicMapLayout } from './tutor/layout'
import { STORAGE_PREFIX } from './tutor/constants'

const SESSION_TOKEN_PREFIX = `${STORAGE_PREFIX}:session:`
const ADMIN_PASSWORD_KEY = `${STORAGE_PREFIX}:admin-password`
const SERVER_BASE = (import.meta.env.VITE_SERVER_URL || 'http://localhost:4001/api').replace(/\/$/, '')

const callServer = async (path, body = {}, method = 'POST') => {
  const response = await fetch(`${SERVER_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.error) throw new Error(data?.error || `Request failed (${response.status})`)
  return data
}

// Augment the snapshot with layout positions for the concept graph.
const withLayout = (snapshot) => {
  if (!snapshot?.state?.nodes) return snapshot
  const nodesArray = Object.values(snapshot.state.nodes)
  const laidOut = computeDynamicMapLayout(nodesArray)
  const byId = {}
  for (const node of laidOut) byId[node.id] = node
  return { ...snapshot, state: { ...snapshot.state, nodes: byId } }
}

const storageKey = (conceptId) => `${SESSION_TOKEN_PREFIX}${conceptId}`
export const getStoredSessionToken = (conceptId) => localStorage.getItem(storageKey(conceptId)) || ''
export const storeSessionToken = (conceptId, token) => localStorage.setItem(storageKey(conceptId), token)
export const clearStoredSessionToken = (conceptId) => localStorage.removeItem(storageKey(conceptId))

export const getStoredAdminPassword = () => sessionStorage.getItem(ADMIN_PASSWORD_KEY) || ''
export const storeAdminPassword = (password) => sessionStorage.setItem(ADMIN_PASSWORD_KEY, password)
export const clearAdminPassword = () => sessionStorage.removeItem(ADMIN_PASSWORD_KEY)

/* ── Catalog (public) ─────────────────────────────────────────── */
export const fetchCatalog = async () => callServer('/catalog', null, 'GET')

// Teacher tree mirrors the public catalog for now — admin-specific analytics
// will land in a follow-up. Accepts password for future-proof API parity.
export const fetchTeacherTree = async (password) =>
  callServer(`/catalog`, null, 'GET').then((data) => ({ ...data, password }))

export const fetchTeacherAnalytics = async ({ scope, id, password }) => {
  const qs = new URLSearchParams({ scope, id, password }).toString()
  return callServer(`/teacher/analytics?${qs}`, null, 'GET')
}

export const fetchTeacherSessionDetail = async ({ sessionId, password }) => {
  const qs = new URLSearchParams({ password }).toString()
  return callServer(`/teacher/sessions/${encodeURIComponent(sessionId)}?${qs}`, null, 'GET')
}

export const fetchOpsHealth = async (password) =>
  callServer(`/ops/sessions?password=${encodeURIComponent(password)}`, null, 'GET')

/* ── Admin ────────────────────────────────────────────────────── */
export const createCourse = async ({ title, description = '', password }) =>
  callServer('/courses', { password, title, description })
export const updateCourse = async ({ id, title, description, password }) =>
  callServer(`/courses/${encodeURIComponent(id)}`, { password, title, description }, 'PATCH')
export const deleteCourse = async ({ id, password }) =>
  callServer(`/courses/${encodeURIComponent(id)}`, { password }, 'DELETE')

export const createHomework = async ({ courseId, title, description = '', password }) =>
  callServer('/homeworks', { password, courseId, title, description })
export const updateHomework = async ({ id, title, description, password }) =>
  callServer(`/homeworks/${encodeURIComponent(id)}`, { password, title, description }, 'PATCH')
export const deleteHomework = async ({ id, password }) =>
  callServer(`/homeworks/${encodeURIComponent(id)}`, { password }, 'DELETE')

export const createConcept = async ({ homeworkId, title, seedQuestion, conceptSummary = '', conceptGoals = [], timeBudgetMs, password }) =>
  callServer('/concepts', { password, homeworkId, title, seedQuestion, conceptSummary, conceptGoals, timeBudgetMs })
export const fetchConcept = async ({ id, password }) =>
  callServer(`/concepts/${encodeURIComponent(id)}?password=${encodeURIComponent(password)}`, null, 'GET')
export const updateConcept = async ({ id, title, seedQuestion, conceptSummary, conceptGoals, timeBudgetMs, password }) =>
  callServer(`/concepts/${encodeURIComponent(id)}`, { password, title, seedQuestion, conceptSummary, conceptGoals, timeBudgetMs }, 'PATCH')
export const deleteConcept = async ({ id, password }) =>
  callServer(`/concepts/${encodeURIComponent(id)}`, { password }, 'DELETE')

/* ── Tutor session ────────────────────────────────────────────── */
export const startTutorSession = async ({ conceptId, studentName, forceNew = false }) => {
  if (forceNew) clearStoredSessionToken(conceptId)
  else {
    const stored = getStoredSessionToken(conceptId)
    if (stored) {
      try {
        const restored = await getTutorSession(stored)
        if (restored?.snapshot?.state) return { sessionToken: stored, ...restored }
      } catch { clearStoredSessionToken(conceptId) }
    }
  }
  const started = await callServer('/tutor/start', { conceptId, studentName })
  storeSessionToken(conceptId, started.sessionToken)
  return {
    sessionToken: started.sessionToken,
    snapshot: withLayout(started.snapshot),
    tutorMessage: started.tutorMessage,
  }
}

export const getTutorSession = async (token) => {
  const loaded = await callServer('/tutor/get', { token })
  return { snapshot: withLayout(loaded.snapshot) }
}

export const submitTutorTurn = async ({ token, studentMessage }) => {
  const result = await callServer('/tutor/turn', { token, studentMessage })
  return { snapshot: withLayout(result.snapshot), tutorMessage: result.tutorMessage, decision: result.decision }
}

export const acceptOffer = async ({ token }) => {
  const result = await callServer('/tutor/offer/accept', { token })
  return { snapshot: withLayout(result.snapshot), tutorMessage: result.tutorMessage }
}

export const skipOffer = async ({ token }) => {
  const result = await callServer('/tutor/offer/skip', { token })
  return { snapshot: withLayout(result.snapshot), tutorMessage: result.tutorMessage }
}

export const returnFromActive = async ({ token, viaSkip = true }) => {
  const result = await callServer('/tutor/return', { token, viaSkip })
  return { snapshot: withLayout(result.snapshot), tutorMessage: result.tutorMessage }
}

export const restartTutorSession = async ({ token }) => {
  const result = await callServer('/tutor/restart', { token })
  return { snapshot: withLayout(result.snapshot), tutorMessage: result.tutorMessage }
}

export const transcribeAudio = async (blob) => {
  const formData = new FormData()
  formData.append('file', blob, 'recording.webm')
  const response = await fetch(`${SERVER_BASE}/transcribe`, { method: 'POST', body: formData })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.error) throw new Error(data?.error || `Transcription failed (${response.status})`)
  return data.text || ''
}
