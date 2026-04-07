import { corsHeaders, json } from '../_shared/cors.ts'
import { getServiceClient } from '../_shared/client.ts'
import { loadSnapshot, requireJsonBody, requireSessionByToken } from '../_shared/mvp_v2.ts'

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const body = await requireJsonBody(request)
    const token = typeof body.token === 'string' ? body.token : ''
    const snapshot = body.snapshot && typeof body.snapshot === 'object' ? body.snapshot : null

    if (!token || !snapshot?.session) return json({ error: 'token and snapshot are required.' }, 400)

    const supabase = getServiceClient()
    const existingSession = await requireSessionByToken(supabase, token)
    const session = snapshot.session
    const now = new Date().toISOString()

    const { error: sessionError } = await supabase
      .from('mvp_v2_sessions')
      .update({
        phase: session.phase,
        status: session.status,
        current_node_id: session.currentNodeId,
        turn_index: session.turnIndex || 0,
        learning_completed_at: session.learningCompletedAt,
        evaluation_completed_at: session.evaluationCompletedAt,
        survey_completed_at: session.surveyCompletedAt,
        time_budget_ms: session.timeBudgetMs,
        last_active_at: now,
      })
      .eq('id', existingSession.id)

    if (sessionError) throw sessionError

    const graphNodes = Array.isArray(session.graphNodes) ? session.graphNodes : []
    if (graphNodes.length) {
      const { error } = await supabase
        .from('mvp_v2_graph_nodes')
        .upsert(graphNodes.map((node: any) => ({
          session_id: existingSession.id,
          node_id: node.id,
          title: node.title,
          summary: node.summary || '',
          parent_ids: node.parentIds || [],
          depth: node.depth || 0,
          order_index: node.orderIndex || 0,
          status: node.status,
          prompt_kind: node.promptKind,
          support_level: node.supportLevel || 0,
          with_support_used: !!node.withSupportUsed,
          successful_recall_count: node.successfulRecallCount || 0,
          recall_scheduled_at_turn: node.recallScheduledAtTurn,
          best_scores: node.bestScores || {},
          misconception_streak: node.misconceptionStreak || 0,
          attempts: node.attempts || 0,
          last_assessment_summary: node.lastAssessmentSummary || '',
          rubric: node.rubric || {},
          prompt_pack: node.promptPack || {},
          is_root: !!node.isRoot,
        })), { onConflict: 'session_id,node_id' })

      if (error) throw error
    }

    const evidenceRecords = Array.isArray(session.evidenceRecords) ? session.evidenceRecords : []
    if (evidenceRecords.length) {
      const { error } = await supabase
        .from('mvp_v2_evidence_records')
        .upsert(evidenceRecords.map((entry: any) => ({
          session_id: existingSession.id,
          evidence_id: entry.id,
          node_id: entry.nodeId,
          turn_index: entry.turnIndex || 0,
          prompt_kind: entry.promptKind,
          scores: entry.scores || {},
          misconception_detected: !!entry.misconceptionDetected,
          misconception_label: entry.misconceptionLabel || '',
          misconception_reason: entry.misconceptionReason || '',
          missing_concepts: entry.missingConcepts || [],
          strengths: entry.strengths || [],
          rationale: entry.rationale || '',
          support_used: !!entry.supportUsed,
          created_at: entry.createdAt || now,
        })), { onConflict: 'session_id,evidence_id' })

      if (error) throw error
    }

    const messages = Array.isArray(session.messages) ? session.messages : []
    if (messages.length) {
      const { error } = await supabase
        .from('mvp_v2_messages')
        .upsert(messages.map((message: any) => ({
          session_id: existingSession.id,
          message_id: message.id,
          node_id: message.nodeId || null,
          role: message.role,
          content: message.content,
          visible_to_student: message.visibleToStudent !== false,
          metadata: message.metadata || {},
          created_at: message.createdAt || now,
        })), { onConflict: 'session_id,message_id' })

      if (error) throw error
    }

    const events = Array.isArray(session.events) ? session.events : []
    if (events.length) {
      const { error } = await supabase
        .from('mvp_v2_events')
        .upsert(events.map((event: any) => ({
          session_id: existingSession.id,
          event_id: event.id,
          event_type: event.type,
          payload: event.payload || {},
          created_at: event.createdAt || now,
        })), { onConflict: 'session_id,event_id' })

      if (error) throw error
    }

    const refreshed = await loadSnapshot(supabase, existingSession.id)
    return json({ success: true, snapshot: refreshed })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error.' }, 500)
  }
})

