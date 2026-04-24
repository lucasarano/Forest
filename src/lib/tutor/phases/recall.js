// Recall phase — 3 short recall questions per learning goal.
//
// Flow:
//   - When entering recall, the runtime builds a plan of { goalIndex, attempt }
//     entries (3 per goal). The plan is stored on state.recallPlan and the
//     first probe is generated immediately.
//   - Each turn: evaluate the student's answer to the current question.
//     - Correct → advance the plan index; generate the next probe or finish.
//     - Wrong → guide the student with the correct idea, flag restartAvailable,
//       and ask ONE follow-up re-asking the same question.
//   - When every question has been answered correctly, the node completes.
//
// Recall does NOT open new subtopics. It only tests what was taught.

import { z } from 'zod'
import { callJson, callText } from '../ai.js'
import { PHASES, PASS_THRESHOLDS, ACTIONS } from '../constants.js'

const QUESTIONS_PER_GOAL = 3

const nodeContext = (node) => [
  `Concept: ${node.title}`,
  `Seed question: ${node.question}`,
].join('\n')

const historyBlock = (node, limit = 10) => {
  const msgs = (node.messages || []).slice(-limit)
  if (!msgs.length) return '(no prior turns)'
  return msgs.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')
}

// Build the initial plan: QUESTIONS_PER_GOAL entries for each learning goal.
// If there are no explicit goals, fall back to 3 generic recall questions.
export const buildPlan = ({ goals = [] } = {}) => {
  const safeGoals = Array.isArray(goals) ? goals : []
  const entries = []
  if (safeGoals.length === 0) {
    for (let k = 0; k < QUESTIONS_PER_GOAL; k += 1) {
      entries.push({ goalIndex: null, attempt: k, status: 'pending', asked: null, answer: null })
    }
  } else {
    for (let g = 0; g < safeGoals.length; g += 1) {
      for (let k = 0; k < QUESTIONS_PER_GOAL; k += 1) {
        entries.push({ goalIndex: g, attempt: k, status: 'pending', asked: null, answer: null })
      }
    }
  }
  return {
    entries,
    currentIndex: 0,
    questionsPerGoal: QUESTIONS_PER_GOAL,
    totalWrong: 0,
    createdAt: new Date().toISOString(),
  }
}

export const planComplete = (plan) => {
  if (!plan) return false
  return plan.currentIndex >= plan.entries.length
}

export const currentEntry = (plan) => {
  if (!plan) return null
  return plan.entries[plan.currentIndex] || null
}

// Produce a short, simple recall question targeting a specific learning goal.
// The question should surface memory of what was taught in THIS session — not
// introduce new material.
export const probeForGoal = async ({ node, goal, goalIndex, attempt, priorAsked = [] }) => {
  const goalLine = goal
    ? `Target goal #${(goalIndex ?? 0) + 1}: ${goal}`
    : 'No explicit goal — ask a simple recall question on the root concept.'
  const variation = [
    'Shape: a direct "what is X" or "name the..." retrieval question.',
    'Shape: a short scenario retrieval — "in ONE sentence, what does Y do when Z happens?"',
    'Shape: a small contrast — "briefly, what is the difference between A and B (as we used them)?"',
  ][attempt % 3]
  const systemPrompt = [
    'You are the Recall Question Agent. Ask ONE very simple question that checks whether the',
    'student still remembers the key idea tied to the target goal below.',
    '',
    'Rules:',
    '- Base the question on what was actually taught in this session — do NOT introduce new',
    '  content, new terms, or new scenarios.',
    '- Keep it short and concrete. Under 30 words. One question, no preamble, no hints.',
    '- Do NOT restate or paraphrase the goal. Derive a simple check from it.',
    '- Avoid repeating any prior recall question verbatim.',
    '- Tell the student they can answer in one short sentence.',
    '',
    variation,
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalLine,
    priorAsked.length
      ? `Already asked (do not repeat verbatim):\n${priorAsked.map((q) => `- ${q}`).join('\n')}`
      : '',
    `Session history (for memory of what was taught):\n${historyBlock(node, 14)}`,
    'Write the recall question now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.5, maxCompletionTokens: 80 })
}

// Evaluator: did the student retrieve the correct idea for THIS question?
// Strict pass/fail — confidence is a simple correctness score.
const evalSchema = z.object({
  correct: z.boolean(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  // Short correct answer we can echo if the student got it wrong.
  correctIdea: z.string().nullable().optional(),
})

export const evaluate = async ({ node, studentAnswer, goal }) => {
  const systemPrompt = [
    'You are the Recall Evaluator. The student was asked a short retrieval question tied to a',
    'specific learning goal. Decide whether their answer demonstrates they remembered the key',
    'idea from this session.',
    '',
    'Rules:',
    '- Be lenient on phrasing; strict on substance. A short, plain-language correct idea passes.',
    '- "I don\'t know", filler, or off-topic → correct=false, confidence ≤ 0.2.',
    '- Partially correct but missing the core idea → correct=false, confidence 0.3–0.5.',
    '- Clearly captures the core idea → correct=true, confidence ≥ 0.75.',
    '- "correctIdea" is one short sentence stating the correct answer (used if the student was wrong).',
    '',
    'Return STRICT JSON:',
    '  correct: boolean',
    '  confidence: 0..1',
    '  rationale: "..."',
    '  correctIdea: "..." | null',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goal ? `Target goal: ${goal}` : '',
    `Last probe: ${node.phases.recall.lastProbe || '(none)'}`,
    `Student answer: ${studentAnswer}`,
  ].filter(Boolean).join('\n\n')
  return callJson({ systemPrompt, userPrompt, schema: evalSchema, temperature: 0.1 })
}

// Short coaching when the student got a recall question wrong: give the
// correct idea in one line, then re-ask (same question, slightly re-framed).
export const guide = async ({ node, evaluation, goal }) => {
  const correctIdea = evaluation?.correctIdea || ''
  const systemPrompt = [
    'You are the Recall Guide Agent. The student got a recall question wrong. Give them the',
    'correct idea in ONE short sentence, then gently re-ask the SAME question so they can try',
    'again. Do NOT teach new material. Do NOT restart the concept.',
    '',
    'Output shape (keep it tight, under 50 words):',
    '1. One line with the correct idea (use the provided correctIdea if given, otherwise restate',
    '   it yourself in plain words).',
    '2. One short follow-up re-asking the same question in a slightly different phrasing.',
    '',
    'Tell the student they can answer in a short sentence. You may also tell them they can',
    '**restart the homework** if they want to go through the concept again from the beginning —',
    'but only mention this once, not in every response.',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goal ? `Target goal: ${goal}` : '',
    `Last probe: ${node.phases.recall.lastProbe || '(none)'}`,
    `Correct idea to deliver: ${correctIdea || '(not provided — restate the key idea yourself)'}`,
    'Write the coaching + re-ask now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.4, maxCompletionTokens: 140 })
}

// Router: recall is driven by simple correct/wrong rather than confidence buckets.
// The runtime handles plan advancement; the router only reports the verdict.
export const routePhase = ({ evaluation, plan }) => {
  const correct = !!evaluation?.correct
  if (!correct) {
    return { action: ACTIONS.GUIDE, phase: PHASES.RECALL, reason: 'recall_wrong' }
  }
  if (planComplete(plan)) {
    return { action: ACTIONS.COMPLETE_NODE, phase: PHASES.RECALL }
  }
  return { action: ACTIONS.CONTINUE, phase: PHASES.RECALL, reason: 'advance_plan' }
}

// Legacy remediate kept for compatibility with runtime's default decision paths.
export const remediate = guide

export const QUESTIONS_PER_GOAL_COUNT = QUESTIONS_PER_GOAL
