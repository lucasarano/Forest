// Pure aggregation helpers that turn tutor_sessions + tutor_events into
// teacher-facing analytics. No I/O, no Supabase — makes unit testing trivial.

const PHASE_ORDER = ['explanation', 'causality', 'transfer', 'recall']
const PASS_THRESHOLDS = { explanation: 0.7, causality: 0.7, transfer: 0.65, recall: 0.65 }

const safeNodes = (state) => (state && typeof state === 'object' ? state.nodes || {} : {})
const safeNum = (n, fallback = 0) => (Number.isFinite(n) ? n : fallback)
const round2 = (n) => Math.round(safeNum(n) * 100) / 100
const round1pct = (frac) => Math.round(safeNum(frac) * 1000) / 10

const isMastered = (node) => node?.status === 'mastered'
const isSkipped = (node) => node?.status === 'skipped'
const nodeAttempts = (node) => {
  const phases = node?.phases || {}
  return PHASE_ORDER.reduce((sum, ph) => sum + safeNum(phases[ph]?.attempts), 0)
}

const currentPhase = (state) => {
  if (!state) return 'unknown'
  if (state.status === 'completed' || state.completed) return 'completed'
  const nodes = safeNodes(state)
  const topNodeId = (state.stack || [])[state.stack?.length - 1]
  const topNode = topNodeId ? nodes[topNodeId] : null
  return topNode?.currentPhase || 'active'
}

const sessionMasteryRate = (state) => {
  const nodes = Object.values(safeNodes(state))
  if (nodes.length === 0) return 0
  const mastered = nodes.filter(isMastered).length
  return round1pct(mastered / nodes.length)
}

const countSpeechResponses = (events) =>
  (events || []).filter((e) => e.event_type === 'turn' && e?.payload?.decision?.via === 'speech').length

// tab_blur/tab_focus are not currently emitted; be defensive.
const computeTabAwayMs = (events) => {
  let away = 0
  let blurAt = null
  for (const ev of events || []) {
    if (ev.event_type === 'tab_blur') blurAt = new Date(ev.created_at).getTime()
    else if (ev.event_type === 'tab_focus' && blurAt) {
      away += new Date(ev.created_at).getTime() - blurAt
      blurAt = null
    }
  }
  return Math.max(0, away)
}

const truncate = (s, n = 120) => {
  const text = `${s || ''}`.trim()
  if (text.length <= n) return text
  return `${text.slice(0, n - 1)}…`
}

/* ── Public API: analytics rollup ─────────────────────────────── */

export const buildAnalytics = ({ sessions, concepts, eventsBySession }) => {
  const conceptTitles = new Map(concepts.map((c) => [c.id, c.title]))
  const total = sessions.length
  if (total === 0) {
    return {
      overview: { totalSessions: 0, completedCount: 0, completionRate: 0, avgMasteryRate: 0, avgTurns: 0, avgTabAwayMs: 0, avgSpeechResponses: 0, avgEvalScore: null },
      nodes: [],
      students: [],
      misconceptions: [],
      skipReasons: [],
    }
  }

  let completedCount = 0
  let sumMastery = 0
  let sumTurns = 0
  let sumTabAway = 0
  let sumSpeech = 0

  const students = []
  const nodeAgg = new Map() // nodeId → { title, sessions, mastered, skipped, sumAttempts }
  const miscCounts = new Map() // label → { count, nodeIds:Set }
  const skipReasonCounts = new Map()

  for (const s of sessions) {
    const state = s.state || {}
    const events = eventsBySession.get(s.id) || []
    const completed = state.status === 'completed' || state.completed === true
    if (completed) completedCount += 1

    const masteryRate = sessionMasteryRate(state)
    const turns = safeNum(state.turnIndex ?? s.turn_index)
    const tabAwayMs = computeTabAwayMs(events)
    const speechResponses = countSpeechResponses(events)

    sumMastery += masteryRate
    sumTurns += turns
    sumTabAway += tabAwayMs
    sumSpeech += speechResponses

    students.push({
      sessionId: s.id,
      studentName: s.student_name || '',
      conceptId: s.concept_id,
      conceptTitle: conceptTitles.get(s.concept_id) || '',
      phase: currentPhase(state),
      status: state.status || s.status || 'active',
      evalScore: null,
      masteryRate,
      turns,
      tabAwayMs,
      speechResponses,
      startedAt: state.startedAt || s.created_at,
      lastActiveAt: s.last_active_at || s.updated_at,
    })

    // Node rollup
    for (const node of Object.values(safeNodes(state))) {
      const agg = nodeAgg.get(node.id) || { nodeId: node.id, title: node.title || node.id, sessions: 0, mastered: 0, skipped: 0, sumAttempts: 0, misconceptions: new Map() }
      agg.sessions += 1
      if (isMastered(node)) agg.mastered += 1
      if (isSkipped(node)) agg.skipped += 1
      agg.sumAttempts += nodeAttempts(node)

      // Mine low-confidence evidence for this node
      for (const ph of Object.values(node.phases || {})) {
        for (const ev of ph.evidence || []) {
          const score = Number.isFinite(ev.score) ? ev.score : Number.isFinite(ev.confidence) ? ev.confidence : null
          if (score === null || score >= 0.5) continue
          const label = truncate(ev.rationale || ev.tag || 'Unclassified misconception')
          if (!label) continue
          const nodeBucket = agg.misconceptions.get(label) || 0
          agg.misconceptions.set(label, nodeBucket + 1)
          const global = miscCounts.get(label) || { count: 0, nodeIds: new Set() }
          global.count += 1
          global.nodeIds.add(node.id)
          miscCounts.set(label, global)
        }
      }

      nodeAgg.set(node.id, agg)
    }

    // Skip reasons — from events (subtopic_skipped, node_skipped_by_student) OR from skipped-node reasons.
    for (const ev of events) {
      if (ev.event_type === 'subtopic_skipped' || ev.event_type === 'node_skipped_by_student') {
        const reason = truncate(ev?.payload?.reason || ev?.payload?.title || 'Skipped subtopic')
        skipReasonCounts.set(reason, (skipReasonCounts.get(reason) || 0) + 1)
      }
    }
  }

  const nodes = [...nodeAgg.values()].map((a) => {
    let topMisconception = ''
    let topCount = 0
    for (const [label, count] of a.misconceptions.entries()) {
      if (count > topCount) { topCount = count; topMisconception = label }
    }
    return {
      nodeId: a.nodeId,
      title: a.title,
      sessionCount: a.sessions,
      masteryRate: round1pct(a.mastered / Math.max(1, a.sessions)),
      skippedCount: a.skipped,
      avgAttempts: round2(a.sumAttempts / Math.max(1, a.sessions)),
      topMisconception,
    }
  }).sort((a, b) => a.masteryRate - b.masteryRate)

  const misconceptions = [...miscCounts.entries()]
    .map(([label, { count, nodeIds }]) => ({ label, count, nodeIds: [...nodeIds] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  const skipReasons = [...skipReasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  const overview = {
    totalSessions: total,
    completedCount,
    completionRate: round1pct(completedCount / total),
    avgMasteryRate: round1pct(sumMastery / total / 100),
    avgTurns: Math.round((sumTurns / total) * 10) / 10,
    avgTabAwayMs: Math.round(sumTabAway / total),
    avgSpeechResponses: round2(sumSpeech / total),
    avgEvalScore: null,
  }

  return { overview, nodes, students, misconceptions, skipReasons }
}

/* ── Public API: session detail ───────────────────────────────── */

export const buildSessionDetail = ({ session, events, conceptTitle }) => {
  const state = session.state || {}
  const nodesIn = safeNodes(state)

  // Nodes array in traversal order: parents first via depth ascending, then createdAt.
  const nodes = Object.values(nodesIn)
    .sort((a, b) => safeNum(a.depth) - safeNum(b.depth) || (a.createdAt || '').localeCompare(b.createdAt || ''))
    .map((n) => ({
      id: n.id,
      title: n.title || n.id,
      status: n.status || 'active',
      depth: safeNum(n.depth),
      parentId: n.parentId || null,
      masteredAt: n.masteredAt || null,
      reason: n.reason || '',
      currentPhase: n.currentPhase || null,
      phases: Object.fromEntries(PHASE_ORDER.map((ph) => {
        const p = n.phases?.[ph] || {}
        return [ph, {
          phase: ph,
          state: p.state || 'locked',
          confidence: round2(p.confidence),
          attempts: safeNum(p.attempts),
          passes: safeNum(p.passes),
          reopenCount: safeNum(p.reopenCount),
          passedAt: p.passedAt || null,
          threshold: PASS_THRESHOLDS[ph],
        }]
      })),
      messages: (n.messages || []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        phase: m.phase || null,
        createdAt: m.createdAt,
      })),
    }))

  const nodeTitles = new Map(nodes.map((n) => [n.id, n.title]))

  // Confidence time series from phase_decision events
  const confidenceSeries = (events || [])
    .filter((e) => e.event_type === 'phase_decision' && Number.isFinite(e?.payload?.confidence))
    .map((e, idx) => ({
      turnIndex: safeNum(e.payload.turnIndex, idx + 1),
      createdAt: e.created_at,
      nodeId: e.payload.nodeId,
      nodeTitle: nodeTitles.get(e.payload.nodeId) || e.payload.nodeId,
      phase: e.payload.phase,
      confidence: round2(e.payload.confidence),
    }))

  const insights = buildInsights({ nodes, events, confidenceSeries })

  const nodeCount = nodes.length
  const masteredCount = nodes.filter((n) => n.status === 'mastered').length
  const sessionHeader = {
    id: session.id,
    conceptId: session.concept_id,
    conceptTitle: conceptTitle || '',
    studentName: session.student_name || '',
    status: state.status || session.status || 'active',
    startedAt: state.startedAt || session.created_at,
    lastActiveAt: session.last_active_at || session.updated_at,
    turns: safeNum(state.turnIndex ?? session.turn_index),
    masteryRate: round1pct(masteredCount / Math.max(1, nodeCount)),
    nodeCount,
    masteredCount,
    completed: state.status === 'completed' || state.completed === true,
  }

  return {
    session: sessionHeader,
    nodes,
    confidenceSeries,
    insights,
    events: (events || []).map((e) => ({ id: e.id, type: e.event_type, payload: e.payload, createdAt: e.created_at })),
  }
}

const buildInsights = ({ nodes, events, confidenceSeries }) => {
  const out = []
  // stuck_phase + repeated_reopens + fast_mastery
  for (const node of nodes) {
    for (const ph of PHASE_ORDER) {
      const p = node.phases[ph]
      if (!p) continue
      if (p.attempts >= 4 && p.confidence < 0.5 && p.state !== 'passed') {
        out.push({
          kind: 'stuck_phase',
          severity: 'critical',
          nodeId: node.id,
          phase: ph,
          summary: `Stuck on ${ph} in "${node.title}"`,
          detail: `${p.attempts} attempts, confidence ${p.confidence.toFixed(2)} — hasn't cleared ${PASS_THRESHOLDS[ph]}.`,
        })
      }
      if (p.reopenCount >= 2) {
        out.push({
          kind: 'repeated_reopens',
          severity: 'warn',
          nodeId: node.id,
          phase: ph,
          summary: `${ph} reopened ${p.reopenCount}× in "${node.title}"`,
          detail: `Regressions suggest shaky foundation.`,
        })
      }
    }
    if (node.status === 'mastered') {
      const attempts = PHASE_ORDER.reduce((sum, ph) => sum + (node.phases[ph]?.attempts || 0), 0)
      if (attempts <= 2) {
        out.push({
          kind: 'fast_mastery',
          severity: 'info',
          nodeId: node.id,
          summary: `Fast mastery: "${node.title}"`,
          detail: `Mastered in ${attempts} attempt(s).`,
        })
      }
    }
  }
  // long_tab_away
  let blurAt = null
  for (const ev of events || []) {
    if (ev.event_type === 'tab_blur') blurAt = new Date(ev.created_at).getTime()
    else if (ev.event_type === 'tab_focus' && blurAt) {
      const gap = new Date(ev.created_at).getTime() - blurAt
      if (gap > 60_000) {
        out.push({
          kind: 'long_tab_away',
          severity: 'warn',
          summary: `Tab hidden for ${Math.round(gap / 1000)}s`,
          detail: `Possible disengagement at ${new Date(blurAt).toLocaleTimeString()}.`,
        })
      }
      blurAt = null
    }
  }
  // skipped_node
  for (const ev of events || []) {
    if (ev.event_type === 'subtopic_skipped' || ev.event_type === 'node_skipped_by_student') {
      const title = ev?.payload?.title || ev?.payload?.nodeId || 'subtopic'
      out.push({
        kind: 'skipped_node',
        severity: 'info',
        summary: `Skipped "${title}"`,
        detail: ev?.payload?.blockedPhase ? `Blocked at ${ev.payload.blockedPhase}.` : '',
      })
    }
  }
  // low_confidence_streak
  const streakKey = (p) => `${p.nodeId}|${p.phase}`
  let currentKey = null
  let streak = 0
  for (const point of confidenceSeries) {
    const key = streakKey(point)
    if (key !== currentKey) { currentKey = key; streak = 0 }
    if (point.confidence < 0.4) streak += 1
    else streak = 0
    if (streak === 3) {
      out.push({
        kind: 'low_confidence_streak',
        severity: 'warn',
        nodeId: point.nodeId,
        phase: point.phase,
        summary: `3× low confidence on ${point.phase} in "${point.nodeTitle}"`,
        detail: `Last score ${point.confidence.toFixed(2)}.`,
      })
    }
  }
  return out
}
