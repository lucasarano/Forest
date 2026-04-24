// Recall phase — probe, evaluator, remediation, router.
// Recall should not usually open new subtopics; it reopens earlier phases.

import { z } from 'zod'
import { callJson, callText } from '../ai.js'
import { PHASES, PASS_THRESHOLDS, ACTIONS } from '../constants.js'

const nodeContext = (node) => [
  `Concept: ${node.title}`,
  `Seed question: ${node.question}`,
].join('\n')

// ── A. Recall Probe ───────────────────────────────────────────────
// Delayed retrieval: ask for the concept again with minimal hints.
export const probe = async ({ node }) => {
  const systemPrompt = [
    'You are the Recall Probe Agent.',
    'Ask ONE delayed-retrieval question. Avoid strong hints. Do NOT restate the concept.',
    'Example shapes: "Without scrolling back, restate <concept>.", "Explain <concept> from memory in two sentences."',
    'One question, under 30 words.',
  ].join('\n')
  const userPrompt = `${nodeContext(node)}\n\nWrite the recall question now.`
  return callText({ systemPrompt, userPrompt, temperature: 0.5, maxCompletionTokens: 100 })
}

// ── B. Recall Evaluator ───────────────────────────────────────────
const evalSchema = z.object({
  retrievedCoreIdea: z.number().min(0).max(1),
  stableExplanation: z.number().min(0).max(1),
  lostMechanism: z.boolean(),
  reopenTarget: z.enum(['none', 'explanation', 'causality']),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
})

export const evaluate = async ({ node, studentAnswer }) => {
  const systemPrompt = [
    'You are the Recall Evaluator. Observe retrieval quality of the STUDENT\'S current answer only.',
    '',
    'Scoring rules — read carefully:',
    '- Every score is about the STUDENT\'S ANSWER, not your certainty about your own judgement.',
    '- Empty, filler ("yes"/"ok"/"what?"), off-topic, or requests for the tutor to explain must',
    '  score LOW across numeric fields (0.0 – 0.2).',
    '- "confidence" is the overall QUALITY of the retrieval attempt on this turn',
    '  (0 = none, 1 = stable, correct retrieval). NOT how sure you are of your judgement.',
    '',
    'Return STRICT JSON:',
    '  retrievedCoreIdea: 0..1',
    '  stableExplanation: 0..1',
    '  lostMechanism: boolean  // student retrieves words but not the mechanism',
    '  reopenTarget: "none" | "explanation" | "causality"',
    '  confidence: 0..1          // overall QUALITY of student recall (see rules)',
    '  rationale: "..."',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    `Last probe: ${node.phases.recall.lastProbe || '(none)'}`,
    `Student answer: ${studentAnswer}`,
  ].join('\n\n')
  return callJson({ systemPrompt, userPrompt, schema: evalSchema, temperature: 0.1 })
}

// ── C. Recall Remediation ─────────────────────────────────────────
// Light-touch: quick restate + schedule another delayed check.
export const remediate = async ({ node }) => {
  const systemPrompt = [
    'You are the Recall Remediation Agent.',
    'Give a 1-2 sentence quick review, then ONE prompt asking the student to restate the concept',
    'without copying your review. No new teaching.',
  ].join('\n')
  const userPrompt = `${nodeContext(node)}\n\nWrite the quick review + restatement prompt.`
  return callText({ systemPrompt, userPrompt, temperature: 0.4, maxCompletionTokens: 140 })
}

// ── D. Recall Phase Router ────────────────────────────────────────
export const routePhase = ({ evaluation }) => {
  const threshold = PASS_THRESHOLDS[PHASES.RECALL]
  const { confidence, lostMechanism, reopenTarget } = evaluation

  if (reopenTarget === 'explanation' && confidence < threshold) {
    return { action: ACTIONS.REOPEN, targetPhase: PHASES.EXPLANATION, phase: PHASES.RECALL }
  }
  if ((reopenTarget === 'causality' || lostMechanism) && confidence < threshold) {
    return { action: ACTIONS.REOPEN, targetPhase: PHASES.CAUSALITY, phase: PHASES.RECALL }
  }
  if (confidence < threshold) {
    return { action: ACTIONS.REMEDIATE, phase: PHASES.RECALL }
  }
  return { action: ACTIONS.COMPLETE_NODE, phase: PHASES.RECALL }
}
