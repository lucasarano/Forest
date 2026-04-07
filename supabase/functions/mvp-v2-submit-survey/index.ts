import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import { loadSnapshot, requireJsonBody, requireSessionByToken } from '../_shared/mvp_v2.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const body = await requireJsonBody(request)
    const token = typeof body.token === 'string' ? body.token : ''
    const survey = body.survey && typeof body.survey === 'object' ? body.survey : null
    if (!token || !survey) return json({ error: 'token and survey are required.' }, 400)

    const supabase = getServiceClient()
    const session = await requireSessionByToken(supabase, token)
    const completedAt = new Date().toISOString()

    const { error: surveyError } = await supabase
      .from('mvp_v2_survey_responses')
      .upsert({
        session_id: session.id,
        responses: survey,
      }, { onConflict: 'session_id' })

    if (surveyError) throw surveyError

    const { error: updateError } = await supabase
      .from('mvp_v2_sessions')
      .update({
        phase: 'summary',
        status: 'completed',
        survey_completed_at: completedAt,
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

