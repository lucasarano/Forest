import { createServer } from 'node:http'
import { loadLocalEnv } from './loadEnv.js'
import {
  countSessionsByStudyConfig,
  createSessionRecord,
  createStudyConfigRecord,
  ensureBuiltinStudyConfigRecord,
  getSessionByToken,
  getStudyConfig,
  listSessions,
  listStudyConfigs,
  updateSession,
} from './sprint4Store.js'
import {
  buildInitialLearningMessages,
  createInitialSessionSnapshot,
  generateStudyArtifacts,
  getBuiltinStudyConfigRecord,
  getNextEligibleNode,
  markDependentAvailability,
  runControlTurn,
  runGuidedTurn,
  scoreEvaluationAnswers,
} from '../src/lib/sprint4/runtime.js'
import { BUILTIN_STUDY_ID, NODE_STATES, SPRINT4_CONDITIONS, SPRINT4_PHASES } from '../src/lib/sprint4/constants.js'

loadLocalEnv()

const log = (tag, ...args) => {
  const ts = new Date().toISOString()
  console.log(`[${ts}] [${tag}]`, ...args)
}

const PORT = Number(process.env.PORT || process.env.SPRINT4_SERVER_PORT || 4001)
const ADMIN_PASSWORD = process.env.MVP_ADMIN_PASSWORD || 'admin12345'
const OPENAI_API_BASE = 'https://api.openai.com/v1'
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://forest-mockup.vercel.app',
  'https://forest-mockup-cobilanding.vercel.app',
  'https://forest-mockup-lucasarano-cobilanding.vercel.app',
]
const ALLOWED_ORIGINS = new Set(
  `${process.env.ALLOWED_ORIGINS || ''}`
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .concat(!process.env.ALLOWED_ORIGINS ? DEFAULT_ALLOWED_ORIGINS : [])
)

const getApiKey = () => {
  const key = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || ''
  if (!key) throw new Error('OPENAI_API_KEY not set')
  return key
}

const getCorsHeaders = (origin = '') => {
  const headers = {
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    Vary: 'Origin',
  }
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

const isAllowedOrigin = (origin = '') => !origin || ALLOWED_ORIGINS.has(origin)

const sendJson = (response, statusCode, payload, origin = '') => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json', ...getCorsHeaders(origin) })
  response.end(JSON.stringify(payload))
}

const parseBody = async (request) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  return JSON.parse(raw)
}

const parseMultipart = async (request) => {
  const contentType = request.headers['content-type'] || ''
  const match = contentType.match(/boundary=(.+)/)
  if (!match) throw new Error('Missing multipart boundary')

  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = Buffer.concat(chunks)
  const boundary = `--${match[1]}`

  const parts = []
  const boundaryBuf = Buffer.from(boundary)
  let start = body.indexOf(boundaryBuf)
  while (start !== -1) {
    const nextStart = body.indexOf(boundaryBuf, start + boundaryBuf.length)
    if (nextStart === -1) break
    const partBuf = body.slice(start + boundaryBuf.length, nextStart)
    const headerEnd = partBuf.indexOf('\r\n\r\n')
    if (headerEnd === -1) { start = nextStart; continue }
    const headerStr = partBuf.slice(0, headerEnd).toString('utf8')
    let dataBuf = partBuf.slice(headerEnd + 4)
    if (dataBuf.length >= 2 && dataBuf[dataBuf.length - 2] === 0x0d && dataBuf[dataBuf.length - 1] === 0x0a) {
      dataBuf = dataBuf.slice(0, dataBuf.length - 2)
    }
    const nameMatch = headerStr.match(/name="([^"]+)"/)
    const filenameMatch = headerStr.match(/filename="([^"]+)"/)
    parts.push({
      name: nameMatch?.[1] || '',
      filename: filenameMatch?.[1] || '',
      headers: headerStr,
      data: dataBuf,
    })
    start = nextStart
  }
  return parts
}

const chooseCondition = ({ guided, control }) => {
  if (guided === control) return Math.random() >= 0.5 ? SPRINT4_CONDITIONS.GUIDED : SPRINT4_CONDITIONS.CONTROL
  return guided < control ? SPRINT4_CONDITIONS.GUIDED : SPRINT4_CONDITIONS.CONTROL
}

const resolveStudyConfig = async (studyConfigId) => {
  if (studyConfigId === BUILTIN_STUDY_ID) {
    return ensureBuiltinStudyConfigRecord(getBuiltinStudyConfigRecord())
  }
  const stored = await getStudyConfig(studyConfigId)
  if (stored) return stored
  return null
}

const getSnapshot = async (session) => {
  const studyConfig = await resolveStudyConfig(session.studyConfigId)
  if (!studyConfig) throw new Error('Study config not found.')
  return { studyConfig, session }
}

const getTimeRemainingMs = (session) => {
  if (!session?.startedAt || !session?.timeBudgetMs || session.phase !== SPRINT4_PHASES.LEARNING) return 0
  const elapsed = Date.now() - new Date(session.startedAt).getTime()
  return Math.max(0, session.timeBudgetMs - elapsed)
}

const buildGraphDiff = (previousNodes = [], nextNodes = []) => {
  const previousMap = new Map(previousNodes.map((n) => [n.id, n]))
  const nextMap = new Map(nextNodes.map((n) => [n.id, n]))
  const added = []
  const changed = []
  nextMap.forEach((node, id) => {
    const prev = previousMap.get(id)
    if (!prev) { added.push(id); return }
    if (prev.status !== node.status || prev.promptKind !== node.promptKind ||
        prev.supportLevel !== node.supportLevel || prev.successfulRecallCount !== node.successfulRecallCount) {
      changed.push(id)
    }
  })
  return { added, changed }
}

const summarizeNodes = (graphNodes = []) => graphNodes.map((n) => ({
  id: n.id, title: n.title, status: n.status, promptKind: n.promptKind,
  supportLevel: n.supportLevel || 0, successfulRecallCount: n.successfulRecallCount || 0,
  bestScores: n.bestScores || {}, isRoot: !!n.isRoot,
}))

const summarizeEvidence = (session) => {
  const activeNode = (session.graphNodes || []).find((n) => n.id === session.currentNodeId)
  if (!activeNode) return null
  const latestEvidence = [...(session.evidenceRecords || [])].reverse().find((e) => e.nodeId === activeNode.id)
  return { nodeId: activeNode.id, nodeTitle: activeNode.title, bestScores: activeNode.bestScores || {}, latestEvidence }
}

const requireAdmin = (password) => {
  if (!password || password !== ADMIN_PASSWORD) throw new Error('Invalid admin password.')
}

const server = createServer(async (request, response) => {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : ''
  if (!request.url) { sendJson(response, 400, { error: 'Missing URL.' }, origin); return }
  if (!isAllowedOrigin(origin)) { sendJson(response, 403, { error: 'Origin not allowed.' }, origin); return }
  if (request.method === 'OPTIONS') { sendJson(response, 200, { ok: true }, origin); return }

  try {
    const url = new URL(request.url, `http://${request.headers.host}`)

    if (request.method === 'GET' && url.pathname === '/api/sprint4/health') {
      sendJson(response, 200, { ok: true, port: PORT }, origin); return
    }

    if (request.method !== 'POST') { sendJson(response, 405, { error: 'Method not allowed.' }, origin); return }

    const isMultipart = (request.headers['content-type'] || '').includes('multipart/form-data')

    if (url.pathname === '/api/sprint4/transcribe') {
      const parts = await parseMultipart(request)
      const audioPart = parts.find((p) => p.name === 'file' || p.filename)
      if (!audioPart) { sendJson(response, 400, { error: 'No audio file provided.' }, origin); return }

      const formData = new FormData()
      formData.append('file', new Blob([audioPart.data]), audioPart.filename || 'audio.webm')
      formData.append('model', 'whisper-1')

      const whisperRes = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getApiKey()}` },
        body: formData,
      })
      if (!whisperRes.ok) {
        const err = await whisperRes.json().catch(() => ({}))
        throw new Error(err.error?.message || `Whisper failed (${whisperRes.status})`)
      }
      const result = await whisperRes.json()
      sendJson(response, 200, { text: result.text || '' }, origin)
      return
    }

    if (url.pathname === '/api/sprint4/upload-document') {
      const parts = await parseMultipart(request)
      const filePart = parts.find((p) => p.name === 'file' || p.filename)
      const tokenPart = parts.find((p) => p.name === 'token')
      if (!filePart || !tokenPart) { sendJson(response, 400, { error: 'Missing file or token.' }, origin); return }

      const token = tokenPart.data.toString('utf8').trim()
      const existing = await getSessionByToken(token)
      if (!existing) { sendJson(response, 401, { error: 'Session not found.' }, origin); return }

      const filename = filePart.filename || 'upload.txt'
      let extractedText = ''
      const ext = filename.split('.').pop()?.toLowerCase()

      if (ext === 'txt' || ext === 'md') {
        extractedText = filePart.data.toString('utf8')
      } else if (ext === 'pdf') {
        try {
          const pdfParse = (await import('pdf-parse')).default
          const result = await pdfParse(filePart.data)
          extractedText = result.text || ''
        } catch {
          extractedText = '[PDF text extraction failed]'
        }
      } else {
        extractedText = `[Unsupported file type: ${ext}]`
      }

      const docRecord = {
        id: crypto.randomUUID(),
        filename,
        extractedText: extractedText.slice(0, 5000),
        uploadedAt: new Date().toISOString(),
      }

      const next = await updateSession(token, (current) => ({
        ...current,
        uploadedDocuments: [...(current.uploadedDocuments || []), docRecord],
        updatedAt: new Date().toISOString(),
      }))

      sendJson(response, 200, { document: { id: docRecord.id, filename: docRecord.filename }, snapshot: await getSnapshot(next) }, origin)
      return
    }

    const body = isMultipart ? {} : await parseBody(request)

    if (url.pathname === '/api/sprint4/create-study-config') {
      requireAdmin(body.password)
      const seedConcept = `${body.seedConcept || ''}`.trim()
      const timeBudgetMs = Number.isFinite(body.timeBudgetMs) ? Number(body.timeBudgetMs) : 8 * 60 * 1000
      if (!seedConcept) { sendJson(response, 400, { error: 'seedConcept is required.' }, origin); return }

      const artifacts = await generateStudyArtifacts(seedConcept)
      const record = await createStudyConfigRecord({
        seedConcept, conceptSummary: artifacts.conceptSummary, timeBudgetMs,
        graphModel: artifacts.graphModel,
        graphNodes: artifacts.graphNodes, evaluationBundle: artifacts.evaluationBundle,
      })

      sendJson(response, 200, { studyConfigId: record.id, evaluationBundleId: `${record.id}:evaluation`, studyConfig: record }, origin)
      return
    }

    if (url.pathname === '/api/sprint4/admin-summary') {
      requireAdmin(body.password)
      const [configs, sessions] = await Promise.all([listStudyConfigs(), listSessions()])
      const configMap = new Map(configs.map((c) => [c.id, c]))
      const average = (vals) => vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : 0

      const configSummaries = configs.map((config) => {
        const matching = sessions.filter((s) => s.studyConfigId === config.id)
        const evalTotals = matching.map((s) => (s.evaluationScores || []).reduce((sum, sc) => sum + Number(sc.score || 0), 0))
        return {
          ...config,
          sessionCount: matching.length,
          guidedCount: matching.filter((s) => s.condition === SPRINT4_CONDITIONS.GUIDED).length,
          controlCount: matching.filter((s) => s.condition === SPRINT4_CONDITIONS.CONTROL).length,
          averageEvaluationScore: average(evalTotals),
          averageTurns: average(matching.map((s) => s.turnIndex || 0)),
        }
      })

      sendJson(response, 200, {
        configs: configSummaries,
        sessions: sessions.map((s) => ({
          id: s.id, studyConfigId: s.studyConfigId,
          seedConcept: configMap.get(s.studyConfigId)?.seedConcept || '',
          condition: s.condition, phase: s.phase, status: s.status, turnIndex: s.turnIndex || 0,
          startedAt: s.startedAt, learningCompletedAt: s.learningCompletedAt,
          evaluationCompletedAt: s.evaluationCompletedAt, surveyCompletedAt: s.surveyCompletedAt,
          timeBudgetMs: s.timeBudgetMs,
        })),
      }, origin)
      return
    }

    if (url.pathname === '/api/sprint4/start-session') {
      const studyConfigId = `${body.studyConfigId || ''}`
      log('SESSION:START', `studyConfigId="${studyConfigId}" requestedCondition="${body.condition || ''}"`)
      const studyConfig = await resolveStudyConfig(studyConfigId)
      if (!studyConfig) { log('SESSION:ERR', 'study config not found'); sendJson(response, 404, { error: 'Study config not found.' }, origin); return }

      const requestedCondition = `${body.condition || ''}`.trim()
      let condition
      if (requestedCondition === 'guided') condition = SPRINT4_CONDITIONS.GUIDED
      else if (requestedCondition === 'control') condition = SPRINT4_CONDITIONS.CONTROL
      else {
        const counts = await countSessionsByStudyConfig(studyConfig.id)
        condition = chooseCondition(counts)
      }
      const sessionToken = crypto.randomUUID()
      const snapshot = createInitialSessionSnapshot({ studyConfigId: studyConfig.id, studyConfig, condition })
      const now = new Date().toISOString()
      const session = { ...snapshot, id: crypto.randomUUID(), createdAt: now, updatedAt: now, lastActiveAt: now }

      log('SESSION:CREATED', `condition=${condition} currentNodeId="${session.currentNodeId}" nodes(${session.graphNodes?.length}):`, (session.graphNodes || []).map(n => `${n.id}[${n.status}]`).join(' | '))

      const persisted = await createSessionRecord({ sessionToken, session })
      sendJson(response, 200, { sessionToken, snapshot: await getSnapshot(persisted) }, origin)
      return
    }

    if (url.pathname === '/api/sprint4/submit-self-report') {
      const token = `${body.token || ''}`
      const rating = Number(body.rating)
      const text = `${body.text || ''}`.trim()
      const existing = await getSessionByToken(token)
      if (!existing) { sendJson(response, 401, { error: 'Session not found.' }, origin); return }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) { sendJson(response, 400, { error: 'rating must be 1-5.' }, origin); return }

      const studyConfig = await resolveStudyConfig(existing.studyConfigId)
      if (!studyConfig) { sendJson(response, 404, { error: 'Study config not found.' }, origin); return }

      const firstNode = existing.graphNodes?.[0] || null
      const initialMessages = buildInitialLearningMessages({ studyConfig, firstNode, condition: existing.condition })
      const now = new Date().toISOString()

      const next = await updateSession(token, (current) => ({
        ...current,
        selfReport: { rating, text, submittedAt: now },
        phase: SPRINT4_PHASES.LEARNING,
        startedAt: now,
        messages: [...(current.messages || []), ...initialMessages],
        events: [...(current.events || []), {
          id: crypto.randomUUID(), type: 'self_report_submitted',
          payload: { rating, text }, createdAt: now,
        }],
        updatedAt: now, lastActiveAt: now,
      }))

      sendJson(response, 200, { sessionToken: token, snapshot: await getSnapshot(next) }, origin)
      return
    }

    if (url.pathname === '/api/sprint4/skip-node') {
      const token = `${body.token || ''}`
      const nodeId = `${body.nodeId || ''}`
      const reason = `${body.reason || ''}`.trim()
      log('SKIP:START', `nodeId="${nodeId}" reason="${reason}"`)
      const existing = await getSessionByToken(token)
      if (!existing) { sendJson(response, 401, { error: 'Session not found.' }, origin); return }

      let graphNodes = (existing.graphNodes || []).map((n) =>
        n.id === nodeId ? { ...n, status: NODE_STATES.SKIPPED } : n
      )
      graphNodes = markDependentAvailability(graphNodes)
      const nextNode = getNextEligibleNode({ ...existing, graphNodes }) || graphNodes[0]
      log('SKIP:DONE', `skipped="${nodeId}" nextNode="${nextNode?.id}" graph:`, graphNodes.map(n => `${n.id}[${n.status}]`).join(' | '))

      const next = await updateSession(token, (current) => ({
        ...current,
        graphNodes,
        currentNodeId: nextNode?.id || current.currentNodeId,
        events: [...(current.events || []), {
          id: crypto.randomUUID(), type: 'node_skipped',
          payload: { nodeId, reason, turnIndex: current.turnIndex },
          createdAt: new Date().toISOString(),
        }],
        updatedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
      }))

      sendJson(response, 200, { snapshot: await getSnapshot(next) }, origin)
      return
    }

    if (url.pathname === '/api/sprint4/track-events') {
      const token = `${body.token || ''}`
      const clientEvents = Array.isArray(body.events) ? body.events : []
      const existing = await getSessionByToken(token)
      if (!existing) { sendJson(response, 401, { error: 'Session not found.' }, origin); return }

      const next = await updateSession(token, (current) => {
        const metrics = { ...(current.metrics || {}) }
        let totalAway = metrics.totalTabAwayMs || 0
        for (const evt of clientEvents) {
          if (evt.type === 'tab_focus' && typeof evt.payload?.awayDurationMs === 'number') {
            totalAway += evt.payload.awayDurationMs
          }
        }
        metrics.totalTabAwayMs = totalAway

        return {
          ...current,
          events: [...(current.events || []), ...clientEvents.map((e) => ({
            id: crypto.randomUUID(), type: e.type, payload: e.payload || {},
            createdAt: e.createdAt || new Date().toISOString(),
          }))],
          metrics,
          updatedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
        }
      })

      sendJson(response, 200, { ok: true }, origin)
      return
    }

    if (url.pathname === '/api/sprint4/get-session') {
      const token = `${body.token || ''}`
      const existing = await getSessionByToken(token)
      if (!existing) { sendJson(response, 401, { error: 'Session not found or token is invalid.' }, origin); return }
      const session = await updateSession(token, (current) => ({ ...current, lastActiveAt: new Date().toISOString() }))
      sendJson(response, 200, { snapshot: await getSnapshot(session) }, origin)
      return
    }

    if (url.pathname === '/api/sprint4/submit-turn') {
      const token = `${body.token || ''}`
      const userMessage = `${body.userMessage || ''}`
      const helpRequested = !!body.helpRequested
      const activeNodeId = `${body.activeNodeId || ''}`
      const metadata = body.metadata || {}

      console.log(`\n${'='.repeat(80)}`)
      log('TURN:START', `turn request | activeNodeId="${activeNodeId}" helpRequested=${helpRequested} userMsg="${userMessage.slice(0, 120)}"`)

      const existing = await getSessionByToken(token)
      if (!existing) { log('TURN:ERR', 'session not found'); sendJson(response, 401, { error: 'Session not found.' }, origin); return }
      const studyConfig = await resolveStudyConfig(existing.studyConfigId)
      if (!studyConfig) { log('TURN:ERR', 'study config not found'); sendJson(response, 404, { error: 'Study config not found.' }, origin); return }

      log('TURN:SESSION', `condition=${existing.condition} phase=${existing.phase} turnIndex=${existing.turnIndex} currentNodeId="${existing.currentNodeId}"`)
      log('TURN:GRAPH_BEFORE', `nodes(${existing.graphNodes?.length}):`, (existing.graphNodes || []).map(n => `${n.id}[${n.status}|prompt=${n.promptKind}|parents=${(n.parentIds||[]).join(',')}]`).join(' | '))

      const baseSession = { ...existing, currentNodeId: activeNodeId || existing.currentNodeId }
      log('TURN:RESOLVED_NODE', `using currentNodeId="${baseSession.currentNodeId}" (requested="${activeNodeId}", fallback="${existing.currentNodeId}")`)

      const result = baseSession.condition === SPRINT4_CONDITIONS.GUIDED
        ? await runGuidedTurn({ session: baseSession, studyConfig, userMessage, helpRequested })
        : await runControlTurn({ session: baseSession, studyConfig, userMessage })

      let nextSession = result.session

      log('TURN:RESULT', `tutorMsg="${(result.tutorMessage?.content || '').slice(0, 120)}..."`)
      log('TURN:RESULT', `nextCurrentNodeId="${nextSession.currentNodeId}" nextPhase=${nextSession.phase} nextTurn=${nextSession.turnIndex}`)
      log('TURN:GRAPH_AFTER', `nodes(${nextSession.graphNodes?.length}):`, (nextSession.graphNodes || []).map(n => `${n.id}[${n.status}|prompt=${n.promptKind}|parents=${(n.parentIds||[]).join(',')}]`).join(' | '))

      const graphDiff = buildGraphDiff(existing.graphNodes, nextSession.graphNodes)
      if (graphDiff.added.length) log('TURN:EXPANSION', `added nodes: ${graphDiff.added.join(', ')}`)
      if (graphDiff.changed.length) log('TURN:CHANGES', `changed nodes: ${graphDiff.changed.join(', ')}`)

      if (metadata.speechBased) {
        const metrics = { ...(nextSession.metrics || {}) }
        metrics.speechResponseCount = (metrics.speechResponseCount || 0) + 1
        nextSession = { ...nextSession, metrics }
      }

      if (nextSession.phase === SPRINT4_PHASES.LEARNING && nextSession.startedAt && nextSession.timeBudgetMs &&
          Date.now() - new Date(nextSession.startedAt).getTime() >= nextSession.timeBudgetMs) {
        log('TURN:TIME_EXPIRED', 'time budget exceeded, advancing to evaluation')
        nextSession = { ...nextSession, phase: SPRINT4_PHASES.EVALUATION, learningCompletedAt: nextSession.learningCompletedAt || new Date().toISOString() }
      }

      nextSession = { ...nextSession, updatedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString() }
      const persisted = await updateSession(token, () => nextSession)
      const snapshot = await getSnapshot(persisted)

      log('TURN:DONE', `persisted currentNodeId="${persisted.currentNodeId}" phase=${persisted.phase} nodeCount=${persisted.graphNodes?.length}`)
      console.log(`${'='.repeat(80)}\n`)

      sendJson(response, 200, {
        tutorMessage: result.tutorMessage,
        graphDiff: buildGraphDiff(existing.graphNodes, persisted.graphNodes),
        activeNodeId: persisted.currentNodeId,
        nodeSummaries: summarizeNodes(persisted.graphNodes),
        evidenceSummary: summarizeEvidence(persisted),
        phase: persisted.phase,
        timeRemainingMs: getTimeRemainingMs(persisted),
        snapshot,
      }, origin)
      return
    }

    if (url.pathname === '/api/sprint4/advance-phase') {
      const token = `${body.token || ''}`
      const phase = `${body.phase || ''}`
      const existing = await getSessionByToken(token)
      if (!existing) { sendJson(response, 401, { error: 'Session not found.' }, origin); return }

      const next = await updateSession(token, (current) => ({
        ...current, phase,
        learningCompletedAt: phase === SPRINT4_PHASES.EVALUATION ? current.learningCompletedAt || new Date().toISOString() : current.learningCompletedAt,
        updatedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
      }))

      sendJson(response, 200, { sessionToken: token, snapshot: await getSnapshot(next) }, origin)
      return
    }

    if (url.pathname === '/api/sprint4/submit-evaluation') {
      const token = `${body.token || ''}`
      const answers = Array.isArray(body.answers) ? body.answers : []
      const existing = await getSessionByToken(token)
      if (!existing) { sendJson(response, 401, { error: 'Session not found.' }, origin); return }
      const studyConfig = await resolveStudyConfig(existing.studyConfigId)
      if (!studyConfig) { sendJson(response, 404, { error: 'Study config not found.' }, origin); return }

      const scores = await scoreEvaluationAnswers({ studyConfig, answers })
      const next = await updateSession(token, (current) => ({
        ...current, evaluationAnswers: answers, evaluationScores: scores.answers,
        evaluationOverallScore: scores.overallScore, evaluationSummary: scores.summary,
        evaluationCompletedAt: new Date().toISOString(), phase: SPRINT4_PHASES.SURVEY,
        updatedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
      }))

      sendJson(response, 200, { sessionToken: token, snapshot: await getSnapshot(next) }, origin)
      return
    }

    if (url.pathname === '/api/sprint4/submit-survey') {
      const token = `${body.token || ''}`
      const survey = body.survey && typeof body.survey === 'object' ? body.survey : null
      const existing = await getSessionByToken(token)
      if (!existing) { sendJson(response, 401, { error: 'Session not found.' }, origin); return }
      if (!survey) { sendJson(response, 400, { error: 'survey is required.' }, origin); return }

      const next = await updateSession(token, (current) => ({
        ...current, surveyResponse: survey, surveyCompletedAt: new Date().toISOString(),
        status: 'completed', phase: SPRINT4_PHASES.SUMMARY,
        updatedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
      }))

      sendJson(response, 200, { sessionToken: token, snapshot: await getSnapshot(next) }, origin)
      return
    }

    sendJson(response, 404, { error: 'Route not found.' }, origin)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.'
    const statusCode = message === 'Invalid admin password.' ? 401 : 500
    log('ERROR', `${request.method} ${request.url} → ${statusCode}: ${message}`)
    if (error instanceof Error && error.stack) log('ERROR:STACK', error.stack)
    sendJson(response, statusCode, { error: message }, origin)
  }
})

server.listen(PORT, () => {
  console.log(`Sprint 4 LangGraph server listening on port ${PORT}`)
})
