import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import {
  createOpaqueToken,
  hashToken,
  loadSnapshot,
  mapSession,
  mapStudyConfig,
  MVP_V2_INSTRUMENTATION_VERSION,
  requireJsonBody,
} from '../_shared/mvp_v2.ts'

const chooseCondition = (guidedCount: number, controlCount: number) => {
  if (guidedCount === controlCount) {
    return Math.random() >= 0.5 ? 'guided_dynamic_map' : 'freeform_control'
  }
  return guidedCount < controlCount ? 'guided_dynamic_map' : 'freeform_control'
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const body = await requireJsonBody(request)
    const studyConfigId = typeof body.studyConfigId === 'string' ? body.studyConfigId : ''
    if (!studyConfigId) return json({ error: 'studyConfigId is required.' }, 400)

    const supabase = getServiceClient()
    const { data: studyConfig, error: configError } = await supabase
      .from('mvp_v2_study_configs')
      .select('*')
      .eq('id', studyConfigId)
      .single()

    if (configError || !studyConfig) throw configError || new Error('Study config not found.')

    const { data: sessions, error: countError } = await supabase
      .from('mvp_v2_sessions')
      .select('condition')
      .eq('study_config_id', studyConfigId)

    if (countError) throw countError

    const guidedCount = (sessions || []).filter((entry: any) => entry.condition === 'guided_dynamic_map').length
    const controlCount = (sessions || []).filter((entry: any) => entry.condition === 'freeform_control').length
    const condition = chooseCondition(guidedCount, controlCount)

    const now = new Date().toISOString()
    const sessionToken = createOpaqueToken()
    const tokenHash = await hashToken(sessionToken)

    const { data: session, error: insertError } = await supabase
      .from('mvp_v2_sessions')
      .insert({
        study_config_id: studyConfigId,
        session_token_hash: tokenHash,
        condition,
        phase: 'learning',
        status: 'active',
        started_at: now,
        time_budget_ms: studyConfig.time_budget_ms,
        instrumentation_version: MVP_V2_INSTRUMENTATION_VERSION,
        last_active_at: now,
      })
      .select('*')
      .single()

    if (insertError || !session) throw insertError || new Error('Could not create session.')

    const snapshot = await loadSnapshot(supabase, session.id)
    return json({
      sessionToken,
      snapshot: {
        ...snapshot,
        studyConfig: mapStudyConfig(studyConfig),
        session: {
          ...snapshot.session,
          ...mapSession(session),
        },
      },
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error.' }, 500)
  }
})

