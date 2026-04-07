import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import {
  mapStudyConfig,
  requireAdminPassword,
  requireJsonBody,
} from '../_shared/mvp_v2.ts'

const average = (values: number[]) => {
  if (!values.length) return 0
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const body = await requireJsonBody(request)
    requireAdminPassword(typeof body.password === 'string' ? body.password : '')

    const supabase = getServiceClient()
    const [configsRes, sessionsRes, evidenceRes, scoresRes] = await Promise.all([
      supabase.from('mvp_v2_study_configs').select('*').order('created_at', { ascending: false }),
      supabase.from('mvp_v2_sessions').select('*').order('created_at', { ascending: false }),
      supabase.from('mvp_v2_evidence_records').select('*'),
      supabase.from('mvp_v2_evaluation_scores').select('*'),
    ])

    if (configsRes.error) throw configsRes.error
    if (sessionsRes.error) throw sessionsRes.error
    if (evidenceRes.error) throw evidenceRes.error
    if (scoresRes.error) throw scoresRes.error

    const evidenceBySession = new Map<string, any[]>()
    const scoresBySession = new Map<string, any[]>()

    for (const record of evidenceRes.data || []) {
      const list = evidenceBySession.get(record.session_id) || []
      list.push(record)
      evidenceBySession.set(record.session_id, list)
    }

    for (const score of scoresRes.data || []) {
      const list = scoresBySession.get(score.session_id) || []
      list.push(score)
      scoresBySession.set(score.session_id, list)
    }

    const sessions = (sessionsRes.data || []).map((session) => {
      const sessionEvidence = evidenceBySession.get(session.id) || []
      const sessionScores = scoresBySession.get(session.id) || []
      const averagePromptScore = average(sessionScores.map((entry) => Number(entry.score || 0)))
      const graphExpansionCount = sessionEvidence.filter((entry) => entry.misconception_detected).length

      return {
        id: session.id,
        studyConfigId: session.study_config_id,
        condition: session.condition,
        phase: session.phase,
        status: session.status,
        turnIndex: session.turn_index || 0,
        startedAt: session.started_at,
        learningCompletedAt: session.learning_completed_at,
        evaluationCompletedAt: session.evaluation_completed_at,
        surveyCompletedAt: session.survey_completed_at,
        timeBudgetMs: session.time_budget_ms,
        averagePromptScore,
        graphExpansionCount,
      }
    })

    const configs = (configsRes.data || []).map((config) => {
      const configSessions = sessions.filter((session) => session.studyConfigId === config.id)
      const guidedSessions = configSessions.filter((session) => session.condition === 'guided_dynamic_map')
      const controlSessions = configSessions.filter((session) => session.condition === 'freeform_control')

      return {
        ...mapStudyConfig(config),
        sessionCount: configSessions.length,
        guidedCount: guidedSessions.length,
        controlCount: controlSessions.length,
        averageEvaluationScore: average(configSessions.map((session) => session.averagePromptScore)),
        averageTurns: average(configSessions.map((session) => session.turnIndex)),
      }
    })

    return json({
      configs,
      sessions,
      aggregates: {
        configCount: configs.length,
        sessionCount: sessions.length,
        averageEvaluationScore: average(sessions.map((session) => session.averagePromptScore)),
        averageTurns: average(sessions.map((session) => session.turnIndex)),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.'
    const status = message === 'Invalid admin password.' ? 401 : 500
    return json({ error: message }, status)
  }
})

