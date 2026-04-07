import { createServer } from 'node:http'
import { loadLocalEnv } from './loadEnv.js'
import {
  countSessionsByStudyConfig,
  createSessionRecord,
  createStudyConfigRecord,
  getSessionByToken,
  getStudyConfig,
  listSessions,
  listStudyConfigs,
  updateSession,
} from './sprint4Store.js'
import {
  createInitialSessionSnapshot,
  generateStudyArtifacts,
  runControlTurn,
  runGuidedTurn,
  scoreEvaluationAnswers,
} from '../src/lib/sprint4/runtime.js'
import { SPRINT4_CONDITIONS, SPRINT4_PHASES } from '../src/lib/sprint4/constants.js'

loadLocalEnv()

const PORT = Number(process.env.SPRINT4_SERVER_PORT || 4001)
const ADMIN_PASSWORD = process.env.MVP_ADMIN_PASSWORD || 'admin12345'

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  response.end(JSON.stringify(payload))
}

const parseBody = async (request) => {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(chunk)
  }

  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  return JSON.parse(raw)
}

const chooseCondition = ({ guided, control }) => {
  if (guided === control) {
    return Math.random() >= 0.5 ? SPRINT4_CONDITIONS.GUIDED : SPRINT4_CONDITIONS.CONTROL
  }
  return guided < control ? SPRINT4_CONDITIONS.GUIDED : SPRINT4_CONDITIONS.CONTROL
}

const getSnapshot = async (session) => {
  const studyConfig = await getStudyConfig(session.studyConfigId)
  if (!studyConfig) {
    throw new Error('Study config not found.')
  }
  return {
    studyConfig,
    session,
  }
}

const getTimeRemainingMs = (session) => {
  if (!session?.startedAt || !session?.timeBudgetMs || session.phase !== SPRINT4_PHASES.LEARNING) return 0
  const elapsed = Date.now() - new Date(session.startedAt).getTime()
  return Math.max(0, session.timeBudgetMs - elapsed)
}

const buildGraphDiff = (previousNodes = [], nextNodes = []) => {
  const previousMap = new Map(previousNodes.map((node) => [node.id, node]))
  const nextMap = new Map(nextNodes.map((node) => [node.id, node]))
  const added = []
  const changed = []

  nextMap.forEach((node, id) => {
    const previous = previousMap.get(id)
    if (!previous) {
      added.push(id)
      return
    }
    if (
      previous.status !== node.status ||
      previous.promptKind !== node.promptKind ||
      previous.supportLevel !== node.supportLevel ||
      previous.successfulRecallCount !== node.successfulRecallCount
    ) {
      changed.push(id)
    }
  })

  return { added, changed }
}

const summarizeNodes = (graphNodes = []) => graphNodes.map((node) => ({
  id: node.id,
  title: node.title,
  status: node.status,
  promptKind: node.promptKind,
  supportLevel: node.supportLevel || 0,
  successfulRecallCount: node.successfulRecallCount || 0,
  bestScores: node.bestScores || {},
  isRoot: !!node.isRoot,
}))

const summarizeEvidence = (session) => {
  const activeNode = (session.graphNodes || []).find((node) => node.id === session.currentNodeId)
  if (!activeNode) return null
  const latestEvidence = [...(session.evidenceRecords || [])].reverse().find((entry) => entry.nodeId === activeNode.id)
  return {
    nodeId: activeNode.id,
    nodeTitle: activeNode.title,
    bestScores: activeNode.bestScores || {},
    latestEvidence,
  }
}

const requireAdmin = (password) => {
  if (!password || password !== ADMIN_PASSWORD) {
    throw new Error('Invalid admin password.')
  }
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: 'Missing URL.' })
    return
  }

  if (request.method === 'OPTIONS') {
    sendJson(response, 200, { ok: true })
    return
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host}`)

    if (request.method === 'GET' && url.pathname === '/api/sprint4/health') {
      sendJson(response, 200, { ok: true, port: PORT })
      return
    }

    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed.' })
      return
    }

    const body = await parseBody(request)

    if (url.pathname === '/api/sprint4/create-study-config') {
      requireAdmin(body.password)
      const seedConcept = `${body.seedConcept || ''}`.trim()
      const timeBudgetMs = Number.isFinite(body.timeBudgetMs) ? Number(body.timeBudgetMs) : 8 * 60 * 1000
      if (!seedConcept) {
        sendJson(response, 400, { error: 'seedConcept is required.' })
        return
      }

      const artifacts = await generateStudyArtifacts(seedConcept)
      const record = await createStudyConfigRecord({
        seedConcept,
        conceptSummary: artifacts.conceptSummary,
        timeBudgetMs,
        graphNodes: artifacts.graphNodes,
        evaluationBundle: artifacts.evaluationBundle,
      })

      sendJson(response, 200, {
        studyConfigId: record.id,
        evaluationBundleId: `${record.id}:evaluation`,
        studyConfig: record,
      })
      return
    }

    if (url.pathname === '/api/sprint4/admin-summary') {
      requireAdmin(body.password)
      const [configs, sessions] = await Promise.all([listStudyConfigs(), listSessions()])
      const configMap = new Map(configs.map((config) => [config.id, config]))

      const average = (values) => values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : 0

      const configSummaries = configs.map((config) => {
        const matching = sessions.filter((session) => session.studyConfigId === config.id)
        const evaluationTotals = matching.map((session) =>
          (session.evaluationScores || []).reduce((sum, score) => sum + Number(score.score || 0), 0)
        )
        return {
          ...config,
          sessionCount: matching.length,
          guidedCount: matching.filter((session) => session.condition === SPRINT4_CONDITIONS.GUIDED).length,
          controlCount: matching.filter((session) => session.condition === SPRINT4_CONDITIONS.CONTROL).length,
          averageEvaluationScore: average(evaluationTotals),
          averageTurns: average(matching.map((session) => session.turnIndex || 0)),
        }
      })

      sendJson(response, 200, {
        configs: configSummaries,
        sessions: sessions.map((session) => ({
          id: session.id,
          studyConfigId: session.studyConfigId,
          seedConcept: configMap.get(session.studyConfigId)?.seedConcept || '',
          condition: session.condition,
          phase: session.phase,
          status: session.status,
          turnIndex: session.turnIndex || 0,
          startedAt: session.startedAt,
          learningCompletedAt: session.learningCompletedAt,
          evaluationCompletedAt: session.evaluationCompletedAt,
          surveyCompletedAt: session.surveyCompletedAt,
          timeBudgetMs: session.timeBudgetMs,
        })),
      })
      return
    }

    if (url.pathname === '/api/sprint4/start-session') {
      const studyConfigId = `${body.studyConfigId || ''}`
      const studyConfig = await getStudyConfig(studyConfigId)
      if (!studyConfig) {
        sendJson(response, 404, { error: 'Study config not found.' })
        return
      }

      const counts = await countSessionsByStudyConfig(studyConfigId)
      const condition = chooseCondition(counts)
      const sessionToken = crypto.randomUUID()
      const snapshot = createInitialSessionSnapshot({
        studyConfigId,
        studyConfig,
        condition,
      })
      const now = new Date().toISOString()
      const session = {
        ...snapshot,
        id: crypto.randomUUID(),
        startedAt: now,
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      }

      await createSessionRecord({
        studyConfigId,
        sessionToken,
        session,
      })

      sendJson(response, 200, {
        sessionToken,
        snapshot: await getSnapshot(session),
      })
      return
    }

    if (url.pathname === '/api/sprint4/get-session') {
      const token = `${body.token || ''}`
      const existing = await getSessionByToken(token)
      if (!existing) {
        sendJson(response, 401, { error: 'Session not found or token is invalid.' })
        return
      }

      const session = await updateSession(token, (current) => ({
        ...current,
        lastActiveAt: new Date().toISOString(),
      }))

      sendJson(response, 200, { snapshot: await getSnapshot(session) })
      return
    }

    if (url.pathname === '/api/sprint4/submit-turn') {
      const token = `${body.token || ''}`
      const userMessage = `${body.userMessage || ''}`
      const helpRequested = !!body.helpRequested
      const activeNodeId = `${body.activeNodeId || ''}`

      const existing = await getSessionByToken(token)
      if (!existing) {
        sendJson(response, 401, { error: 'Session not found or token is invalid.' })
        return
      }

      const studyConfig = await getStudyConfig(existing.studyConfigId)
      if (!studyConfig) {
        sendJson(response, 404, { error: 'Study config not found.' })
        return
      }

      const baseSession = {
        ...existing,
        currentNodeId: activeNodeId || existing.currentNodeId,
      }

      const result = baseSession.condition === SPRINT4_CONDITIONS.GUIDED
        ? await runGuidedTurn({
            session: baseSession,
            studyConfig,
            userMessage,
            helpRequested,
          })
        : await runControlTurn({
            session: baseSession,
            studyConfig,
            userMessage,
          })

      let nextSession = result.session
      if (
        nextSession.phase === SPRINT4_PHASES.LEARNING &&
        nextSession.startedAt &&
        nextSession.timeBudgetMs &&
        Date.now() - new Date(nextSession.startedAt).getTime() >= nextSession.timeBudgetMs
      ) {
        nextSession = {
          ...nextSession,
          phase: SPRINT4_PHASES.EVALUATION,
          learningCompletedAt: nextSession.learningCompletedAt || new Date().toISOString(),
        }
      }

      nextSession = {
        ...nextSession,
        updatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      }

      const persisted = await updateSession(token, () => nextSession)
      const snapshot = await getSnapshot(persisted)

      sendJson(response, 200, {
        tutorMessage: result.tutorMessage,
        graphDiff: buildGraphDiff(existing.graphNodes, persisted.graphNodes),
        activeNodeId: persisted.currentNodeId,
        nodeSummaries: summarizeNodes(persisted.graphNodes),
        evidenceSummary: summarizeEvidence(persisted),
        phase: persisted.phase,
        timeRemainingMs: getTimeRemainingMs(persisted),
        snapshot,
      })
      return
    }

    if (url.pathname === '/api/sprint4/advance-phase') {
      const token = `${body.token || ''}`
      const phase = `${body.phase || ''}`
      const existing = await getSessionByToken(token)
      if (!existing) {
        sendJson(response, 401, { error: 'Session not found or token is invalid.' })
        return
      }

      const next = await updateSession(token, (current) => ({
        ...current,
        phase,
        learningCompletedAt: phase === SPRINT4_PHASES.EVALUATION
          ? current.learningCompletedAt || new Date().toISOString()
          : current.learningCompletedAt,
        updatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      }))

      sendJson(response, 200, {
        sessionToken: token,
        snapshot: await getSnapshot(next),
      })
      return
    }

    if (url.pathname === '/api/sprint4/submit-evaluation') {
      const token = `${body.token || ''}`
      const answers = Array.isArray(body.answers) ? body.answers : []
      const existing = await getSessionByToken(token)
      if (!existing) {
        sendJson(response, 401, { error: 'Session not found or token is invalid.' })
        return
      }

      const studyConfig = await getStudyConfig(existing.studyConfigId)
      if (!studyConfig) {
        sendJson(response, 404, { error: 'Study config not found.' })
        return
      }

      const scores = await scoreEvaluationAnswers({ studyConfig, answers })
      const next = await updateSession(token, (current) => ({
        ...current,
        evaluationAnswers: answers,
        evaluationScores: scores.answers,
        evaluationOverallScore: scores.overallScore,
        evaluationSummary: scores.summary,
        evaluationCompletedAt: new Date().toISOString(),
        phase: SPRINT4_PHASES.SURVEY,
        updatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      }))

      sendJson(response, 200, {
        sessionToken: token,
        snapshot: await getSnapshot(next),
      })
      return
    }

    if (url.pathname === '/api/sprint4/submit-survey') {
      const token = `${body.token || ''}`
      const survey = body.survey && typeof body.survey === 'object' ? body.survey : null
      const existing = await getSessionByToken(token)
      if (!existing) {
        sendJson(response, 401, { error: 'Session not found or token is invalid.' })
        return
      }
      if (!survey) {
        sendJson(response, 400, { error: 'survey is required.' })
        return
      }

      const next = await updateSession(token, (current) => ({
        ...current,
        surveyResponse: survey,
        surveyCompletedAt: new Date().toISOString(),
        status: 'completed',
        phase: SPRINT4_PHASES.SUMMARY,
        updatedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      }))

      sendJson(response, 200, {
        sessionToken: token,
        snapshot: await getSnapshot(next),
      })
      return
    }

    sendJson(response, 404, { error: 'Route not found.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.'
    const statusCode = message === 'Invalid admin password.' ? 401 : 500
    sendJson(response, statusCode, { error: message })
  }
})

server.listen(PORT, () => {
  console.log(`Sprint 4 LangGraph server listening on http://localhost:${PORT}`)
})

