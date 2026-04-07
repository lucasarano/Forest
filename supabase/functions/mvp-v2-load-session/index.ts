import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import { loadSnapshot, requireJsonBody, requireSessionByToken } from '../_shared/mvp_v2.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const body = await requireJsonBody(request)
    const token = typeof body.token === 'string' ? body.token : ''
    if (!token) return json({ error: 'Session token is required.' }, 400)

    const supabase = getServiceClient()
    const session = await requireSessionByToken(supabase, token)
    await supabase
      .from('mvp_v2_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', session.id)

    const snapshot = await loadSnapshot(supabase, session.id)
    return json({ snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.'
    const status = message.toLowerCase().includes('token') ? 401 : 500
    return json({ error: message }, status)
  }
})

