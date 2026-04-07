import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import { getHigherPhase, insertEventLogs, MVP_INSTRUMENTATION_VERSION, requireJsonBody, requireSessionByToken } from '../_shared/mvp.ts'

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
    const answers = Array.isArray(body.answers) ? body.answers : []
    const totalQuizScore = Number.isFinite(body.totalQuizScore) ? body.totalQuizScore : 0
    const guidedQuizScore = Number.isFinite(body.guidedQuizScore) ? body.guidedQuizScore : 0
    const freeformQuizScore = Number.isFinite(body.freeformQuizScore) ? body.freeformQuizScore : 0

    if (!token || answers.length === 0) {
      return json({ error: 'Session token and answers are required.' }, 400)
    }

    const supabase = getServiceClient()
    const session = await requireSessionByToken(supabase, token)
    const completedAt = new Date().toISOString()

    const rows = answers.map((answer) => ({
      session_id: session.id,
      question_key: answer.questionKey,
      topic: answer.topic,
      selected_option: answer.selectedOption,
      is_correct: !!answer.isCorrect,
    }))

    const { error: answerError } = await supabase
      .from('mvp_assessment_answers')
      .upsert(rows, { onConflict: 'session_id,question_key' })

    if (answerError) throw answerError

    const { error: sessionError } = await supabase
      .from('mvp_sessions')
      .update({
        current_phase: 'survey',
        assessment_completed_at: completedAt,
        total_quiz_score: totalQuizScore,
        guided_quiz_score: guidedQuizScore,
        freeform_quiz_score: freeformQuizScore,
        instrumentation_version: session.instrumentation_version || MVP_INSTRUMENTATION_VERSION,
        highest_phase_reached: getHigherPhase(session.highest_phase_reached || session.current_phase, 'survey'),
        last_active_at: completedAt,
      })
      .eq('id', session.id)

    if (sessionError) throw sessionError

    await insertEventLogs(supabase, session.id, [
      {
        phase: 'assessment',
        eventType: 'assessment_submitted',
        payload: {
          answerCount: answers.length,
          totalQuizScore,
          guidedQuizScore,
          freeformQuizScore,
        },
        createdAt: completedAt,
      },
      {
        phase: 'survey',
        eventType: 'phase_changed',
        payload: {
          fromPhase: session.current_phase,
          toPhase: 'survey',
        },
        createdAt: completedAt,
      },
    ])

    return json({ success: true })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error.' }, 500)
  }
})
