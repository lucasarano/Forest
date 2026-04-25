import { createServer } from 'node:http'
import { loadLocalEnv } from './loadEnv.js'
import {
  createCourse,
  listCourses,
  getCourse,
  updateCourse,
  deleteCourse,
  createHomework,
  listHomeworksByCourse,
  getHomework,
  updateHomework,
  deleteHomework,
  createConceptRecord,
  listConceptsByHomework,
  getConcept,
  updateConcept,
  deleteConcept,
  fetchCatalog,
  createTutorSession,
  getTutorSessionByToken,
  updateTutorSession,
  insertTutorEvent,
  listTutorSessionsSummary,
  listSessionsByScope,
  getSessionDetail,
  getAllEventsForSessions,
} from './db.js'
import { buildAnalytics, buildSessionDetail, sessionEvalScore } from './teacherAnalytics.js'
import {
  initializeState,
  generateOpeningTurn,
  runTurn,
  acceptSubtopicOffer,
  skipSubtopicOffer,
  returnFromActiveNode,
  restartSession,
} from '../src/lib/tutor/runtime.js'
import { DEFAULT_TIME_BUDGET_MS } from '../src/lib/tutor/constants.js'

loadLocalEnv()

const log = (tag, ...args) => console.log(`[${new Date().toISOString()}] [${tag}]`, ...args)

const PORT = Number(process.env.PORT || process.env.FOREST_SERVER_PORT || 4001)
const ADMIN_PASSWORD = process.env.MVP_ADMIN_PASSWORD || 'admin12345'
const OPENAI_API_BASE = 'https://api.openai.com/v1'
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://localhost:4173', 'http://127.0.0.1:4173',
  'http://localhost:5173', 'http://127.0.0.1:5173',
]
const ALLOWED_ORIGINS = new Set(
  `${process.env.ALLOWED_ORIGINS || ''}`
    .split(/[\s,]+/).map((v) => v.trim()).filter(Boolean)
    .concat(!process.env.ALLOWED_ORIGINS ? DEFAULT_ALLOWED_ORIGINS : [])
)

const getApiKey = () => {
  const key = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || ''
  if (!key) throw new Error('OPENAI_API_KEY not set')
  return key
}

const corsHeaders = (origin = '') => {
  const headers = {
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    Vary: 'Origin',
  }
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}
const isAllowed = (origin = '') => !origin || ALLOWED_ORIGINS.has(origin)

const sendJson = (response, statusCode, payload, origin = '') => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json', ...corsHeaders(origin) })
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
      data: dataBuf,
    })
    start = nextStart
  }
  return parts
}

const requireAdmin = (password) => {
  if (!password || password !== ADMIN_PASSWORD) throw new Error('Invalid admin password.')
}

const resolveConcept = async (conceptId) => (conceptId ? getConcept(conceptId) : null)

const snapshotFor = async (session, state) => {
  const concept = await resolveConcept(session.conceptId)
  return {
    session: {
      id: session.id,
      studentName: session.studentName,
      conceptId: session.conceptId,
      turnIndex: state.turnIndex,
      status: state.status,
      completed: state.completed,
    },
    concept,
    state,
  }
}

const persistTurn = async ({ sessionToken, sessionId, state, extraEvent = null }) => {
  await updateTutorSession({ sessionToken, state })
  if (extraEvent) {
    try { await insertTutorEvent({ sessionId, ...extraEvent }) } catch (error) { log('EVENT:ERR', error.message) }
  }
}

const handler = async (request, response) => {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : ''
  if (!request.url) { sendJson(response, 400, { error: 'Missing URL.' }, origin); return }
  if (!isAllowed(origin)) { sendJson(response, 403, { error: 'Origin not allowed.' }, origin); return }
  if (request.method === 'OPTIONS') { sendJson(response, 200, { ok: true }, origin); return }

  const url = new URL(request.url, `http://${request.headers.host}`)

  // Health
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, 200, { ok: true, port: PORT }, origin)
  }

  // Catalog (public)
  if (request.method === 'GET' && url.pathname === '/api/catalog') {
    const catalog = await fetchCatalog()
    return sendJson(response, 200, catalog, origin)
  }

  // Admin: courses
  if (request.method === 'GET' && url.pathname === '/api/courses') {
    requireAdmin(url.searchParams.get('password') || '')
    const courses = await listCourses()
    return sendJson(response, 200, { courses }, origin)
  }
  if (request.method === 'GET' && url.pathname === '/api/homeworks') {
    requireAdmin(url.searchParams.get('password') || '')
    const courseId = url.searchParams.get('courseId') || ''
    if (!courseId) return sendJson(response, 400, { error: 'courseId required' }, origin)
    const homeworks = await listHomeworksByCourse(courseId)
    return sendJson(response, 200, { homeworks }, origin)
  }
  if (request.method === 'GET' && url.pathname === '/api/concepts') {
    requireAdmin(url.searchParams.get('password') || '')
    const homeworkId = url.searchParams.get('homeworkId') || ''
    if (!homeworkId) return sendJson(response, 400, { error: 'homeworkId required' }, origin)
    const concepts = await listConceptsByHomework(homeworkId)
    return sendJson(response, 200, { concepts }, origin)
  }
  {
    const m = url.pathname.match(/^\/api\/concepts\/([^/]+)$/)
    if (m && request.method === 'GET') {
      requireAdmin(url.searchParams.get('password') || '')
      const concept = await getConcept(m[1])
      if (!concept) return sendJson(response, 404, { error: 'Concept not found.' }, origin)
      return sendJson(response, 200, { concept }, origin)
    }
  }

  // Admin: ops dashboard aggregate (sessions + event rollups).
  if (request.method === 'GET' && url.pathname === '/api/ops/sessions') {
    requireAdmin(url.searchParams.get('password') || '')
    const sessions = await listTutorSessionsSummary()
    const ids = sessions.map((s) => s.id)
    const events = ids.length ? await getAllEventsForSessions(ids) : []

    const totalSessions = sessions.length
    const completedSessions = sessions.filter((s) => s.status === 'completed' || s.state?.completed === true)
    const completedCount = completedSessions.length
    const completionRate = totalSessions ? Math.round((completedCount / totalSessions) * 100) : 0

    // UI hardcodes legacy phase keys [self_report, learning, evaluation, survey, summary].
    // Current model only has active/completed, so map completed→summary, active→learning.
    const sessionsByPhase = { self_report: 0, learning: 0, evaluation: 0, survey: 0, summary: 0 }
    for (const s of sessions) {
      if (s.status === 'completed' || s.state?.completed === true) sessionsByPhase.summary += 1
      else sessionsByPhase.learning += 1
    }

    const eventsByType = {}
    for (const ev of events) eventsByType[ev.event_type] = (eventsByType[ev.event_type] || 0) + 1
    const totalEvents = events.length
    const avgEventsPerSession = totalSessions ? Math.round((totalEvents / totalSessions) * 10) / 10 : 0

    const eventsBySession = new Map()
    for (const ev of events) {
      const list = eventsBySession.get(ev.session_id) || []
      list.push(ev)
      eventsBySession.set(ev.session_id, list)
    }
    const sessionsWithNoEvents = sessions.filter((s) => !(eventsBySession.get(s.id)?.length)).length
    const sessionsWithNoEvalScore = completedSessions.filter((s) => sessionEvalScore(s.state || {}) == null).length

    const recentEvents = [...events]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20)
      .map((e) => ({ type: e.event_type, at: e.created_at }))

    return sendJson(response, 200, {
      totalSessions,
      completedCount,
      completionRate,
      totalEvents,
      avgEventsPerSession,
      sessionsByPhase,
      eventsByType,
      recentEvents,
      sessionsWithNoEvents,
      sessionsWithNoEvalScore,
      sessions,
    }, origin)
  }

  // Teacher analytics
  if (request.method === 'GET' && url.pathname === '/api/teacher/analytics') {
    requireAdmin(url.searchParams.get('password') || '')
    const scope = url.searchParams.get('scope') || ''
    const id = url.searchParams.get('id') || ''
    if (!['course', 'homework', 'concept'].includes(scope)) return sendJson(response, 400, { error: 'scope must be course, homework, or concept' }, origin)
    if (!id) return sendJson(response, 400, { error: 'id is required' }, origin)
    const { sessions, concepts } = await listSessionsByScope({ scope, id })
    const eventsBySession = new Map()
    if (sessions.length > 0) {
      const ids = sessions.map((s) => s.id)
      const all = await getAllEventsForSessions(ids)
      for (const ev of all) {
        const list = eventsBySession.get(ev.session_id) || []
        list.push(ev)
        eventsBySession.set(ev.session_id, list)
      }
    }
    const analytics = buildAnalytics({ sessions, concepts, eventsBySession })
    return sendJson(response, 200, analytics, origin)
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/teacher/sessions/')) {
    requireAdmin(url.searchParams.get('password') || '')
    const sessionId = url.pathname.slice('/api/teacher/sessions/'.length)
    if (!sessionId) return sendJson(response, 400, { error: 'sessionId required' }, origin)
    const detail = await getSessionDetail(sessionId)
    if (!detail) return sendJson(response, 404, { error: 'Session not found.' }, origin)
    const concept = detail.session.concept_id ? await getConcept(detail.session.concept_id) : null
    const payload = buildSessionDetail({
      session: detail.session,
      events: detail.events,
      conceptTitle: concept?.title || '',
    })
    return sendJson(response, 200, payload, origin)
  }

  if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return sendJson(response, 405, { error: 'Method not allowed.' }, origin)
  }

  // Multipart: transcription
  const isMultipart = (request.headers['content-type'] || '').includes('multipart/form-data')
  if (url.pathname === '/api/transcribe' && isMultipart) {
    const parts = await parseMultipart(request)
    const audioPart = parts.find((p) => p.name === 'file' || p.filename)
    if (!audioPart) return sendJson(response, 400, { error: 'No audio file provided.' }, origin)
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
      return sendJson(response, 500, { error: err.error?.message || `Whisper failed (${whisperRes.status})` }, origin)
    }
    const result = await whisperRes.json()
    return sendJson(response, 200, { text: result.text || '' }, origin)
  }

  const body = isMultipart ? {} : await parseBody(request)
  const queryPassword = url.searchParams.get('password') || ''
  const adminPassword = `${body.password || queryPassword || ''}`

  // Admin: update/delete course
  const courseMatch = url.pathname.match(/^\/api\/courses\/([^/]+)$/)
  if (courseMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
    requireAdmin(adminPassword)
    const id = courseMatch[1]
    const existing = await getCourse(id)
    if (!existing) return sendJson(response, 404, { error: 'Course not found.' }, origin)
    if (request.method === 'DELETE') {
      await deleteCourse(id)
      return sendJson(response, 200, { ok: true }, origin)
    }
    const course = await updateCourse({
      id,
      title: typeof body.title === 'string' ? body.title.trim() : undefined,
      description: typeof body.description === 'string' ? body.description.trim() : undefined,
    })
    return sendJson(response, 200, { course }, origin)
  }

  // Admin: update/delete homework
  const homeworkMatch = url.pathname.match(/^\/api\/homeworks\/([^/]+)$/)
  if (homeworkMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
    requireAdmin(adminPassword)
    const id = homeworkMatch[1]
    const existing = await getHomework(id)
    if (!existing) return sendJson(response, 404, { error: 'Homework not found.' }, origin)
    if (request.method === 'DELETE') {
      await deleteHomework(id)
      return sendJson(response, 200, { ok: true }, origin)
    }
    const homework = await updateHomework({
      id,
      title: typeof body.title === 'string' ? body.title.trim() : undefined,
      description: typeof body.description === 'string' ? body.description.trim() : undefined,
    })
    return sendJson(response, 200, { homework }, origin)
  }

  // Admin: update/delete concept
  const conceptMatch = url.pathname.match(/^\/api\/concepts\/([^/]+)$/)
  if (conceptMatch && (request.method === 'PATCH' || request.method === 'DELETE')) {
    requireAdmin(adminPassword)
    const id = conceptMatch[1]
    const existing = await getConcept(id)
    if (!existing) return sendJson(response, 404, { error: 'Concept not found.' }, origin)
    if (request.method === 'DELETE') {
      await deleteConcept(id)
      return sendJson(response, 200, { ok: true }, origin)
    }
    const conceptGoals = Array.isArray(body.conceptGoals)
      ? body.conceptGoals.map((g) => `${g}`.trim()).filter(Boolean)
      : undefined
    const timeBudgetMs = Number.isFinite(Number(body.timeBudgetMs)) && Number(body.timeBudgetMs) > 0
      ? Number(body.timeBudgetMs) : undefined
    const concept = await updateConcept({
      id,
      title: typeof body.title === 'string' ? body.title.trim() : undefined,
      seedQuestion: typeof body.seedQuestion === 'string' ? body.seedQuestion.trim() : undefined,
      conceptSummary: typeof body.conceptSummary === 'string' ? body.conceptSummary.trim() : undefined,
      conceptGoals,
      timeBudgetMs,
    })
    return sendJson(response, 200, { concept }, origin)
  }

  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' }, origin)

  // Admin mutations
  if (url.pathname === '/api/courses') {
    requireAdmin(body.password)
    const title = `${body.title || ''}`.trim()
    if (!title) return sendJson(response, 400, { error: 'title is required.' }, origin)
    const course = await createCourse({ title, description: `${body.description || ''}`.trim() })
    return sendJson(response, 200, { course }, origin)
  }
  if (url.pathname === '/api/homeworks') {
    requireAdmin(body.password)
    const courseId = `${body.courseId || ''}`.trim()
    const title = `${body.title || ''}`.trim()
    if (!courseId || !title) return sendJson(response, 400, { error: 'courseId and title are required.' }, origin)
    const course = await getCourse(courseId)
    if (!course) return sendJson(response, 404, { error: 'Course not found.' }, origin)
    const homework = await createHomework({ courseId, title, description: `${body.description || ''}`.trim() })
    return sendJson(response, 200, { homework }, origin)
  }
  if (url.pathname === '/api/concepts') {
    requireAdmin(body.password)
    const homeworkId = `${body.homeworkId || ''}`.trim()
    const title = `${body.title || ''}`.trim()
    const seedQuestion = `${body.seedQuestion || ''}`.trim()
    const timeBudgetMs = Number.isFinite(Number(body.timeBudgetMs)) && Number(body.timeBudgetMs) > 0
      ? Number(body.timeBudgetMs) : DEFAULT_TIME_BUDGET_MS
    const conceptSummary = `${body.conceptSummary || ''}`.trim()
    const conceptGoals = Array.isArray(body.conceptGoals)
      ? body.conceptGoals.map((g) => `${g}`.trim()).filter(Boolean)
      : []
    if (!homeworkId || !title || !seedQuestion) return sendJson(response, 400, { error: 'homeworkId, title, and seedQuestion are required.' }, origin)
    const hw = await getHomework(homeworkId)
    if (!hw) return sendJson(response, 404, { error: 'Homework not found.' }, origin)
    const concept = await createConceptRecord({ homeworkId, title, seedQuestion, conceptSummary, conceptGoals, timeBudgetMs })
    return sendJson(response, 200, { concept }, origin)
  }

  // Tutor endpoints
  if (url.pathname === '/api/tutor/start') {
    const conceptId = `${body.conceptId || ''}`.trim()
    const studentName = `${body.studentName || ''}`.trim()
    if (!conceptId) return sendJson(response, 400, { error: 'conceptId is required.' }, origin)
    if (!studentName) return sendJson(response, 400, { error: 'studentName is required.' }, origin)
    const concept = await getConcept(conceptId)
    if (!concept) return sendJson(response, 404, { error: 'Concept not found.' }, origin)

    let state = initializeState({ concept })
    const opening = await generateOpeningTurn(state)
    state = opening.state
    const sessionToken = crypto.randomUUID()
    const created = await createTutorSession({ sessionToken, conceptId, studentName, state })
    log('TUTOR:START', `student="${studentName}" concept="${concept.title}"`)
    const snapshot = await snapshotFor({ id: created.id, studentName, conceptId }, state)
    return sendJson(response, 200, { sessionToken, snapshot, tutorMessage: opening.tutorMessage }, origin)
  }

  if (url.pathname === '/api/tutor/get') {
    const token = `${body.token || ''}`
    const session = await getTutorSessionByToken(token)
    if (!session) return sendJson(response, 401, { error: 'Session not found.' }, origin)
    const snapshot = await snapshotFor(session, session.state)
    return sendJson(response, 200, { snapshot }, origin)
  }

  if (url.pathname === '/api/tutor/turn') {
    const token = `${body.token || ''}`
    const studentMessage = `${body.studentMessage || ''}`.trim()
    if (!studentMessage) return sendJson(response, 400, { error: 'studentMessage required' }, origin)
    const session = await getTutorSessionByToken(token)
    if (!session) return sendJson(response, 401, { error: 'Session not found.' }, origin)
    try {
      const result = await runTurn(session.state, { studentMessage })
      await persistTurn({ sessionToken: token, sessionId: session.id, state: result.state, extraEvent: {
        eventType: 'turn',
        payload: { decision: result.decision || null },
      }})
      const snapshot = await snapshotFor(session, result.state)
      return sendJson(response, 200, { snapshot, tutorMessage: result.tutorMessage, decision: result.decision || null }, origin)
    } catch (error) {
      log('TUTOR:TURN:ERR', error.stack || error.message)
      return sendJson(response, 500, { error: error.message || 'Turn failed.' }, origin)
    }
  }

  if (url.pathname === '/api/tutor/offer/accept') {
    const token = `${body.token || ''}`
    const session = await getTutorSessionByToken(token)
    if (!session) return sendJson(response, 401, { error: 'Session not found.' }, origin)
    if (!session.state.offer) return sendJson(response, 400, { error: 'No pending offer.' }, origin)
    const result = await acceptSubtopicOffer(session.state)
    await persistTurn({ sessionToken: token, sessionId: session.id, state: result.state, extraEvent: {
      eventType: 'offer_accepted', payload: {},
    }})
    const snapshot = await snapshotFor(session, result.state)
    return sendJson(response, 200, { snapshot, tutorMessage: result.tutorMessage }, origin)
  }

  if (url.pathname === '/api/tutor/offer/skip') {
    const token = `${body.token || ''}`
    const session = await getTutorSessionByToken(token)
    if (!session) return sendJson(response, 401, { error: 'Session not found.' }, origin)
    if (!session.state.offer) return sendJson(response, 400, { error: 'No pending offer.' }, origin)
    const result = await skipSubtopicOffer(session.state)
    await persistTurn({ sessionToken: token, sessionId: session.id, state: result.state, extraEvent: {
      eventType: 'offer_skipped', payload: {},
    }})
    const snapshot = await snapshotFor(session, result.state)
    return sendJson(response, 200, { snapshot, tutorMessage: result.tutorMessage }, origin)
  }

  if (url.pathname === '/api/tutor/restart') {
    const token = `${body.token || ''}`
    const session = await getTutorSessionByToken(token)
    if (!session) return sendJson(response, 401, { error: 'Session not found.' }, origin)
    try {
      const result = await restartSession(session.state)
      await persistTurn({
        sessionToken: token,
        sessionId: session.id,
        state: result.state,
        extraEvent: { eventType: 'session_restarted', payload: {} },
      })
      log('TUTOR:RESTART', `session="${session.id}"`)
      const snapshot = await snapshotFor(session, result.state)
      return sendJson(response, 200, { snapshot, tutorMessage: result.tutorMessage }, origin)
    } catch (error) {
      log('TUTOR:RESTART:ERR', error.stack || error.message)
      return sendJson(response, 500, { error: error.message || 'Restart failed.' }, origin)
    }
  }

  if (url.pathname === '/api/tutor/return') {
    const token = `${body.token || ''}`
    const viaSkip = body.viaSkip !== false
    const session = await getTutorSessionByToken(token)
    if (!session) return sendJson(response, 401, { error: 'Session not found.' }, origin)
    const result = await returnFromActiveNode(session.state, { viaSkip })
    if (!result.tutorMessage) return sendJson(response, 400, { error: 'Cannot return from root.' }, origin)
    await persistTurn({ sessionToken: token, sessionId: session.id, state: result.state, extraEvent: {
      eventType: viaSkip ? 'student_skip' : 'student_return', payload: {},
    }})
    const snapshot = await snapshotFor(session, result.state)
    return sendJson(response, 200, { snapshot, tutorMessage: result.tutorMessage }, origin)
  }

  return sendJson(response, 404, { error: 'Route not found.' }, origin)
}

const server = createServer(async (request, response) => {
  const origin = typeof request.headers.origin === 'string' ? request.headers.origin : ''
  try {
    await handler(request, response)
  } catch (error) {
    const message = error?.message || 'Internal error.'
    const statusCode = message === 'Invalid admin password.' ? 401 : 500
    log('ERROR', `${request.method} ${request.url} → ${statusCode}: ${message}`)
    if (error instanceof Error && error.stack) log('ERROR:STACK', error.stack)
    sendJson(response, statusCode, { error: message }, origin)
  }
})

server.listen(PORT, () => {
  console.log(`Forest tutor API listening on port ${PORT}`)
})
