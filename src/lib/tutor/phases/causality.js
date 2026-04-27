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
const goalsBlock = ({ goals = [], goalsCovered = [] } = {}) => {
  if (!Array.isArray(goals) || goals.length === 0) return ''
  const lines = goals.map((g, i) => {
    const covered = goalsCovered[i] === true
    return `  ${i + 1}. [${covered ? 'x' : ' '}] ${g}`
  })
  return [
    'Internal coverage checklist (scope hint only — NOT a question bank, NOT to be read aloud):',
    ...lines,
    'Use these to stay in scope and avoid drifting into dimensions the goals do not mention.',
    'Do NOT paraphrase a checklist item into a probe; do NOT enumerate the terms inside one.',
    'For causality: probe mechanism on an UNCOVERED goal first; only revisit covered ones if',
    'the student has just made a mechanistic error.',
  ].join('\n')
}

// ── A. Causal Probe ───────────────────────────────────────────────
// Asks ONE mechanism/intervention question.
export const probe = async ({ node, mode = 'initial', goals = [], goalsCovered = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals, goalsCovered }) : ''
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
    'CRITICAL — VARY THE QUESTION SHAPE EACH TURN. Look at the recent turns in the user prompt.',
    'If a previous tutor probe asked "what happens to X if we break/remove/change Y", DO NOT ask',
    'the same shape again with a different Y in the same chain. Specifically:',
    '- If you have already drilled the chlorophyll → light reactions → Calvin cycle → glucose',
    '  chain by breaking a different link, switch to a DIFFERENT goal angle entirely (e.g.,',
    '  reverse the direction: "what would have to be true upstream for X to happen?", or ask',
    '  about an uncovered goal you have not yet probed).',
    '- If the student has already given a clear correct answer naming the chain, do NOT re-ask',
    '  the same chain with a fresh scenario. Pick a different mechanism dimension or move on.',
    'Treat repetition as a failure mode, not as reinforcement.',
    '',
    'Preferred shape: one sentence of concrete setup, then a why / what-if question.',
    'Forms you can use (pick the one that fits this concept best AND that you have not just used):',
    '- State a specific situation in the concept, then ask why the next step happens.',
    '- Propose a small intervention ("if we change X in this specific case...") and ask what',
    '  follows and why.',
    '- Propose removing or breaking one element and ask what effect that has and why.',
    '- Reverse the question: given an observed effect, ask what cause is required upstream.',
    '- Compare two cases that differ in one mechanism step and ask why the outcomes diverge.',
    '',
    'Avoid purely abstract "why does this happen?" with no scenario. The student should be',
    'reasoning about something specific they can picture.',
    '',
    'CONVERSATIONAL LEAD-IN — REQUIRED when the recent turns show prior student answers:',
    'Begin with ONE short clause (≤12 words, no question mark) that reacts to what the student',
    'just said. Affirm a correct piece, name what they got, or note where they were close.',
    'Examples: "Right — energy comes from the light reactions." / "Yes, the mechanism stalls there."',
    'Do NOT use hollow praise ("Great job!"). Do NOT restate the prior question. Do NOT lecture.',
    'After the lead-in, write the new question on the next line.',
    '',
    'Tell the student they can answer in words — no formal math required.',
    'Under 70 words total (including the lead-in). ONE question. No teaching. No multi-part questions.',
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
  // 1-indexed goal numbers whose CAUSAL MECHANISM the student's answer demonstrated clearly
  // on THIS turn. Only used when the concept has required learning goals.
  goalsAddressed: z.array(z.number().int()).optional().default([]),
})

export const evaluate = async ({ node, studentAnswer, goals = [], goalsCovered = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals, goalsCovered }) : ''
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
    node?.isRoot && Array.isArray(goals) && goals.length > 0
      ? [
          'REQUIRED LEARNING GOALS — the user prompt lists numbered goals. For "goalsAddressed",',
          'return the 1-indexed numbers of goals whose CAUSAL MECHANISM the student articulated on',
          'THIS turn. Be REASONABLE, not nitpicky:',
          '- If the student named the relevant cause AND its effect for a goal, even briefly,',
          '  CREDIT IT. E.g., "less chlorophyll means less light absorbed, so fewer carriers, so',
          '  Calvin cycle slows" credits goals about chlorophyll role AND about light reactions',
          '  driving the Calvin cycle.',
          '- A clear correct answer that bundles two goals into one chain credits BOTH goals.',
          '- Do not require formal terminology. Plain-language causal chains count.',
          '- Only withhold credit when the answer is empty, off-topic, or genuinely vague (no',
          '  cause-and-effect named).',
          'If none are clearly demonstrated, return [].',
        ].join('\n')
      : 'This concept has no explicit learning goals; return [] for "goalsAddressed".',
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
    '  goalsAddressed: [1,2,...]  // 1-indexed goal numbers whose mechanism was demonstrated on THIS turn; [] if none',
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
export const remediate = async ({ node, evaluation, goals = [], goalsCovered = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals, goalsCovered }) : ''
  const systemPrompt = [
    'You are the Causal Remediation Agent.',
    'The student said something mechanistically incorrect. TEACH them the right mechanism using a',
    'CONCRETE example DRAWN FROM THIS CONCEPT — a specific scenario native to the topic, not an',
    'abstract phrasing and not an example imported from an unrelated domain.',
    '',
    'Structure:',
    '1. Name the specific wrong move briefly (one sentence) so the student knows what is being',
    '   corrected. Do not pile on; one clear "actually, the cause and effect go the other way"',
    '   is enough.',
    '2. Walk through what ACTUALLY happens in the worked case — 4-6 short lines showing the',
    '   cause producing the effect, step by step. Specific objects, parts, or events.',
    '3. Add 1-2 sentences naming the underlying mechanism — WHY it works that way, what the',
    '   student should remember. This is the part that prevents the same mistake again.',
    '4. End with ONE follow-up why/how question grounded in that same scenario.',
    '',
    'STAY INSIDE THE GOAL SCOPE — do not introduce dimensions the goals do not mention.',
    'Use numbers ONLY if the goals are quantitative. Tell the student they can answer in words.',
    '',
    'Aim for 130-180 words. Real teaching, not a one-liner correction.',
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
  return callText({ systemPrompt, userPrompt, temperature: 0.4, maxCompletionTokens: 400 })
}

// ── C2. Causal Guided Teaching ───────────────────────────────────
// Teach forward through the mechanism with a concrete worked step. Used when
// the student is vague or partial but not factually wrong.
export const guide = async ({ node, evaluation, goals = [], goalsCovered = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals, goalsCovered }) : ''
  const systemPrompt = [
    'You are the Causal Guided Teaching Agent. The student has not yet articulated the',
    'mechanism clearly. Do NOT re-ask "why does this happen?" — TEACH FORWARD with substance.',
    'Most of the response is teaching; the prediction question is a small tail at the end.',
    '',
    'Approach:',
    '1. Pick a concrete scenario DRAWN FROM THIS CONCEPT and walk through one or two causal steps',
    '   yourself. Use specific objects/parts/steps native to the topic. Show the CAUSE producing',
    '   the EFFECT — make the mechanism visible step by step. Use numbers ONLY if the goals are',
    '   quantitative. 4-6 short lines or bullets.',
    '2. Add 1-2 sentences naming the IDEA behind the mechanism — what makes the cause produce',
    '   that effect, what the student should hold onto. This is the part that turns a trace into',
    '   understanding.',
    '3. Then hand the student the NEXT causal step as a prediction question. "If we change X,',
    '   what happens to Y, and why?" — not "explain the mechanism."',
    '',
    'Style:',
    '- Aim for 110-160 words. Substantive teaching, not a one-liner.',
    '- Bullets or a mini-trace are fine.',
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
  return callText({ systemPrompt, userPrompt, temperature: 0.5, maxCompletionTokens: 400 })
}

// ── C3. Rescue Teach ─────────────────────────────────────────────
// Loop-breaker for causality. The runtime routes here when the student has
// produced ≥2 consecutive give-up signals and the teach-then-predict cycle is
// no longer landing. Acknowledge the loop, state the mechanism plainly, then
// the runtime force-advances the phase. NO question, NO new probe.
export const rescueTeach = async ({ node, goals = [], goalsCovered = [] }) => {
  const goalsHint = node?.isRoot ? goalsBlock({ goals, goalsCovered }) : ''
  const recentMsgs = (node.messages || [])
    .slice(-10)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n')
  const systemPrompt = [
    'You are the Causal Rescue Agent. The student has been stuck across multiple consecutive turns',
    'on the mechanism for this concept. Re-asking "why" with new prediction questions is making',
    'things worse, not better. BREAK THE LOOP.',
    '',
    'Format:',
    '1. ONE short acknowledgment that this angle is not landing — warm, matter-of-fact.',
    '2. State the mechanism plainly in 2-4 short sentences. Name the cause, what it does, and the',
    '   effect. No "imagine X" framing, no bullet template, no mini-trace, no quiz tail.',
    '3. End with a brief transition that signals movement — "Let\'s keep going." or "Moving on."',
    '',
    'Hard rules:',
    '- 60-110 words.',
    '- ZERO question marks anywhere.',
    '- No prediction question, no "what would happen if", no new probe.',
    '- Vary phrasing from earlier turns; do not reuse openings the student has already seen.',
    '- Stay inside the goal scope.',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsHint,
    `Last probe: ${node.phases.causality.lastProbe || '(none)'}`,
    `Recent turns:\n${recentMsgs}`,
    'Write the rescue message now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.4, maxCompletionTokens: 280 })
}

// ── D. Causal Phase Router ────────────────────────────────────────
export const routePhase = ({ node, evaluation, phaseRecord, goals = [], goalsCovered = [] }) => {
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
    // Cap detour offers per phase — after one, teach inline instead of
    // stacking another "I think we need a quick detour" on the student.
    if ((phaseRecord.subtopicOfferCount || 0) >= 1) {
      return { action: ACTIONS.GUIDE, phase: PHASES.CAUSALITY, downgraded: 'subtopic_cap' }
    }
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

  // Confidence high enough, but gate advancement on goal coverage. For the root
  // node we require EVERY goal to have its mechanism demonstrated at least once
  // before moving on to transfer.
  const goalsGated = node?.isRoot && Array.isArray(goals) && goals.length > 0
  if (goalsGated) {
    const allCovered = goals.every((_, i) => goalsCovered[i] === true)
    if (!allCovered) {
      // Loop-break: the evaluator's goalsAddressed credit is strict by design,
      // so a student can keep giving correct mechanism answers without ever
      // accumulating credit for every goal. If the recent turns show
      // consistent passing confidence, the student is demonstrating mechanism
      // ability — drilling further on the same chain creates the repetition
      // the user reported. Advance; recall retests each goal individually.
      const recentEvidence = (phaseRecord?.evidence || []).slice(-3)
      const recentPassingCount = recentEvidence
        .filter((e) => typeof e?.raw?.confidence === 'number' && e.raw.confidence >= threshold)
        .length
      if (recentPassingCount >= 2) {
        return {
          action: ACTIONS.ADVANCE,
          phase: PHASES.CAUSALITY,
          reason: 'consistent_passing',
        }
      }
      // Safety valve: this turn already passed (we'd have remediated/guided
      // otherwise). After enough attempts, credit and advance.
      if ((phaseRecord?.attempts || 0) >= 4) {
        return {
          action: ACTIONS.ADVANCE,
          phase: PHASES.CAUSALITY,
          reason: 'attempts_with_passing_confidence',
        }
      }
      return { action: ACTIONS.CONTINUE, phase: PHASES.CAUSALITY, reason: 'goals_not_covered' }
    }
  }

  return { action: ACTIONS.ADVANCE, phase: PHASES.CAUSALITY }
}
