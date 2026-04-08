import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DATA_DIR = path.join(process.cwd(), '.local')
const STORE_PATH = path.join(DATA_DIR, 'sprint4-store.json')

const EMPTY_STORE = {
  studyConfigs: {},
  sessions: {},
  sessionTokens: {},
}

let writeQueue = Promise.resolve()

const ensureStore = async () => {
  await mkdir(DATA_DIR, { recursive: true })
  try {
    const raw = await readFile(STORE_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      studyConfigs: parsed.studyConfigs || {},
      sessions: parsed.sessions || {},
      sessionTokens: parsed.sessionTokens || {},
    }
  } catch {
    await writeFile(STORE_PATH, JSON.stringify(EMPTY_STORE, null, 2))
    return structuredClone(EMPTY_STORE)
  }
}

const saveStore = async (store) => {
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(store, null, 2))
}

export const readStore = async () => ensureStore()

export const mutateStore = async (mutator) => {
  writeQueue = writeQueue.then(async () => {
    const store = await ensureStore()
    const result = await mutator(store)
    await saveStore(store)
    return result
  })

  return writeQueue
}

export const listStudyConfigs = async () => {
  const store = await ensureStore()
  return Object.values(store.studyConfigs)
}

export const getStudyConfig = async (studyConfigId) => {
  const store = await ensureStore()
  return store.studyConfigs[studyConfigId] || null
}

export const ensureBuiltinStudyConfigRecord = async (studyConfig) => studyConfig

export const createStudyConfigRecord = async ({ seedConcept, conceptSummary, timeBudgetMs, graphNodes, evaluationBundle, graphModel = 'legacy' }) => {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  const record = {
    id,
    seedConcept,
    conceptSummary,
    timeBudgetMs,
    graphModel,
    graphNodes,
    evaluationBundle,
    createdAt: now,
    updatedAt: now,
  }

  await mutateStore((store) => {
    store.studyConfigs[id] = record
    return record
  })

  return record
}

export const createSessionRecord = async ({ sessionToken, session }) =>
  mutateStore((store) => {
    store.sessions[session.id] = session
    store.sessionTokens[sessionToken] = session.id
    return session
  })

export const getSessionByToken = async (sessionToken) => {
  const store = await ensureStore()
  const sessionId = store.sessionTokens[sessionToken]
  if (!sessionId) return null
  return store.sessions[sessionId] || null
}

export const updateSession = async (sessionToken, updater) =>
  mutateStore((store) => {
    const sessionId = store.sessionTokens[sessionToken]
    if (!sessionId || !store.sessions[sessionId]) {
      throw new Error('Session not found or token is invalid.')
    }

    const current = store.sessions[sessionId]
    const next = updater(structuredClone(current))
    store.sessions[sessionId] = next
    return next
  })

export const countSessionsByStudyConfig = async (studyConfigId) => {
  const store = await ensureStore()
  const sessions = Object.values(store.sessions).filter((session) => session.studyConfigId === studyConfigId)
  return {
    guided: sessions.filter((session) => session.condition === 'guided_dynamic_map').length,
    control: sessions.filter((session) => session.condition === 'freeform_control').length,
  }
}

export const listSessions = async () => {
  const store = await ensureStore()
  return Object.values(store.sessions)
}
