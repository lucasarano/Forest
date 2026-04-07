import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { z } from 'zod'
import {
  createEmptyDimensionScores,
  EVALUATION_PROMPT_IDS,
  isMasteredNodeState,
  MAX_VISIBLE_HISTORY,
  NODE_STATES,
  PROMPT_KINDS,
  SPRINT4_CONDITIONS,
  SPRINT4_INSTRUMENTATION_VERSION,
  SPRINT4_PHASES,
} from './constants.js'
import { callStructuredPrompt, callTextPrompt } from './ai.js'

const ScoreSchema = z.number().int().min(0).max(2)

const PromptPackSchema = z.object({
  initial: z.string().min(1),
  teach: z.string().min(1),
  reassess: z.string().min(1),
  transfer: z.string().min(1),
  recall: z.string().min(1),
})

const RubricSchema = z.object({
  explanationFocus: z.string().min(1),
  causalReasoningFocus: z.string().min(1),
  transferFocus: z.string().min(1),
  misconceptionTargets: z.array(z.string()).min(1).max(6),
  recallCue: z.string().min(1),
})

const PlannerNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  parentIds: z.array(z.string()).default([]),
  isRoot: z.boolean().optional().default(false),
  rubric: RubricSchema,
  promptPack: PromptPackSchema,
})

const PlannerConfigSchema = z.object({
  conceptSummary: z.string().min(1),
  rootNodeId: z.string().min(1),
  nodes: z.array(PlannerNodeSchema).min(4).max(8),
  evaluationBundle: z.object({
    prompts: z.array(z.object({
      id: z.enum([
        EVALUATION_PROMPT_IDS.EXPLANATION,
        EVALUATION_PROMPT_IDS.TRANSFER,
        EVALUATION_PROMPT_IDS.MISCONCEPTION,
      ]),
      title: z.string().min(1),
      prompt: z.string().min(1),
    })).length(3),
    scoringNotes: z.array(z.string()).min(3).max(8),
  }),
})

const AssessmentSchema = z.object({
  explanation: ScoreSchema,
  causalReasoning: ScoreSchema,
  transfer: ScoreSchema,
  misconceptionResistance: ScoreSchema,
  misconceptionDetected: z.boolean(),
  misconceptionLabel: z.string().default(''),
  misconceptionReason: z.string().default(''),
  missingConcepts: z.array(z.string()).max(6).default([]),
  strengths: z.array(z.string()).max(6).default([]),
  recommendedAction: z.enum([
    PROMPT_KINDS.TEACH,
    PROMPT_KINDS.REASSESS,
    PROMPT_KINDS.TRANSFER,
    PROMPT_KINDS.RECALL,
    'mark_partial',
    'mark_mastered',
  ]),
  conciseRationale: z.string().min(1),
  tutorFocus: z.string().min(1),
  confidence: z.number().min(0).max(1),
})

const ExpansionSchema = z.object({
  reason: z.string().min(1),
  newNodes: z.array(PlannerNodeSchema).min(1).max(3),
  retargetNodeId: z.string().optional().default(''),
})

const EvaluationScoreSchema = z.object({
  answers: z.array(z.object({
    promptId: z.string().min(1),
    score: ScoreSchema,
    rationale: z.string().min(1),
    strengths: z.array(z.string()).max(4).default([]),
    gaps: z.array(z.string()).max(4).default([]),
  })).length(3),
  overallScore: z.number().min(0).max(6),
  summary: z.string().min(1),
})

const TurnState = Annotation.Root({
  seedConcept: Annotation({
    reducer: (_, value) => value,
    default: () => '',
  }),
  session: Annotation({
    reducer: (_, value) => value,
    default: () => null,
  }),
  activeNode: Annotation({
    reducer: (_, value) => value,
    default: () => null,
  }),
  userMessage: Annotation({
    reducer: (_, value) => value,
    default: () => '',
  }),
  helpRequested: Annotation({
    reducer: (_, value) => value,
    default: () => false,
  }),
  latestAssessment: Annotation({
    reducer: (_, value) => value,
    default: () => null,
  }),
  decision: Annotation({
    reducer: (_, value) => value,
    default: () => null,
  }),
  plannerPatch: Annotation({
    reducer: (_, value) => value,
    default: () => null,
  }),
  tutorMessage: Annotation({
    reducer: (_, value) => value,
    default: () => null,
  }),
  updatedSession: Annotation({
    reducer: (_, value) => value,
    default: () => null,
  }),
})

const slugify = (value) =>
  `${value || 'node'}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'node'

const createId = (prefix) => `${prefix}_${crypto.randomUUID()}`

const dedupe = (values) => [...new Set((values || []).filter(Boolean))]

const sortNodes = (nodes) =>
  [...nodes].sort((left, right) => {
    const depthDiff = (left.depth || 0) - (right.depth || 0)
    if (depthDiff !== 0) return depthDiff
    return (left.orderIndex || 0) - (right.orderIndex || 0)
  })

const computeDepth = (nodeId, nodeMap, cache = new Map(), trail = new Set()) => {
  if (cache.has(nodeId)) return cache.get(nodeId)
  if (trail.has(nodeId)) return 0

  const node = nodeMap.get(nodeId)
  if (!node) return 0

  const nextTrail = new Set(trail)
  nextTrail.add(nodeId)
  const parentDepth = (node.parentIds || []).reduce((maxDepth, parentId) => {
    const candidate = computeDepth(parentId, nodeMap, cache, nextTrail) + 1
    return Math.max(maxDepth, candidate)
  }, 0)
  cache.set(nodeId, parentDepth)
  return parentDepth
}

const normalizePlannerNodes = (plannerOutput) => {
  const rawNodes = plannerOutput.nodes || []
  const idMap = new Map()
  const normalized = rawNodes.map((node, index) => {
    const baseId = slugify(node.id || node.title)
    const uniqueId = idMap.has(baseId) ? `${baseId}-${index + 1}` : baseId
    idMap.set(baseId, uniqueId)
    return {
      id: uniqueId,
      title: node.title.trim(),
      summary: node.summary.trim(),
      parentIds: node.parentIds || [],
      isRoot: !!node.isRoot,
      rubric: node.rubric,
      promptPack: node.promptPack,
      orderIndex: index,
    }
  })

  const titleToId = new Map(normalized.map((node) => [slugify(node.title), node.id]))
  const nodeIds = new Set(normalized.map((node) => node.id))

  normalized.forEach((node) => {
    node.parentIds = dedupe((node.parentIds || []).map((parentId) => {
      const normalizedParentId = slugify(parentId)
      if (nodeIds.has(normalizedParentId)) return normalizedParentId
      return titleToId.get(normalizedParentId) || null
    }).filter((parentId) => parentId && parentId !== node.id))
  })

  const explicitRoot = normalized.find((node) => node.id === slugify(plannerOutput.rootNodeId)) ||
    normalized.find((node) => node.isRoot) ||
    normalized[normalized.length - 1]

  const nodeMap = new Map(normalized.map((node) => [node.id, node]))
  const depthCache = new Map()

  normalized.forEach((node) => {
    node.depth = computeDepth(node.id, nodeMap, depthCache)
  })

  if (explicitRoot && explicitRoot.parentIds.length === 0 && normalized.length > 1) {
    const prerequisiteIds = normalized
      .filter((node) => node.id !== explicitRoot.id && node.depth <= explicitRoot.depth)
      .slice(0, Math.min(3, normalized.length - 1))
      .map((node) => node.id)
    explicitRoot.parentIds = prerequisiteIds
    explicitRoot.depth = computeDepth(explicitRoot.id, nodeMap, new Map())
  }

  return sortNodes(normalized).map((node, index) => ({
    ...node,
    orderIndex: index,
    status: node.parentIds.length === 0 ? NODE_STATES.ACTIVE : NODE_STATES.LOCKED,
    promptKind: PROMPT_KINDS.ASSESS,
    supportLevel: 0,
    withSupportUsed: false,
    successfulRecallCount: 0,
    recallScheduledAtTurn: null,
    bestScores: createEmptyDimensionScores(),
    misconceptionStreak: 0,
    attempts: 0,
    lastAssessmentSummary: '',
  }))
}

const createPlannerPrompt = (seedConcept) => `
Seed concept: ${seedConcept}

Create an initial diagnostic mastery graph for a single learning session.

Rules:
- Return 4 to 8 concept-specific nodes generated from the seed concept.
- Include one integrator/root node that depends on prerequisite subskills.
- parentIds point from a node to the prerequisite nodes it depends on.
- Make subskills diagnostically useful, not just broad topics.
- Misconceptions must be plausible wrong ideas, not trivial mistakes.
- Do not include any hardcoded content unrelated to the seed concept.

Return JSON matching this exact structure:
{
  "conceptSummary": "<one-sentence overview of the seed concept>",
  "rootNodeId": "<id of the integrator node>",
  "nodes": [
    {
      "id": "<kebab-case-id>",
      "title": "<short title>",
      "summary": "<1-2 sentence description>",
      "parentIds": ["<id of prerequisite node>"],
      "isRoot": false,
      "rubric": {
        "explanationFocus": "<what a good explanation should cover for this node>",
        "causalReasoningFocus": "<what cause-effect reasoning to look for>",
        "transferFocus": "<how the learner should apply this to a new context>",
        "misconceptionTargets": ["<plausible misconception 1>", "<plausible misconception 2>"],
        "recallCue": "<short cue to trigger recall of this concept later>"
      },
      "promptPack": {
        "initial": "<the first assessment question posed to the learner for this node>",
        "teach": "<a targeted teaching prompt when the learner struggles>",
        "reassess": "<a follow-up assessment question after teaching>",
        "transfer": "<a transfer question applying the concept to a novel scenario>",
        "recall": "<a spaced-recall prompt to test retention later>"
      }
    }
  ],
  "evaluationBundle": {
    "prompts": [
      { "id": "explanation", "title": "<title>", "prompt": "<open-ended explanation question>" },
      { "id": "transfer", "title": "<title>", "prompt": "<transfer/application question>" },
      { "id": "misconception", "title": "<title>", "prompt": "<question probing a common misconception>" }
    ],
    "scoringNotes": ["<scoring guideline 1>", "<scoring guideline 2>", "<scoring guideline 3>"]
  }
}

Every field shown above is required. Do not omit any.
`

const createAssessmentPrompt = ({ seedConcept, node, recentMessages, userMessage, helpRequested }) => `
Seed concept: ${seedConcept}
Current node title: ${node.title}
Current node summary: ${node.summary}
Current prompt kind: ${node.promptKind}
Node rubric:
- Explanation focus: ${node.rubric.explanationFocus}
- Causal reasoning focus: ${node.rubric.causalReasoningFocus}
- Transfer focus: ${node.rubric.transferFocus}
- Recall cue: ${node.rubric.recallCue}
- Target misconceptions: ${(node.rubric.misconceptionTargets || []).join('; ')}

Recent conversation for this node:
${recentMessages || 'No prior node conversation.'}

Latest learner response:
${userMessage || '(blank)'}

Help requested: ${helpRequested ? 'yes' : 'no'}

Score the learner's latest response only. Use 0 = absent/incorrect, 1 = partial, 2 = strong.
`

const createExpansionPrompt = ({ seedConcept, node, latestAssessment }) => `
Seed concept: ${seedConcept}
Node needing expansion:
- title: ${node.title}
- summary: ${node.summary}
- misconception targets: ${(node.rubric.misconceptionTargets || []).join('; ')}

Latest assessment:
- misconception detected: ${latestAssessment?.misconceptionDetected ? 'yes' : 'no'}
- misconception label: ${latestAssessment?.misconceptionLabel || ''}
- rationale: ${latestAssessment?.conciseRationale || ''}
- missing concepts: ${(latestAssessment?.missingConcepts || []).join('; ')}

Generate 1 to 3 new prerequisite nodes that would help remediate this gap.
These new nodes will become prerequisites of the current node.
`

const createGuidedTutorPrompt = ({
  seedConcept,
  node,
  decision,
  assessment,
  recentMessages,
}) => `
You are Forest's student-facing tutor for a guided diagnostic learning session.

Seed concept: ${seedConcept}
Current node: ${node.title}
Node summary: ${node.summary}
Node prompt kind: ${node.promptKind}
Decision action: ${decision.nextAction}
Assessment rationale: ${assessment?.conciseRationale || ''}
Assessment gaps: ${(assessment?.missingConcepts || []).join('; ') || 'none'}
Assessment strengths: ${(assessment?.strengths || []).join('; ') || 'none'}
Misconception status: ${assessment?.misconceptionDetected ? `${assessment?.misconceptionLabel}: ${assessment?.misconceptionReason}` : 'none'}
Recent conversation:
${recentMessages || 'No prior conversation.'}

Behavior rules:
- Speak directly to the learner.
- Keep the response concise and high-signal.
- If teaching, give targeted help, not a full lecture.
- End with exactly one focused next question unless the session is wrapping up.
- Do not mention internal scores, nodes, rubric dimensions, or mastery logic.
- If the node was just mastered, acknowledge progress briefly and steer to the next useful prompt.
`

const createControlTutorSystemPrompt = (seedConcept) => `You are a helpful tutor for the concept "${seedConcept}".

Rules:
- Teach conversationally.
- Answer the learner directly.
- Use short sections and concrete examples when helpful.
- Do not mention maps, mastery, nodes, hidden rubrics, or assessment logic.
- Stay focused on the seed concept unless the learner explicitly changes scope.
`

const createEvaluationPrompt = ({ seedConcept, evaluationBundle, answers }) => `
Seed concept: ${seedConcept}

External evaluation prompts and student answers:
${evaluationBundle.prompts.map((prompt) => {
    const answer = answers.find((entry) => entry.promptId === prompt.id)?.answer || ''
    return [
      `Prompt ID: ${prompt.id}`,
      `Prompt title: ${prompt.title}`,
      `Prompt: ${prompt.prompt}`,
      `Answer: ${answer || '(blank)'}`,
    ].join('\n')
  }).join('\n\n')}

Scoring notes:
${(evaluationBundle.scoringNotes || []).map((note, index) => `${index + 1}. ${note}`).join('\n')}

Score each answer from 0 to 2. Evaluate only from these answers. Do not use any internal session evidence.
`

const formatRecentMessages = (messages, nodeId) => messages
  .filter((message) => (message.nodeId || '') === nodeId)
  .slice(-MAX_VISIBLE_HISTORY)
  .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
  .join('\n')

const getNodeMap = (graphNodes) => new Map((graphNodes || []).map((node) => [node.id, node]))

const getNodeEvidence = (evidenceRecords, nodeId) =>
  (evidenceRecords || []).filter((entry) => entry.nodeId === nodeId)

const getBestScores = (node, evidenceRecords) => {
  const nodeEvidence = getNodeEvidence(evidenceRecords, node.id)
  return nodeEvidence.reduce((scores, evidence) => ({
    explanation: Math.max(scores.explanation, evidence.scores?.explanation || 0),
    causalReasoning: Math.max(scores.causalReasoning, evidence.scores?.causalReasoning || 0),
    transfer: Math.max(scores.transfer, evidence.scores?.transfer || 0),
    misconceptionResistance: Math.max(scores.misconceptionResistance, evidence.scores?.misconceptionResistance || 0),
  }), createEmptyDimensionScores())
}

const isNodeAvailable = (node, nodeMap) => (node.parentIds || []).every((parentId) => {
  const parent = nodeMap.get(parentId)
  return parent && isMasteredNodeState(parent.status)
})

const getNextEligibleNode = (session, preferredNodeId = '') => {
  const nodeMap = getNodeMap(session.graphNodes)
  const sorted = sortNodes(session.graphNodes || [])
  if (preferredNodeId) {
    const preferred = nodeMap.get(preferredNodeId)
    if (preferred && preferred.status !== NODE_STATES.LOCKED) return preferred
  }

  const dueRecallNode = sorted.find((node) =>
    !isMasteredNodeState(node.status) &&
    typeof node.recallScheduledAtTurn === 'number' &&
    session.turnIndex > node.recallScheduledAtTurn &&
    node.id !== session.currentNodeId
  )
  if (dueRecallNode && isNodeAvailable(dueRecallNode, nodeMap)) {
    return dueRecallNode
  }

  const activeNode = sorted.find((node) =>
    (node.status === NODE_STATES.ACTIVE || node.status === NODE_STATES.PARTIAL) &&
    isNodeAvailable(node, nodeMap)
  )
  if (activeNode) return activeNode

  const lockedRoot = sorted.find((node) => node.status === NODE_STATES.LOCKED && isNodeAvailable(node, nodeMap))
  return lockedRoot || null
}

const getAlternativeEligibleNode = (session, excludedNodeId) => {
  const nodeMap = getNodeMap(session.graphNodes)
  return sortNodes(session.graphNodes || []).find((node) =>
    node.id !== excludedNodeId &&
    !isMasteredNodeState(node.status) &&
    isNodeAvailable(node, nodeMap) &&
    (node.status === NODE_STATES.ACTIVE || node.status === NODE_STATES.PARTIAL)
  ) || null
}

const markDependentAvailability = (graphNodes) => {
  const nodeMap = getNodeMap(graphNodes)
  return sortNodes(graphNodes).map((node) => {
    if (isMasteredNodeState(node.status)) return node
    if (isNodeAvailable(node, nodeMap)) {
      return {
        ...node,
        status: node.status === NODE_STATES.LOCKED ? NODE_STATES.ACTIVE : node.status,
      }
    }
    return {
      ...node,
      status: node.status === NODE_STATES.ACTIVE || node.status === NODE_STATES.PARTIAL
        ? NODE_STATES.LOCKED
        : node.status,
    }
  })
}

const createMessage = ({ role, content, nodeId = null, visibleToStudent = true, metadata = {} }) => ({
  id: createId('s4msg'),
  role,
  content,
  nodeId,
  visibleToStudent,
  metadata,
  createdAt: new Date().toISOString(),
})

const createEvent = (type, payload = {}) => ({
  id: createId('s4evt'),
  type,
  payload,
  createdAt: new Date().toISOString(),
})

const createEvidence = ({ nodeId, turnIndex, promptKind, assessment, supportUsed }) => ({
  id: createId('s4ev'),
  nodeId,
  turnIndex,
  promptKind,
  scores: {
    explanation: assessment.explanation,
    causalReasoning: assessment.causalReasoning,
    transfer: assessment.transfer,
    misconceptionResistance: assessment.misconceptionResistance,
  },
  misconceptionDetected: assessment.misconceptionDetected,
  misconceptionLabel: assessment.misconceptionLabel || '',
  misconceptionReason: assessment.misconceptionReason || '',
  missingConcepts: assessment.missingConcepts || [],
  strengths: assessment.strengths || [],
  rationale: assessment.conciseRationale,
  supportUsed: !!supportUsed,
  createdAt: new Date().toISOString(),
})

const getNodeMasteryState = (node, evidenceRecords) => {
  const bestScores = getBestScores(node, evidenceRecords)
  const thresholdMet =
    bestScores.explanation >= 2 &&
    bestScores.causalReasoning >= 2 &&
    bestScores.transfer >= 1 &&
    bestScores.misconceptionResistance >= 1 &&
    (node.successfulRecallCount || 0) >= 2

  if (!thresholdMet) return null
  return node.withSupportUsed ? NODE_STATES.MASTERED_WITH_SUPPORT : NODE_STATES.MASTERED_INDEPENDENTLY
}

const createFallbackAssessment = (helpRequested) => ({
  explanation: 0,
  causalReasoning: 0,
  transfer: 0,
  misconceptionResistance: 0,
  misconceptionDetected: false,
  misconceptionLabel: '',
  misconceptionReason: '',
  missingConcepts: ['The learner needs a more specific explanation.'],
  strengths: [],
  recommendedAction: helpRequested ? PROMPT_KINDS.TEACH : PROMPT_KINDS.REASSESS,
  conciseRationale: helpRequested
    ? 'The learner explicitly asked for help before producing enough evidence.'
    : 'The latest response did not contain enough substance to score strongly.',
  tutorFocus: helpRequested
    ? 'Give one small conceptual foothold and ask a narrower follow-up.'
    : 'Request a more concrete explanation tied to the node focus.',
  confidence: 0.15,
})

const decideNextAction = ({ node, assessment, session, evidenceRecords }) => {
  const nodeEvidence = getNodeEvidence(evidenceRecords, node.id)
  const priorMisconceptionCount = nodeEvidence
    .slice(-2)
    .filter((entry) => entry.misconceptionDetected)
    .length

  const next = {
    nextAction: PROMPT_KINDS.REASSESS,
    markState: null,
    scheduleRecall: false,
    activateNodeId: node.id,
    reason: assessment.conciseRationale,
  }

  if (assessment.misconceptionDetected && priorMisconceptionCount >= 2) {
    next.nextAction = 'expand_graph'
    return next
  }

  const bestScores = getBestScores(node, evidenceRecords)
  const hasStrongCore = bestScores.explanation >= 2 && bestScores.causalReasoning >= 2
  const hasTransfer = bestScores.transfer >= 1

  if (node.promptKind === PROMPT_KINDS.RECALL) {
    if (assessment.explanation >= 2 && assessment.causalReasoning >= 1) {
      next.scheduleRecall = false
    }
  }

  if (assessment.misconceptionDetected) {
    next.nextAction = PROMPT_KINDS.TEACH
    return next
  }

  if (assessment.explanation === 0 || assessment.causalReasoning === 0 || session.helpRequested) {
    next.nextAction = PROMPT_KINDS.TEACH
    return next
  }

  if (!hasStrongCore) {
    next.nextAction = PROMPT_KINDS.REASSESS
    next.markState = NODE_STATES.PARTIAL
    return next
  }

  if (!hasTransfer) {
    next.nextAction = PROMPT_KINDS.TRANSFER
    next.markState = NODE_STATES.PARTIAL
    return next
  }

  if ((node.successfulRecallCount || 0) < 2) {
    next.nextAction = PROMPT_KINDS.RECALL
    next.markState = NODE_STATES.PARTIAL
    next.scheduleRecall = true
    return next
  }

  next.nextAction = 'mark_mastered'
  next.markState = node.withSupportUsed ? NODE_STATES.MASTERED_WITH_SUPPORT : NODE_STATES.MASTERED_INDEPENDENTLY
  return next
}

const plannerNode = async (state) => {
  const { session, activeNode, latestAssessment, seedConcept } = state
  const expansion = await callStructuredPrompt({
    systemPrompt: 'You are Forest Sprint 4 ConceptPlanner. Return structured JSON only.',
    userPrompt: createExpansionPrompt({
      seedConcept,
      node: activeNode,
      latestAssessment,
    }),
    schema: ExpansionSchema,
  })

  const normalizedNewNodes = normalizePlannerNodes({
    nodes: expansion.newNodes,
    rootNodeId: expansion.retargetNodeId || activeNode.id,
  }).map((node, index) => ({
    ...node,
    status: node.parentIds.length === 0 ? NODE_STATES.ACTIVE : NODE_STATES.LOCKED,
    orderIndex: (session.graphNodes?.length || 0) + index,
  }))

  return {
    plannerPatch: {
      reason: expansion.reason,
      newNodes: normalizedNewNodes,
    },
  }
}

const assessmentNode = async (state) => {
  const { session, activeNode, userMessage, helpRequested, seedConcept } = state
  if (!userMessage.trim()) {
    return {
      latestAssessment: createFallbackAssessment(helpRequested),
    }
  }

  const assessment = await callStructuredPrompt({
    systemPrompt: 'You are Forest Sprint 4 Assessment. Return strict JSON only. Do not speak to the student.',
    userPrompt: createAssessmentPrompt({
      seedConcept,
      node: activeNode,
      recentMessages: formatRecentMessages(session.messages || [], activeNode.id),
      userMessage,
      helpRequested,
    }),
    schema: AssessmentSchema,
  })

  return { latestAssessment: assessment }
}

const decisionNode = async (state) => {
  const { session, activeNode, latestAssessment } = state
  return {
    decision: decideNextAction({
      node: activeNode,
      assessment: latestAssessment,
      session,
      evidenceRecords: session.evidenceRecords || [],
    }),
  }
}

const tutorNode = async (state) => {
  const { seedConcept, session, activeNode, latestAssessment, decision, plannerPatch, userMessage, helpRequested } = state
  const currentTurn = (session.turnIndex || 0) + 1
  const userMessageEntry = createMessage({
    role: 'user',
    content: userMessage.trim() || (helpRequested ? "I'm stuck." : ''),
    nodeId: activeNode?.id || null,
  })

  let graphNodes = [...(session.graphNodes || [])]
  const events = [createEvent('turn_submitted', {
    nodeId: activeNode?.id || null,
    helpRequested: !!helpRequested,
    condition: session.condition,
  })]

  if (plannerPatch?.newNodes?.length) {
    graphNodes = graphNodes.map((node) => (
      node.id === activeNode.id
        ? {
            ...node,
            parentIds: dedupe([...(node.parentIds || []), ...plannerPatch.newNodes.map((entry) => entry.id)]),
            status: NODE_STATES.LOCKED,
          }
        : node
    ))
    graphNodes.push(...plannerPatch.newNodes)
    events.push(createEvent('graph_expanded', {
      sourceNodeId: activeNode.id,
      newNodeIds: plannerPatch.newNodes.map((node) => node.id),
      reason: plannerPatch.reason,
    }))
  }

  const nodeMap = getNodeMap(graphNodes)
  const currentNode = nodeMap.get(activeNode.id) || activeNode
  const supportUsed = helpRequested || currentNode.promptKind === PROMPT_KINDS.TEACH || decision.nextAction === PROMPT_KINDS.TEACH
  const evidenceRecord = createEvidence({
    nodeId: currentNode.id,
    turnIndex: currentTurn,
    promptKind: currentNode.promptKind,
    assessment: latestAssessment,
    supportUsed,
  })
  const evidenceRecords = [...(session.evidenceRecords || []), evidenceRecord]

  const nextNodeState = {
    ...currentNode,
    attempts: (currentNode.attempts || 0) + 1,
    supportLevel: helpRequested ? (currentNode.supportLevel || 0) + 1 : currentNode.supportLevel || 0,
    withSupportUsed: currentNode.withSupportUsed || supportUsed,
    bestScores: getBestScores(currentNode, evidenceRecords),
    lastAssessmentSummary: latestAssessment.conciseRationale,
    promptKind: decision.nextAction === 'mark_mastered'
      ? PROMPT_KINDS.RECALL
      : decision.nextAction,
  }

  if (currentNode.promptKind === PROMPT_KINDS.RECALL && latestAssessment.explanation >= 2 && latestAssessment.causalReasoning >= 1) {
    nextNodeState.successfulRecallCount = (currentNode.successfulRecallCount || 0) + 1
    nextNodeState.recallScheduledAtTurn = null
    events.push(createEvent('recall_success', {
      nodeId: currentNode.id,
      successfulRecallCount: nextNodeState.successfulRecallCount,
    }))
  } else {
    nextNodeState.successfulRecallCount = currentNode.successfulRecallCount || 0
  }

  if (decision.nextAction === PROMPT_KINDS.RECALL) {
    nextNodeState.recallScheduledAtTurn = currentTurn
  }

  if (decision.markState === NODE_STATES.PARTIAL) {
    nextNodeState.status = NODE_STATES.PARTIAL
  }

  const masteryState = decision.nextAction === 'mark_mastered'
    ? getNodeMasteryState(nextNodeState, evidenceRecords) || decision.markState
    : null

  if (masteryState) {
    nextNodeState.status = masteryState
    events.push(createEvent('node_mastered', {
      nodeId: currentNode.id,
      status: masteryState,
    }))
  }

  graphNodes = graphNodes.map((node) => (node.id === nextNodeState.id ? nextNodeState : node))
  graphNodes = markDependentAvailability(graphNodes)

  let nextActiveNode = getNextEligibleNode({
    ...session,
    graphNodes,
    evidenceRecords,
    turnIndex: currentTurn,
    currentNodeId: nextNodeState.id,
  }, nextNodeState.id)

  if (decision.nextAction === PROMPT_KINDS.RECALL) {
    nextActiveNode = getAlternativeEligibleNode({
      ...session,
      graphNodes,
    }, nextNodeState.id) || nextActiveNode
  }

  if (isMasteredNodeState(nextNodeState.status)) {
    nextActiveNode = getNextEligibleNode({
      ...session,
      graphNodes,
      evidenceRecords,
      turnIndex: currentTurn,
      currentNodeId: nextNodeState.id,
    })
  }

  const nextNode = nextActiveNode || nextNodeState
  const recentMessages = formatRecentMessages(session.messages || [], nextNode.id)

  const tutorContent = await callTextPrompt({
    systemPrompt: createGuidedTutorPrompt({
      seedConcept,
      node: nextNode,
      decision,
      assessment: latestAssessment,
      recentMessages,
    }),
    messages: [{
      role: 'user',
      content: [
        `Decision action: ${decision.nextAction}`,
        `Use this node prompt when appropriate: ${nextNode.promptPack?.[nextNode.promptKind] || nextNode.promptPack?.initial || nextNode.summary}`,
        `If the learner just mastered a previous node, transition naturally into this next focus: ${nextNode.title}`,
      ].join('\n'),
    }],
    temperature: 0.45,
    maxCompletionTokens: 900,
  })

  const tutorMessage = createMessage({
    role: 'assistant',
    content: tutorContent,
    nodeId: nextNode.id,
    metadata: {
      promptKind: nextNode.promptKind,
      fromDecision: decision.nextAction,
    },
  })

  const rootNode = sortNodes(graphNodes)[graphNodes.length - 1]
  const learningCompleted = !!rootNode && isMasteredNodeState(rootNode.status)

  const updatedSession = {
    ...session,
    currentNodeId: nextNode.id,
    graphNodes,
    evidenceRecords,
    messages: [
      ...(session.messages || []),
      ...(userMessageEntry.content ? [userMessageEntry] : []),
      tutorMessage,
    ],
    events: [
      ...(session.events || []),
      ...events,
    ],
    turnIndex: currentTurn,
    phase: learningCompleted ? SPRINT4_PHASES.EVALUATION : session.phase,
    status: learningCompleted ? 'learning_complete' : session.status,
    learningCompletedAt: learningCompleted ? new Date().toISOString() : session.learningCompletedAt || null,
    currentNodeSummary: {
      id: nextNode.id,
      title: nextNode.title,
      status: nextNode.status,
    },
  }

  return {
    tutorMessage,
    updatedSession,
  }
}

const buildTurnWorkflow = () => {
  const workflow = new StateGraph(TurnState)
    .addNode('runAssessment', assessmentNode)
    .addNode('runDecision', decisionNode)
    .addNode('runPlanner', plannerNode)
    .addNode('runTutor', tutorNode)
    .addEdge(START, 'runAssessment')
    .addEdge('runAssessment', 'runDecision')
    .addConditionalEdges('runDecision', (state) => (
      state.decision?.nextAction === 'expand_graph' ? 'runPlanner' : 'runTutor'
    ), {
      runPlanner: 'runPlanner',
      runTutor: 'runTutor',
    })
    .addEdge('runPlanner', 'runTutor')
    .addEdge('runTutor', END)

  return workflow.compile()
}

const turnWorkflow = buildTurnWorkflow()

const GRADIENT_DESCENT_CONFIG = {
  conceptSummary: 'Gradient descent is an iterative optimization algorithm that adjusts model parameters in the direction opposite to the gradient of the loss function, scaled by a learning rate, to find parameter values that minimize prediction error.',
  rootNodeId: 'gradient-descent-integration',
  nodes: [
    {
      id: 'loss-functions',
      title: 'Loss Functions',
      summary: 'A loss function quantifies the discrepancy between a model\'s predictions and the true target values, providing a single scalar that optimization seeks to minimize.',
      parentIds: [],
      isRoot: false,
      rubric: {
        explanationFocus: 'The learner should explain that a loss function maps predictions and ground truth to a non-negative scalar, and that lower values indicate better model fit.',
        causalReasoningFocus: 'The learner should connect how changing predictions (via parameters) causally changes the loss value, creating the optimization landscape.',
        transferFocus: 'The learner should be able to choose an appropriate loss function for a new task (e.g., MSE for regression vs cross-entropy for classification) and justify why.',
        misconceptionTargets: [
          'Believing loss can be negative under standard formulations like MSE or cross-entropy',
          'Confusing the loss function with the accuracy metric and assuming they always move together',
          'Thinking there is one universal loss function for all tasks',
        ],
        recallCue: 'What does a loss function measure and why do we minimize it?',
      },
      promptPack: {
        initial: 'In your own words, what does a loss function do in machine learning, and why is minimizing it the central goal of training?',
        teach: 'A loss function takes the model\'s predictions and the true labels and returns a number — the "loss." Think of MSE: it squares each prediction error and averages them. A loss of 0 means perfect predictions. Training is the process of searching for parameter values that push this number as low as possible.',
        reassess: 'Suppose you switch from mean squared error to mean absolute error on the same dataset. How would that change what the optimizer is penalizing, and when might you prefer one over the other?',
        transfer: 'You\'re building a spam classifier. Why would cross-entropy loss be a better choice than MSE here, and what does cross-entropy actually measure?',
        recall: 'Without looking anything up, explain what a loss function computes and give one concrete example.',
      },
    },
    {
      id: 'derivatives-and-gradients',
      title: 'Derivatives & Gradients',
      summary: 'The derivative of a function at a point gives the slope (rate of change), and the gradient generalizes this to multiple dimensions, pointing in the direction of steepest ascent.',
      parentIds: [],
      isRoot: false,
      rubric: {
        explanationFocus: 'The learner should explain that a derivative tells you how fast and in which direction a function\'s output changes as you nudge the input, and that a gradient is the vector of partial derivatives.',
        causalReasoningFocus: 'The learner should reason about why moving opposite to the gradient decreases the function value — because the gradient points uphill.',
        transferFocus: 'The learner should apply gradient intuition to a new multivariable function and predict which direction reduces the output.',
        misconceptionTargets: [
          'Thinking the gradient points toward the minimum rather than toward the steepest ascent',
          'Confusing the gradient (a vector) with the loss value (a scalar)',
          'Believing you need to compute the derivative symbolically every time rather than numerically or via automatic differentiation',
        ],
        recallCue: 'What is a gradient, and which direction does it point relative to the function\'s minimum?',
      },
      promptPack: {
        initial: 'Explain what a gradient is and why we move in the opposite direction of the gradient when we want to minimize a function.',
        teach: 'Imagine you\'re standing on a hilly landscape in fog. The gradient at your feet is a compass arrow pointing directly uphill — the steepest climb. To go downhill fastest you walk the opposite way. In math, the gradient of f(w) is the vector of all partial derivatives ∂f/∂wᵢ. Each component says "if you increase wᵢ a tiny bit, f increases by this much." Negate the whole vector and you have the steepest descent direction.',
        reassess: 'If the gradient of a loss function with respect to weights [w₁, w₂] is [4, -2], what does each component tell you about how to adjust w₁ and w₂ to reduce the loss?',
        transfer: 'You have a function f(x, y) = x² + 3y². Compute the gradient at point (2, 1) and describe what step you would take to decrease f.',
        recall: 'From memory, define gradient and explain why the negative gradient is the descent direction.',
      },
    },
    {
      id: 'learning-rate',
      title: 'Learning Rate',
      summary: 'The learning rate is a positive scalar that controls how large each parameter update step is; too large causes divergence, too small causes slow convergence.',
      parentIds: ['derivatives-and-gradients'],
      isRoot: false,
      rubric: {
        explanationFocus: 'The learner should explain that the learning rate scales the gradient step, balancing convergence speed against stability.',
        causalReasoningFocus: 'The learner should reason about the causal chain: large learning rate → overshooting the minimum → oscillation or divergence; small learning rate → tiny steps → slow or stalled training.',
        transferFocus: 'The learner should be able to diagnose a training curve (e.g., oscillating loss) and recommend adjusting the learning rate.',
        misconceptionTargets: [
          'Believing a larger learning rate always trains faster',
          'Thinking the learning rate is learned automatically by vanilla gradient descent',
          'Assuming a single fixed learning rate is always optimal throughout training',
        ],
        recallCue: 'What role does the learning rate play in the update step and what goes wrong at extremes?',
      },
      promptPack: {
        initial: 'What is the learning rate in gradient descent, and what happens if it\'s set too high or too low?',
        teach: 'The update rule is w ← w − α·∇L. The learning rate α is the step size multiplier. Picture a ball rolling downhill: α is how far it rolls each tick. If α is huge the ball leaps past the valley and bounces higher each time (divergence). If α is tiny, it barely moves and may never reach the bottom in practical time. A good α lands in a sweet spot — steady, shrinking loss each step.',
        reassess: 'You\'re training a model and the loss oscillates wildly between epochs instead of decreasing. What is the most likely cause and how would you fix it?',
        transfer: 'Many modern optimizers use a "learning rate schedule" that decreases α over time. Why might a high rate early and a low rate later be beneficial?',
        recall: 'Explain from memory what the learning rate controls and the consequences of extreme values.',
      },
    },
    {
      id: 'gradient-update-rule',
      title: 'The Gradient Descent Update Rule',
      summary: 'The core update rule w ← w − α·∇L(w) iteratively adjusts each parameter in the direction that locally reduces the loss, combining the gradient and learning rate.',
      parentIds: ['loss-functions', 'derivatives-and-gradients', 'learning-rate'],
      isRoot: false,
      rubric: {
        explanationFocus: 'The learner should walk through the update formula component by component: current weights, minus the learning rate times the gradient of the loss with respect to those weights.',
        causalReasoningFocus: 'The learner should explain why repeated application of this rule causes the loss to decrease over iterations — each step follows the steepest local descent.',
        transferFocus: 'The learner should be able to manually compute one update step given concrete weight values, a gradient, and a learning rate.',
        misconceptionTargets: [
          'Forgetting the negative sign and moving in the gradient (ascent) direction',
          'Believing one update step finds the global minimum',
          'Thinking the update rule changes the loss function itself rather than the parameters',
        ],
        recallCue: 'Write out the gradient descent update rule and explain each term.',
      },
      promptPack: {
        initial: 'Write out the gradient descent update rule and explain step by step what each part does and why the loss decreases after an update.',
        teach: 'The rule is simple: w_new = w_old − α · ∇L(w_old). ∇L(w_old) is the gradient — it tells you the slope of the loss surface at your current position. Multiplying by α scales how far you step. The minus sign is crucial: the gradient points uphill, so subtracting it moves you downhill. Each iteration you recompute the gradient at the new position and step again. Over many iterations the parameters settle near a loss minimum.',
        reassess: 'Given weights w = [3.0, -1.0], gradient ∇L = [0.5, -0.3], and learning rate α = 0.1, compute the updated weights and explain why the loss should be lower at the new point.',
        transfer: 'Suppose you have two parameters but the gradient is [100, 0.01] — one component is vastly larger. What practical problem does this create for a single global learning rate, and how might you address it?',
        recall: 'Without reference, write the update rule for gradient descent and explain the role of each symbol.',
      },
    },
    {
      id: 'convergence-and-local-minima',
      title: 'Convergence & Local Minima',
      summary: 'Gradient descent converges when parameter updates become negligibly small; in non-convex landscapes it may settle in a local minimum rather than the global one.',
      parentIds: ['gradient-update-rule'],
      isRoot: false,
      rubric: {
        explanationFocus: 'The learner should explain convergence as the gradient approaching zero (flat region) and distinguish local minima, global minima, and saddle points.',
        causalReasoningFocus: 'The learner should reason about why non-convex loss surfaces cause gradient descent to potentially stop at suboptimal points, and what factors influence which minimum is found.',
        transferFocus: 'The learner should apply convergence reasoning to diagnose a training curve that has plateaued and suggest strategies (restarts, momentum, learning rate schedules).',
        misconceptionTargets: [
          'Believing gradient descent always finds the global minimum',
          'Thinking a zero gradient always means a minimum (ignoring saddle points)',
          'Assuming local minima are always catastrophically worse than the global minimum in deep networks',
        ],
        recallCue: 'What does it mean for gradient descent to converge, and what can go wrong in non-convex landscapes?',
      },
      promptPack: {
        initial: 'What does it mean for gradient descent to "converge," and why might it end up at a local minimum instead of the global minimum?',
        teach: 'Convergence means the updates get smaller and smaller because the gradient approaches zero — you\'ve reached a relatively flat spot. In a simple bowl-shaped (convex) loss, that flat spot is the global minimum. But real neural network losses are bumpy (non-convex) with many valleys. Gradient descent rolls into whichever valley it reaches first from its starting point. That valley might not be the deepest one. Techniques like random restarts, momentum, or adaptive learning rates help escape shallow valleys.',
        reassess: 'Your model\'s training loss decreased quickly then stopped improving, but the loss is still high. Is this necessarily a local minimum? What else could explain the plateau, and what would you try?',
        transfer: 'Two teams train the same architecture on the same data but get different final losses. What role does random initialization play, and how does this relate to local minima?',
        recall: 'Explain convergence in gradient descent and the difference between local and global minima.',
      },
    },
    {
      id: 'stochastic-gradient-descent',
      title: 'Stochastic & Mini-Batch Gradient Descent',
      summary: 'SGD approximates the true gradient using a single sample or small batch, trading per-step accuracy for speed and introducing noise that can help escape local minima.',
      parentIds: ['gradient-update-rule'],
      isRoot: false,
      rubric: {
        explanationFocus: 'The learner should contrast full-batch gradient descent (using all data) with SGD (one sample) and mini-batch (a subset), explaining the noise-speed tradeoff.',
        causalReasoningFocus: 'The learner should reason about why noisier gradient estimates can paradoxically help optimization by bouncing out of shallow local minima.',
        transferFocus: 'The learner should be able to recommend a batch size given constraints (memory, dataset size, convergence behavior) and explain the tradeoffs.',
        misconceptionTargets: [
          'Thinking SGD computes the exact gradient — it computes a noisy estimate',
          'Believing larger batches are always better for final model quality',
          'Confusing "epoch" with "iteration" in the context of SGD',
        ],
        recallCue: 'How does stochastic gradient descent differ from full-batch, and what is the benefit of the noise it introduces?',
      },
      promptPack: {
        initial: 'How does stochastic gradient descent (SGD) differ from standard (full-batch) gradient descent, and why is SGD used in practice despite its noisier updates?',
        teach: 'Full-batch GD computes the gradient over every training example — accurate but slow for large datasets. SGD picks just one random example (or a small mini-batch) and estimates the gradient from that. The estimate is noisier but much cheaper. Surprisingly, that noise is useful: it helps the optimizer bounce out of shallow local minima and sharp valleys, often finding flatter minima that generalize better. Mini-batch (e.g., 32 or 64 examples) is the practical sweet spot — more stable than single-sample SGD, far faster than full-batch.',
        reassess: 'If you increase the mini-batch size from 32 to 1024, what happens to the variance of gradient estimates and the training dynamics? Are there downsides?',
        transfer: 'You have a dataset of 10 million images and a GPU with 16 GB of memory. Why is full-batch gradient descent infeasible, and how would you choose a mini-batch size?',
        recall: 'Describe the difference between full-batch, mini-batch, and stochastic gradient descent and the noise tradeoff.',
      },
    },
    {
      id: 'gradient-descent-integration',
      title: 'How Gradient Descent Minimizes Loss',
      summary: 'Gradient descent minimizes loss by iteratively computing the gradient of the loss with respect to model parameters and taking scaled steps in the negative gradient direction, converging toward a minimum of the loss surface.',
      parentIds: ['convergence-and-local-minima', 'stochastic-gradient-descent'],
      isRoot: true,
      rubric: {
        explanationFocus: 'The learner should synthesize the full pipeline: loss function defines the objective, gradient gives direction, learning rate gives step size, the update rule ties them together, and iteration leads to convergence.',
        causalReasoningFocus: 'The learner should trace the complete causal chain from "model makes bad predictions" through "loss is high" → "gradient points uphill" → "negative gradient step reduces loss" → "repeated steps converge near minimum."',
        transferFocus: 'The learner should be able to explain gradient descent\'s role in training a new model architecture they haven\'t seen before, identifying where each concept applies.',
        misconceptionTargets: [
          'Believing gradient descent directly finds the best parameters in one step rather than iterating',
          'Thinking gradient descent only works for neural networks (it works for any differentiable loss)',
          'Confusing the optimization process (gradient descent) with the model architecture',
        ],
        recallCue: 'Walk through the full story of how gradient descent minimizes loss, from the loss function through convergence.',
      },
      promptPack: {
        initial: 'Put it all together: starting from a randomly initialized model, explain the complete process of how gradient descent minimizes the loss function step by step, from the first forward pass to convergence.',
        teach: 'Here\'s the full picture: (1) The model makes predictions with its current parameters. (2) The loss function measures how wrong those predictions are. (3) We compute the gradient — partial derivatives of the loss with respect to every parameter — telling us the direction of steepest increase. (4) We update each parameter by subtracting the learning rate times its gradient component. (5) We repeat with new data (SGD) or the same data (batch). Each iteration the loss generally drops. (6) Eventually the gradient shrinks toward zero and we converge near a minimum. The choice of loss function, learning rate, and batch strategy all shape how quickly and how well this process works.',
        reassess: 'A colleague says "gradient descent just follows the slope downhill until the loss is zero." What parts of this are correct and what important nuances are missing?',
        transfer: 'You\'re training a logistic regression model (not a neural network) on tabular data. Does gradient descent still apply? Walk through how each concept — loss, gradient, learning rate, convergence — maps onto this simpler setting.',
        recall: 'From memory, explain the complete end-to-end process of how gradient descent minimizes loss in machine learning.',
      },
    },
  ],
  evaluationBundle: {
    prompts: [
      {
        id: 'explanation',
        title: 'Explain the gradient descent process',
        prompt: 'Explain, as if to a fellow student, how gradient descent works to minimize a loss function in machine learning. Cover the role of the loss function, the gradient, the learning rate, and the update rule. What does one iteration look like, and what does convergence mean?',
      },
      {
        id: 'transfer',
        title: 'Apply gradient descent to a new scenario',
        prompt: 'You are given a simple linear regression model y = wx + b and a dataset of 100 points. You choose mean squared error as your loss. Describe concretely how you would use gradient descent to find good values of w and b. What would you compute at each step, and how would you know when to stop?',
      },
      {
        id: 'misconception',
        title: 'Identify and correct a misconception',
        prompt: 'A student claims: "Gradient descent always finds the best possible parameters for any model because it follows the gradient directly to the global minimum, and using a bigger learning rate makes it get there faster." Identify the misconceptions in this statement and explain what actually happens.',
      },
    ],
    scoringNotes: [
      'Award full marks for explanation if the learner accurately describes the iterative cycle: forward pass → loss computation → gradient computation → parameter update → repeat.',
      'For transfer, check that the learner correctly identifies ∂L/∂w and ∂L/∂b as the needed gradients and describes updating both parameters each step.',
      'For misconception, the learner should identify at least two errors: (1) GD does not guarantee the global minimum in non-convex landscapes, and (2) a learning rate that is too large causes divergence, not faster convergence.',
      'Partial credit if the core idea is present but details (like the negative sign, or local vs global minima) are imprecise.',
    ],
  },
}

export const generateStudyArtifacts = async (seedConcept) => {
  const graphNodes = normalizePlannerNodes(GRADIENT_DESCENT_CONFIG)
  const rootNode = graphNodes.find((node) => node.id === slugify(GRADIENT_DESCENT_CONFIG.rootNodeId)) || graphNodes[graphNodes.length - 1]

  return {
    seedConcept,
    conceptSummary: GRADIENT_DESCENT_CONFIG.conceptSummary,
    rootNodeId: rootNode.id,
    graphNodes,
    evaluationBundle: GRADIENT_DESCENT_CONFIG.evaluationBundle,
  }
}

export const createInitialSessionSnapshot = ({ studyConfigId, studyConfig, condition }) => {
  const graphNodes = (studyConfig?.graphNodes || []).map((node) => ({ ...node }))
  const firstNode = getNextEligibleNode({
    graphNodes,
    evidenceRecords: [],
    currentNodeId: '',
    turnIndex: 0,
  }) || graphNodes[0]

  return {
    id: '',
    studyConfigId,
    condition,
    phase: SPRINT4_PHASES.LEARNING,
    status: 'active',
    currentNodeId: firstNode?.id || '',
    turnIndex: 0,
    graphNodes,
    evidenceRecords: [],
    messages: firstNode ? [createMessage({
      role: 'assistant',
      content: condition === SPRINT4_CONDITIONS.GUIDED
        ? `We’ll build toward **${studyConfig.seedConcept}** through a live concept map. Let’s start with **${firstNode.title}**.\n\n${firstNode.promptPack.initial}`
        : `You have a fixed study window to learn **${studyConfig.seedConcept}**. Ask whatever you want and use the conversation however you like.`,
      nodeId: firstNode.id,
    })] : [],
    events: [createEvent('session_started', { condition })],
    evaluationAnswers: [],
    evaluationScores: [],
    surveyResponse: null,
    learningCompletedAt: null,
    evaluationCompletedAt: null,
    surveyCompletedAt: null,
    timeBudgetMs: studyConfig.timeBudgetMs,
    instrumentationVersion: SPRINT4_INSTRUMENTATION_VERSION,
  }
}

export const runGuidedTurn = async ({ session, studyConfig, userMessage, helpRequested }) => {
  const activeNode = session.graphNodes.find((node) => node.id === session.currentNodeId) ||
    getNextEligibleNode(session)

  if (!activeNode) {
    return {
      session: {
        ...session,
        phase: SPRINT4_PHASES.EVALUATION,
      },
      tutorMessage: createMessage({
        role: 'assistant',
        content: 'You have completed the guided learning loop. Continue to the external evaluation.',
        nodeId: null,
      }),
    }
  }

  const result = await turnWorkflow.invoke({
    seedConcept: studyConfig.seedConcept,
    session: {
      ...session,
      helpRequested,
    },
    activeNode,
    userMessage,
    helpRequested,
  })

  return {
    session: result.updatedSession,
    tutorMessage: result.tutorMessage,
  }
}

export const runControlTurn = async ({ session, studyConfig, userMessage }) => {
  const userMessageEntry = createMessage({
    role: 'user',
    content: userMessage,
    nodeId: null,
  })
  const assistantContent = await callTextPrompt({
    systemPrompt: createControlTutorSystemPrompt(studyConfig.seedConcept),
    messages: [...(session.messages || []), userMessageEntry].map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    })),
    temperature: 0.55,
    maxCompletionTokens: 1000,
  })
  const assistantMessage = createMessage({
    role: 'assistant',
    content: assistantContent,
    nodeId: null,
  })

  return {
    session: {
      ...session,
      turnIndex: (session.turnIndex || 0) + 1,
      messages: [...(session.messages || []), userMessageEntry, assistantMessage],
      events: [
        ...(session.events || []),
        createEvent('turn_submitted', {
          condition: session.condition,
        }),
      ],
    },
    tutorMessage: assistantMessage,
  }
}

export const scoreEvaluationAnswers = async ({ studyConfig, answers }) => {
  const evaluationScores = await callStructuredPrompt({
    systemPrompt: 'You are Forest Sprint 4 external evaluator. Return strict JSON only. Do not use any hidden session context.',
    userPrompt: createEvaluationPrompt({
      seedConcept: studyConfig.seedConcept,
      evaluationBundle: studyConfig.evaluationBundle,
      answers,
    }),
    schema: EvaluationScoreSchema,
    maxCompletionTokens: 2600,
  })

  return evaluationScores
}
