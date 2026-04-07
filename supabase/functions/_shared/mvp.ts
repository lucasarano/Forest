const encoder = new TextEncoder()
export const MVP_INSTRUMENTATION_VERSION = 'mvp_admin_v1'
export const MVP_ADMIN_PASSWORD = Deno.env.get('MVP_ADMIN_PASSWORD') || 'admin12345'
export const MVP_PHASE_ORDER = [
  'entry',
  'diagnostic_notice',
  'guided_water',
  'freeform_airplane',
  'assessment',
  'survey',
  'summary',
] as const
const phaseRank = new Map(MVP_PHASE_ORDER.map((phase, index) => [phase, index]))
const ROOT_NODE_KEY = 'water-system-flow'
const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')

const mapSession = (row: Record<string, unknown>) => ({
  id: row.id,
  participantName: row.participant_name,
  participantEmail: row.participant_email,
  currentPhase: row.current_phase,
  status: row.status,
  diagnosticAcknowledgedAt: row.diagnostic_acknowledged_at,
  waterStartedAt: row.water_started_at,
  waterCompletedAt: row.water_completed_at,
  airplaneStartedAt: row.airplane_started_at,
  airplaneCompletedAt: row.airplane_completed_at,
  assessmentCompletedAt: row.assessment_completed_at,
  surveyCompletedAt: row.survey_completed_at,
  waterTimeMs: row.water_time_ms,
  airplaneTimeBudgetMs: row.airplane_time_budget_ms,
  totalQuizScore: row.total_quiz_score,
  guidedQuizScore: row.guided_quiz_score,
  freeformQuizScore: row.freeform_quiz_score,
  guidedConfidenceBefore: row.guided_confidence_before,
  guidedConfidenceAfter: row.guided_confidence_after,
  freeformConfidenceBefore: row.freeform_confidence_before,
  freeformConfidenceAfter: row.freeform_confidence_after,
  instrumentationVersion: row.instrumentation_version,
  lastActiveAt: row.last_active_at,
  completionReason: row.completion_reason,
  highestPhaseReached: row.highest_phase_reached,
  guidedOutcome: row.guided_outcome,
  airplaneOutcome: row.airplane_outcome,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const normalizeEmail = (value: string) => value.trim().toLowerCase()

export const hashToken = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return toHex(digest)
}

export const createOpaqueToken = () =>
  `${crypto.randomUUID()}-${crypto.randomUUID()}`

export const getHigherPhase = (currentPhase: string | null | undefined, nextPhase: string | null | undefined) => {
  const currentRank = phaseRank.get((currentPhase || '') as typeof MVP_PHASE_ORDER[number]) ?? -1
  const nextRank = phaseRank.get((nextPhase || '') as typeof MVP_PHASE_ORDER[number]) ?? -1
  return nextRank >= currentRank ? nextPhase : currentPhase
}

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

export const requireSessionByToken = async (supabase: any, token: string) => {
  const tokenHash = await hashToken(token)
  const { data, error } = await supabase
    .from('mvp_sessions')
    .select('*')
    .eq('session_token_hash', tokenHash)
    .single()

  if (error || !data) {
    throw new Error('Session not found or token is invalid.')
  }

  return data
}

export const loadSnapshot = async (supabase: any, sessionId: string) => {
  const [sessionRes, nodeRes, chatRes, assessmentRes, surveyRes] = await Promise.all([
    supabase.from('mvp_sessions').select('*').eq('id', sessionId).single(),
    supabase.from('mvp_node_progress').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    supabase.from('mvp_chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    supabase.from('mvp_assessment_answers').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    supabase.from('mvp_survey_responses').select('*').eq('session_id', sessionId).maybeSingle(),
  ])

  if (sessionRes.error || !sessionRes.data) {
    throw new Error(sessionRes.error?.message || 'Could not load MVP session.')
  }

  if (nodeRes.error) throw new Error(nodeRes.error.message)
  if (chatRes.error) throw new Error(chatRes.error.message)
  if (assessmentRes.error) throw new Error(assessmentRes.error.message)
  if (surveyRes.error) throw new Error(surveyRes.error.message)

  return {
    session: mapSession(sessionRes.data),
    nodeProgress: (nodeRes.data || []).map((row) => ({
      nodeKey: row.node_key,
      status: row.status,
      masteryScore: typeof row.mastery_score === 'number' ? row.mastery_score : 0,
      attemptCount: row.attempt_count,
      interactionCount: row.interaction_count,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms,
      lastAnswer: row.last_answer,
      messages: Array.isArray(row.messages) ? row.messages : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    chatMessages: (chatRes.data || []).map((row) => ({
      id: row.client_message_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
    })),
    assessmentAnswers: (assessmentRes.data || []).map((row) => ({
      questionKey: row.question_key,
      topic: row.topic,
      selectedOption: row.selected_option,
      isCorrect: row.is_correct,
      createdAt: row.created_at,
    })),
    surveyResponse: surveyRes.data
      ? {
          guidedConfidenceBefore: sessionRes.data.guided_confidence_before,
          guidedConfidenceAfter: sessionRes.data.guided_confidence_after,
          freeformConfidenceBefore: sessionRes.data.freeform_confidence_before,
          freeformConfidenceAfter: sessionRes.data.freeform_confidence_after,
          clarityRating: surveyRes.data.clarity_rating,
          engagementRating: surveyRes.data.engagement_rating,
          effectivenessRating: surveyRes.data.effectiveness_rating,
          guidedUsefulness: surveyRes.data.guided_usefulness,
          freeformUsefulness: surveyRes.data.freeform_usefulness,
          clearerSystem: surveyRes.data.clearer_system,
          preferredSystem: surveyRes.data.preferred_system,
          positiveAspectGuided: surveyRes.data.positive_aspect_guided,
          positiveAspectFreeform: surveyRes.data.positive_aspect_freeform,
          betterExperience: surveyRes.data.better_experience,
          clearerExplanations: surveyRes.data.clearer_explanations,
          preferredModerateTopic: surveyRes.data.preferred_moderate_topic,
          comment: surveyRes.data.comment,
          createdAt: surveyRes.data.created_at,
          updatedAt: surveyRes.data.updated_at,
        }
      : null,
  }
}

export const insertEventLogs = async (
  supabase: any,
  sessionId: string,
  events: Array<{ phase?: string | null, eventType: string, payload?: Record<string, unknown>, createdAt?: string }>
) => {
  const rows = events
    .filter((event) => event && typeof event.eventType === 'string' && event.eventType)
    .map((event) => ({
      session_id: sessionId,
      phase: event.phase || null,
      event_type: event.eventType,
      payload: event.payload || {},
      created_at: event.createdAt || new Date().toISOString(),
    }))

  if (!rows.length) return

  const { error } = await supabase.from('mvp_event_logs').insert(rows)
  if (error) throw new Error(error.message)
}

export const loadAdminSessionDetail = async (supabase: any, sessionId: string) => {
  const snapshot = await loadSnapshot(supabase, sessionId)
  const { data: events, error } = await supabase
    .from('mvp_event_logs')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  return {
    ...snapshot,
    eventLogs: (events || []).map((event) => ({
      id: event.id,
      phase: event.phase,
      eventType: event.event_type,
      payload: event.payload || {},
      createdAt: event.created_at,
    })),
  }
}

export const deriveSessionAnalyticsSummary = (
  session: Record<string, unknown>,
  detail: Record<string, unknown>,
  now = new Date().toISOString(),
) => {
  const nodeProgress = Array.isArray(detail.nodeProgress) ? detail.nodeProgress : []
  const surveyResponse = detail.surveyResponse && typeof detail.surveyResponse === 'object' ? detail.surveyResponse : null
  const currentPhase = `${session.currentPhase || session.current_phase || 'entry'}`
  const highestPhaseReached = `${session.highestPhaseReached || session.highest_phase_reached || currentPhase}`
  const skippedNodes = nodeProgress.filter((node: any) => node.status === 'skipped').map((node: any) => node.nodeKey)
  const nodeMetrics = nodeProgress.map((node: any) => ({
    nodeKey: node.nodeKey,
    masteryTimeMs: typeof node.durationMs === 'number' ? node.durationMs : Number(node.duration_ms || 0),
    attemptCount: typeof node.attemptCount === 'number' ? node.attemptCount : Number(node.attempt_count || 0),
    interactionCount: typeof node.interactionCount === 'number' ? node.interactionCount : Number(node.interaction_count || 0),
  }))
  const rootNode = nodeProgress.find((node: any) => node.nodeKey === ROOT_NODE_KEY)
  const rootSkipped = rootNode?.status === 'skipped'
  const rootMasteryScore = typeof rootNode?.masteryScore === 'number' ? rootNode.masteryScore : 0
  const lastActiveAt = `${session.lastActiveAt || session.last_active_at || session.updatedAt || session.updated_at || session.createdAt || session.created_at || now}`
  const airplaneStartedAt = session.airplaneStartedAt || session.airplane_started_at
  const airplaneCompletedAt = session.airplaneCompletedAt || session.airplane_completed_at
  const airplaneBudgetMs = Number(session.airplaneTimeBudgetMs || session.airplane_time_budget_ms || 0)
  const airplaneTimeUsedMs = airplaneStartedAt
    ? Math.max(
        0,
        airplaneCompletedAt
          ? new Date(`${airplaneCompletedAt}`).getTime() - new Date(`${airplaneStartedAt}`).getTime()
          : Math.min(airplaneBudgetMs || Infinity, new Date(now).getTime() - new Date(`${airplaneStartedAt}`).getTime()),
      )
    : 0

  let derivedCompletionReason = `${session.completionReason || session.completion_reason || ''}`
  if (!derivedCompletionReason) {
    if (`${session.status}` === 'completed') {
      derivedCompletionReason = 'completed_full_flow'
    } else {
      const inactiveTooLong = now
        ? new Date(now).getTime() - new Date(lastActiveAt).getTime() > INACTIVITY_THRESHOLD_MS
        : false
      if (inactiveTooLong) {
        const abandonmentMap: Record<string, string> = {
          guided_water: 'abandoned_mid_guided',
          freeform_airplane: 'abandoned_mid_airplane',
          assessment: 'abandoned_mid_assessment',
          survey: 'abandoned_mid_survey',
        }
        derivedCompletionReason = abandonmentMap[currentPhase] || `abandoned_mid_${currentPhase}`
      } else {
        derivedCompletionReason = `in_progress_${currentPhase}`
      }
    }
  }

  return {
    id: session.id,
    participantName: session.participantName || session.participant_name,
    participantEmail: session.participantEmail || session.participant_email,
    status: session.status,
    currentPhase,
    highestPhaseReached,
    instrumentationVersion: session.instrumentationVersion || session.instrumentation_version,
    lastActiveAt,
    completionReason: derivedCompletionReason,
    guidedOutcome: session.guidedOutcome || session.guided_outcome || (rootSkipped ? 'root_skipped_advanced' : 'guided_in_progress'),
    airplaneOutcome: session.airplaneOutcome || session.airplane_outcome || 'not_started',
    totalQuizScore: Number(session.totalQuizScore || session.total_quiz_score || 0),
    guidedQuizScore: Number(session.guidedQuizScore || session.guided_quiz_score || 0),
    freeformQuizScore: Number(session.freeformQuizScore || session.freeform_quiz_score || 0),
    guidedConfidenceBefore: Number(session.guidedConfidenceBefore || session.guided_confidence_before || 0),
    guidedConfidenceAfter: Number(session.guidedConfidenceAfter || session.guided_confidence_after || 0),
    freeformConfidenceBefore: Number(session.freeformConfidenceBefore || session.freeform_confidence_before || 0),
    freeformConfidenceAfter: Number(session.freeformConfidenceAfter || session.freeform_confidence_after || 0),
    quizPerformance: Number(session.totalQuizScore || session.total_quiz_score || 0),
    waterTimeMs: Number(session.waterTimeMs || session.water_time_ms || 0),
    totalCompletionTimeMs: Number(session.waterTimeMs || session.water_time_ms || 0),
    airplaneTimeBudgetMs: airplaneBudgetMs,
    airplaneTimeUsedMs,
    nodeMetrics,
    skippedNodes,
    anySkipped: skippedNodes.length > 0,
    rootSkipped,
    rootMasteryScore,
    surveyPreference: surveyResponse?.betterExperience || null,
    surveyBetterExperience: surveyResponse?.betterExperience || null,
    surveyClearerExplanations: surveyResponse?.clearerExplanations || null,
    surveyPreferredModerateTopic: surveyResponse?.preferredModerateTopic || null,
    surveyClarityRating: surveyResponse?.clarityRating || null,
    surveyEngagementRating: surveyResponse?.engagementRating || null,
    surveyEffectivenessRating: surveyResponse?.effectivenessRating || null,
    surveyGuidedUsefulness: surveyResponse?.guidedUsefulness || null,
    surveyFreeformUsefulness: surveyResponse?.freeformUsefulness || null,
    surveyClearerSystem: surveyResponse?.clearerSystem || null,
    surveyPreferredSystem: surveyResponse?.preferredSystem || null,
    surveyPositiveAspectGuided: surveyResponse?.positiveAspectGuided || null,
    surveyPositiveAspectFreeform: surveyResponse?.positiveAspectFreeform || null,
    assessmentCompletedAt: session.assessmentCompletedAt || session.assessment_completed_at || null,
    surveyCompletedAt: session.surveyCompletedAt || session.survey_completed_at || null,
    createdAt: session.createdAt || session.created_at,
    updatedAt: session.updatedAt || session.updated_at,
  }
}
