// Transfer phase — probe, evaluator, remediation, router.
// Keeps remediation narrow. Rarely opens new subtopics.

import { z } from 'zod'
import { callJson, callText } from '../ai.js'
import { PHASES, PASS_THRESHOLDS, ACTIONS } from '../constants.js'

const historyBlock = (node, limit = 6) => {
  const msgs = (node.messages || []).slice(-limit)
  if (!msgs.length) return '(no prior turns)'
  return msgs.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')
}

const nodeContext = (node) => [
  `Concept: ${node.title}`,
  `Seed question: ${node.question}`,
].join('\n')

// Internal coverage checklist — scope hint for the agent, NOT a script.
const goalsBlock = ({ goals = [] } = {}) => {
  if (!Array.isArray(goals) || goals.length === 0) return ''
  const lines = goals.map((g, i) => `  ${i + 1}. ${g}`)
  return [
    'Internal coverage checklist (scope hint only — NOT a question bank, NOT to be read aloud):',
    ...lines,
    'Use these to stay in scope. Do NOT paraphrase a checklist item into a probe; do NOT enumerate',
    'the terms inside one.',
  ].join('\n')
}

// ── A. Transfer Probe ─────────────────────────────────────────────
// Near-transfer first, then farther transfer if the student passes.
export const probe = async ({ node, mode = 'near', goals = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals }) : ''
  const systemPrompt = [
    'You are the Transfer Probe Agent.',
    'Ask ONE question that applies the concept in a NEW context, not the one used to teach it.',
    '',
    'GROUND THE NEW CONTEXT CONCRETELY — name a specific object/scenario, not just a category.',
    '"Concrete" does NOT automatically mean "numeric". STAY INSIDE THE GOAL SCOPE shown below:',
    'if no goal is quantitative, use a specific qualitative scenario native to this concept\'s',
    'domain. Use numbers ONLY when the goals are quantitative, and only to the extent the goals',
    'require — don\'t invent math probes that the goals do not ask for.',
    '',
    'For mode=near, keep the new context structurally similar to what was taught.',
    'For mode=far, use a different domain with the same underlying structure, still concrete.',
    '',
    'IMPORTANT: tell the student explicitly that they can answer IN WORDS — describing the',
    'process step by step — rather than writing out raw math. The goal is understanding, not',
    'notation.',
    '',
    'One question, under 60 words, no teaching, no hints.',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsHint,
    `Mode: ${mode}`,
    `Recent turns:\n${historyBlock(node)}`,
    'Write the transfer question now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.6, maxCompletionTokens: 160 })
}

// ── B. Transfer Evaluator ─────────────────────────────────────────
const evalSchema = z.object({
  preservedStructure: z.number().min(0).max(1),
  appliedCorrectly: z.number().min(0).max(1),
  wordingConfusion: z.boolean(),
  exposesCausalWeakness: z.boolean(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
})

export const evaluate = async ({ node, studentAnswer, goals = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals }) : ''
  const systemPrompt = [
    'You are the Transfer Evaluator. Observe ONE thing: how well the STUDENT\'S current answer',
    'shows the concept travelling to a new context.',
    '',
    'Scoring rules — read carefully:',
    '- Every score is about the STUDENT\'S ANSWER, not your certainty about your own judgement.',
    '- Empty, filler ("yes"/"ok"/"what?"), off-topic, or requests for the tutor to explain must',
    '  score LOW across numeric fields (0.0 – 0.2).',
    '- ACCEPT WORD-BASED DESCRIPTIONS of math or procedure. A student who walks through the new',
    '  scenario step by step in plain language ("we save the cheapest cost to each intersection,',
    '  so when another path reaches it, we just read the stored value") is successfully transferring.',
    '  Do NOT require formal notation or algebra.',
    '- "confidence" is the overall QUALITY of the transfer attempt on this turn',
    '  (0 = none, 1 = correctly applied in the new context). NOT how sure you are of your judgement.',
    '',
    'Return STRICT JSON:',
    '  preservedStructure: 0..1',
    '  appliedCorrectly: 0..1',
    '  wordingConfusion: boolean  // failure was mostly about phrasing, not understanding',
    '  exposesCausalWeakness: boolean  // failure clearly reveals a mechanism gap',
    '  confidence: 0..1           // overall QUALITY of student transfer (see rules)',
    '  rationale: "..."',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsHint,
    `Last probe: ${node.phases.transfer.lastProbe || '(none)'}`,
    `Student answer: ${studentAnswer}`,
  ].filter(Boolean).join('\n\n')
  return callJson({ systemPrompt, userPrompt, schema: evalSchema, temperature: 0.1 })
}

// ── C. Transfer Remediation ───────────────────────────────────────
export const remediate = async ({ node, evaluation, goals = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals }) : ''
  const systemPrompt = [
    'You are the Transfer Remediation Agent.',
    'Offer ONE SIMPLER, MORE CONCRETE application case. "Concrete" = a specific scenario the',
    'student can picture; it is only numeric if the goals are quantitative. Use a case RELATED TO',
    'THIS CONCEPT — do not import examples from unrelated domains.',
    'If useful, compare the taught context and this new one side-by-side in a 2-3 line mini-trace.',
    'Then ask ONE follow-up that tests the transfer again in a slightly different concrete context.',
    '',
    'STAY INSIDE THE GOAL SCOPE — do not test dimensions the goals do not mention.',
    'Tell the student they can describe the answer in WORDS — step by step — rather than writing',
    'raw math. Do not reteach mechanism in depth — that is the causal phase.',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsHint,
    `Evaluator rationale: ${evaluation.rationale}`,
    `Preserved structure: ${evaluation.preservedStructure}`,
    `Wording confusion: ${evaluation.wordingConfusion}`,
    'Write the remediation + follow-up.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.4, maxCompletionTokens: 200 })
}

// ── D. Transfer Phase Router ──────────────────────────────────────
export const routePhase = ({ evaluation }) => {
  const threshold = PASS_THRESHOLDS[PHASES.TRANSFER]
  const { confidence, exposesCausalWeakness } = evaluation

  if (exposesCausalWeakness && confidence < threshold) {
    return { action: ACTIONS.REOPEN, targetPhase: PHASES.CAUSALITY, phase: PHASES.TRANSFER }
  }
  if (confidence < threshold) {
    return { action: ACTIONS.REMEDIATE, phase: PHASES.TRANSFER }
  }
  return { action: ACTIONS.ADVANCE, phase: PHASES.TRANSFER }
}
