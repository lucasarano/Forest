// Subtopic Inference Agent.
// Given a failure in the active phase + evaluator-flagged prerequisite hint,
// infer ONE best next subtopic. Never a whole tree.

import { z } from 'zod'
import { callJson } from '../ai.js'

const schema = z.object({
  title: z.string().min(2),
  question: z.string().min(3),
  reason: z.string().min(3),
  skippable: z.boolean(),
  localOrPrerequisite: z.enum(['local', 'prerequisite']),
})

export const inferSubtopic = async ({ node, phase, hint, studentAnswer }) => {
  const systemPrompt = [
    'You are the Subtopic Inference Agent. Decide whether a missing prerequisite is blocking',
    'the student, and if so, propose ONE small subtopic to learn first.',
    'Rules:',
    '  - Propose ONE subtopic only. Never a tree.',
    '  - Keep it SMALLER than the parent concept — a tight, focused idea.',
    '  - Prefer truly prerequisite ideas. If the gap is local, set localOrPrerequisite="local".',
    '  - "question" is a concise seed question a tutor can start the child session with.',
    '    ANCHOR IT IN A SPECIFIC SCENARIO native to the subtopic — not an abstract "what is X?".',
    '    Numbers only if the parent concept is quantitative; otherwise use a qualitative specific case.',
    '  - "reason" is ONE short sentence for the student on why this helps.',
    '  - "skippable" is almost always true (only root is non-skippable elsewhere).',
    'Return STRICT JSON: { title, question, reason, skippable, localOrPrerequisite }.',
  ].join('\n')
  const userPrompt = [
    `Parent concept: ${node.title}`,
    `Parent question: ${node.question}`,
    `Active phase: ${phase}`,
    `Evaluator hint: ${hint || '(none)'}`,
    `Student answer: ${studentAnswer || '(none)'}`,
    'Return JSON only.',
  ].join('\n')
  return callJson({ systemPrompt, userPrompt, schema, temperature: 0.2, maxCompletionTokens: 280 })
}
