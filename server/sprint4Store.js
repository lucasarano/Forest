import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { loadLocalEnv } from './loadEnv.js'
import * as localStore from './sprint4Store.local.js'

const DEFAULT_GRAPH_MODEL = 'legacy'
const DEFAULT_ALLOWED_ARRAY = []

let supabaseClient = null
let usingSupabase = null

const hashToken = (token) => createHash('sha256').update(token).digest('hex')

const getRuntimeSessionStatus = (row) => row.status === 'active' ? 'active' : row.status || 'active'

const mapStudyConfig = (row) => ({
  id: row.id,
  seedConcept: row.seed_concept,
  conceptSummary: row.concept_summary || '',
  timeBudgetMs: typeof row.time_budget_ms === 'number' ? row.time_budget_ms : 0,
  graphModel: row.graph_model || DEFAULT_GRAPH_MODEL,
  graphNodes: Array.isArray(row.planner_graph) ? row.planner_graph : [],
  evaluationBundle: row.evaluation_bundle || {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapGraphNode = (row) => ({
  id: row.node_id,
  title: row.title,
  summary: row.summary || '',
  parentIds: Array.isArray(row.parent_ids) ? row.parent_ids : DEFAULT_ALLOWED_ARRAY,
  depth: typeof row.depth === 'number' ? row.depth : 0,
  orderIndex: typeof row.order_index === 'number' ? row.order_index : 0,
  status: row.status,
  promptKind: row.prompt_kind,
  supportLevel: typeof row.support_level === 'number' ? row.support_level : 0,
  withSupportUsed: !!row.with_support_used,
  successfulRecallCount: typeof row.successful_recall_count === 'number' ? row.successful_recall_count : 0,
  recallScheduledAtTurn: typeof row.recall_scheduled_at_turn === 'number' ? row.recall_scheduled_at_turn : null,
  bestScores: row.best_scores || {},
  misconceptionStreak: typeof row.misconception_streak === 'number' ? row.misconception_streak : 0,
  attempts: typeof row.attempts === 'number' ? row.attempts : 0,
  lastAssessmentSummary: row.last_assessment_summary || '',
  rubric: row.rubric || {},
  promptPack: row.prompt_pack || {},
  isRoot: !!row.is_root,
  nodeType: row.node_type || '',
  simpleGoodTurnCount: typeof row.simple_good_turn_count === 'number' ? row.simple_good_turn_count : 0,
  clarificationDepth: typeof row.clarification_depth === 'number' ? row.clarification_depth : 0,
  derivedFromTopic: row.derived_from_topic || '',
  lastMcqAtAttempt: typeof row.last_mcq_at_attempt === 'number' ? row.last_mcq_at_attempt : 0,
})

const mapEvidenceRecord = (row) => ({
  id: row.evidence_id,
  nodeId: row.node_id,
  turnIndex: typeof row.turn_index === 'number' ? row.turn_index : 0,
  promptKind: row.prompt_kind,
  scores: row.scores || {},
  misconceptionDetected: !!row.misconception_detected,
  misconceptionLabel: row.misconception_label || '',
  misconceptionReason: row.misconception_reason || '',
  missingConcepts: Array.isArray(row.missing_concepts) ? row.missing_concepts : DEFAULT_ALLOWED_ARRAY,
  strengths: Array.isArray(row.strengths) ? row.strengths : DEFAULT_ALLOWED_ARRAY,
  rationale: row.rationale || '',
  supportUsed: !!row.support_used,
  createdAt: row.created_at,
})

const mapMessage = (row) => ({
  id: row.message_id,
  nodeId: row.node_id,
  role: row.role,
  content: row.content,
  visibleToStudent: row.visible_to_student !== false,
  metadata: row.metadata || {},
  createdAt: row.created_at,
})

const mapEvent = (row) => ({
  id: row.event_id,
  type: row.event_type,
  payload: row.payload || {},
  createdAt: row.created_at,
})

const mapEvaluationAnswer = (row) => ({
  promptId: row.prompt_id,
  answer: row.answer || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapEvaluationScore = (row) => ({
  promptId: row.prompt_id,
  score: typeof row.score === 'number' ? row.score : 0,
  rationale: row.rationale || '',
  strengths: Array.isArray(row.strengths) ? row.strengths : DEFAULT_ALLOWED_ARRAY,
  gaps: Array.isArray(row.gaps) ? row.gaps : DEFAULT_ALLOWED_ARRAY,
  overallScore: typeof row.overall_score === 'number' ? row.overall_score : 0,
  summary: row.summary || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapSession = (row, studyConfig = null) => ({
  id: row.id,
  studyConfigId: row.study_config_id,
  condition: row.condition,
  phase: row.phase,
  status: getRuntimeSessionStatus(row),
  currentNodeId: row.current_node_id || '',
  turnIndex: typeof row.turn_index === 'number' ? row.turn_index : 0,
  startedAt: row.started_at,
  learningCompletedAt: row.learning_completed_at,
  evaluationCompletedAt: row.evaluation_completed_at,
  surveyCompletedAt: row.survey_completed_at,
  timeBudgetMs: typeof row.time_budget_ms === 'number' ? row.time_budget_ms : 0,
  instrumentationVersion: row.instrumentation_version || '',
  lastActiveAt: row.last_active_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  graphModel: studyConfig?.graphModel || DEFAULT_GRAPH_MODEL,
  selfReport: row.self_report || null,
  uploadedDocuments: Array.isArray(row.uploaded_documents) ? row.uploaded_documents : [],
  metrics: row.metrics || null,
  evaluationOverallScore: typeof row.evaluation_overall_score === 'number' ? row.evaluation_overall_score : 0,
  evaluationSummary: row.evaluation_summary || '',
})

const sessionUpdatePayload = (session) => ({
  phase: session.phase,
  status: session.status,
  current_node_id: session.currentNodeId || null,
  turn_index: session.turnIndex || 0,
  started_at: session.startedAt || null,
  learning_completed_at: session.learningCompletedAt || null,
  evaluation_completed_at: session.evaluationCompletedAt || null,
  survey_completed_at: session.surveyCompletedAt || null,
  time_budget_ms: session.timeBudgetMs || 0,
  instrumentation_version: session.instrumentationVersion || null,
  last_active_at: session.lastActiveAt || null,
  self_report: session.selfReport || null,
  uploaded_documents: session.uploadedDocuments || [],
  metrics: session.metrics || {},
  evaluation_overall_score: Number.isFinite(session.evaluationOverallScore) ? session.evaluationOverallScore : 0,
  evaluation_summary: session.evaluationSummary || '',
})

const graphNodeRows = (sessionId, graphNodes = []) => graphNodes.map((node) => ({
  session_id: sessionId,
  node_id: node.id,
  title: node.title,
  summary: node.summary || '',
  parent_ids: node.parentIds || [],
  depth: node.depth || 0,
  order_index: node.orderIndex || 0,
  status: node.status,
  prompt_kind: node.promptKind,
  support_level: node.supportLevel || 0,
  with_support_used: !!node.withSupportUsed,
  successful_recall_count: node.successfulRecallCount || 0,
  recall_scheduled_at_turn: node.recallScheduledAtTurn ?? null,
  best_scores: node.bestScores || {},
  misconception_streak: node.misconceptionStreak || 0,
  attempts: node.attempts || 0,
  last_assessment_summary: node.lastAssessmentSummary || '',
  rubric: node.rubric || {},
  prompt_pack: node.promptPack || {},
  is_root: !!node.isRoot,
  node_type: node.nodeType || '',
  simple_good_turn_count: node.simpleGoodTurnCount || 0,
  clarification_depth: node.clarificationDepth || 0,
  derived_from_topic: node.derivedFromTopic || '',
  last_mcq_at_attempt: node.lastMcqAtAttempt || 0,
}))

const evidenceRows = (sessionId, evidenceRecords = []) => evidenceRecords.map((entry) => ({
  session_id: sessionId,
  evidence_id: entry.id,
  node_id: entry.nodeId,
  turn_index: entry.turnIndex || 0,
  prompt_kind: entry.promptKind,
  scores: entry.scores || {},
  misconception_detected: !!entry.misconceptionDetected,
  misconception_label: entry.misconceptionLabel || '',
  misconception_reason: entry.misconceptionReason || '',
  missing_concepts: entry.missingConcepts || [],
  strengths: entry.strengths || [],
  rationale: entry.rationale || '',
  support_used: !!entry.supportUsed,
  created_at: entry.createdAt || new Date().toISOString(),
}))

const messageRows = (sessionId, messages = []) => messages.map((message) => ({
  session_id: sessionId,
  message_id: message.id,
  node_id: message.nodeId || null,
  role: message.role,
  content: message.content,
  visible_to_student: message.visibleToStudent !== false,
  metadata: message.metadata || {},
  created_at: message.createdAt || new Date().toISOString(),
}))

const eventRows = (sessionId, events = []) => events.map((event) => ({
  session_id: sessionId,
  event_id: event.id,
  event_type: event.type,
  payload: event.payload || {},
  created_at: event.createdAt || new Date().toISOString(),
}))

const evaluationAnswerRows = (sessionId, answers = []) => answers.map((answer) => ({
  session_id: sessionId,
  prompt_id: answer.promptId,
  answer: answer.answer || '',
  created_at: answer.createdAt || new Date().toISOString(),
  updated_at: answer.updatedAt || answer.createdAt || new Date().toISOString(),
}))

const evaluationScoreRows = (sessionId, scores = []) => scores.map((score) => ({
  session_id: sessionId,
  prompt_id: score.promptId,
  score: score.score || 0,
  rationale: score.rationale || '',
  strengths: score.strengths || [],
  gaps: score.gaps || [],
  overall_score: Number.isFinite(score.overallScore) ? score.overallScore : 0,
  summary: score.summary || '',
  created_at: score.createdAt || new Date().toISOString(),
  updated_at: score.updatedAt || score.createdAt || new Date().toISOString(),
}))

const loadSessionById = async (supabase, sessionId) => {
  const [sessionRes, graphRes, evidenceRes, messageRes, eventRes, evaluationAnswersRes, evaluationScoresRes, surveyRes] = await Promise.all([
    supabase.from('mvp_v2_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('mvp_v2_graph_nodes').select('*').eq('session_id', sessionId).order('order_index', { ascending: true }),
    supabase.from('mvp_v2_evidence_records').select('*').eq('session_id', sessionId).order('turn_index', { ascending: true }),
    supabase.from('mvp_v2_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    supabase.from('mvp_v2_events').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    supabase.from('mvp_v2_evaluation_answers').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    supabase.from('mvp_v2_evaluation_scores').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    supabase.from('mvp_v2_survey_responses').select('*').eq('session_id', sessionId).maybeSingle(),
  ])

  if (sessionRes.error || !sessionRes.data) throw new Error(sessionRes.error?.message || 'Could not load session.')
  if (graphRes.error) throw new Error(graphRes.error.message)
  if (evidenceRes.error) throw new Error(evidenceRes.error.message)
  if (messageRes.error) throw new Error(messageRes.error.message)
  if (eventRes.error) throw new Error(eventRes.error.message)
  if (evaluationAnswersRes.error) throw new Error(evaluationAnswersRes.error.message)
  if (evaluationScoresRes.error) throw new Error(evaluationScoresRes.error.message)
  if (surveyRes.error) throw new Error(surveyRes.error.message)

  const { data: studyConfigRow, error: studyConfigError } = await supabase
    .from('mvp_v2_study_configs')
    .select('*')
    .eq('id', sessionRes.data.study_config_id)
    .single()

  if (studyConfigError || !studyConfigRow) throw new Error(studyConfigError?.message || 'Could not load study config.')

  const studyConfig = mapStudyConfig(studyConfigRow)
  return {
    ...mapSession(sessionRes.data, studyConfig),
    graphNodes: (graphRes.data || []).map(mapGraphNode),
    evidenceRecords: (evidenceRes.data || []).map(mapEvidenceRecord),
    messages: (messageRes.data || []).map(mapMessage),
    events: (eventRes.data || []).map(mapEvent),
    evaluationAnswers: (evaluationAnswersRes.data || []).map(mapEvaluationAnswer),
    evaluationScores: (evaluationScoresRes.data || []).map(mapEvaluationScore),
    surveyResponse: surveyRes.data?.responses || null,
  }
}

const persistSessionData = async (supabase, sessionId, session) => {
  const { error: sessionError } = await supabase
    .from('mvp_v2_sessions')
    .update(sessionUpdatePayload(session))
    .eq('id', sessionId)

  if (sessionError) throw sessionError

  const graphRows = graphNodeRows(sessionId, session.graphNodes)
  if (graphRows.length > 0) {
    const { error } = await supabase
      .from('mvp_v2_graph_nodes')
      .upsert(graphRows, { onConflict: 'session_id,node_id' })
    if (error) throw error
  }

  const evidence = evidenceRows(sessionId, session.evidenceRecords)
  if (evidence.length > 0) {
    const { error } = await supabase
      .from('mvp_v2_evidence_records')
      .upsert(evidence, { onConflict: 'session_id,evidence_id' })
    if (error) throw error
  }

  const messages = messageRows(sessionId, session.messages)
  if (messages.length > 0) {
    const { error } = await supabase
      .from('mvp_v2_messages')
      .upsert(messages, { onConflict: 'session_id,message_id' })
    if (error) throw error
  }

  const events = eventRows(sessionId, session.events)
  if (events.length > 0) {
    const { error } = await supabase
      .from('mvp_v2_events')
      .upsert(events, { onConflict: 'session_id,event_id' })
    if (error) throw error
  }

  const evaluationAnswers = evaluationAnswerRows(sessionId, session.evaluationAnswers)
  if (evaluationAnswers.length > 0) {
    const { error } = await supabase
      .from('mvp_v2_evaluation_answers')
      .upsert(evaluationAnswers, { onConflict: 'session_id,prompt_id' })
    if (error) throw error
  }

  const evaluationScores = evaluationScoreRows(sessionId, session.evaluationScores)
  if (evaluationScores.length > 0) {
    const { error } = await supabase
      .from('mvp_v2_evaluation_scores')
      .upsert(evaluationScores, { onConflict: 'session_id,prompt_id' })
    if (error) throw error
  }

  if (session.surveyResponse && typeof session.surveyResponse === 'object') {
    const { error } = await supabase
      .from('mvp_v2_survey_responses')
      .upsert({
        session_id: sessionId,
        responses: session.surveyResponse,
      }, { onConflict: 'session_id' })
    if (error) throw error
  }
}

const ensureSupabaseConfig = () => {
  if (usingSupabase !== null) return usingSupabase
  loadLocalEnv()
  usingSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  return usingSupabase
}

const getSupabaseClient = () => {
  if (!ensureSupabaseConfig()) return null
  if (supabaseClient) return supabaseClient
  supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  return supabaseClient
}

export const readStore = async () => localStore.readStore()

export const ensureBuiltinStudyConfigRecord = async (builtinStudyConfig) => {
  const supabase = getSupabaseClient()
  if (!supabase) return localStore.ensureBuiltinStudyConfigRecord(builtinStudyConfig)

  const { data, error } = await supabase
    .from('mvp_v2_study_configs')
    .select('*')
    .eq('seed_concept', builtinStudyConfig.seedConcept)
    .eq('concept_summary', builtinStudyConfig.conceptSummary || '')
    .eq('time_budget_ms', builtinStudyConfig.timeBudgetMs)
    .eq('graph_model', builtinStudyConfig.graphModel || DEFAULT_GRAPH_MODEL)
    .limit(1)

  if (error) throw error
  if ((data || []).length > 0) return mapStudyConfig(data[0])

  return createStudyConfigRecord({
    seedConcept: builtinStudyConfig.seedConcept,
    conceptSummary: builtinStudyConfig.conceptSummary || '',
    timeBudgetMs: builtinStudyConfig.timeBudgetMs,
    graphNodes: builtinStudyConfig.graphNodes || [],
    evaluationBundle: builtinStudyConfig.evaluationBundle || {},
    graphModel: builtinStudyConfig.graphModel || DEFAULT_GRAPH_MODEL,
  })
}

export const listStudyConfigs = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return localStore.listStudyConfigs()

  const { data, error } = await supabase
    .from('mvp_v2_study_configs')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(mapStudyConfig)
}

export const getStudyConfig = async (studyConfigId) => {
  const supabase = getSupabaseClient()
  if (!supabase) return localStore.getStudyConfig(studyConfigId)

  const { data, error } = await supabase
    .from('mvp_v2_study_configs')
    .select('*')
    .eq('id', studyConfigId)
    .maybeSingle()

  if (error) throw error
  return data ? mapStudyConfig(data) : null
}

export const createStudyConfigRecord = async ({ seedConcept, conceptSummary, timeBudgetMs, graphNodes, evaluationBundle, graphModel = DEFAULT_GRAPH_MODEL }) => {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return localStore.createStudyConfigRecord({ seedConcept, conceptSummary, timeBudgetMs, graphNodes, evaluationBundle, graphModel })
  }

  const { data, error } = await supabase
    .from('mvp_v2_study_configs')
    .insert({
      seed_concept: seedConcept,
      concept_summary: conceptSummary || '',
      time_budget_ms: timeBudgetMs,
      graph_model: graphModel,
      planner_graph: graphNodes || [],
      evaluation_bundle: evaluationBundle || {},
    })
    .select('*')
    .single()

  if (error || !data) throw error || new Error('Could not create study config.')
  return mapStudyConfig(data)
}

export const createSessionRecord = async ({ sessionToken, session }) => {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return localStore.createSessionRecord({ sessionToken, session })
  }

  const tokenHash = hashToken(sessionToken)
  const { data, error } = await supabase
    .from('mvp_v2_sessions')
    .insert({
      study_config_id: session.studyConfigId,
      session_token_hash: tokenHash,
      condition: session.condition,
      ...sessionUpdatePayload(session),
    })
    .select('*')
    .single()

  if (error || !data) throw error || new Error('Could not create session.')

  const persistedSession = {
    ...session,
    id: data.id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }

  await persistSessionData(supabase, data.id, persistedSession)
  return persistedSession
}

export const getSessionByToken = async (sessionToken) => {
  const supabase = getSupabaseClient()
  if (!supabase) return localStore.getSessionByToken(sessionToken)

  const { data, error } = await supabase
    .from('mvp_v2_sessions')
    .select('id')
    .eq('session_token_hash', hashToken(sessionToken))
    .maybeSingle()

  if (error) throw error
  if (!data?.id) return null
  return loadSessionById(supabase, data.id)
}

export const updateSession = async (sessionToken, updater) => {
  const supabase = getSupabaseClient()
  if (!supabase) return localStore.updateSession(sessionToken, updater)

  const current = await getSessionByToken(sessionToken)
  if (!current) throw new Error('Session not found or token is invalid.')

  const next = updater(structuredClone(current))
  await persistSessionData(supabase, current.id, next)
  return {
    ...next,
    id: current.id,
  }
}

export const countSessionsByStudyConfig = async (studyConfigId) => {
  const supabase = getSupabaseClient()
  if (!supabase) return localStore.countSessionsByStudyConfig(studyConfigId)

  const { data, error } = await supabase
    .from('mvp_v2_sessions')
    .select('condition')
    .eq('study_config_id', studyConfigId)

  if (error) throw error
  return {
    guided: (data || []).filter((entry) => entry.condition === 'guided_dynamic_map').length,
    control: (data || []).filter((entry) => entry.condition === 'freeform_control').length,
  }
}

export const listSessions = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return localStore.listSessions()

  const [sessionsRes, scoresRes, surveysRes] = await Promise.all([
    supabase.from('mvp_v2_sessions').select('*').order('created_at', { ascending: false }),
    supabase.from('mvp_v2_evaluation_scores').select('*'),
    supabase.from('mvp_v2_survey_responses').select('*'),
  ])

  if (sessionsRes.error) throw sessionsRes.error
  if (scoresRes.error) throw scoresRes.error
  if (surveysRes.error) throw surveysRes.error

  const scoresBySession = new Map()
  for (const row of scoresRes.data || []) {
    const list = scoresBySession.get(row.session_id) || []
    list.push(mapEvaluationScore(row))
    scoresBySession.set(row.session_id, list)
  }

  const surveyBySession = new Map((surveysRes.data || []).map((row) => [row.session_id, row.responses || null]))

  return (sessionsRes.data || []).map((row) => ({
    ...mapSession(row),
    evaluationScores: scoresBySession.get(row.id) || [],
    surveyResponse: surveyBySession.get(row.id) || null,
  }))
}
