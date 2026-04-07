import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import {
  deriveSessionAnalyticsSummary,
  loadSnapshot,
  MVP_INSTRUMENTATION_VERSION,
  requireAdminPassword,
  requireJsonBody,
} from '../_shared/mvp.ts'

const average = (values: number[]) => {
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

const matchesFilter = (session: Record<string, any>, filters: Record<string, any>) => {
  const search = `${filters.search || ''}`.trim().toLowerCase()
  if (search) {
    const haystack = `${session.participantName || ''} ${session.participantEmail || ''}`.toLowerCase()
    if (!haystack.includes(search)) return false
  }

  if (filters.status && session.status !== filters.status) return false
  if (filters.highestPhaseReached && session.highestPhaseReached !== filters.highestPhaseReached) return false
  if (filters.completionReason && session.completionReason !== filters.completionReason) return false
  if (filters.guidedOutcome && session.guidedOutcome !== filters.guidedOutcome) return false
  if (filters.airplaneOutcome && session.airplaneOutcome !== filters.airplaneOutcome) return false
  if (filters.surveyPreference && session.surveyPreference !== filters.surveyPreference) return false
  if (filters.hasSkipped === 'yes' && !session.anySkipped) return false
  if (filters.hasSkipped === 'no' && session.anySkipped) return false

  if (filters.dateFrom) {
    const from = new Date(`${filters.dateFrom}T00:00:00.000Z`).getTime()
    if (new Date(session.createdAt).getTime() < from) return false
  }

  if (filters.dateTo) {
    const to = new Date(`${filters.dateTo}T23:59:59.999Z`).getTime()
    if (new Date(session.createdAt).getTime() > to) return false
  }

  return true
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  try {
    const body = await requireJsonBody(request)
    requireAdminPassword(typeof body.password === 'string' ? body.password : '')
    const filters = body.filters && typeof body.filters === 'object' ? body.filters : {}

    const supabase = getServiceClient()
    const { data: sessionRows, error: sessionError } = await supabase
      .from('mvp_sessions')
      .select('*')
      .eq('instrumentation_version', MVP_INSTRUMENTATION_VERSION)
      .order('created_at', { ascending: false })

    if (sessionError) throw sessionError

    const sessionIds = (sessionRows || []).map((row) => row.id)
    if (!sessionIds.length) {
      return json({
        aggregates: {
          totalSessions: 0,
          completedSessions: 0,
          inProgressSessions: 0,
          averageGuidedTimeMs: 0,
          averageAirplaneTimeUsedMs: 0,
          averageQuizScore: 0,
          dropoffByPhase: [],
          skipRateByNode: [],
          airplaneOutcomeBreakdown: [],
        },
        sessions: [],
      })
    }

    const [nodeRes, surveyRes] = await Promise.all([
      supabase.from('mvp_node_progress').select('*').in('session_id', sessionIds),
      supabase.from('mvp_survey_responses').select('*').in('session_id', sessionIds),
    ])

    if (nodeRes.error) throw nodeRes.error
    if (surveyRes.error) throw surveyRes.error

    const nodesBySession = new Map<string, any[]>()
    const surveysBySession = new Map<string, any>()

    for (const row of nodeRes.data || []) {
      const list = nodesBySession.get(row.session_id) || []
      list.push({
        nodeKey: row.node_key,
        status: row.status,
        masteryScore: typeof row.mastery_score === 'number' ? row.mastery_score : 0,
        attemptCount: typeof row.attempt_count === 'number' ? row.attempt_count : 0,
        interactionCount: typeof row.interaction_count === 'number' ? row.interaction_count : 0,
        durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : 0,
      })
      nodesBySession.set(row.session_id, list)
    }

    for (const row of surveyRes.data || []) {
      surveysBySession.set(row.session_id, {
        betterExperience: row.better_experience,
        clearerExplanations: row.clearer_explanations,
        preferredModerateTopic: row.preferred_moderate_topic,
      })
    }

    const now = new Date().toISOString()
    const summaries = (sessionRows || []).map((session) =>
      deriveSessionAnalyticsSummary(
        session,
        {
          nodeProgress: nodesBySession.get(session.id) || [],
          surveyResponse: surveysBySession.get(session.id) || null,
        },
        now,
      ))
      .filter((session) => matchesFilter(session, filters))

    const dropoffCounts = new Map<string, number>()
    const skipCounts = new Map<string, number>()
    const airplaneOutcomeCounts = new Map<string, number>()

    summaries.forEach((session) => {
      dropoffCounts.set(session.highestPhaseReached, (dropoffCounts.get(session.highestPhaseReached) || 0) + 1)
      ;(session.skippedNodes || []).forEach((nodeKey: string) => {
        skipCounts.set(nodeKey, (skipCounts.get(nodeKey) || 0) + 1)
      })
      airplaneOutcomeCounts.set(session.airplaneOutcome, (airplaneOutcomeCounts.get(session.airplaneOutcome) || 0) + 1)
    })

    return json({
      aggregates: {
        totalSessions: summaries.length,
        completedSessions: summaries.filter((session) => session.status === 'completed').length,
        inProgressSessions: summaries.filter((session) => session.status !== 'completed').length,
        averageGuidedTimeMs: average(summaries.map((session) => session.waterTimeMs).filter((value) => value > 0)),
        averageAirplaneTimeUsedMs: average(summaries.map((session) => session.airplaneTimeUsedMs).filter((value) => value > 0)),
        averageQuizScore: average(summaries.map((session) => session.totalQuizScore).filter((value) => value >= 0)),
        dropoffByPhase: Array.from(dropoffCounts.entries()).map(([phase, count]) => ({ phase, count })),
        skipRateByNode: Array.from(skipCounts.entries()).map(([nodeKey, count]) => ({
          nodeKey,
          count,
          rate: summaries.length ? count / summaries.length : 0,
        })),
        airplaneOutcomeBreakdown: Array.from(airplaneOutcomeCounts.entries()).map(([outcome, count]) => ({ outcome, count })),
      },
      sessions: summaries,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.'
    const status = message === 'Invalid admin password.' ? 401 : 500
    return json({ error: message }, status)
  }
})
