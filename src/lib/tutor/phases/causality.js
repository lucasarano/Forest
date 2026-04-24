// Causality phase — probe, evaluator, remediation, router.
// Phase where most subtopics are opened: mechanism gaps usually reveal
// missing prerequisites.

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

// Internal coverage checklist — scope hint for the agent, NOT a script to
// paraphrase to the student.
const goalsBlock = ({ goals = [] } = {}) => {
  if (!Array.isArray(goals) || goals.length === 0) return ''
  const lines = goals.map((g, i) => `  ${i + 1}. ${g}`)
  return [
    'Internal coverage checklist (scope hint only — NOT a question bank, NOT to be read aloud):',
    ...lines,
    'Use these to stay in scope and avoid drifting into dimensions the goals do not mention.',
    'Do NOT paraphrase a checklist item into a probe; do NOT enumerate the terms inside one.',
  ].join('\n')
}

// ── A. Causal Probe ───────────────────────────────────────────────
// Asks ONE mechanism/intervention question.
export const probe = async ({ node, mode = 'initial', goals = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals }) : ''
  const systemPrompt = [
    'You are the Causal Probe Agent.',
    'Ask ONE question about mechanism or intervention. GROUND IT IN A CONCRETE CASE DRAWN FROM',
    'THIS CONCEPT — name a specific object, part, step, or event before asking the "why" or',
    '"what-if". "Concrete" does NOT automatically mean "numeric". Use numbers ONLY when the',
    'learning goal is quantitative (rates, concentrations, calculations, algorithmic cost).',
    'STAY INSIDE THE GOAL SCOPE shown in the user prompt — do not introduce quantitative aspects',
    'the goals do not mention. Do NOT import examples from unrelated domains; derive the',
    'scenario from THIS concept.',
    '',
    'Preferred shape: one sentence of concrete setup, then a why / what-if question.',
    'Forms you can use (pick the one that fits this concept best):',
    '- State a specific situation in the concept, then ask why the next step happens.',
    '- Propose a small intervention ("if we change X in this specific case...") and ask what',
    '  follows and why.',
    '- Propose removing or breaking one element and ask what effect that has and why.',
    '',
    'Avoid purely abstract "why does this happen?" with no scenario. The student should be',
    'reasoning about something specific they can picture.',
    '',
    'Tell the student they can answer in words — no formal math required.',
    'Under 55 words. ONE question. No teaching. No multi-part questions.',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsHint,
    `Mode: ${mode}`,
    `Recent turns:\n${historyBlock(node)}`,
    'Write the next question now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.6, maxCompletionTokens: 120 })
}

// ── B. Causal Evaluator ───────────────────────────────────────────
const evalSchema = z.object({
  explainedCauseAndEffect: z.number().min(0).max(1),
  understandsDirectionality: z.number().min(0).max(1),
  reasonedThroughChanges: z.number().min(0).max(1),
  magicalLanguage: z.boolean(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  localOrPrerequisite: z.enum(['local', 'prerequisite', 'unclear']),
  suspectedPrerequisiteGap: z.string().nullable().optional(),
  explanationFoundationWeak: z.boolean(),
})

export const evaluate = async ({ node, studentAnswer, goals = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals }) : ''
  const systemPrompt = [
    'You are the Causal Evaluator. You observe ONE thing: how well the STUDENT\'S current answer',
    'shows they understand why and how the concept works.',
    '',
    'Scoring rules — read carefully:',
    '- Every score is about the STUDENT\'S ANSWER quality, not your certainty about your own judgement.',
    '- Empty, filler ("yes"/"ok"/"what?"), off-topic, or answers that ask the tutor to explain',
    '  must score LOW across all numeric fields (0.0 – 0.2).',
    '- Only give scores ≥ 0.7 when the student actually reasoned through cause and effect.',
    '- ACCEPT WORD-BASED MECHANISM DESCRIPTIONS. A student describing the mechanism in plain',
    '  words anchored to a specific scenario within THIS concept is just as valid as formal',
    '  math or jargon. Do NOT penalize for lack of notation. Focus on whether cause → effect is',
    '  actually articulated.',
    '- "confidence" is the overall QUALITY of the student\'s causal reasoning on this turn',
    '  (0 = none, 1 = clear and correct mechanism). NOT how sure you are of your judgement.',
    '',
    'Return STRICT JSON:',
    '  explainedCauseAndEffect: 0..1',
    '  understandsDirectionality: 0..1',
    '  reasonedThroughChanges: 0..1',
    '  magicalLanguage: boolean  // uses vague, superficial, or magical phrasing',
    '  confidence: 0..1          // overall QUALITY of student causal reasoning (see rules)',
    '  rationale: "..."',
    '  localOrPrerequisite: "local" | "prerequisite" | "unclear"',
    '  suspectedPrerequisiteGap: "..." or null  // small concept name if a missing idea blocks mechanism',
    '  explanationFoundationWeak: boolean  // if causal failure actually exposes a weaker earlier explanation',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsHint,
    `Last probe: ${node.phases.causality.lastProbe || '(none)'}`,
    `Student answer: ${studentAnswer}`,
  ].filter(Boolean).join('\n\n')
  return callJson({ systemPrompt, userPrompt, schema: evalSchema, temperature: 0.1 })
}

// ── C. Causal Remediation ─────────────────────────────────────────
// Narrow: used when the student said something mechanistically wrong (magical
// language, reversed causality). For vague-but-not-wrong answers, use guide.
export const remediate = async ({ node, evaluation, goals = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals }) : ''
  const systemPrompt = [
    'You are the Causal Remediation Agent.',
    'The student said something mechanistically incorrect. Correct it using a CONCRETE tiny',
    'example DRAWN FROM THIS CONCEPT — a specific scenario native to the topic, not an abstract',
    'phrasing and not an example imported from an unrelated domain. Name the specific wrong move,',
    'show what actually happens in the worked case, then ask ONE follow-up why/how question',
    'grounded in that same scenario. Use numbers ONLY if the goals are quantitative.',
    '',
    'STAY INSIDE THE GOAL SCOPE — do not introduce dimensions the goals do not mention.',
    '',
    'Total length: 3-4 short sentences or a 3-line mini-trace. Do NOT do a full lecture. Do NOT',
    'restart the concept. Tell the student they can answer in words.',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsHint,
    `Last probe: ${node.phases.causality.lastProbe || '(none)'}`,
    `Evaluator rationale: ${evaluation.rationale}`,
    `Magical language: ${evaluation.magicalLanguage}`,
    `Understands directionality: ${evaluation.understandsDirectionality}`,
    'Write the remediation + follow-up question.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.4, maxCompletionTokens: 220 })
}

// ── C2. Causal Guided Teaching ───────────────────────────────────
// Teach forward through the mechanism with a concrete worked step. Used when
// the student is vague or partial but not factually wrong.
export const guide = async ({ node, evaluation, goals = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals }) : ''
  const systemPrompt = [
    'You are the Causal Guided Teaching Agent. The student has not yet articulated the',
    'mechanism clearly. Do NOT re-ask "why does this happen?" — TEACH FORWARD.',
    '',
    'Approach:',
    '1. Pick a tiny concrete scenario DRAWN FROM THIS CONCEPT and walk ONE causal step yourself.',
    '   Use specific objects/parts/steps native to the topic. Show the CAUSE producing the EFFECT',
    '   in one move. Use numbers ONLY if the goals are quantitative.',
    '2. Then hand the student the NEXT causal step as a prediction question. "If we change X,',
    '   what happens to Y, and why?" — not "explain the mechanism."',
    '',
    'Style:',
    '- Under 100 words. Bullets or a 3-line mini-trace are fine.',
    '- Concrete, not abstract. Name actual specifics from this topic.',
    '- STAY INSIDE THE GOAL SCOPE — no off-goal dimensions.',
    '- Do NOT import examples from unrelated domains.',
    '- No apology, no recap, no "let me help you".',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsHint,
    `Last probe: ${node.phases.causality.lastProbe || '(none)'}`,
    `Evaluator rationale: ${evaluation?.rationale || '(none)'}`,
    `Signals — confidence=${evaluation?.confidence ?? 'n/a'}, magicalLanguage=${evaluation?.magicalLanguage ?? false}`,
    'Write the guided causal step + prediction question now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.5, maxCompletionTokens: 240 })
}

// ── D. Causal Phase Router ────────────────────────────────────────
export const routePhase = ({ evaluation, phaseRecord }) => {
  const threshold = PASS_THRESHOLDS[PHASES.CAUSALITY]
  const {
    confidence,
    localOrPrerequisite,
    suspectedPrerequisiteGap,
    explanationFoundationWeak,
    magicalLanguage,
  } = evaluation

  if (explanationFoundationWeak && confidence < threshold) {
    return { action: ACTIONS.REOPEN, targetPhase: PHASES.EXPLANATION, phase: PHASES.CAUSALITY }
  }
  if (
    localOrPrerequisite === 'prerequisite'
    && suspectedPrerequisiteGap
    && phaseRecord.attempts >= 2
    && confidence < threshold
  ) {
    return {
      action: ACTIONS.OPEN_SUBTOPIC,
      reason: suspectedPrerequisiteGap,
      phase: PHASES.CAUSALITY,
    }
  }
  // Clear mechanistic error → REMEDIATE (correct it). Otherwise → GUIDE (teach forward).
  if (confidence < threshold) {
    if (magicalLanguage) {
      return { action: ACTIONS.REMEDIATE, phase: PHASES.CAUSALITY }
    }
    return { action: ACTIONS.GUIDE, phase: PHASES.CAUSALITY }
  }
  return { action: ACTIONS.ADVANCE, phase: PHASES.CAUSALITY }
}
