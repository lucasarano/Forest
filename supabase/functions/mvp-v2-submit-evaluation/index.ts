import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import { loadSnapshot, requireJsonBody, requireSessionByToken } from '../_shared/mvp_v2.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const body = await requireJsonBody(request)
    const token = typeof body.token === 'string' ? body.token : ''
    const answers = Array.isArray(body.answers) ? body.answers : []
    const scores = body.scores && typeof body.scores === 'object' ? body.scores : null
    if (!token || !scores) return json({ error: 'token, answers, and scores are required.' }, 400)

    const supabase = getServiceClient()
    const session = await requireSessionByToken(supabase, token)
    const completedAt = new Date().toISOString()

    if (answers.length) {
      const { error } = await supabase
        .from('mvp_v2_evaluation_answers')
        .upsert(answers.map((answer: any) => ({
          session_id: session.id,
          prompt_id: answer.promptId,
          answer: answer.answer || '',
        })), { onConflict: 'session_id,prompt_id' })

      if (error) throw error
    }

    const scoreRows = Array.isArray(scores.answers) ? scores.answers : []
    if (scoreRows.length) {
      const { error } = await supabase
        .from('mvp_v2_evaluation_scores')
        .upsert(scoreRows.map((entry: any) => ({
          session_id: session.id,
          prompt_id: entry.promptId,
          score: entry.score || 0,
          rationale: entry.rationale || '',
          strengths: entry.strengths || [],
          gaps: entry.gaps || [],
          overall_score: scores.overallScore || 0,
          summary: scores.summary || '',
        })), { onConflict: 'session_id,prompt_id' })

      if (error) throw error
    }

    const { error: updateError } = await supabase
      .from('mvp_v2_sessions')
      .update({
        phase: 'survey',
        evaluation_completed_at: completedAt,
        last_active_at: completedAt,
      })
      .eq('id', session.id)

    if (updateError) throw updateError

    const snapshot = await loadSnapshot(supabase, session.id)
    return json({ success: true, snapshot })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error.' }, 500)
  }
})

