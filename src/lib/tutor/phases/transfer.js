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
const goalsBlock = ({ goals = [], goalsCovered = [] } = {}) => {
  if (!Array.isArray(goals) || goals.length === 0) return ''
  const lines = goals.map((g, i) => {
    const covered = goalsCovered[i] === true
    return `  ${i + 1}. [${covered ? 'x' : ' '}] ${g}`
  })
  return [
    'Internal coverage checklist (scope hint only — NOT a question bank, NOT to be read aloud):',
    ...lines,
    'Use these to stay in scope. Do NOT paraphrase a checklist item into a probe; do NOT enumerate',
    'the terms inside one.',
    'For transfer: apply an UNCOVERED goal to a new context first. Only revisit covered ones if',
    'the student\'s answer suggested the transfer failed on that goal.',
  ].join('\n')
}

// ── A. Transfer Probe ─────────────────────────────────────────────
// Near-transfer first, then farther transfer if the student passes.
export const probe = async ({ node, mode = 'near', goals = [], goalsCovered = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals, goalsCovered }) : ''
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
    'CONVERSATIONAL LEAD-IN — REQUIRED when the recent turns show prior student answers:',
    'Begin with ONE short clause (≤12 words, no question mark) that reacts to what the student',
    'just said. Affirm a correct piece or note where they were close. Examples: "Right — that',
    'maps over." / "Yes, the same idea applies here." Do NOT use hollow praise ("Nice work!").',
    'Do NOT restate the prior question. Do NOT lecture. After the lead-in, write the new question',
    'on the next line.',
    '',
    'One question, under 75 words total (including the lead-in), no teaching, no hints.',
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
  correctOutcomeButMissingWhy: z.boolean().optional().default(false),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  // 1-indexed goal numbers the student's answer clearly TRANSFERRED to the new context
  // on THIS turn. Only used when the concept has required learning goals.
  goalsAddressed: z.array(z.number().int()).optional().default([]),
})

export const evaluate = async ({ node, studentAnswer, goals = [], goalsCovered = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals, goalsCovered }) : ''
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
    '- If the student gets the transferred OUTCOME right but gives little or no why/how, set',
    '  appliedCorrectly high enough to reflect the correct outcome, set exposesCausalWeakness=true,',
    '  set correctOutcomeButMissingWhy=true, and score confidence as partial (about 0.45–0.6),',
    '  not as a total failure.',
    '- "confidence" is the overall QUALITY of the transfer attempt on this turn',
    '  (0 = none, 1 = correctly applied in the new context). NOT how sure you are of your judgement.',
    '',
    node?.isRoot && Array.isArray(goals) && goals.length > 0
      ? [
          'REQUIRED LEARNING GOALS — the user prompt lists numbered goals. For "goalsAddressed",',
          'return the 1-indexed numbers of ONLY those goals whose substance the student CLEARLY',
          'transferred to the new context on THIS turn. Be strict: vague or tangential references',
          'do not count. If none are demonstrated, return [].',
        ].join('\n')
      : 'This concept has no explicit learning goals; return [] for "goalsAddressed".',
    '',
    'Return STRICT JSON:',
    '  preservedStructure: 0..1',
    '  appliedCorrectly: 0..1',
    '  wordingConfusion: boolean  // failure was mostly about phrasing, not understanding',
    '  exposesCausalWeakness: boolean  // failure clearly reveals a mechanism gap',
    '  correctOutcomeButMissingWhy: boolean  // right outcome in new context, but why/how is thin',
    '  confidence: 0..1           // overall QUALITY of student transfer (see rules)',
    '  rationale: "..."',
    '  goalsAddressed: [1,2,...]  // 1-indexed goal numbers successfully transferred on THIS turn; [] if none',
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
export const remediate = async ({ node, evaluation, goals = [], goalsCovered = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals, goalsCovered }) : ''
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

// ── C2. Transfer Guided Why Follow-up ─────────────────────────────
// Used when the student mapped the outcome into the new context, but did not
// yet explain why the same structure holds. Stay in transfer; do not reopen
// causality unless the outcome itself is wrong.
export const guide = async ({ node, evaluation, goals = [], goalsCovered = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals, goalsCovered }) : ''
  const systemPrompt = [
    'You are the Transfer Guided Follow-up Agent.',
    'The student appears to have the transferred outcome mostly right, but their answer did',
    'not explain why/how the idea carries into the new context.',
    '',
    'Do NOT reopen the old causal phase. Stay on the SAME transfer scenario and ask for the',
    'missing why in one focused follow-up.',
    '',
    'Shape:',
    '1. Briefly acknowledge the correct outcome without overpraising.',
    '2. Ask ONE why/how follow-up tied to the exact scenario in the last probe.',
    '',
    'Under 55 words. No new scenario. No full reteach. No formal math requirement unless the',
    'goals are quantitative.',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsHint,
    `Last transfer probe: ${node.phases.transfer.lastProbe || '(none)'}`,
    `Evaluator rationale: ${evaluation.rationale}`,
    `Applied correctly: ${evaluation.appliedCorrectly}`,
    'Write the focused why/how follow-up now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.4, maxCompletionTokens: 140 })
}

// ── C2. Rescue Teach ─────────────────────────────────────────────
// Loop-breaker for transfer. The runtime routes here when the student has
// produced ≥2 consecutive give-up signals on the transfer phase. State the
// transferred takeaway plainly, then the runtime force-advances to recall.
// NO question, NO new probe.
export const rescueTeach = async ({ node, goals = [], goalsCovered = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals, goalsCovered }) : ''
  const recentMsgs = (node.messages || [])
    .slice(-10)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n')
  const systemPrompt = [
    'You are the Transfer Rescue Agent. The student has been stuck across multiple consecutive',
    'transfer turns. Re-asking with new scenarios is making things worse, not better. BREAK THE',
    'LOOP.',
    '',
    'Format:',
    '1. ONE short acknowledgment that this angle is not landing.',
    '2. State the transferred takeaway plainly in 2-4 short sentences — name how the SAME idea',
    '   shows up in the new context, and why. No new scenario for them to reason through.',
    '3. End with a brief transition — "Let\'s move on." or similar.',
    '',
    'Hard rules:',
    '- 60-110 words.',
    '- ZERO question marks anywhere.',
    '- No new scenario, no prediction question, no "what would happen", no probe.',
    '- Vary phrasing from earlier turns.',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsHint,
    `Last transfer probe: ${node.phases.transfer.lastProbe || '(none)'}`,
    `Recent turns:\n${recentMsgs}`,
    'Write the rescue message now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.4, maxCompletionTokens: 280 })
}

// ── D. Transfer Phase Router ──────────────────────────────────────
export const routePhase = ({ node, evaluation, phaseRecord, goals = [], goalsCovered = [] }) => {
  const threshold = PASS_THRESHOLDS[PHASES.TRANSFER]
  const {
    appliedCorrectly,
    confidence,
    correctOutcomeButMissingWhy,
    exposesCausalWeakness,
  } = evaluation
  const outcomeRightButThin = correctOutcomeButMissingWhy || appliedCorrectly >= 0.65

  // Loop-break: re-asking "but why" on the same outcome the student already
  // produced makes the chat feel unforgiving. If the evaluator has flagged
  // missing-why on this turn AND on at least one of the previous two turns,
  // the student has shown the right transferred outcome more than once and
  // further drilling here is not landing. Advance — recall will retest the
  // why directly per goal.
  const recentEvidence = (phaseRecord?.evidence || []).slice(-3)
  const recentMissingWhyCount = recentEvidence
    .filter((e) => e?.raw?.correctOutcomeButMissingWhy === true)
    .length
  if (correctOutcomeButMissingWhy && recentMissingWhyCount >= 2) {
    return {
      action: ACTIONS.ADVANCE,
      phase: PHASES.TRANSFER,
      reason: 'missing_why_loop_break',
    }
  }

  if (exposesCausalWeakness && confidence < threshold && outcomeRightButThin) {
    return { action: ACTIONS.GUIDE, phase: PHASES.TRANSFER, reason: 'missing_why' }
  }
  if (exposesCausalWeakness && confidence < threshold) {
    return { action: ACTIONS.REOPEN, targetPhase: PHASES.CAUSALITY, phase: PHASES.TRANSFER }
  }
  if (confidence < threshold) {
    return { action: ACTIONS.REMEDIATE, phase: PHASES.TRANSFER }
  }

  // Gate transfer advancement on goal coverage: every goal must be transferred
  // to a new context at least once before we move on to recall.
  const goalsGated = node?.isRoot && Array.isArray(goals) && goals.length > 0
  if (goalsGated) {
    const allCovered = goals.every((_, i) => goalsCovered[i] === true)
    if (!allCovered) {
      // Safety valve: this turn already passed confidence (or we'd have
      // remediated above). After enough attempts, credit the transfer and
      // advance — generating yet another scenario when the student just
      // demonstrated the skill is what feels like "the same question again".
      // Recall retests each goal individually, so any remaining gap surfaces
      // there rather than being papered over.
      if ((phaseRecord?.attempts || 0) >= 4) {
        return {
          action: ACTIONS.ADVANCE,
          phase: PHASES.TRANSFER,
          reason: 'attempts_with_passing_confidence',
        }
      }
      return { action: ACTIONS.CONTINUE, phase: PHASES.TRANSFER, reason: 'goals_not_covered' }
    }
  }

  return { action: ACTIONS.ADVANCE, phase: PHASES.TRANSFER }
}
