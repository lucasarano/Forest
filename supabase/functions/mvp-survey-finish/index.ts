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

    if (!token) {
      return json({ error: 'Session token is required.' }, 400)
    }

    const betterExperience = typeof body.betterExperience === 'string' ? body.betterExperience : ''
    const clearerExplanations = typeof body.clearerExplanations === 'string' ? body.clearerExplanations : ''
    const preferredModerateTopic = typeof body.preferredModerateTopic === 'string' ? body.preferredModerateTopic : ''
    const comment = typeof body.comment === 'string' ? body.comment : ''
    const clarityRating = Number.isFinite(body.clarityRating) ? body.clarityRating : null
    const engagementRating = Number.isFinite(body.engagementRating) ? body.engagementRating : null
    const effectivenessRating = Number.isFinite(body.effectivenessRating) ? body.effectivenessRating : null
    const guidedUsefulness = Number.isFinite(body.guidedUsefulness) ? body.guidedUsefulness : null
    const freeformUsefulness = Number.isFinite(body.freeformUsefulness) ? body.freeformUsefulness : null
    const clearerSystem = typeof body.clearerSystem === 'string' ? body.clearerSystem : ''
    const preferredSystem = typeof body.preferredSystem === 'string' ? body.preferredSystem : ''
    const positiveAspectGuided = typeof body.positiveAspectGuided === 'string' ? body.positiveAspectGuided : ''
    const positiveAspectFreeform = typeof body.positiveAspectFreeform === 'string' ? body.positiveAspectFreeform : ''

    if (
      !betterExperience ||
      !clearerExplanations ||
      !preferredModerateTopic ||
      !clarityRating ||
      !engagementRating ||
      !effectivenessRating ||
      !guidedUsefulness ||
      !freeformUsefulness ||
      !clearerSystem ||
      !preferredSystem ||
      !positiveAspectGuided.trim() ||
      !positiveAspectFreeform.trim()
    ) {
      return json({ error: 'All required survey fields must be completed.' }, 400)
    }

    const supabase = getServiceClient()
    const session = await requireSessionByToken(supabase, token)
    const completedAt = new Date().toISOString()

    const { error: surveyError } = await supabase
      .from('mvp_survey_responses')
      .upsert({
        session_id: session.id,
        better_experience: betterExperience,
        clearer_explanations: clearerExplanations,
        preferred_moderate_topic: preferredModerateTopic,
        comment,
        clarity_rating: clarityRating,
        engagement_rating: engagementRating,
        effectiveness_rating: effectivenessRating,
        guided_usefulness: guidedUsefulness,
        freeform_usefulness: freeformUsefulness,
        clearer_system: clearerSystem,
        preferred_system: preferredSystem,
        positive_aspect_guided: positiveAspectGuided.trim(),
        positive_aspect_freeform: positiveAspectFreeform.trim(),
      }, { onConflict: 'session_id' })

    if (surveyError) throw surveyError

    const { error: sessionError } = await supabase
      .from('mvp_sessions')
      .update({
        current_phase: 'summary',
        status: 'completed',
        survey_completed_at: completedAt,
        instrumentation_version: session.instrumentation_version || MVP_INSTRUMENTATION_VERSION,
        highest_phase_reached: getHigherPhase(session.highest_phase_reached || session.current_phase, 'summary'),
        completion_reason: 'completed_full_flow',
        last_active_at: completedAt,
      })
      .eq('id', session.id)

    if (sessionError) throw sessionError

    await insertEventLogs(supabase, session.id, [
      {
        phase: 'survey',
        eventType: 'survey_submitted',
        payload: {
          betterExperience,
          clearerExplanations,
          preferredModerateTopic,
          clarityRating,
          engagementRating,
          effectivenessRating,
          guidedUsefulness,
          freeformUsefulness,
          clearerSystem,
          preferredSystem,
        },
        createdAt: completedAt,
      },
      {
        phase: 'summary',
        eventType: 'mvp_completed',
        payload: {
          status: 'completed',
        },
        createdAt: completedAt,
      },
    ])

    return json({ success: true, completedAt })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error.' }, 500)
  }
})
