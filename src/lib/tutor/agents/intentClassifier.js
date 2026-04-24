// Intent Classifier — runs before any phase evaluator.
//
// Question: is the student's message actually an attempt to answer the probe,
// or is it something else (accepting an offered example, asking a clarifying
// question, giving a non-answer)? Phase evaluators treat everything as an
// attempt, which produces bad scores and misleading routing. This agent
// routes those non-attempt turns to the right place.

import { z } from 'zod'
import { callJson, callText } from '../ai.js'

const schema = z.object({
  intent: z.enum(['attempt', 'accept', 'decline', 'question', 'prerequisite_question', 'giveup', 'nonanswer']),
  rationale: z.string(),
  // Only populated for prerequisite_question — the term/concept the student is asking about.
  prerequisiteTerm: z.string().nullable().optional(),
})

const lastTutorMessage = (node) => {
  const msgs = node?.messages || []
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    if (msgs[i].role === 'tutor' || msgs[i].role === 'system') return msgs[i].content
  }
  return ''
}

// Classify the student's latest message.
export const classifyIntent = async ({ node, studentAnswer }) => {
  const last = lastTutorMessage(node)
  const systemPrompt = [
    'You are the Intent Classifier for a tutoring system. Your only job is to classify what the',
    'student\'s latest message is doing in the conversation. Return STRICT JSON.',
    '',
    '════════════════════════════════════════════════════════════════════',
    'DECISION PROCEDURE — follow these checks IN ORDER. Stop at the first one that fires.',
    '════════════════════════════════════════════════════════════════════',
    '',
    'STEP 1 — GIVE-UP CHECK (do this FIRST, before anything else).',
    '  Does the student\'s message express, in ANY form, that they do not know, are stuck, lost,',
    '  or confused AS A WHOLE — without naming a specific term and without asking the tutor to',
    '  rephrase?',
    '  If yes → intent = "giveup". STOP.',
    '',
    '  This is the MOST IMPORTANT rule. Do not skip it. Do not downgrade these to "nonanswer".',
    '  A "giveup" message is short AND expresses inability/confusion. That combination alone is',
    '  enough — it does not need to be a substantive answer to count as a meaningful signal.',
    '',
    '  Canonical give-up phrasings — all of these are "giveup":',
    '    • "i don\'t know" / "i dont know" / "idk" / "dunno" / "i have no idea" / "no idea" /',
    '      "no clue" / "i have no clue"',
    '    • "i don\'t understand" / "i dont understand" / "i don\'t get it" / "i dont get this"',
    '    • "i\'m lost" / "im lost" / "i am lost" / "i\'m stuck" / "stuck" / "i\'m confused" /',
    '      "confused" / "this is confusing"',
    '    • Combinations: "idk what to say", "i really don\'t know", "honestly no idea",',
    '      "sorry i don\'t know", "i\'m not sure at all", "i don\'t understand this"',
    '    • Shrugs with no content: "¯\\_(ツ)_/¯", "😕", "🤷", "pass"',
    '',
    '  ⚠️  DO NOT classify any of the above as "nonanswer". "Nonanswer" is for empty/gibberish/',
    '      filler. A clear "I don\'t know" is a HIGH-SIGNAL event — the student has told you they',
    '      are lost and need teaching. That is "giveup", always.',
    '',
    'STEP 2 — PREREQUISITE CHECK.',
    '  Is the student naming a specific TERM or NOUN they don\'t recognize and asking what it',
    '  means? (e.g., "what is X", "what does Y mean", "I don\'t know what a Z is", "wait what\'s X")',
    '  If yes → intent = "prerequisite_question". Set "prerequisiteTerm" to the exact term.',
    '  STOP.',
    '',
    '  Note: "I don\'t know" by itself is STEP 1 (giveup), not this step. Only fires when a',
    '  specific term is named.',
    '',
    'STEP 3 — OFFER-REPLY CHECK.',
    '  Did the tutor\'s last message make an offer ("Would you like an example?", "Want me to',
    '  walk through it?") and the student\'s reply is a short yes/no/sure/please/skip?',
    '  If yes → intent = "accept" or "decline". STOP.',
    '',
    'STEP 4 — CLARIFICATION CHECK.',
    '  Is the student asking the tutor to rephrase, clarify, or explain the CURRENT probe,',
    '  without naming a specific unknown term? ("what do you mean", "can you rephrase",',
    '  "can you give an example of THIS")',
    '  If yes → intent = "question". STOP.',
    '',
    'STEP 5 — ATTEMPT CHECK.',
    '  Did the student write one or more sentences that engage with the concept — even clumsily,',
    '  even wrongly? If yes → intent = "attempt". STOP.',
    '',
    'STEP 6 — FALLBACK.',
    '  Only if none of the above apply: empty, gibberish, single-word filler ("what?"/"ok"/"hmm"),',
    '  or off-topic with zero engagement → intent = "nonanswer".',
    '',
    '════════════════════════════════════════════════════════════════════',
    'Intents reference:',
    '  "giveup"                — student explicitly flagged they are stuck/lost/don\'t know.',
    '  "prerequisite_question" — student asked what a specific term means.',
    '  "accept" / "decline"    — student responded to an offer the tutor made.',
    '  "question"              — student asked to clarify the current probe.',
    '  "attempt"               — student is trying to answer (even if clumsy or wrong).',
    '  "nonanswer"             — empty/gibberish/off-topic; NOT a recognizable give-up.',
    '════════════════════════════════════════════════════════════════════',
    '',
    'Return JSON: { "intent": "...", "rationale": "one short sentence citing which step fired",',
    '  "prerequisiteTerm": "..." | null }',
  ].join('\n')
  const userPrompt = [
    `Tutor\'s last message:\n${last || '(none)'}`,
    `Student message:\n${studentAnswer}`,
  ].join('\n\n')
  return callJson({ systemPrompt, userPrompt, schema, temperature: 0.1, maxCompletionTokens: 200 })
}

// Fulfill an offer the tutor just made (student said yes). The response must
// actually deliver the promised example/analogy/content, then re-probe in the
// student\'s own words.
export const fulfillOffer = async ({ node, studentAnswer }) => {
  const last = lastTutorMessage(node)
  const systemPrompt = [
    'You are the Offer-Fulfillment Agent. The student just accepted something you offered',
    'in your previous message (for example: "Would you like an example?" → student said yes).',
    '',
    'They said yes because they want to LEARN — actually deliver substantive teaching, not a',
    'two-sentence summary. Lead with the example/walk-through, end with a soft check-in.',
    '',
    'Your job:',
    '1. Actually deliver the thing you offered, in real depth (4-8 short lines). If you offered',
    '   an example, walk through it with specifics — concrete objects, named steps, a mini-trace',
    '   or bullets. If you offered an analogy, draw it out with both sides spelled out. If you',
    '   offered to clarify a contrast, name both items and what separates them.',
    '2. Add 1-2 sentences pointing out WHAT MATTERS in what you just showed — the underlying',
    '   idea or the part that should click for the student.',
    '3. End with a soft, optional check-in — "Want to try a similar one yourself?" or',
    '   "Anything still fuzzy?" Do NOT immediately demand they restate the idea.',
    '',
    'Aim for 130-200 words. Stay inside this concept; do not switch topics. Substantive teaching,',
    'not a one-liner.',
  ].join('\n')
  const userPrompt = [
    `Concept: ${node.title}`,
    `Your previous message (contained the offer):\n${last}`,
    `Student reply: ${studentAnswer}`,
    'Write the fulfillment + follow-up now.',
  ].join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.5, maxCompletionTokens: 420 })
}

// Answer a clarifying question from the student briefly, then redirect back to the probe.
// If the student is explicitly asking for an example, actually show a concrete one.
// If the student is expressing confusion ("what do you mean", "i don't understand"), treat
// that as a REQUEST FOR GROUNDING and re-ask the probe anchored to a concrete scenario.
export const answerClarification = async ({ node, studentAnswer }) => {
  const last = lastTutorMessage(node)
  const asksForExample = /\bexample\b|\bshow me\b|\bcan you (show|give|demonstrate)\b|\bcan u show\b/i.test(studentAnswer)
  const expressesConfusion = /\b(i\s*(don'?t|dont|do not)\s*(understand|get\s*(it|this))|what do you mean|im\s*not\s*sure|i'?m\s*confused|confused|idk|no\s*idea|what\??)\b/i.test(studentAnswer)
  const systemPrompt = [
    'You are the Clarification Agent. The student just asked a clarifying question about the',
    'probe, rather than answering it.',
    '',
    asksForExample || expressesConfusion
      ? [
          'The student is confused and needs grounding. TEACH them — give a substantive concrete',
          'explanation, not another abstract paraphrase. Lead with explanation, end with a soft',
          'check-in. Do NOT immediately re-ask the probe they were stuck on.',
          '',
          'Template:',
          '1) ONE short setup sentence that names a specific tiny scenario DRAWN FROM THIS CONCEPT —',
          '   real objects/steps/events native to the topic. Use numbers ONLY if the concept is',
          '   quantitative; otherwise use a qualitative specific case.',
          '2) Walk through the actual details in 4-7 short lines. Use specifics, not placeholders.',
          '   Show the mechanism, not just the label. Bullets, a tiny code block, or a short',
          '   mini-trace are all fine. Numbered steps if there is a sequence.',
          '3) Add 1-2 sentences naming what the student should TAKE AWAY from the example — the',
          '   underlying idea, what makes it work, or how it contrasts with a nearby concept.',
          '   This is the part that turns the example into understanding.',
          '4) End with a SOFT, optional check-in — e.g., "Want me to walk through another case?"',
          '   or "Anything in here feel fuzzy?" Do NOT re-ask the original probe verbatim.',
          '',
          'Aim for 130-200 words. The student asked for help understanding — give them a real',
          'explanation, not a one-liner. Do NOT import examples from unrelated domains. If an',
          'earlier turn already used a scenario and the student is still lost, SHRINK it rather',
          'than switching to a new one.',
        ].join('\n')
      : [
          'Your job:',
          '1. Answer the clarification thoroughly — 2-4 sentences of plain-language explanation,',
          '   not a one-liner. Make sure the student actually understands what was being asked.',
          '2. Then re-ask a version of the same probe, anchored to a concrete scenario with',
          '   specific values rather than a fully abstract re-ask.',
          '',
          'Do not give a full lecture, but do not be telegraphic either. Aim for 80-120 words.',
        ].join('\n'),
  ].join('\n')
  const userPrompt = [
    `Concept: ${node.title}`,
    `Your previous message:\n${last}`,
    `Student question: ${studentAnswer}`,
    'Write the response now.',
  ].join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.4, maxCompletionTokens: 420 })
}

// Ask the student to take a real shot when they gave a non-answer.
// If the previous probe was abstract, re-ask with a tiny concrete anchor rather than
// repeating the same question word-for-word — friction usually means the question needs
// grounding, not a louder re-ask.
export const inviteAttempt = async ({ node }) => {
  const last = lastTutorMessage(node)
  const systemPrompt = [
    'You are the Invite-Attempt Agent. The student\'s reply was a non-answer (filler, empty,',
    '"?", or off-topic). Gently invite them to take a first shot.',
    '',
    'If the previous probe was abstract, RE-ASK with a tiny concrete anchor — a specific scenario',
    'DRAWN FROM THIS CONCEPT — so the student has something to latch onto. Use numbers only if',
    'the concept is quantitative. Do NOT parrot the same abstract question. Do NOT teach or answer.',
    '',
    '🚫 FORBIDDEN — do NOT reassure the student about answer length or format. Never write any of:',
    '   • "a word or two is fine"',
    '   • "a word or phrase is fine"',
    '   • "just a word is fine"',
    '   • "even a short answer works"',
    '   • "no need to be exact"',
    '   • "even a guess is fine"',
    '   • any phrasing telling the student their answer can be short, brief, rough, or informal.',
    '   These phrases are patronizing and signal low expectations. Just ask the question.',
    '',
    'Keep it to 1-2 short sentences. Friendly, brief, grounded. End with ONE question.',
  ].join('\n')
  const userPrompt = [
    `Concept: ${node.title}`,
    `Your previous message:\n${last}`,
    'Write the invitation now.',
  ].join('\n\n')
  return callText({ systemPrompt, userPrompt, temperature: 0.5, maxCompletionTokens: 80 })
}
