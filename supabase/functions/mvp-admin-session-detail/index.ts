import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import {
  deriveSessionAnalyticsSummary,
  loadAdminSessionDetail,
  MVP_INSTRUMENTATION_VERSION,
  requireAdminPassword,
  requireJsonBody,
} from '../_shared/mvp.ts'

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
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''

    if (!sessionId) {
      return json({ error: 'sessionId is required.' }, 400)
    }

    const supabase = getServiceClient()
    const { data: sessionRow, error } = await supabase
      .from('mvp_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('instrumentation_version', MVP_INSTRUMENTATION_VERSION)
      .single()

    if (error || !sessionRow) {
      return json({ error: 'Session not found.' }, 404)
    }

    const detail = await loadAdminSessionDetail(supabase, sessionId)
    const summary = deriveSessionAnalyticsSummary(detail.session, detail, new Date().toISOString())

    return json({
      summary,
      detail,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.'
    const status = message === 'Invalid admin password.' ? 401 : 500
    return json({ error: message }, status)
  }
})
