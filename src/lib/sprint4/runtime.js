import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { z } from 'zod'
import {
  BUILTIN_SEED_CONCEPT,
  BUILTIN_STUDY_ID,
  createEmptyDimensionScores,
  createEmptyMetrics,
  DEFAULT_TIME_BUDGET_MS,
  EVALUATION_PROMPT_IDS,
  isMasteredNodeState,
  MAX_VISIBLE_HISTORY,
  MODEL_BY_CONTEXT,
  NODE_TYPES,
  NODE_STATES,
  PROMPT_KINDS,
  SPRINT4_CONDITIONS,
  SPRINT4_GRAPH_MODELS,
  SPRINT4_INSTRUMENTATION_VERSION,
  SPRINT4_PHASES,
} from './constants.js'
import { callStructuredPrompt, callTextPrompt } from './ai.js'

/* ── Logging ────────────────────────────────────────────────────── */
const LOG_PREFIX = '[Sprint4]'
const log = (tag, data) => {
  const ts = new Date().toISOString()
  console.log(`${LOG_PREFIX} ${ts} [${tag}]`, typeof data === 'string' ? data : JSON.stringify(data, null, 2))
}

const UNKNOWN_CONFUSION_TOPIC = 'this concept'

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

const LightNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  initialPrompt: z.string().min(1),
  parentIds: z.array(z.string()).default([]),
})

const PlannerNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  parentIds: z.array(z.string()).default([]),
  isRoot: z.boolean().optional().default(false),
  initialPrompt: z.string().optional().default(''),
  rubric: RubricSchema.optional(),
  promptPack: PromptPackSchema.optional(),
})

const PlannerConfigSchema = z.object({
  conceptSummary: z.string().min(1),
  rootNodeId: z.string().min(1),
  nodes: z.array(PlannerNodeSchema).min(1).max(8),
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
  subtopicSuggestions: z.array(z.object({
    title: z.string(),
    reason: z.string().default(''),
  })).max(3).default([]),
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
  newNodes: z.array(LightNodeSchema).min(1).max(1),
  retargetNodeId: z.string().optional().default(''),
})

const MCQSchema = z.object({
  question: z.string().min(1),
  correctAnswer: z.string().min(1),
  distractors: z.array(z.object({
    text: z.string().min(1),
    misconceptionLabel: z.string().default(''),
  })).min(2).max(4),
  explanation: z.string().min(1),
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

const addRuntimeFields = (node) => ({
  ...node,
  status: node.status || ((node.parentIds || []).length === 0 ? NODE_STATES.ACTIVE : NODE_STATES.LOCKED),
  promptKind: node.promptKind || PROMPT_KINDS.ASSESS,
  supportLevel: node.supportLevel || 0,
  withSupportUsed: node.withSupportUsed || false,
  successfulRecallCount: node.successfulRecallCount || 0,
  recallScheduledAtTurn: node.recallScheduledAtTurn ?? null,
  bestScores: node.bestScores || createEmptyDimensionScores(),
  misconceptionStreak: node.misconceptionStreak || 0,
  attempts: node.attempts || 0,
  lastAssessmentSummary: node.lastAssessmentSummary || '',
  nodeType: node.nodeType || (node.isRoot ? NODE_TYPES.ROOT : ''),
  simpleGoodTurnCount: node.simpleGoodTurnCount || 0,
  partialStruggleCount: node.partialStruggleCount || 0,
  clarificationDepth: node.clarificationDepth || 0,
  derivedFromTopic: node.derivedFromTopic || '',
  lastMcqAtAttempt: node.lastMcqAtAttempt || 0,
  checkpointMcqCompleted: !!node.checkpointMcqCompleted,
  pendingMcqMode: node.pendingMcqMode || '',
})

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
      initialPrompt: node.initialPrompt || node.promptPack?.initial || '',
      rubric: node.rubric || null,
      promptPack: node.promptPack || null,
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

  const nodeMap = new Map(normalized.map((node) => [node.id, node]))
  const depthCache = new Map()

  normalized.forEach((node) => {
    node.depth = computeDepth(node.id, nodeMap, depthCache)
  })

  return sortNodes(normalized).map((node, index) => addRuntimeFields({
    ...node,
    orderIndex: index,
  }))
}

const normalizeLightNodes = (lightNodes, existingGraphNodes = []) => {
  const existingIds = new Set(existingGraphNodes.map((n) => n.id))
  const baseIndex = existingGraphNodes.length

  return lightNodes.map((node, index) => {
    let nodeId = slugify(node.id || node.title)
    if (existingIds.has(nodeId)) nodeId = `${nodeId}-${baseIndex + index + 1}`
    existingIds.add(nodeId)

    const parentIds = dedupe((node.parentIds || []).map(slugify).filter((pid) => pid !== nodeId))

    return addRuntimeFields({
      id: nodeId,
      title: node.title.trim(),
      summary: node.summary.trim(),
      initialPrompt: node.initialPrompt || '',
      parentIds,
      isRoot: false,
      rubric: null,
      promptPack: null,
      orderIndex: baseIndex + index,
      depth: 0,
      nodeType: node.nodeType || NODE_TYPES.DYNAMIC,
      simpleGoodTurnCount: node.simpleGoodTurnCount || 0,
      clarificationDepth: node.clarificationDepth || 0,
      derivedFromTopic: node.derivedFromTopic || '',
    })
  })
}

const getNodePrompt = (node, promptKind) => {
  if (node.promptPack?.[promptKind]) return node.promptPack[promptKind]
  if (node.promptPack?.initial) return node.promptPack.initial
  if (node.initialPrompt) return node.initialPrompt
  return node.summary
}

const getRubricSection = (node) => {
  if (node.rubric) {
    return [
      `- Explanation focus: ${node.rubric.explanationFocus}`,
      `- Causal reasoning focus: ${node.rubric.causalReasoningFocus}`,
      `- Transfer focus: ${node.rubric.transferFocus}`,
      `- Recall cue: ${node.rubric.recallCue}`,
      `- Target misconceptions: ${(node.rubric.misconceptionTargets || []).join('; ')}`,
    ].join('\n')
  }
  return `- Node summary (no detailed rubric): ${node.summary}\n- Assess explanation, causal reasoning, transfer ability, and misconception resistance based on the node summary.`
}

const createAssessmentPrompt = ({ seedConcept, node, recentMessages, userMessage, helpRequested, uploadedDocContext }) => `
Seed concept: ${seedConcept}
Current node title: ${node.title}
Current node summary: ${node.summary}
Current prompt kind: ${node.promptKind}
Node rubric:
${getRubricSection(node)}

Recent conversation for this node:
${recentMessages || 'No prior node conversation.'}

Latest learner response:
${userMessage || '(blank)'}

Help requested: ${helpRequested ? 'yes' : 'no'}
${uploadedDocContext ? `\nReference material provided by learner:\n${uploadedDocContext}\n` : ''}
Score the learner's latest response only. Use 0 = absent/incorrect, 1 = partial, 2 = strong.
IMPORTANT scoring rules (follow ALL):
- One-word replies, short phrases, prompt-term repetition, or vague answers like "idk", "loss function", or "gradient descent" score 0 for explanation unless they clearly state a correct idea.
- Explanation = 1 requires a correct sentence-level claim in the learner's own words. A keyword, label, or copied phrase is not enough.
- Explanation = 2 requires a coherent plain-language explanation of what is happening in this node.
- CausalReasoning = 0 unless the learner explains a mechanism, dependency, step, or cause-and-effect relation.
- CausalReasoning = 1 requires at least one correct why/how link or concrete mechanism.
- CausalReasoning = 2 requires a clear why/how chain, not just "it reduces loss" or another high-level conclusion.
- Do NOT penalize for omitting mathematical notation, formulas, or equations. Plain-language conceptual understanding can still earn full marks.
- If the learner expresses confusion or says they don't understand, set recommendedAction to "teach" and score only what is actually present in the latest response.
Also identify if the learner is exploring any subtopics or has knowledge gaps that would benefit from a new focused node.

Return JSON matching this exact structure:
{
  "explanation": 0,
  "causalReasoning": 0,
  "transfer": 0,
  "misconceptionResistance": 0,
  "misconceptionDetected": false,
  "misconceptionLabel": "",
  "misconceptionReason": "",
  "missingConcepts": [],
  "strengths": [],
  "subtopicSuggestions": [{ "title": "<subtopic>", "reason": "<why>" }],
  "recommendedAction": "reassess",
  "conciseRationale": "<1-2 sentences>",
  "tutorFocus": "<what the tutor should address next>",
  "confidence": 0.5
}

All fields are required. subtopicSuggestions can be an empty array if no subtopics are detected. recommendedAction must be one of: teach, reassess, transfer, recall, mark_partial, mark_mastered.
`

const createExpansionPrompt = ({ seedConcept, node, latestAssessment, skippedNodeTitles, confusionTopic }) => `
Seed concept: ${seedConcept}
Node needing expansion:
- title: ${node.title}
- summary: ${node.summary}

Latest assessment:
- misconception detected: ${latestAssessment?.misconceptionDetected ? 'yes' : 'no'}
- misconception label: ${latestAssessment?.misconceptionLabel || ''}
- rationale: ${latestAssessment?.conciseRationale || ''}
- missing concepts: ${(latestAssessment?.missingConcepts || []).join('; ')}
- subtopic suggestions: ${(latestAssessment?.subtopicSuggestions || []).map((s) => `${s.title}: ${s.reason}`).join('; ') || 'none'}
${confusionTopic ? `\nThe learner explicitly said they don't understand: "${confusionTopic}"\nCreate a focused subnode specifically about this topic to help them build understanding.\n` : ''}
${skippedNodeTitles?.length ? `\nSkipped topics (the learner chose to skip these — do NOT create nodes covering these concepts):\n${skippedNodeTitles.map((t) => `- ${t}`).join('\n')}\n` : ''}
Generate exactly 1 new focused node that addresses the single most critical gap, misconception, or missing concept.
The node should be a self-contained concept that helps build toward understanding the parent node.
Do NOT generate multiple nodes — pick the single most important one.
Do NOT recreate or rephrase any skipped topic.

Return JSON matching this structure:
{
  "reason": "<why this node is needed>",
  "newNodes": [
    {
      "id": "<kebab-case-id>",
      "title": "<short title>",
      "summary": "<1-2 sentence description>",
      "initialPrompt": "<the first question to pose to the learner for this node>",
      "parentIds": []
    }
  ],
  "retargetNodeId": "<optional: id of which existing node to redirect the learner to>"
}
`

const createGuidedTutorPrompt = ({
  seedConcept,
  node,
  decision,
  assessment,
  recentMessages,
  uploadedDocContext,
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
MCQ follow-up: ${decision?.mcqOutcome
    ? `${decision.mcqOutcome.correct ? 'learner selected the correct option' : 'learner selected an incorrect option'} (${decision.mcqOutcome.mode || 'diagnostic'})`
    : 'none'}
Recent conversation:
${recentMessages || 'No prior conversation.'}
${uploadedDocContext ? `\nReference material provided by learner:\n${uploadedDocContext}\n` : ''}
Behavior rules:
- Speak directly to the learner.
- Keep the response concise and high-signal.
- If teaching, give targeted help, not a full lecture.
- End with exactly one focused next question unless the session is wrapping up.
- Do not mention internal scores, nodes, rubric dimensions, or mastery logic.
- If the node was just mastered, acknowledge progress briefly and steer to the next useful prompt.
- NEVER ask the learner to write mathematical formulas, equations, or notation. Accept conceptual or plain-language explanations. You may show formulas when teaching, but do not require the learner to produce them.
- Do not treat weak, vague, or keyword-only answers as sufficient understanding.
- After an MCQ, ask the learner to explain why the correct option is right in their own words. If they chose incorrectly, correct the misconception briefly before asking for that explanation.
- For partial answers, press for mechanism, cause-and-effect, or a concrete step-by-step explanation.
- For clarification nodes, explicitly reconnect the subtopic back to the parent concept before moving on.
`

const createMCQPrompt = ({ seedConcept, node, latestAssessment }) => `
Seed concept: ${seedConcept}
Node: ${node.title}
Node summary: ${node.summary}
${latestAssessment?.misconceptionLabel ? `Detected misconception: ${latestAssessment.misconceptionLabel}` : ''}
Assessment gaps: ${(latestAssessment?.missingConcepts || []).join('; ') || 'none'}
Assessment strengths: ${(latestAssessment?.strengths || []).join('; ') || 'none'}

Generate a mechanism-focused multiple choice question that tests understanding of this concept.
Prefer questions that test why a process works, what step should happen next, or which explanation matches the correct causal story.
Avoid pure vocabulary checks unless the node is explicitly about defining a term.
Include one correct answer and 2-4 distractors. Each distractor should represent a realistic misconception for this node or the latest assessment, not a generic wrong answer.

Return JSON matching this structure:
{
  "question": "<the question>",
  "correctAnswer": "<the correct answer text>",
  "distractors": [
    { "text": "<wrong answer>", "misconceptionLabel": "<what wrong belief this represents>" }
  ],
  "explanation": "<explanation of why the correct answer is right>"
}
`

const createChainedReasoningPrompt = ({ seedConcept, node, parentNodes }) => `
Seed concept: ${seedConcept}
Current node: ${node.title} — ${node.summary}
Prerequisite nodes the learner has studied:
${parentNodes.map((p) => `- ${p.title}: ${p.summary}`).join('\n')}

Create a question that requires the learner to integrate their understanding of the prerequisite concepts to reason about the current node.
The question should explicitly reference the prerequisite concepts and ask the learner to connect them.
Return only the question text as a plain string.
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

Return JSON matching this exact structure:
{
  "answers": [
    {
      "promptId": "<the Prompt ID from above, e.g. explanation>",
      "score": 0,
      "rationale": "<1-2 sentence justification for the score>",
      "strengths": ["<strength 1>"],
      "gaps": ["<gap 1>"]
    }
  ],
  "overallScore": 0,
  "summary": "<1-2 sentence overall assessment>"
}

The "answers" array must contain exactly 3 entries, one per prompt above, using the exact Prompt ID values. Every field is required.
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

const getEffectiveScores = (bestScores, assessment = null) => ({
  explanation: Math.max(bestScores?.explanation || 0, assessment?.explanation || 0),
  causalReasoning: Math.max(bestScores?.causalReasoning || 0, assessment?.causalReasoning || 0),
  transfer: Math.max(bestScores?.transfer || 0, assessment?.transfer || 0),
  misconceptionResistance: Math.max(bestScores?.misconceptionResistance || 0, assessment?.misconceptionResistance || 0),
})

const isRootDynamicGraphSession = (session) => session?.graphModel === SPRINT4_GRAPH_MODELS.ROOT_DYNAMIC

const isDynamicNode = (node, session = null) =>
  !!node &&
  node.nodeType === NODE_TYPES.DYNAMIC &&
  (!session || isRootDynamicGraphSession(session))

const normalizeConfusionTopic = (value) => {
  const cleaned = `${value || ''}`
    .replace(/^['"`(\[]+|['"`)\].,:;!?]+$/g, '')
    .replace(/^(?:what\s+)?(?:a|an|the)\s+/i, '')
    .replace(/\b(?:is|are|was|were|means?|mean|works?|work)\b$/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned.length >= 2 ? cleaned : ''
}

const getTopicKey = (value) => {
  const normalized = normalizeConfusionTopic(value)
  return normalized ? slugify(normalized) : ''
}

const toDisplayTopic = (value) => {
  const normalized = normalizeConfusionTopic(value) || UNKNOWN_CONFUSION_TOPIC
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

const EXPLICIT_CONFUSION_PATTERNS = [
  /i\s*(?:don'?t|do\s*not)\s*(?:understand|get|know)\s+(?:what\s+)?(.{1,80})/i,
  /(?:don'?t|do\s*not)\s*(?:understand|get)\s+(?:how|why|what)\s+(.{1,80})/i,
  /(?:confused|lost)\s+(?:about|by|on)\s+(.{1,80})/i,
  /(?:what\s+(?:is|are|does)|explain)\s+(.{1,80})/i,
]

const BARE_CONFUSION_PATTERNS = [
  /^i\s*(?:don'?t|do\s*not)\s*(?:understand|get|know)\b/i,
  /^i(?:'m|\s+am)?\s*(?:confused|lost)\b/i,
  /^i(?:'m|\s+am)?\s*stuck\b/i,
]

const PROMPT_CONTEXT_PATTERNS = [
  /['"`]([^'"`?]{2,80})['"`]/,
  /do you know what\s+([^?.,!]{2,80})/i,
  /what\s+(?:is|are|does)\s+([^?.,!]{2,80})/i,
  /focus on\s+([^?.,!]{2,80})/i,
]

const detectExplicitConfusion = (msg) => {
  if (!msg) return { expressedConfusion: false, explicitTopic: '' }

  for (const pattern of EXPLICIT_CONFUSION_PATTERNS) {
    const match = msg.match(pattern)
    if (match) {
      return {
        expressedConfusion: true,
        explicitTopic: normalizeConfusionTopic(match[1]),
      }
    }
  }

  const expressedConfusion = BARE_CONFUSION_PATTERNS.some((pattern) => pattern.test(msg))
  return {
    expressedConfusion,
    explicitTopic: '',
  }
}

const inferTopicFromPromptContext = ({ session, node }) => {
  const candidates = [
    ...[...(session?.messages || [])]
      .reverse()
      .filter((message) => message.nodeId === node?.id && message.role === 'assistant')
      .map((message) => message.content),
    getNodePrompt(node, node?.promptKind || PROMPT_KINDS.ASSESS),
    node?.initialPrompt || '',
    node?.derivedFromTopic || '',
    node?.title || '',
  ]

  for (const candidate of candidates) {
    for (const pattern of PROMPT_CONTEXT_PATTERNS) {
      const match = `${candidate || ''}`.match(pattern)
      if (!match) continue
      const normalized = normalizeConfusionTopic(match[1])
      if (normalized) return normalized
    }
  }

  return ''
}

const inferRecentHistoryConfusion = ({ session, node }) => {
  const recentNodeMessages = [...(session?.messages || [])]
    .filter((message) => message.nodeId === node?.id)
    .slice(-MAX_VISIBLE_HISTORY)
    .reverse()

  for (const message of recentNodeMessages) {
    if (message.role !== 'user') continue
    const detection = detectExplicitConfusion(message.content)
    if (!detection.expressedConfusion) continue

    return {
      expressedConfusion: true,
      topic: normalizeConfusionTopic(detection.explicitTopic),
      source: detection.explicitTopic ? 'recentUserExplicit' : 'recentUserConfusion',
      explicitTopic: detection.explicitTopic,
    }
  }

  return {
    expressedConfusion: false,
    topic: '',
    source: '',
    explicitTopic: '',
  }
}

const inferConfusionInfo = ({ userMessage, assessment, node, session, useRecentHistory = false }) => {
  const detection = detectExplicitConfusion(userMessage)
  const recentHistoryConfusion = useRecentHistory
    ? inferRecentHistoryConfusion({ session, node })
    : { expressedConfusion: false, topic: '', source: '', explicitTopic: '' }

  if (!detection.expressedConfusion && !recentHistoryConfusion.expressedConfusion) {
    return {
      expressedConfusion: false,
      topic: '',
      source: '',
      explicitTopic: '',
    }
  }

  const topicCandidates = [
    detection.explicitTopic ? { topic: detection.explicitTopic, source: 'explicit' } : null,
    recentHistoryConfusion.topic ? { topic: recentHistoryConfusion.topic, source: recentHistoryConfusion.source } : null,
    assessment?.missingConcepts?.[0] ? { topic: assessment.missingConcepts[0], source: 'missingConcept' } : null,
    assessment?.subtopicSuggestions?.[0]?.title ? { topic: assessment.subtopicSuggestions[0].title, source: 'subtopicSuggestion' } : null,
    (() => {
      const fromPrompt = inferTopicFromPromptContext({ session, node })
      return fromPrompt ? { topic: fromPrompt, source: 'promptContext' } : null
    })(),
  ].filter(Boolean)

  const selected = topicCandidates.find((candidate) => normalizeConfusionTopic(candidate.topic))
  return {
    expressedConfusion: true,
    topic: normalizeConfusionTopic(selected?.topic),
    source: selected?.source || '',
    explicitTopic: detection.explicitTopic || recentHistoryConfusion.explicitTopic,
  }
}

const getAncestorNodes = (graphNodes, nodeId, seen = new Set()) => {
  if (!nodeId || seen.has(nodeId)) return []
  seen.add(nodeId)

  const nodeMap = getNodeMap(graphNodes)
  const node = nodeMap.get(nodeId)
  if (!node) return []

  return (node.parentIds || []).flatMap((parentId) => {
    const parent = nodeMap.get(parentId)
    if (!parent) return []
    return [parent, ...getAncestorNodes(graphNodes, parent.id, seen)]
  })
}

const findMatchingAncestorTopic = ({ graphNodes, nodeId, topic }) => {
  const topicKey = getTopicKey(topic)
  if (!topicKey) return null

  return getAncestorNodes(graphNodes, nodeId).find((ancestor) => (
    getTopicKey(ancestor.derivedFromTopic || ancestor.title) === topicKey
  )) || null
}

const isNonEmptyLearnerMessage = (value) => `${value || ''}`.trim().length > 0

const isDirectionallyCorrectAssessment = (assessment) =>
  !assessment?.misconceptionDetected &&
  assessment?.explanation >= 1 &&
  assessment?.causalReasoning >= 1

const isMeaningfulButInsufficientAssessment = (assessment) =>
  !assessment?.misconceptionDetected &&
  (assessment?.explanation >= 1 || assessment?.causalReasoning >= 1) &&
  !isDirectionallyCorrectAssessment(assessment)

const hasDynamicMasteryScores = (scores) =>
  scores.explanation >= 2 &&
  scores.causalReasoning >= 1

const createDeterministicClarificationNode = ({ activeNode, confusionInfo, session }) => {
  const topic = normalizeConfusionTopic(
    confusionInfo?.topic ||
    inferTopicFromPromptContext({ session, node: activeNode }) ||
    activeNode?.derivedFromTopic ||
    activeNode?.title ||
    UNKNOWN_CONFUSION_TOPIC
  ) || UNKNOWN_CONFUSION_TOPIC

  const displayTopic = toDisplayTopic(topic)

  return {
    id: getTopicKey(topic) || `${activeNode.id}-clarification`,
    title: displayTopic,
    summary: `Clarify what ${topic} means and how it supports understanding of ${activeNode.title}.`,
    initialPrompt: `Let's focus on ${topic}. In one or two plain-language sentences, what do you think ${topic} means here?`,
    parentIds: [],
    nodeType: NODE_TYPES.DYNAMIC,
    clarificationDepth: (activeNode?.clarificationDepth || 0) + 1,
    simpleGoodTurnCount: 0,
    derivedFromTopic: topic,
  }
}

const getLearningCompleted = ({ session, graphNodes }) => {
  if (!isRootDynamicGraphSession(session)) {
    return graphNodes.every((node) => isMasteredNodeState(node.status)) && graphNodes.length > 0
  }

  const rootNode = graphNodes.find((node) => node.nodeType === NODE_TYPES.ROOT || node.isRoot) || null
  const unresolvedDynamicNodes = graphNodes.filter((node) => (
    node.nodeType === NODE_TYPES.DYNAMIC && !isMasteredNodeState(node.status)
  ))

  return !!rootNode && isMasteredNodeState(rootNode.status) && unresolvedDynamicNodes.length === 0
}

const isNodeAvailable = (node, nodeMap) => (node.parentIds || []).every((parentId) => {
  const parent = nodeMap.get(parentId)
  return parent && isMasteredNodeState(parent.status)
})

const getNextEligibleNode = (session, preferredNodeId = '') => {
  const nodeMap = getNodeMap(session.graphNodes)
  const sorted = sortNodes(session.graphNodes || [])
  log('getNextEligibleNode:start', {
    preferredNodeId,
    currentNodeId: session.currentNodeId,
    turnIndex: session.turnIndex,
    nodes: sorted.map((n) => ({ id: n.id, status: n.status, parentIds: n.parentIds })),
  })
  if (preferredNodeId) {
    const preferred = nodeMap.get(preferredNodeId)
    if (
      preferred &&
      preferred.status !== NODE_STATES.LOCKED &&
      !isMasteredNodeState(preferred.status) &&
      isNodeAvailable(preferred, nodeMap)
    ) {
      log('getNextEligibleNode:result', { selected: preferred.id, reason: 'preferred' })
      return preferred
    }
  }

  const dueRecallNode = sorted.find((node) =>
    !isMasteredNodeState(node.status) &&
    typeof node.recallScheduledAtTurn === 'number' &&
    session.turnIndex > node.recallScheduledAtTurn &&
    node.id !== session.currentNodeId
  )
  if (dueRecallNode && isNodeAvailable(dueRecallNode, nodeMap)) {
    log('getNextEligibleNode:result', { selected: dueRecallNode.id, reason: 'due_recall' })
    return dueRecallNode
  }

  const activeNode = sorted.find((node) =>
    (node.status === NODE_STATES.ACTIVE || node.status === NODE_STATES.PARTIAL) &&
    isNodeAvailable(node, nodeMap)
  )
  if (activeNode) {
    log('getNextEligibleNode:result', { selected: activeNode.id, reason: 'active_or_partial' })
    return activeNode
  }

  const lockedRoot = sorted.find((node) => node.status === NODE_STATES.LOCKED && isNodeAvailable(node, nodeMap))
  log('getNextEligibleNode:result', { selected: lockedRoot?.id || null, reason: lockedRoot ? 'locked_root_available' : 'none_found' })
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
  log('markDependentAvailability:input', graphNodes.map((n) => ({
    id: n.id, status: n.status, parentIds: n.parentIds,
  })))
  const result = sortNodes(graphNodes).map((node) => {
    if (isMasteredNodeState(node.status)) return node
    const available = isNodeAvailable(node, nodeMap)
    const parentStatuses = (node.parentIds || []).map((pid) => {
      const p = nodeMap.get(pid)
      return { id: pid, status: p?.status || 'NOT_FOUND', mastered: p ? isMasteredNodeState(p.status) : false }
    })
    if (available) {
      const newStatus = node.status === NODE_STATES.LOCKED ? NODE_STATES.ACTIVE : node.status
      if (newStatus !== node.status) {
        log('markDependentAvailability:unlock', { id: node.id, from: node.status, to: newStatus, parentStatuses })
      }
      return { ...node, status: newStatus }
    }
    const newStatus = (node.status === NODE_STATES.ACTIVE || node.status === NODE_STATES.PARTIAL)
      ? NODE_STATES.LOCKED : node.status
    if (newStatus !== node.status) {
      log('markDependentAvailability:lock', { id: node.id, from: node.status, to: newStatus, parentStatuses })
    }
    return { ...node, status: newStatus }
  })
  log('markDependentAvailability:output', result.map((n) => ({ id: n.id, status: n.status })))
  return result
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
    (node.successfulRecallCount || 0) >= 1

  if (!thresholdMet) return null
  return node.withSupportUsed ? NODE_STATES.MASTERED_WITH_SUPPORT : NODE_STATES.MASTERED_INDEPENDENTLY
}

const createFallbackAssessment = ({ helpRequested, node, evidenceRecords, userMessage, session }) => {
  const bestScores = getBestScores(node || { id: '' }, evidenceRecords || [])
  const confusionInfo = inferConfusionInfo({
    userMessage,
    assessment: null,
    node,
    session,
    useRecentHistory: helpRequested || !`${userMessage || ''}`.trim(),
  })
  const explicitHelp = helpRequested || confusionInfo.expressedConfusion

  return {
    explanation: bestScores.explanation,
    causalReasoning: bestScores.causalReasoning,
    transfer: bestScores.transfer,
    misconceptionResistance: bestScores.misconceptionResistance,
    misconceptionDetected: false,
    misconceptionLabel: '',
    misconceptionReason: '',
    missingConcepts: confusionInfo.topic
      ? [confusionInfo.topic]
      : ['The learner needs a more specific explanation.'],
    strengths: [],
    subtopicSuggestions: confusionInfo.topic
      ? [{ title: confusionInfo.topic, reason: 'Derived from explicit learner confusion during fallback assessment.' }]
      : [],
    recommendedAction: explicitHelp ? PROMPT_KINDS.TEACH : PROMPT_KINDS.REASSESS,
    conciseRationale: explicitHelp
      ? `Fallback assessment preserved the learner's explicit confusion${confusionInfo.topic ? ` about "${confusionInfo.topic}"` : ''}.`
      : 'Fallback assessment preserved prior evidence because the model response was unavailable.',
    tutorFocus: explicitHelp
      ? `Clarify ${confusionInfo.topic || 'the immediate sticking point'} in plain language and ask one narrow follow-up.`
      : 'Request a more concrete explanation tied to the current node focus.',
    confidence: 0.15,
  }
}

const getUploadedDocContext = (session) => {
  const docs = session.uploadedDocuments || []
  if (!docs.length) return ''
  const combined = docs.map((d) => d.extractedText || '').join('\n\n')
  return combined.slice(0, 2000)
}

const decideNextAction = ({ node, assessment, session, evidenceRecords, userMessage }) => {
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

  const bestScores = getBestScores(node, evidenceRecords)
  const effectiveScores = getEffectiveScores(bestScores, assessment)
  const hasPartialCore = effectiveScores.explanation >= 1 && effectiveScores.causalReasoning >= 1
  const hasStrongCore = effectiveScores.explanation >= 2 && effectiveScores.causalReasoning >= 2

  const nodeAttempts = (node.attempts || 0)
  const trimmedUserMessage = `${userMessage || ''}`.trim()
  const hasNonEmptyResponse = isNonEmptyLearnerMessage(trimmedUserMessage)
  const mcqCorrect = node.promptKind === PROMPT_KINDS.MCQ &&
    /\(correct\)/i.test(trimmedUserMessage)
  const confusionInfo = inferConfusionInfo({
    userMessage,
    assessment,
    node,
    session,
    useRecentHistory: session.helpRequested || !`${userMessage || ''}`.trim(),
  })
  const duplicateAncestor = confusionInfo.topic
    ? findMatchingAncestorTopic({
        graphNodes: session.graphNodes || [],
        nodeId: node.id,
        topic: confusionInfo.topic,
      })
    : null
  const depthCapReached = isDynamicNode(node, session) && (node.clarificationDepth || 0) >= 3
  const shouldExpand = confusionInfo.expressedConfusion &&
    isRootDynamicGraphSession(session) &&
    !depthCapReached &&
    !duplicateAncestor

  log('decideNextAction:expandCheck', {
    shouldExpand,
    misconceptionDetected: assessment.misconceptionDetected,
    priorMisconceptionCount,
    subtopicSuggestionCount: assessment.subtopicSuggestions?.length || 0,
    missingConceptCount: assessment.missingConcepts?.length || 0,
    nodeAttempts,
    userExpressedConfusion: confusionInfo.expressedConfusion,
    confusionTopic: confusionInfo.topic,
    confusionSource: confusionInfo.source || '',
    duplicateAncestorId: duplicateAncestor?.id || '',
    depthCapReached,
    hasStrongCore,
    hasPartialCore,
    bestScores,
    effectiveScores,
  })

  if (shouldExpand) {
    next.nextAction = 'expand_graph'
    next.confusionInfo = confusionInfo
    return next
  }

  if (isRootDynamicGraphSession(session) && confusionInfo.expressedConfusion) {
    next.nextAction = PROMPT_KINDS.TEACH
    next.reason = depthCapReached
      ? `The learner is explicitly confused about "${confusionInfo.topic || UNKNOWN_CONFUSION_TOPIC}", but the clarification depth cap was reached.`
      : duplicateAncestor
        ? `The learner is explicitly confused about "${confusionInfo.topic || UNKNOWN_CONFUSION_TOPIC}", which already exists in the active ancestry.`
        : assessment.conciseRationale
    next.confusionInfo = confusionInfo
    return next
  }

  if (node.promptKind === PROMPT_KINDS.MCQ) {
    next.nextAction = mcqCorrect ? PROMPT_KINDS.REASSESS : PROMPT_KINDS.TEACH
    next.markState = NODE_STATES.PARTIAL
    next.mcqOutcome = {
      correct: mcqCorrect,
      mode: node.pendingMcqMode || 'diagnostic',
    }
    next.reason = mcqCorrect
      ? `The learner selected the correct option for "${node.title}", but still needs to explain why it is right in their own words.`
      : `The learner selected an incorrect option for "${node.title}", so the tutor should correct the misconception before asking for an explanation.`
    return next
  }

  if (isDynamicNode(node, session)) {
    const nextGoodTurnCount = (node.simpleGoodTurnCount || 0) + (isDirectionallyCorrectAssessment(assessment) ? 1 : 0)
    const nextPartialStruggleCount = (node.partialStruggleCount || 0) +
      (hasNonEmptyResponse && isMeaningfulButInsufficientAssessment(assessment) ? 1 : 0)
    const meetsDynamicMasteryThreshold =
      nextGoodTurnCount >= 2 &&
      hasDynamicMasteryScores(effectiveScores)

    if (meetsDynamicMasteryThreshold) {
      next.nextAction = 'mark_mastered'
      next.markState = node.withSupportUsed ? NODE_STATES.MASTERED_WITH_SUPPORT : NODE_STATES.MASTERED_INDEPENDENTLY
      return next
    }

    if (
      !node.checkpointMcqCompleted &&
      hasNonEmptyResponse &&
      isMeaningfulButInsufficientAssessment(assessment) &&
      nextPartialStruggleCount >= 2
    ) {
      next.nextAction = PROMPT_KINDS.MCQ
      next.markState = NODE_STATES.PARTIAL
      next.mcqMode = 'checkpoint'
      next.reason = `The learner has given multiple partial answers on "${node.title}". Use a checkpoint MCQ to probe the mechanism before continuing.`
      return next
    }

    if (isDirectionallyCorrectAssessment(assessment)) {
      next.nextAction = PROMPT_KINDS.REASSESS
      next.markState = NODE_STATES.PARTIAL
      next.reason = nextGoodTurnCount >= 2
        ? `The learner has the gist of "${node.title}", but still needs a stronger mechanism-level explanation before the clarification can close.`
        : `The learner showed some correct causal understanding of "${node.title}". Ask for a stronger explanation that connects the subtopic back to the parent idea.`
      return next
    }

    if (hasNonEmptyResponse && isMeaningfulButInsufficientAssessment(assessment)) {
      next.nextAction = PROMPT_KINDS.REASSESS
      next.markState = NODE_STATES.PARTIAL
      next.reason = `The learner is engaging with "${node.title}", but has not yet explained the mechanism clearly enough. Ask for a more concrete why/how explanation.`
      return next
    }

    next.nextAction = PROMPT_KINDS.TEACH
    next.reason = `The learner has not yet shown enough understanding to complete the clarification node "${node.title}".`
    return next
  }

  const hasTransfer = effectiveScores.transfer >= 1

  if (node.promptKind === PROMPT_KINDS.RECALL) {
    if (assessment.explanation >= 2 && assessment.causalReasoning >= 1) {
      next.scheduleRecall = false
    }
  }

  if (assessment.misconceptionDetected) {
    next.nextAction = PROMPT_KINDS.MCQ
    next.mcqMode = 'misconception'
    return next
  }

  if (
    node.nodeType === NODE_TYPES.ROOT &&
    !node.checkpointMcqCompleted &&
    hasPartialCore &&
    !hasTransfer
  ) {
    next.nextAction = PROMPT_KINDS.MCQ
    next.markState = NODE_STATES.PARTIAL
    next.mcqMode = 'checkpoint'
    next.reason = `Before moving past "${node.title}", run a checkpoint MCQ to verify the learner can distinguish the right causal story from nearby misconceptions.`
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

  const recallJustSucceeded = node.promptKind === PROMPT_KINDS.RECALL &&
    assessment.explanation >= 2 && assessment.causalReasoning >= 1
  const effectiveRecallCount = (node.successfulRecallCount || 0) +
    (recallJustSucceeded ? 1 : 0)

  if (effectiveRecallCount < 1) {
    next.nextAction = PROMPT_KINDS.RECALL
    next.markState = NODE_STATES.PARTIAL
    next.scheduleRecall = true
    return next
  }

  next.nextAction = 'mark_mastered'
  next.markState = node.withSupportUsed ? NODE_STATES.MASTERED_WITH_SUPPORT : NODE_STATES.MASTERED_INDEPENDENTLY
  return next
}

const buildFallbackTutorContent = ({ node, decision, assessment, promptText }) => {
  const lead = decision?.nextAction === 'mark_mastered'
    ? `Nice progress on ${node?.title || 'this concept'}.`
    : `Let's focus on ${node?.title || 'this concept'}.`
  const focus = assessment?.tutorFocus || 'Give a short plain-language answer.'
  return `${lead} ${focus}\n\n${promptText}`.trim()
}

const plannerNode = async (state) => {
  const { session, activeNode, latestAssessment, seedConcept, decision } = state
  const skippedNodeTitles = (session.graphNodes || [])
    .filter((n) => n.status === NODE_STATES.SKIPPED)
    .map((n) => n.title)
  const confusionTopic = decision?.confusionInfo?.topic || null
  log('plannerNode:start', {
    activeNodeId: activeNode?.id,
    activeNodeTitle: activeNode?.title,
    existingNodeCount: (session.graphNodes || []).length,
    existingNodeIds: (session.graphNodes || []).map((n) => n.id),
    skippedNodeTitles,
    confusionTopic,
  })

  let expansion
  try {
    expansion = await callStructuredPrompt({
      systemPrompt: 'You are Forest Sprint 4 ConceptPlanner. Return structured JSON only.',
      userPrompt: createExpansionPrompt({
        seedConcept,
        node: activeNode,
        latestAssessment,
        skippedNodeTitles,
        confusionTopic,
      }),
      schema: ExpansionSchema,
      model: MODEL_BY_CONTEXT.planner,
    })
  } catch (error) {
    const fallbackNode = createDeterministicClarificationNode({
      activeNode,
      confusionInfo: decision?.confusionInfo,
      session,
    })
    log('plannerNode:fallback', {
      activeNodeId: activeNode?.id,
      confusionTopic,
      error: error instanceof Error ? error.message : 'Unknown planner error',
      fallbackNodeId: fallbackNode.id,
      fallbackTopic: fallbackNode.derivedFromTopic,
    })
    expansion = {
      reason: `Deterministic clarification fallback for "${fallbackNode.derivedFromTopic}".`,
      newNodes: [fallbackNode],
      retargetNodeId: '',
    }
  }

  const newNodes = normalizeLightNodes(expansion.newNodes, session.graphNodes || []).map((node) => ({
    ...node,
    nodeType: NODE_TYPES.DYNAMIC,
    clarificationDepth: node.clarificationDepth > 0
      ? node.clarificationDepth
      : (activeNode?.clarificationDepth || 0) + 1,
    derivedFromTopic: node.derivedFromTopic || normalizeConfusionTopic(decision?.confusionInfo?.topic || node.title),
  }))

  const existingIds = new Set((session.graphNodes || []).map((n) => n.id))
  const rawRetarget = slugify(expansion.retargetNodeId || '')
  const retargetNodeId = existingIds.has(rawRetarget) ? rawRetarget : ''

  log('plannerNode:result', {
    reason: expansion.reason,
    retargetNodeId,
    rawRetargetNodeId: expansion.retargetNodeId,
    rawNewNodeCount: expansion.newNodes.length,
    normalizedNewNodes: newNodes.map((n) => ({
      id: n.id, title: n.title, status: n.status, parentIds: n.parentIds,
    })),
  })

  return {
    plannerPatch: {
      reason: expansion.reason,
      newNodes,
      retargetNodeId,
    },
  }
}

const assessmentNode = async (state) => {
  const { session, activeNode, userMessage, helpRequested, seedConcept } = state
  log('assessmentNode:start', {
    activeNodeId: activeNode?.id,
    activeNodeTitle: activeNode?.title,
    activeNodeStatus: activeNode?.status,
    activeNodePromptKind: activeNode?.promptKind,
    userMessageLength: userMessage?.length || 0,
    userMessagePreview: (userMessage || '').slice(0, 120),
    helpRequested,
    messageCount: (session.messages || []).length,
    nodeMessageCount: (session.messages || []).filter((m) => m.nodeId === activeNode?.id).length,
  })
  if (!userMessage.trim()) {
    log('assessmentNode:fallback', 'empty user message, using fallback assessment')
    return {
      latestAssessment: createFallbackAssessment({
        helpRequested,
        node: activeNode,
        evidenceRecords: session.evidenceRecords || [],
        userMessage,
        session,
      }),
    }
  }

  let assessment
  try {
    assessment = await callStructuredPrompt({
      systemPrompt: 'You are Forest Sprint 4 Assessment. Return strict JSON only. Do not speak to the student.',
      userPrompt: createAssessmentPrompt({
        seedConcept,
        node: activeNode,
        recentMessages: formatRecentMessages(session.messages || [], activeNode.id),
        userMessage,
        helpRequested,
        uploadedDocContext: getUploadedDocContext(session),
      }),
      schema: AssessmentSchema,
      model: MODEL_BY_CONTEXT.assessment,
    })
  } catch (error) {
    assessment = createFallbackAssessment({
      helpRequested,
      node: activeNode,
      evidenceRecords: session.evidenceRecords || [],
      userMessage,
      session,
    })
    log('assessmentNode:fallback', {
      activeNodeId: activeNode?.id,
      error: error instanceof Error ? error.message : 'Unknown assessment error',
      confusionTopic: assessment.missingConcepts?.[0] || '',
    })
  }

  log('assessmentNode:result', {
    explanation: assessment.explanation,
    causalReasoning: assessment.causalReasoning,
    transfer: assessment.transfer,
    misconceptionDetected: assessment.misconceptionDetected,
    misconceptionLabel: assessment.misconceptionLabel,
    recommendedAction: assessment.recommendedAction,
    subtopicSuggestions: assessment.subtopicSuggestions?.length || 0,
    missingConcepts: assessment.missingConcepts,
    rationale: assessment.conciseRationale,
  })

  return { latestAssessment: assessment }
}

const decisionNode = async (state) => {
  const { session, activeNode, latestAssessment, userMessage } = state
  const decision = decideNextAction({
    node: activeNode,
    assessment: latestAssessment,
    session,
    evidenceRecords: session.evidenceRecords || [],
    userMessage,
  })
  log('decisionNode:result', {
    activeNodeId: activeNode?.id,
    nextAction: decision.nextAction,
    markState: decision.markState,
    scheduleRecall: decision.scheduleRecall,
    activateNodeId: decision.activateNodeId,
    confusionTopic: decision.confusionInfo?.topic || null,
    reason: decision.reason,
  })
  return { decision }
}

const tutorNode = async (state) => {
  const { seedConcept, session, activeNode, latestAssessment, decision, plannerPatch, userMessage, helpRequested } = state
  const currentTurn = (session.turnIndex || 0) + 1

  log('tutorNode:start', {
    activeNodeId: activeNode?.id,
    activeNodeTitle: activeNode?.title,
    activeNodeStatus: activeNode?.status,
    activeNodeParentIds: activeNode?.parentIds,
    decisionAction: decision?.nextAction,
    decisionMarkState: decision?.markState,
    hasPlannerPatch: !!plannerPatch?.newNodes?.length,
    newNodeCount: plannerPatch?.newNodes?.length || 0,
    currentTurn,
    currentNodeId: session.currentNodeId,
  })

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
    const newNodeIds = plannerPatch.newNodes.map((entry) => entry.id)
    log('tutorNode:expansion', {
      activeNodeId: activeNode.id,
      activeNodePreviousParentIds: activeNode.parentIds,
      activeNodePreviousStatus: activeNode.status,
      newChildNodeIds: newNodeIds,
      action: 'Adding new nodes as parents of active node, locking active node',
    })
    graphNodes = graphNodes.map((node) => (
      node.id === activeNode.id
        ? {
            ...node,
            parentIds: dedupe([...(node.parentIds || []), ...newNodeIds]),
            status: NODE_STATES.LOCKED,
          }
        : node
    ))
    graphNodes.push(...plannerPatch.newNodes)
    const activeAfterPatch = graphNodes.find((n) => n.id === activeNode.id)
    log('tutorNode:expansion:afterPatch', {
      activeNodeId: activeNode.id,
      activeNodeNewParentIds: activeAfterPatch?.parentIds,
      activeNodeNewStatus: activeAfterPatch?.status,
      totalNodes: graphNodes.length,
      allNodes: graphNodes.map((n) => ({ id: n.id, status: n.status, parentIds: n.parentIds })),
    })
    events.push(createEvent('graph_expanded', {
      sourceNodeId: activeNode.id,
      newNodeIds: plannerPatch.newNodes.map((node) => node.id),
      reason: plannerPatch.reason,
    }))
    events.push(createEvent('dynamic_child_created', {
      sourceNodeId: activeNode.id,
      newNodeIds,
      topics: plannerPatch.newNodes.map((node) => node.derivedFromTopic || node.title),
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

  if (helpRequested || decision.nextAction === PROMPT_KINDS.TEACH) {
    events.push(createEvent('explanation_requested', {
      nodeId: currentNode.id,
      turnIndex: currentTurn,
    }))
  }

  const previousNodeId = session.currentNodeId
  const newAttempts = (currentNode.attempts || 0) + 1
  const dynamicGoodTurnIncrement = isDynamicNode(currentNode, session) && isDirectionallyCorrectAssessment(latestAssessment)
    ? 1
    : 0
  const dynamicPartialStruggleIncrement = isDynamicNode(currentNode, session) &&
    currentNode.promptKind !== PROMPT_KINDS.MCQ &&
    isNonEmptyLearnerMessage(userMessage) &&
    isMeaningfulButInsufficientAssessment(latestAssessment)
    ? 1
    : 0
  const checkpointMcqCompleted = currentNode.checkpointMcqCompleted ||
    (currentNode.promptKind === PROMPT_KINDS.MCQ && currentNode.pendingMcqMode === 'checkpoint')
  const nextNodeState = {
    ...currentNode,
    attempts: newAttempts,
    supportLevel: helpRequested ? (currentNode.supportLevel || 0) + 1 : currentNode.supportLevel || 0,
    withSupportUsed: currentNode.withSupportUsed || supportUsed,
    bestScores: getBestScores(currentNode, evidenceRecords),
    lastAssessmentSummary: latestAssessment.conciseRationale,
    simpleGoodTurnCount: isDynamicNode(currentNode, session)
      ? (currentNode.simpleGoodTurnCount || 0) + dynamicGoodTurnIncrement
      : (currentNode.simpleGoodTurnCount || 0),
    partialStruggleCount: isDynamicNode(currentNode, session)
      ? (currentNode.partialStruggleCount || 0) + dynamicPartialStruggleIncrement
      : (currentNode.partialStruggleCount || 0),
    promptKind: decision.nextAction === 'mark_mastered'
      ? (isDynamicNode(currentNode, session) ? currentNode.promptKind : PROMPT_KINDS.RECALL)
      : (decision.nextAction === 'expand_graph' ? currentNode.promptKind : decision.nextAction),
    lastMcqAtAttempt: decision.nextAction === PROMPT_KINDS.MCQ ? newAttempts : (currentNode.lastMcqAtAttempt || 0),
    checkpointMcqCompleted,
    pendingMcqMode: decision.nextAction === PROMPT_KINDS.MCQ ? (decision.mcqMode || '') : '',
  }

  const recallSucceeded = currentNode.promptKind === PROMPT_KINDS.RECALL &&
    latestAssessment.explanation >= 2 && latestAssessment.causalReasoning >= 1
  const mcqCorrect = currentNode.promptKind === PROMPT_KINDS.MCQ &&
    userMessage && /\(correct\)/i.test(userMessage)

  if (recallSucceeded) {
    nextNodeState.successfulRecallCount = (currentNode.successfulRecallCount || 0) + 1
    nextNodeState.recallScheduledAtTurn = null
    events.push(createEvent('recall_success', {
      nodeId: currentNode.id,
      successfulRecallCount: nextNodeState.successfulRecallCount,
    }))
  } else {
    nextNodeState.successfulRecallCount = currentNode.successfulRecallCount || 0
  }

  if (currentNode.promptKind === PROMPT_KINDS.MCQ) {
    events.push(createEvent(mcqCorrect ? 'mcq_correct' : 'mcq_incorrect', {
      nodeId: currentNode.id,
      mcqMode: currentNode.pendingMcqMode || 'diagnostic',
    }))
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
    events.push(createEvent('node_completed', {
      nodeId: currentNode.id,
      completedAt: new Date().toISOString(),
      turnIndex: currentTurn,
      finalStatus: masteryState,
    }))
  }

  log('tutorNode:nodeStateUpdate', {
    nodeId: nextNodeState.id,
    previousStatus: currentNode.status,
    newStatus: nextNodeState.status,
    promptKind: nextNodeState.promptKind,
    attempts: nextNodeState.attempts,
    simpleGoodTurnCount: nextNodeState.simpleGoodTurnCount,
    partialStruggleCount: nextNodeState.partialStruggleCount,
    bestScores: nextNodeState.bestScores,
    masteryState,
    parentIds: nextNodeState.parentIds,
  })

  graphNodes = graphNodes.map((node) => (node.id === nextNodeState.id ? nextNodeState : node))
  log('tutorNode:beforeMarkDependentAvailability', graphNodes.map((n) => ({
    id: n.id, status: n.status, parentIds: n.parentIds,
  })))
  graphNodes = markDependentAvailability(graphNodes)

  log('tutorNode:afterMarkDependentAvailability', graphNodes.map((n) => ({
    id: n.id, status: n.status,
  })))

  const retargetPreferred = plannerPatch?.retargetNodeId || ''
  const preferNodeId = retargetPreferred || nextNodeState.id
  let nextActiveNode = getNextEligibleNode({
    ...session,
    graphNodes,
    evidenceRecords,
    turnIndex: currentTurn,
    currentNodeId: nextNodeState.id,
  }, preferNodeId)

  if (decision.nextAction === PROMPT_KINDS.RECALL) {
    const altNode = getAlternativeEligibleNode({ ...session, graphNodes }, nextNodeState.id)
    log('tutorNode:recallAlternative', { altNodeId: altNode?.id || null })
    nextActiveNode = altNode || nextActiveNode
  }

  if (isMasteredNodeState(nextNodeState.status)) {
    log('tutorNode:mastered, finding next node', { masteredNodeId: nextNodeState.id })
    nextActiveNode = getNextEligibleNode({
      ...session,
      graphNodes,
      evidenceRecords,
      turnIndex: currentTurn,
      currentNodeId: nextNodeState.id,
    })
  }

  const nextNode = nextActiveNode || nextNodeState
  log('tutorNode:nextNode', {
    nextNodeId: nextNode.id,
    nextNodeTitle: nextNode.title,
    nextNodeStatus: nextNode.status,
    nextNodePromptKind: nextNode.promptKind,
    previousNodeId: session.currentNodeId,
    switched: nextNode.id !== session.currentNodeId,
  })
  const recentMessages = formatRecentMessages(session.messages || [], nextNode.id)

  if (nextNode.id !== previousNodeId) {
    events.push(createEvent('node_entered', {
      nodeId: nextNode.id,
      enteredAt: new Date().toISOString(),
      turnIndex: currentTurn,
    }))
  }

  const lockedNodes = graphNodes.filter((n) => n.status === NODE_STATES.LOCKED)
  for (const locked of lockedNodes) {
    const parents = (locked.parentIds || []).map((pid) => graphNodes.find((n) => n.id === pid)).filter(Boolean)
    const masteredParents = parents.filter((p) => isMasteredNodeState(p.status))
    if (parents.length > 1 && masteredParents.length === parents.length - 1) {
      const bottleneck = parents.find((p) => !isMasteredNodeState(p.status))
      if (bottleneck) {
        events.push(createEvent('dependency_bottleneck', {
          blockedNodeId: locked.id,
          bottleneckNodeId: bottleneck.id,
        }))
      }
    }
  }

  let mcqData = null
  if (decision.nextAction === PROMPT_KINDS.MCQ) {
    try {
      mcqData = await callStructuredPrompt({
        systemPrompt: 'You are Forest Sprint 4 MCQ generator. Return strict JSON only.',
        userPrompt: createMCQPrompt({ seedConcept, node: nextNode, latestAssessment }),
        schema: MCQSchema,
        model: MODEL_BY_CONTEXT.mcq_generate,
      })
    } catch { /* fall back to normal tutor message if MCQ generation fails */ }
  }

  let chainedQuestion = null
  if (decision.nextAction === PROMPT_KINDS.CHAINED) {
    const parentNodes = (nextNode.parentIds || []).map((pid) => graphNodes.find((n) => n.id === pid)).filter(Boolean)
    if (parentNodes.length > 0) {
      try {
        chainedQuestion = await callTextPrompt({
          systemPrompt: 'You generate a single integration question. Return only the question text.',
          messages: [{ role: 'user', content: createChainedReasoningPrompt({ seedConcept, node: nextNode, parentNodes }) }],
          model: MODEL_BY_CONTEXT.assessment,
          temperature: 0.4,
          maxCompletionTokens: 300,
        })
      } catch { /* fall back to normal tutor message */ }
    }
  }

  const promptText = chainedQuestion || getNodePrompt(nextNode, nextNode.promptKind)
  log('tutorNode:tutorPromptInput', {
    decisionAction: decision.nextAction,
    promptTextPreview: promptText.slice(0, 200),
    hasMcq: !!mcqData,
    hasChainedQuestion: !!chainedQuestion,
    recentMessagesPreview: recentMessages.slice(0, 300),
    nextNodeId: nextNode.id,
    nextNodePromptKind: nextNode.promptKind,
  })

  let tutorContent
  try {
    tutorContent = await callTextPrompt({
      systemPrompt: createGuidedTutorPrompt({
        seedConcept,
        node: nextNode,
        decision,
        assessment: latestAssessment,
        recentMessages,
        uploadedDocContext: getUploadedDocContext(session),
      }),
      messages: [{
        role: 'user',
        content: [
          `Decision action: ${decision.nextAction}`,
          `Use this node prompt when appropriate: ${promptText}`,
          `If the learner just mastered a previous node, transition naturally into this next focus: ${nextNode.title}`,
          mcqData ? `Present this as a multiple choice question instead of open-ended. Question: ${mcqData.question}\nOptions:\nA) ${mcqData.correctAnswer}\n${mcqData.distractors.map((d, i) => `${String.fromCharCode(66 + i)}) ${d.text}`).join('\n')}` : '',
        ].filter(Boolean).join('\n'),
      }],
      temperature: 0.45,
      maxCompletionTokens: 900,
      model: MODEL_BY_CONTEXT.tutor,
    })
  } catch (error) {
    tutorContent = buildFallbackTutorContent({
      node: nextNode,
      decision,
      assessment: latestAssessment,
      promptText,
    })
    log('tutorNode:fallback', {
      nextNodeId: nextNode.id,
      error: error instanceof Error ? error.message : 'Unknown tutor error',
      decisionAction: decision.nextAction,
    })
  }

  const tutorMessage = createMessage({
    role: 'assistant',
    content: tutorContent,
    nodeId: nextNode.id,
    metadata: {
      promptKind: nextNode.promptKind,
      fromDecision: decision.nextAction,
      ...(mcqData ? { mcq: { ...mcqData, mode: decision.mcqMode || '' } } : {}),
    },
  })

  const learningCompleted = getLearningCompleted({ session, graphNodes })

  const metrics = { ...(session.metrics || createEmptyMetrics()) }
  if (helpRequested || decision.nextAction === PROMPT_KINDS.TEACH) {
    metrics.explanationRequestCount = (metrics.explanationRequestCount || 0) + 1
  }
  const nodeTs = metrics.nodeTimestamps || {}
  if (nextNode.id !== previousNodeId) {
    if (!nodeTs[nextNode.id]) nodeTs[nextNode.id] = {}
    nodeTs[nextNode.id].enteredAt = nodeTs[nextNode.id].enteredAt || new Date().toISOString()
  }
  if (masteryState && currentNode.id) {
    if (!nodeTs[currentNode.id]) nodeTs[currentNode.id] = {}
    nodeTs[currentNode.id].completedAt = new Date().toISOString()
  }
  metrics.nodeTimestamps = nodeTs

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
    metrics,
    currentNodeSummary: {
      id: nextNode.id,
      title: nextNode.title,
      status: nextNode.status,
    },
  }

  log('tutorNode:final', {
    currentNodeId: updatedSession.currentNodeId,
    phase: updatedSession.phase,
    turnIndex: updatedSession.turnIndex,
    learningCompleted,
    messageCount: updatedSession.messages.length,
    tutorMessagePreview: tutorMessage.content.slice(0, 200),
    tutorMessageNodeId: tutorMessage.nodeId,
    graphSummary: graphNodes.map((n) => ({ id: n.id, status: n.status, parentIds: n.parentIds })),
  })

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

const buildSeedNode = (seedConcept) => ({
  id: slugify(seedConcept),
  title: seedConcept,
  summary: seedConcept,
  initialPrompt: `Let's explore: ${seedConcept}. In your own words, explain what you understand about this topic so far.`,
  parentIds: [],
  isRoot: true,
  nodeType: NODE_TYPES.ROOT,
  clarificationDepth: 0,
  simpleGoodTurnCount: 0,
  derivedFromTopic: '',
  rubric: null,
  promptPack: null,
})

const DEFAULT_EVALUATION_BUNDLE = {
  prompts: [
    {
      id: 'explanation',
      title: 'Explain the concept',
      prompt: 'Explain, as if to a fellow student, the key ideas behind the concept you just studied. Cover the main mechanisms, why they work, and how the pieces fit together.',
    },
    {
      id: 'transfer',
      title: 'Apply to a new scenario',
      prompt: 'Describe how you would apply what you learned to a new, related problem you haven\'t seen before. Be specific about which ideas transfer and how.',
    },
    {
      id: 'misconception',
      title: 'Identify a misconception',
      prompt: 'What is a common misunderstanding someone might have about this topic? Explain why it\'s wrong and what the correct understanding is.',
    },
  ],
  scoringNotes: [
    'Award full marks for explanation if the learner accurately describes the core mechanisms and how they relate.',
    'For transfer, check that the learner correctly identifies which concepts apply and describes a concrete application.',
    'For misconception, the learner should identify a plausible wrong belief and clearly explain the correct alternative.',
  ],
}

export const generateStudyArtifacts = async (seedConcept) => {
  const trimmed = `${seedConcept || ''}`.trim() || BUILTIN_SEED_CONCEPT
  const seedNode = buildSeedNode(trimmed)
  const graphNodes = [addRuntimeFields({ ...seedNode, orderIndex: 0, depth: 0 })]

  return {
    seedConcept: trimmed,
    conceptSummary: trimmed,
    graphModel: SPRINT4_GRAPH_MODELS.ROOT_DYNAMIC,
    rootNodeId: seedNode.id,
    graphNodes,
    evaluationBundle: DEFAULT_EVALUATION_BUNDLE,
  }
}

export const getBuiltinStudyConfigRecord = () => {
  const artifacts = (() => {
    const seedNode = buildSeedNode(BUILTIN_SEED_CONCEPT)
    const graphNodes = [addRuntimeFields({ ...seedNode, orderIndex: 0, depth: 0 })]
    return {
      seedConcept: BUILTIN_SEED_CONCEPT,
      conceptSummary: BUILTIN_SEED_CONCEPT,
      graphModel: SPRINT4_GRAPH_MODELS.ROOT_DYNAMIC,
      rootNodeId: seedNode.id,
      graphNodes,
      evaluationBundle: DEFAULT_EVALUATION_BUNDLE,
    }
  })()

  const now = new Date().toISOString()
  return {
    id: BUILTIN_STUDY_ID,
    seedConcept: artifacts.seedConcept,
    conceptSummary: artifacts.conceptSummary,
    timeBudgetMs: DEFAULT_TIME_BUDGET_MS,
    graphModel: artifacts.graphModel,
    graphNodes: artifacts.graphNodes,
    evaluationBundle: artifacts.evaluationBundle,
    createdAt: now,
    updatedAt: now,
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
    graphModel: studyConfig.graphModel || SPRINT4_GRAPH_MODELS.LEGACY,
    phase: SPRINT4_PHASES.SELF_REPORT,
    status: 'active',
    currentNodeId: firstNode?.id || '',
    turnIndex: 0,
    graphNodes,
    evidenceRecords: [],
    messages: [],
    events: [createEvent('session_started', { condition })],
    evaluationAnswers: [],
    evaluationScores: [],
    surveyResponse: null,
    selfReport: null,
    uploadedDocuments: [],
    metrics: createEmptyMetrics(),
    learningCompletedAt: null,
    evaluationCompletedAt: null,
    surveyCompletedAt: null,
    timeBudgetMs: studyConfig.timeBudgetMs,
    instrumentationVersion: SPRINT4_INSTRUMENTATION_VERSION,
  }
}

export const buildInitialLearningMessages = ({ studyConfig, firstNode, condition }) => {
  if (!firstNode) return []
  const prompt = getNodePrompt(firstNode, PROMPT_KINDS.ASSESS)
  return [createMessage({
    role: 'assistant',
    content: condition === SPRINT4_CONDITIONS.GUIDED
      ? `We'll explore **${studyConfig.seedConcept}** together through a live concept map.\n\n${prompt}`
      : `You have a fixed study window to learn **${studyConfig.seedConcept}**. Ask whatever you want and use the conversation however you like.`,
    nodeId: firstNode.id,
  })]
}

export const runGuidedTurn = async ({ session, studyConfig, userMessage, helpRequested }) => {
  log('runGuidedTurn:start', {
    currentNodeId: session.currentNodeId,
    turnIndex: session.turnIndex,
    phase: session.phase,
    graphModel: session.graphModel || studyConfig.graphModel || SPRINT4_GRAPH_MODELS.LEGACY,
    nodeCount: (session.graphNodes || []).length,
    messageCount: (session.messages || []).length,
    evidenceCount: (session.evidenceRecords || []).length,
    userMessagePreview: (userMessage || '').slice(0, 120),
    helpRequested,
    allNodes: (session.graphNodes || []).map((n) => ({ id: n.id, status: n.status, parentIds: n.parentIds })),
  })

  const activeNode = session.graphNodes.find((node) => node.id === session.currentNodeId) ||
    getNextEligibleNode(session)

  if (!activeNode) {
    log('runGuidedTurn:noActiveNode', 'No eligible node found, transitioning to evaluation')
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

  log('runGuidedTurn:activeNode', {
    id: activeNode.id,
    title: activeNode.title,
    status: activeNode.status,
    promptKind: activeNode.promptKind,
    parentIds: activeNode.parentIds,
    attempts: activeNode.attempts,
    bestScores: activeNode.bestScores,
  })

  const result = await turnWorkflow.invoke({
    seedConcept: studyConfig.seedConcept,
    session: {
      ...session,
      graphModel: session.graphModel || studyConfig.graphModel || SPRINT4_GRAPH_MODELS.LEGACY,
      helpRequested,
    },
    activeNode,
    userMessage,
    helpRequested,
  })

  log('runGuidedTurn:complete', {
    newCurrentNodeId: result.updatedSession.currentNodeId,
    newTurnIndex: result.updatedSession.turnIndex,
    newPhase: result.updatedSession.phase,
    newNodeCount: (result.updatedSession.graphNodes || []).length,
    newAllNodes: (result.updatedSession.graphNodes || []).map((n) => ({ id: n.id, status: n.status, parentIds: n.parentIds })),
    tutorMessageNodeId: result.tutorMessage.nodeId,
    tutorMessagePreview: result.tutorMessage.content.slice(0, 150),
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
  let assistantContent
  try {
    assistantContent = await callTextPrompt({
      systemPrompt: createControlTutorSystemPrompt(studyConfig.seedConcept),
      messages: [...(session.messages || []), userMessageEntry].map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      })),
      temperature: 0.55,
      maxCompletionTokens: 1000,
      model: MODEL_BY_CONTEXT.tutor,
    })
  } catch (error) {
    assistantContent = `Let's keep working on ${studyConfig.seedConcept}. Tell me one specific part you're unsure about, or try explaining the main idea in one or two sentences.`
    log('runControlTurn:fallback', {
      error: error instanceof Error ? error.message : 'Unknown control tutor error',
      seedConcept: studyConfig.seedConcept,
    })
  }
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
    model: MODEL_BY_CONTEXT.evaluation_score,
  })

  return evaluationScores
}

export const __test = {
  normalizeConfusionTopic,
  inferConfusionInfo,
  createDeterministicClarificationNode,
  getLearningCompleted,
  isDirectionallyCorrectAssessment,
}

export { markDependentAvailability, getNextEligibleNode }
