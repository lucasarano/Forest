import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import {
  getHigherPhase,
  insertEventLogs,
  loadSnapshot,
  MVP_INSTRUMENTATION_VERSION,
  requireJsonBody,
  requireSessionByToken,
} from '../_shared/mvp.ts'

const assignIfPresent = (target: Record<string, unknown>, source: Record<string, unknown>, sourceKey: string, targetKey = sourceKey) => {
  if (source[sourceKey] !== undefined) {
    target[targetKey] = source[sourceKey]
  }
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
    const token = typeof body.token === 'string' ? body.token : ''

    if (!token) {
      return json({ error: 'Session token is required.' }, 400)
    }

    const supabase = getServiceClient()
    const session = await requireSessionByToken(supabase, token)

    const sessionPatch = body.sessionPatch && typeof body.sessionPatch === 'object' ? body.sessionPatch : null
    const nodeProgress = body.nodeProgress && typeof body.nodeProgress === 'object' ? body.nodeProgress : null
    const chatMessage = body.chatMessage && typeof body.chatMessage === 'object' ? body.chatMessage : null
    const eventLog = body.eventLog && typeof body.eventLog === 'object' ? body.eventLog : null
    const eventLogs = Array.isArray(body.eventLogs) ? body.eventLogs.filter((entry) => entry && typeof entry === 'object') : []
    const now = new Date().toISOString()

    if (sessionPatch) {
      const update: Record<string, unknown> = {}
      assignIfPresent(update, sessionPatch, 'currentPhase', 'current_phase')
      assignIfPresent(update, sessionPatch, 'status')
      assignIfPresent(update, sessionPatch, 'diagnosticAcknowledgedAt', 'diagnostic_acknowledged_at')
      assignIfPresent(update, sessionPatch, 'waterStartedAt', 'water_started_at')
      assignIfPresent(update, sessionPatch, 'waterCompletedAt', 'water_completed_at')
      assignIfPresent(update, sessionPatch, 'airplaneStartedAt', 'airplane_started_at')
      assignIfPresent(update, sessionPatch, 'airplaneCompletedAt', 'airplane_completed_at')
      assignIfPresent(update, sessionPatch, 'assessmentCompletedAt', 'assessment_completed_at')
      assignIfPresent(update, sessionPatch, 'surveyCompletedAt', 'survey_completed_at')
      assignIfPresent(update, sessionPatch, 'waterTimeMs', 'water_time_ms')
      assignIfPresent(update, sessionPatch, 'airplaneTimeBudgetMs', 'airplane_time_budget_ms')
      assignIfPresent(update, sessionPatch, 'totalQuizScore', 'total_quiz_score')
      assignIfPresent(update, sessionPatch, 'guidedQuizScore', 'guided_quiz_score')
      assignIfPresent(update, sessionPatch, 'freeformQuizScore', 'freeform_quiz_score')
      assignIfPresent(update, sessionPatch, 'guidedConfidenceBefore', 'guided_confidence_before')
      assignIfPresent(update, sessionPatch, 'guidedConfidenceAfter', 'guided_confidence_after')
      assignIfPresent(update, sessionPatch, 'freeformConfidenceBefore', 'freeform_confidence_before')
      assignIfPresent(update, sessionPatch, 'freeformConfidenceAfter', 'freeform_confidence_after')
      assignIfPresent(update, sessionPatch, 'completionReason', 'completion_reason')
      assignIfPresent(update, sessionPatch, 'guidedOutcome', 'guided_outcome')
      assignIfPresent(update, sessionPatch, 'airplaneOutcome', 'airplane_outcome')
      update.instrumentation_version = session.instrumentation_version || MVP_INSTRUMENTATION_VERSION
      update.last_active_at = now

      const nextPhase = typeof update.current_phase === 'string' ? update.current_phase as string : session.current_phase
      update.highest_phase_reached = getHigherPhase(session.highest_phase_reached || session.current_phase, nextPhase)

      if (Object.keys(update).length > 0) {
        const { error } = await supabase
          .from('mvp_sessions')
          .update(update)
          .eq('id', session.id)

        if (error) throw error
      }
    }

    if (nodeProgress && typeof nodeProgress.nodeKey === 'string') {
      const row: Record<string, unknown> = {
        session_id: session.id,
        node_key: nodeProgress.nodeKey,
      }
      assignIfPresent(row, nodeProgress, 'status')
      assignIfPresent(row, nodeProgress, 'masteryScore', 'mastery_score')
      assignIfPresent(row, nodeProgress, 'attemptCount', 'attempt_count')
      assignIfPresent(row, nodeProgress, 'interactionCount', 'interaction_count')
      assignIfPresent(row, nodeProgress, 'startedAt', 'started_at')
      assignIfPresent(row, nodeProgress, 'completedAt', 'completed_at')
      assignIfPresent(row, nodeProgress, 'durationMs', 'duration_ms')
      assignIfPresent(row, nodeProgress, 'lastAnswer', 'last_answer')
      assignIfPresent(row, nodeProgress, 'messages')

      const { error } = await supabase
        .from('mvp_node_progress')
        .upsert(row, { onConflict: 'session_id,node_key' })

      if (error) throw error
    }

    if (
      chatMessage &&
      typeof chatMessage.id === 'string' &&
      typeof chatMessage.role === 'string' &&
      typeof chatMessage.content === 'string'
    ) {
      const { error } = await supabase
        .from('mvp_chat_messages')
        .upsert({
          session_id: session.id,
          client_message_id: chatMessage.id,
          role: chatMessage.role,
          content: chatMessage.content,
          created_at: chatMessage.createdAt || new Date().toISOString(),
        }, { onConflict: 'session_id,client_message_id' })

      if (error) throw error
    }

    const normalizedEvents = [
      ...(eventLog ? [eventLog] : []),
      ...eventLogs,
    ].map((entry) => ({
      phase: typeof entry.phase === 'string' ? entry.phase : (sessionPatch?.currentPhase || session.current_phase),
      eventType: typeof entry.eventType === 'string' ? entry.eventType : '',
      payload: entry.payload && typeof entry.payload === 'object' ? entry.payload : {},
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : now,
    })).filter((entry) => entry.eventType)

    if (normalizedEvents.length) {
      await insertEventLogs(supabase, session.id, normalizedEvents)
    }

    if (!sessionPatch || nodeProgress || chatMessage || normalizedEvents.length) {
      await supabase
        .from('mvp_sessions')
        .update({
          last_active_at: now,
          instrumentation_version: session.instrumentation_version || MVP_INSTRUMENTATION_VERSION,
        })
        .eq('id', session.id)
    }

    const snapshot = await loadSnapshot(supabase, session.id)
    return json({ success: true, snapshot })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error.' }, 500)
  }
})
