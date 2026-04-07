import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import {
  createOpaqueToken,
  hashToken,
  insertEventLogs,
  loadSnapshot,
  MVP_INSTRUMENTATION_VERSION,
  normalizeEmail,
  requireJsonBody,
  requireSessionByToken,
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
    const token = typeof body.token === 'string' ? body.token : ''
    const participantName = typeof body.name === 'string' ? body.name.trim() : ''
    const participantEmail = typeof body.email === 'string' ? normalizeEmail(body.email) : ''

    const supabase = getServiceClient()

    if (!token && participantName && participantEmail) {
      const now = new Date().toISOString()
      const nextToken = createOpaqueToken()
      const tokenHash = await hashToken(nextToken)
      const { data: existing, error: existingError } = await supabase
        .from('mvp_sessions')
        .select('*')
        .eq('status', 'active')
        .ilike('participant_email', participantEmail)
        .maybeSingle()

      if (existingError) throw existingError

      let sessionId = existing?.id

      if (existing) {
        const { error } = await supabase
          .from('mvp_sessions')
          .update({
            participant_name: participantName,
            session_token_hash: tokenHash,
            last_active_at: now,
          })
          .eq('id', existing.id)

        if (error) throw error

        if (existing.instrumentation_version === MVP_INSTRUMENTATION_VERSION) {
          await insertEventLogs(supabase, existing.id, [{
            phase: existing.current_phase,
            eventType: 'session_resumed',
            payload: {
              source: 'participant_details',
            },
            createdAt: now,
          }])
        }
      } else {
        const { data, error } = await supabase
          .from('mvp_sessions')
          .insert({
            participant_name: participantName,
            participant_email: participantEmail,
            session_token_hash: tokenHash,
            current_phase: 'diagnostic_notice',
            status: 'active',
            instrumentation_version: MVP_INSTRUMENTATION_VERSION,
            last_active_at: now,
            highest_phase_reached: 'diagnostic_notice',
          })
          .select('id')
          .single()

        if (error || !data) {
          const isDuplicateEmail = error && typeof error === 'object' && 'code' in error && `${error.code}` === '23505'
          if (isDuplicateEmail) {
            const { data: retryExisting, error: retryError } = await supabase
              .from('mvp_sessions')
              .select('*')
              .eq('status', 'active')
              .ilike('participant_email', participantEmail)
              .maybeSingle()

            if (retryError || !retryExisting) {
              throw retryError || error
            }

            const { error: retryUpdateError } = await supabase
              .from('mvp_sessions')
              .update({
                participant_name: participantName,
                session_token_hash: tokenHash,
                last_active_at: now,
              })
              .eq('id', retryExisting.id)

            if (retryUpdateError) throw retryUpdateError
            sessionId = retryExisting.id
          } else {
            throw error || new Error('Could not create MVP session.')
          }
        } else {
          sessionId = data.id
          await insertEventLogs(supabase, sessionId, [{
            phase: 'diagnostic_notice',
            eventType: 'session_created',
            payload: {
              participantEmail,
            },
            createdAt: now,
          }])
        }
      }

      const snapshot = await loadSnapshot(supabase, sessionId)
      return json({ sessionToken: nextToken, snapshot })
    }

    if (!token) {
      return json({ error: 'Session token or participant details are required.' }, 400)
    }

    const session = await requireSessionByToken(supabase, token)
    const resumedAt = new Date().toISOString()
    await supabase
      .from('mvp_sessions')
      .update({ last_active_at: resumedAt })
      .eq('id', session.id)

    if (session.instrumentation_version === MVP_INSTRUMENTATION_VERSION) {
      await insertEventLogs(supabase, session.id, [{
        phase: session.current_phase,
        eventType: 'session_resumed',
        payload: {
          source: 'token',
        },
        createdAt: resumedAt,
      }])
    }

    const snapshot = await loadSnapshot(supabase, session.id)
    return json({ snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.'
    const status = message.toLowerCase().includes('token') ? 401 : 500
    return json({ error: message }, status)
  }
})
