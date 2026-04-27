// Explanation phase — probe, evaluator, remediation, micro-causal, router.
// Each function has one job. The phase router consumes structured observations
// and returns a proposed global action — it does not generate prose.

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
  `Depth in stack: ${node.depth}`,
].join('\n')

// Render the learning goals block for inclusion in agent prompts. Only the root
// node's explanation phase is gated by these; children are prerequisite detours.
//
// Goals are INTERNAL GUIDANCE for the agent — a scope filter and coverage
// checklist. They are NOT a script to recite back to the student. Prompts using
// this block must instruct the LLM to SHAPE its question, not COPY the goal text.
const goalsBlock = ({ goals = [], goalsCovered = [] } = {}) => {
  if (!Array.isArray(goals) || goals.length === 0) return ''
  const lines = goals.map((g, i) => {
    const covered = goalsCovered[i] === true
    return `  ${i + 1}. [${covered ? 'x' : ' '}] ${g}`
  })
  return [
    'Internal coverage checklist (what the student eventually needs to demonstrate —',
    'NOT a list to read aloud to the student, NOT a question bank):',
    ...lines,
    '',
    'PRIORITIZE uncovered items (those marked [ ]). If multiple are uncovered, rotate',
    'between them across turns — do NOT keep asking about the same goal angle the',
    'student already demonstrated. If all are covered, ask one consolidating question',
    'that ties two of them together rather than re-asking any one of them.',
  ].join('\n')
}

// ── A. Explanation Probe Agent ────────────────────────────────────
// Produces the next explanation-oriented question. Rotates between styles so
// the student isn't asked "in your own words..." over and over.
export const probe = async ({ node, mode = 'initial', goals = [], goalsCovered = [] }) => {
  const attempts = node?.phases?.explanation?.attempts || 0
  const goalsGated = node?.isRoot && Array.isArray(goals) && goals.length > 0
  const systemPrompt = [
    'You are the Explanation Probe Agent in a tutoring system.',
    'Your only job: ask ONE short question that targets plain-language grasp of the concept.',
    '',
    'GROUND IN A CONCRETE EXAMPLE WHENEVER POSSIBLE. "Concrete" means a SPECIFIC instance the',
    'student can picture — a specific object, a specific part, a specific step, a specific event,',
    'a specific case. It does NOT automatically mean "numeric". Use numbers ONLY when the topic',
    'or a goal is actually quantitative (calculation, rates, proportions, algorithmic cost, etc.).',
    'For non-quantitative topics (mechanism, components, roles, definitions, cause-and-effect in',
    'words, historical events, literary elements, etc.), use a concrete scenario WITHOUT numbers.',
    '',
    'Infer the right style FROM the concept and goals in the user prompt. Do not import examples',
    'from other domains — derive the scenario from THIS concept.',
    '',
    goalsGated
      ? [
          'This concept has an internal coverage checklist (shown in the user prompt). Treat it',
          'as BACKGROUND SCOPE — it tells you what dimensions the student eventually needs to',
          'demonstrate so you can plan your line of questioning, and it tells you what NOT to',
          'drift into. It is NOT a question bank.',
          '',
          'STRICT RULES on how to use the checklist:',
          '- Do NOT paraphrase a checklist item into a question. If a checklist item reads',
          '  "Students should understand A, B, and C", the probe MUST NOT be "What are A, B, and C?"',
          '  or "Explain A, B, and C". Pick ONE angle (e.g., just A in a specific scenario, or a',
          '  contrast between B and something nearby) and ask about THAT, not the whole item.',
          '- Do NOT enumerate the terms listed inside a checklist item. Pick one.',
          '- Do NOT mention the checklist to the student or hint that a list exists.',
          '- Use the checklist to decide WHAT SUBJECT AREA the question is in and to avoid drifting',
          '  out of scope (e.g., no numeric probes if no item is quantitative). That is all.',
          '',
        ].join('\n')
      : 'No explicit goals — default to a concrete non-numeric scenario; only add numbers if the concept is clearly quantitative.\n',
    'Probe styles — prefer B, C, E when a concrete example is possible:',
    '  A. Restatement — "In your own words..." (OK only if the concept truly resists instancing)',
    '  B. Concrete scenario — state a specific setup drawn from THIS concept (objects/parts/steps;',
    '     numbers only if the goal is quantitative), then ask the student to describe what happens',
    '     or why.',
    '  C. Pick-the-example — give TWO specific cases from this concept and ask which fits and why.',
    '  D. Contrast — "What is the difference between X and [nearby idea]?"',
    '  E. Walk-through — give a tiny specific setup in 1-2 lines, then ask what the student would',
    '     do or what happens next.',
    '',
    attempts === 0
      ? 'For the very first probe, use style B or E with a specific concrete setup scoped to the'
        + ' pending goal. Use style A only if the concept resists concrete instancing.'
      : 'The student has already tried once or more. REQUIRED: use B, C, or E with a SPECIFIC'
        + ' concrete setup drawn from this concept (numbers ONLY if the goal is quantitative).'
        + ' Abstract "in your own words" again is not allowed. If earlier attempts failed,'
        + ' shrink the example (fewer parts, simpler case).',
    '',
    'Rules:',
    '- Do not teach, do not give the answer, do not list features.',
    '- Accept word-based descriptions of mechanism. Never require formal notation.',
    '- If — and only if — the goal is quantitative and you use math, tell the student they can',
    '  answer in plain words describing the steps.',
    '- Short correct answers are fine.',
    '- Under 55 words. ONE question. Nothing else.',
  ].filter(Boolean).join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsGated ? goalsBlock({ goals, goalsCovered }) : '',
    `Mode: ${mode} · attempts so far: ${attempts}`,
    `Recent turns:\n${historyBlock(node, 8)}`,
    'Write the next question now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.7, maxCompletionTokens: 160 })
}

// ── A2. Subtopic Intro Agent ─────────────────────────────────────
// When the student dives into a subtopic (usually because they were stuck or
// asked "what is X"), DON'T open with another probe — teach first. Give a short
// concrete explanation of the subtopic so the student has something to anchor
// on, then invite them to say it back in their own words. The triggerText
// argument is the parent-level question/context that caused the branch so the
// tutor can tie the teaching back to WHY this matters.
export const introduce = async ({ node, triggerText = '', parentTitle = '' } = {}) => {
  const systemPrompt = [
    'You are the Subtopic Intro Agent. The student has just accepted a detour into a small',
    'prerequisite concept because they were confused about it. Your job is to TEACH it',
    'thoroughly, not to quiz them. The student asked because they genuinely do not know — give',
    'them a real explanation, not a one-liner followed by a question.',
    '',
    'Lead with substantive teaching. Build understanding before any check-in. Most of the response',
    'should be explanation; only a small tail is the check-in, and the check-in is OPTIONAL,',
    'low-pressure, and never re-asks the same question they were just stuck on.',
    '',
    'Format:',
    '1. Plain-language definition in 1-2 sentences that name the concept and tie it back to why',
    '   it matters in the parent topic. Use wording native to THIS concept.',
    '2. A concrete worked example or walk-through (3-6 short lines). Show it happening with',
    '   specific named parts, steps, or cases drawn from this concept. Bullets, a tiny mini-trace,',
    '   or a short code block are all fine. Use numbers only if the topic is quantitative.',
    '3. A short clarification of the IDEA behind it — what it does, what it is NOT, or how it',
    '   contrasts with a nearby concept. 1-2 sentences. This is the part that turns the example',
    '   into understanding.',
    '4. ONE light, optional check-in at the end — e.g., "Want me to walk through another case?"',
    '   or "Anything in here feel fuzzy?" Do NOT immediately re-ask the question that triggered',
    '   the detour. Do NOT add meta-reassurances about answer length',
    '   (no "a word or two is fine", "just a word is fine", etc.).',
    '',
    'Rules:',
    '- Do NOT open with a probing/testing question.',
    '- Do NOT restate the parent concept; focus on THIS subtopic.',
    '- Do NOT import examples from unrelated domains; derive them from this subtopic.',
    '- Aim for 120-180 words. Substantive teaching first; a wall-of-text is fine if it is',
    '  actually teaching. A two-line answer is NOT fine here — the student needs the explanation.',
    '- Warm, specific, concrete. Treat them as wanting to learn, not as needing to be tested.',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    parentTitle ? `Parent concept: ${parentTitle}` : '',
    triggerText ? `What the student was asked/said just before branching:\n${triggerText}` : '',
    'Write the teach + gentle check-in now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.5, maxCompletionTokens: 420 })
}

// ── B. Explanation Evaluator ─────────────────────────────────────
// Observes the student's answer through one lens only: explanation quality.
// It produces structured evidence, never routing decisions.
const evaluationSchema = z.object({
  plainLanguage: z.number().min(0).max(1),
  capturedConcept: z.number().min(0).max(1),
  circular: z.boolean(),
  parroting: z.boolean(),
  distinguishesNearby: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  // "misconception" = the student said something specifically WRONG (not just vague
  // or incomplete). Wrong → REMEDIATE. Vague/partial → GUIDE (teach forward).
  misconception: z.boolean().optional().default(false),
  // "direction" compared to the previous turn on this node.
  //   "warmer"   — getting closer to the idea
  //   "colder"   — drifting away
  //   "same"     — roughly the same level, or no prior turn to compare
  direction: z.enum(['warmer', 'colder', 'same']).optional().default('same'),
  rationale: z.string(),
  suspectedPrerequisiteGap: z.string().nullable().optional(),
  // 1-indexed goal numbers the student's answer demonstrated clearly on THIS turn.
  // Only used when the concept has required learning goals configured.
  goalsAddressed: z.array(z.number().int()).optional().default([]),
})

export const evaluate = async ({ node, studentAnswer, goals = [], goalsCovered = [] }) => {
  const goalsGated = node?.isRoot && Array.isArray(goals) && goals.length > 0
  const systemPrompt = [
    'You are the Explanation Evaluator. You observe ONE dimension: how well did the STUDENT',
    'explain the concept in their own words on THIS turn.',
    'Do NOT decide routing. Do NOT reteach. Do NOT score causal or transfer understanding here.',
    '',
    'Scoring rules — read carefully:',
    '- Every score is about the STUDENT\'S ANSWER quality, not your certainty about your own judgement.',
    '- If the answer is empty, a filler like "yes"/"ok"/"what?", off-topic, or asks the tutor to',
    '  explain, then ALL numeric scores must be LOW (0.0 – 0.2).',
    '- BE LENIENT ON BREVITY. A short correct answer is a GOOD answer. Any terse plain-language',
    '  paraphrase that captures the core idea of THIS concept is valid. Do NOT require elaboration,',
    '  multiple sentences, full definitions, or textbook phrasing. If the core idea is captured in',
    '  ANY plain-language form, score confidence ≥ 0.75.',
    '- ACCEPT WORD-BASED DESCRIPTIONS. If the student says the idea in plain words about a concrete',
    '  instance of this concept, that counts just as much as formal terminology. Do NOT downgrade',
    '  for lack of jargon, notation, or technical vocabulary.',
    '- Reward ANY valid plain-language capture, even if terse, informal, or missing nuance. Nuance',
    '  and mechanism belong in later phases (causality), not explanation.',
    '- Only score LOW when the answer is wrong, empty, circular/parroting, or completely off-topic.',
    '- "confidence" is the overall quality score for the explanation the student just gave',
    '  (0 = no explanation / wrong, 1 = captures the core idea in plain language). It is NOT how',
    '  sure you are about your judgement, and it is NOT about completeness or polish.',
    '',
    goalsGated
      ? [
          'REQUIRED LEARNING GOALS — the user prompt lists numbered goals. For "goalsAddressed",',
          'return the 1-indexed numbers of ONLY those goals whose substance the student CLEARLY',
          'demonstrated on THIS turn. Be strict: vague or tangential references do not count. If',
          'none are demonstrated, return []. Do not include already-covered goals unless the student',
          'demonstrated them again on this turn (that is fine; dedup happens upstream).',
        ].join('\n')
      : 'This concept has no explicit learning goals; return [] for "goalsAddressed".',
    '',
    'Return STRICT JSON:',
    '{',
    '  "plainLanguage": 0..1,          // quality of plain-language phrasing in their answer',
    '  "capturedConcept": 0..1,        // how well their answer captured the concept',
    '  "circular": boolean,            // the answer just restates the term',
    '  "parroting": boolean,           // they repeat tutor wording without meaning',
    '  "distinguishesNearby": 0..1,    // they contrast with a nearby idea',
    '  "confidence": 0..1,             // overall QUALITY of the student explanation (see rules)',
    '  "misconception": boolean,       // true ONLY if the student said something specifically WRONG',
    '                                  // (a factually incorrect claim about this concept). False if vague/incomplete.',
    '  "direction": "warmer"|"colder"|"same",  // vs previous turn on this concept',
    '  "rationale": "...",             // one short sentence',
    '  "suspectedPrerequisiteGap": "..." or null,',
    '  "goalsAddressed": [1,2,...]     // 1-indexed goal numbers demonstrated on THIS turn; [] if none',
    '}',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsGated ? goalsBlock({ goals, goalsCovered }) : '',
    `Last probe: ${node.phases.explanation.lastProbe || '(none)'}`,
    `Student answer: ${studentAnswer}`,
  ].filter(Boolean).join('\n\n')
  return callJson({ systemPrompt, userPrompt, schema: evaluationSchema, temperature: 0.1 })
}

// ── C. Remediation ────────────────────────────────────────────────
// Repairs only explanation failures with a simpler take, better analogy,
// and one tight follow-up question.
export const remediate = async ({ node, evaluation, goals = [], goalsCovered = [] }) => {
  const attempts = node?.phases?.explanation?.attempts || 0
  const stuck = attempts >= 2
  const goalsGated = node?.isRoot && Array.isArray(goals) && goals.length > 0
  const systemPrompt = [
    'You are the Explanation Remediation Agent.',
    '',
    stuck
      ? [
          'The student has tried multiple times and is stuck. Abstractions and analogies are not',
          'landing. Escalate: TEACH thoroughly — show a concrete worked example DRAWN FROM THIS',
          'CONCEPT and explain what is happening. Then ask them to describe what they saw. STAY',
          'INSIDE THE GOAL SCOPE — do not introduce numbers, concentrations, or calculations',
          'unless the goals explicitly call for quantitative reasoning.',
          '',
          'Template:',
          '1) ONE setup sentence naming a SPECIFIC scenario drawn from THIS concept (a specific',
          '   object, part, step, or case — not an import from another domain).',
          '2) Walk through the actual steps or parts in 4-6 short lines. Use specific specifics.',
          '   Spell out what is happening at each step. Numbers ONLY if the goal is quantitative.',
          '3) Add 1-2 sentences naming what the student should TAKE AWAY — what made the example',
          '   work, what the underlying idea is, or what is easy to miss.',
          '4) End with ONE question that asks the student to say, in their own words, WHAT they',
          '   just saw happen — not to define the concept abstractly.',
          '',
          'Aim for 130-180 words. Concrete and substantive beats clever and short.',
        ].join('\n')
      : [
          'TEACH with a concrete micro-example DRAWN FROM THIS CONCEPT, not an abstract analogy',
          'and not an example imported from another topic. The student needs to learn the idea —',
          'give them enough to actually understand it.',
          '',
          'Structure:',
          '1) Name a specific scenario from this concept (an object, part, step, or case).',
          '2) Walk through it in 3-5 short lines. Show what happens, with specifics.',
          '3) 1-2 sentences naming what to take away from the example — the idea behind it.',
          '4) ONE follow-up question in words.',
          '',
          'Aim for 100-150 words. Concrete = a specific object, part, step, or case — NOT',
          'automatically numbers. Use numbers ONLY if a goal explicitly requires quantitative',
          'reasoning. Never restart the whole topic. Never dump theory. Only use a pure',
          'plain-language reframe if the concept truly cannot be instanced.',
        ].join('\n'),
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsGated ? goalsBlock({ goals, goalsCovered }) : '',
    `Last probe: ${node.phases.explanation.lastProbe || '(none)'}`,
    `Evaluator rationale: ${evaluation.rationale}`,
    `Signals — plainLanguage=${evaluation.plainLanguage}, capturedConcept=${evaluation.capturedConcept}, circular=${evaluation.circular}, parroting=${evaluation.parroting}`,
    'Write the remediation + follow-up question now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.4, maxCompletionTokens: 360 })
}

// ── C2. Guided Teaching ──────────────────────────────────────────
// Scaffolds a worked mini-example FORWARD with the student. This is the default
// response to vague/partial/low-confidence answers. Unlike remediation, it does
// NOT re-lecture — it walks one concrete step, then hands the next step to the
// student as a prediction task ("what happens next?"). The student is thinking
// through the concept, not defining it.
export const guide = async ({ node, evaluation, goals = [], goalsCovered = [] }) => {
  const attempts = node?.phases?.explanation?.attempts || 0
  const goalsGated = node?.isRoot && Array.isArray(goals) && goals.length > 0
  const systemPrompt = [
    'You are the Guided Teaching Agent. The student is not yet confident on this concept.',
    'Your job is to TEACH FORWARD, not to re-ask a definition question. Substantive teaching',
    'first; the prediction question is a small tail at the end, not the bulk of the response.',
    '',
    'Approach:',
    '1. Pick a concrete scenario DRAWN FROM THIS CONCEPT — a specific object, part, or step',
    '   native to the topic. Use numbers ONLY if a goal explicitly requires quantitative',
    '   reasoning; otherwise use a qualitative specific. Prefer a small example, but do not',
    '   shrink so far that there is nothing to teach.',
    '2. WALK THROUGH the first step or two yourself — do the moves out loud, so the student',
    '   sees the reasoning pattern. Use bullets or a 3-5 line mini-trace.',
    '3. Add 1-2 sentences naming the IDEA the student should take away from this — what makes',
    '   the step work, or what is easy to miss. This is what turns the trace into understanding.',
    '4. Hand them the NEXT step as a prediction question. Not "what is X?" but "what happens',
    '   next?" or "given this, what does step 2 produce?" They predict behavior, not define terms.',
    '',
    'Style:',
    '- Be warm and specific. Don\'t apologize, don\'t recap, don\'t announce what you\'re about to do.',
    '- Aim for 110-160 words total. Substantive teaching, not a one-liner.',
    '- Markdown bullets or a tiny code block if it helps.',
    '- NO abstract restatement of the concept. NO "in your own words" question.',
    '- STAY INSIDE THE GOAL SCOPE. Do not introduce aspects (numbers, concentrations, rates) the',
    '  goals do not mention.',
    '- Do NOT import examples from unrelated domains; derive the scenario from this concept.',
    '',
    attempts >= 2
      ? 'The student has tried multiple times. Shrink the SCENARIO to its smallest meaningful'
        + ' form — fewer parts, fewer moves — but keep the EXPLANATION thorough. Friction means'
        + ' they need MORE teaching on a smaller example, not less teaching overall.'
      : 'Early in the struggle. Teach the idea clearly with one walk-through; you do not need to'
        + ' over-explain edge cases.',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsGated ? goalsBlock({ goals, goalsCovered }) : '',
    `Last probe: ${node.phases.explanation.lastProbe || '(none)'}`,
    `Evaluator rationale: ${evaluation?.rationale || '(none)'}`,
    `Signals — confidence=${evaluation?.confidence ?? 'n/a'}, direction=${evaluation?.direction || 'same'}`,
    'Write the guided step + prediction question now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.5, maxCompletionTokens: 380 })
}

// ── C3. Rescue Teach ─────────────────────────────────────────────
// Called when the student has been stuck across multiple consecutive turns and
// the teach-then-predict template is no longer landing. The runtime detects
// the loop (≥2 consecutive give-up signals on this phase/node) and routes
// here INSTEAD of guide/remediate. Rescue acknowledges the loop, states the
// answer plainly, and signals movement — NO prediction question, NO new probe.
// The runtime force-advances the phase right after this fires, bypassing the
// goals gate, so the student is not kept circling the same question.
export const rescueTeach = async ({ node, goals = [], goalsCovered = [] }) => {
  const goalsGated = node?.isRoot && Array.isArray(goals) && goals.length > 0
  const recentMsgs = (node.messages || [])
    .slice(-10)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n')
  const systemPrompt = [
    'You are the Rescue Agent. The student has been stuck on this concept for multiple consecutive',
    'turns — they keep saying "I don\'t know" / "not sure" / "im lost" in response to your probes.',
    'Re-asking, re-teaching with prediction questions, and shrinking the example have all failed',
    'to land. The loop itself has worn the student down. Continuing to ask makes things worse.',
    '',
    'Your job is to BREAK THE LOOP. Drop the teach-then-quiz template entirely. Do not ask another',
    'prediction question, "in your own words" question, or any new probe. The runtime will move on',
    'to the next angle right after your message — your message is the LAST WORD on this question.',
    '',
    'Format:',
    '1. ONE short acknowledgment that this angle is not landing — show you noticed. Examples:',
    '   "Looks like this angle is not clicking — let me just lay it out."',
    '   "We have been circling this — let me give you the takeaway plainly."',
    '   "No worries — this one is genuinely tricky from how I\'ve been asking. Here it is plainly:"',
    '   Be warm and matter-of-fact. Do NOT apologize at length, do NOT blame the student.',
    '2. STATE THE ANSWER to the question that has been blocking them, in plain language. 2-4 short',
    '   sentences. NO "picture a leaf cell" / "imagine X" framing. NO bullet template. NO mini-trace.',
    '   Just the idea, said clearly, with the specific named parts when it helps. The student needs',
    '   the takeaway, not another setup to work through.',
    '3. End with a brief transition that signals movement — "Let\'s keep going." or "Moving on."',
    '   DO NOT ask a prediction question. DO NOT ask them to restate. DO NOT pose a new probe.',
    '',
    'Hard rules:',
    '- 60-110 words total. Brevity over walk-through.',
    '- ZERO question marks anywhere in your response.',
    '- Vary phrasing from earlier turns. Do NOT reuse openings or scaffolding from prior tutor',
    '  messages in this conversation (look at the recent turns provided).',
    '- Do NOT add reassurances about answer length ("a word or two is fine", etc.).',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    goalsGated ? goalsBlock({ goals, goalsCovered }) : '',
    `Last probe: ${node.phases.explanation.lastProbe || '(none)'}`,
    `Recent turns:\n${recentMsgs}`,
    'Write the rescue message now.',
  ].filter(Boolean).join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.4, maxCompletionTokens: 280 })
}

// ── D. Micro-causal Check ─────────────────────────────────────────
// Tiny guardrail before declaring explanation passed. One lightweight
// why/how question surfaces hidden gaps in fluent-sounding answers.
const microSchema = z.object({
  stillHolds: z.boolean(),
  rationale: z.string(),
  suggestedFollowUp: z.string().nullable().optional(),
})

export const microCausalCheck = async ({ node, studentAnswer, lastProbe = '' }) => {
  const systemPrompt = [
    'You are the Micro-causal Check Agent for the Explanation phase.',
    'The student produced a reasonable-sounding explanation. Your job is a NARROW sanity check:',
    'only flag it if the explanation looks like parroting, magical-sounding words they probably',
    'don\'t understand, or a clear logical error dressed up in fluent language.',
    '',
    'Judge the answer RELATIVE TO THE LAST PROBE. If the probe was a concrete, closed, or',
    'scenario-specific question, a very short direct answer can be fully valid. Do NOT flag an',
    'answer merely because it omits nouns that were already supplied by the probe. Examples:',
    '"both", "it stays saved", or "the SSD" can still hold if they directly answer the probe.',
    '',
    'Default stance: stillHolds = TRUE. Short correct answers are fine. Incomplete-but-correct is',
    'fine. Missing nuance is fine (nuance is for the causality phase). Only return stillHolds=false',
    'when you can POINT TO a specific phrase that suggests the student is just echoing language',
    'without meaning, or says something factually wrong.',
    '',
    'Return STRICT JSON: { "stillHolds": boolean, "rationale": "...", "suggestedFollowUp": "..."|null }.',
  ].join('\n')
  const userPrompt = [
    nodeContext(node),
    `Last probe: ${lastProbe || node?.phases?.explanation?.lastProbe || '(none)'}`,
    `Answer under review: ${studentAnswer}`,
    'Return JSON only.',
  ].join('\n\n')
  return callJson({ systemPrompt, userPrompt, schema: microSchema, temperature: 0.2 })
}

// ── E. Explanation Phase Router ───────────────────────────────────
// Deterministic. Takes only structured observations and returns a proposed
// global action. Does NOT call the LLM.
export const routePhase = ({ node, evaluation, micro, phaseRecord, goals = [], goalsCovered = [] }) => {
  const threshold = PASS_THRESHOLDS[PHASES.EXPLANATION]
  const { confidence, circular, parroting, misconception, suspectedPrerequisiteGap } = evaluation

  // 1. Subtopic only as a last resort — persistent struggle with a named gap.
  //    Cap to ONE system-initiated detour offer per phase per node. Beyond
  //    that, further "I think we need a quick detour" messages stack up and
  //    overwhelm the student instead of helping; switch to GUIDE so the tutor
  //    teaches inline rather than offering yet another branch.
  if (suspectedPrerequisiteGap && phaseRecord.attempts >= 3 && confidence < threshold) {
    if ((phaseRecord.subtopicOfferCount || 0) >= 1) {
      return { action: ACTIONS.GUIDE, phase: PHASES.EXPLANATION, downgraded: 'subtopic_cap' }
    }
    return {
      action: ACTIONS.OPEN_SUBTOPIC,
      reason: suspectedPrerequisiteGap,
      phase: PHASES.EXPLANATION,
    }
  }

  // 2. REMEDIATE is reserved for clear misconceptions: the student said something
  //    specifically wrong that needs to be corrected before moving on. Parroting
  //    and circular answers also warrant a tighter reteach.
  if (misconception || circular || parroting) {
    return { action: ACTIONS.REMEDIATE, phase: PHASES.EXPLANATION }
  }

  // 3. Below threshold but not a misconception → GUIDE. Teach forward with a
  //    concrete worked step instead of just asking again.
  if (confidence < threshold) {
    return { action: ACTIONS.GUIDE, phase: PHASES.EXPLANATION }
  }

  // 4. Passed threshold, but micro-causal flagged a specific phrase — GUIDE,
  //    not remediate, so we scaffold deeper rather than re-lecturing.
  if (micro && micro.stillHolds === false) {
    return {
      action: ACTIONS.GUIDE,
      phase: PHASES.EXPLANATION,
      microFollowUp: micro.suggestedFollowUp || null,
    }
  }

  // 5. If this concept has required learning goals and not all are covered yet,
  //    don't advance — keep probing on the uncovered goals. Confidence alone is
  //    not enough; depth requires all goals demonstrated.
  //
  //    SAFETY VALVE: after enough probe attempts WITH a passing mean
  //    confidence, charitably advance even if some goals haven't been
  //    explicitly credited. Otherwise the student can give correct answer
  //    after correct answer and never move on because the per-turn
  //    goalsAddressed credit is strict by design. The recall phase will
  //    retest each goal individually, so advancing is safe.
  const goalsGated = node?.isRoot && Array.isArray(goals) && goals.length > 0
  if (goalsGated) {
    const allCovered = goals.every((_, i) => goalsCovered[i] === true)
    if (!allCovered) {
      if (phaseRecord.attempts >= 4 && phaseRecord.confidence >= threshold) {
        return {
          action: ACTIONS.ADVANCE,
          phase: PHASES.EXPLANATION,
          reason: 'attempts_with_passing_confidence',
        }
      }
      return { action: ACTIONS.CONTINUE, phase: PHASES.EXPLANATION, reason: 'goals_not_covered' }
    }
  }

  return { action: ACTIONS.ADVANCE, phase: PHASES.EXPLANATION }
}
