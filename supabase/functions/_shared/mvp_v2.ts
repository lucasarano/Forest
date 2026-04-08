const encoder = new TextEncoder()
export const MVP_V2_INSTRUMENTATION_VERSION = 'mvp_v2_dynamic_mastery'
export const MVP_ADMIN_PASSWORD = Deno.env.get('MVP_ADMIN_PASSWORD') || 'admin12345'

export const requireAdminPassword = (password: string) => {
  if (!password || password !== MVP_ADMIN_PASSWORD) {
    throw new Error('Invalid admin password.')
  }
}

export const requireJsonBody = async (request: Request) => {
  try {
    return await request.json()
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')

export const createOpaqueToken = () => `${crypto.randomUUID()}-${crypto.randomUUID()}`

export const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return toHex(digest)
}

export const mapStudyConfig = (row: Record<string, any>) => ({
  id: row.id,
  seedConcept: row.seed_concept,
  conceptSummary: row.concept_summary,
  timeBudgetMs: row.time_budget_ms,
  graphModel: row.graph_model || 'legacy',
  graphNodes: Array.isArray(row.planner_graph) ? row.planner_graph : [],
  evaluationBundle: row.evaluation_bundle || {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapSession = (row: Record<string, any>) => ({
  id: row.id,
  studyConfigId: row.study_config_id,
  condition: row.condition,
  phase: row.phase,
  status: row.status,
  currentNodeId: row.current_node_id,
  turnIndex: typeof row.turn_index === 'number' ? row.turn_index : 0,
  startedAt: row.started_at,
  learningCompletedAt: row.learning_completed_at,
  evaluationCompletedAt: row.evaluation_completed_at,
  surveyCompletedAt: row.survey_completed_at,
  timeBudgetMs: row.time_budget_ms,
  instrumentationVersion: row.instrumentation_version,
  lastActiveAt: row.last_active_at,
  selfReport: row.self_report || null,
  uploadedDocuments: Array.isArray(row.uploaded_documents) ? row.uploaded_documents : [],
  metrics: row.metrics || {},
  evaluationOverallScore: typeof row.evaluation_overall_score === 'number' ? row.evaluation_overall_score : 0,
  evaluationSummary: row.evaluation_summary || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapGraphNode = (row: Record<string, any>) => ({
  id: row.node_id,
  title: row.title,
  summary: row.summary,
  parentIds: Array.isArray(row.parent_ids) ? row.parent_ids : [],
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

export const mapEvidenceRecord = (row: Record<string, any>) => ({
  id: row.evidence_id,
  nodeId: row.node_id,
  turnIndex: typeof row.turn_index === 'number' ? row.turn_index : 0,
  promptKind: row.prompt_kind,
  scores: row.scores || {},
  misconceptionDetected: !!row.misconception_detected,
  misconceptionLabel: row.misconception_label || '',
  misconceptionReason: row.misconception_reason || '',
  missingConcepts: Array.isArray(row.missing_concepts) ? row.missing_concepts : [],
  strengths: Array.isArray(row.strengths) ? row.strengths : [],
  rationale: row.rationale || '',
  supportUsed: !!row.support_used,
  createdAt: row.created_at,
})

export const mapMessage = (row: Record<string, any>) => ({
  id: row.message_id,
  nodeId: row.node_id,
  role: row.role,
  content: row.content,
  visibleToStudent: !!row.visible_to_student,
  metadata: row.metadata || {},
  createdAt: row.created_at,
})

export const mapEvent = (row: Record<string, any>) => ({
  id: row.event_id,
  type: row.event_type,
  payload: row.payload || {},
  createdAt: row.created_at,
})

export const mapEvaluationAnswer = (row: Record<string, any>) => ({
  promptId: row.prompt_id,
  answer: row.answer,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapEvaluationScore = (row: Record<string, any>) => ({
  promptId: row.prompt_id,
  score: typeof row.score === 'number' ? row.score : 0,
  rationale: row.rationale || '',
  strengths: Array.isArray(row.strengths) ? row.strengths : [],
  gaps: Array.isArray(row.gaps) ? row.gaps : [],
  overallScore: typeof row.overall_score === 'number' ? row.overall_score : 0,
  summary: row.summary || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const requireSessionByToken = async (supabase: any, token: string) => {
  const tokenHash = await hashToken(token)
  const { data, error } = await supabase
    .from('mvp_v2_sessions')
    .select('*')
    .eq('session_token_hash', tokenHash)
    .single()

  if (error || !data) {
    throw new Error('Session not found or token is invalid.')
  }

  return data
}

export const loadSnapshot = async (supabase: any, sessionId: string) => {
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

  return {
    studyConfig: mapStudyConfig(studyConfigRow),
    session: {
      ...mapSession(sessionRes.data),
      graphModel: studyConfigRow.graph_model || 'legacy',
      graphNodes: (graphRes.data || []).map(mapGraphNode),
      evidenceRecords: (evidenceRes.data || []).map(mapEvidenceRecord),
      messages: (messageRes.data || []).map(mapMessage),
      events: (eventRes.data || []).map(mapEvent),
      evaluationAnswers: (evaluationAnswersRes.data || []).map(mapEvaluationAnswer),
      evaluationScores: (evaluationScoresRes.data || []).map(mapEvaluationScore),
      surveyResponse: surveyRes.data?.responses || null,
    },
  }
}
