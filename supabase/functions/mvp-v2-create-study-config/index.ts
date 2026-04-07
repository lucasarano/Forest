import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import { mapStudyConfig, requireAdminPassword, requireJsonBody } from '../_shared/mvp_v2.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const body = await requireJsonBody(request)
    requireAdminPassword(typeof body.password === 'string' ? body.password : '')

    const seedConcept = typeof body.seedConcept === 'string' ? body.seedConcept.trim() : ''
    const timeBudgetMs = Number.isFinite(body.timeBudgetMs) ? Number(body.timeBudgetMs) : 0
    const artifacts = body.artifacts && typeof body.artifacts === 'object' ? body.artifacts : null

    if (!seedConcept || !artifacts || !Array.isArray(artifacts.graphNodes)) {
      return json({ error: 'seedConcept and generated artifacts are required.' }, 400)
    }

    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('mvp_v2_study_configs')
      .insert({
        seed_concept: seedConcept,
        concept_summary: artifacts.conceptSummary || '',
        time_budget_ms: timeBudgetMs,
        planner_graph: artifacts.graphNodes,
        evaluation_bundle: artifacts.evaluationBundle || {},
      })
      .select('*')
      .single()

    if (error || !data) throw error || new Error('Could not create study config.')

    return json({
      studyConfigId: data.id,
      evaluationBundleId: `${data.id}:evaluation`,
      studyConfig: mapStudyConfig(data),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.'
    const status = message === 'Invalid admin password.' ? 401 : 500
    return json({ error: message }, status)
  }
})

