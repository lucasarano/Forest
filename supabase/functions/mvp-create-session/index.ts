import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import { createOpaqueToken, hashToken, loadSnapshot, normalizeEmail, requireJsonBody } from '../_shared/mvp.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  try {
    const body = await requireJsonBody(request)
    const participantName = typeof body.name === 'string' ? body.name.trim() : ''
    const participantEmail = typeof body.email === 'string' ? normalizeEmail(body.email) : ''

    if (!participantName || !participantEmail) {
      return json({ error: 'Name and email are required.' }, 400)
    }

    const supabase = getServiceClient()
    const token = createOpaqueToken()
    const tokenHash = await hashToken(token)

    const { data: existing, error: existingError } = await supabase
      .from('mvp_sessions')
      .select('*')
      .eq('participant_email', participantEmail)
      .eq('status', 'active')
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    let sessionId = existing?.id

    if (existing) {
      const { error } = await supabase
        .from('mvp_sessions')
        .update({
          participant_name: participantName,
          session_token_hash: tokenHash,
        })
        .eq('id', existing.id)

      if (error) throw error
    } else {
      const { data, error } = await supabase
        .from('mvp_sessions')
        .insert({
          participant_name: participantName,
          participant_email: participantEmail,
          session_token_hash: tokenHash,
          current_phase: 'diagnostic_notice',
          status: 'active',
        })
        .select('id')
        .single()

      if (error || !data) throw error || new Error('Could not create MVP session.')
      sessionId = data.id
    }

    const snapshot = await loadSnapshot(supabase, sessionId)
    return json({ sessionToken: token, snapshot })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error.' }, 500)
  }
})
