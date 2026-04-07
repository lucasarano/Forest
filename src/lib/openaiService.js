/**
 * AI Service for Knowledge Graph Tutor (Multi-Provider)
 * Supports Google Gemini and OpenAI ChatGPT models.
 */

// ─── Model Registry ───────────────────────────────────────────────────────────

export const AI_MODELS = [
  // Gemini
  { id: 'gemini-3-pro-preview',  label: 'Gemini 3 Pro',        provider: 'gemini', group: 'Gemini' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash',      provider: 'gemini', group: 'Gemini' },
  { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro',       provider: 'gemini', group: 'Gemini' },
  { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash',     provider: 'gemini', group: 'Gemini' },
  { id: 'gemini-2.0-flash',      label: 'Gemini 2.0 Flash',     provider: 'gemini', group: 'Gemini' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', provider: 'gemini', group: 'Gemini' },
  // OpenAI / ChatGPT
  { id: 'gpt-5.2',      label: 'GPT-5.2',      provider: 'openai', group: 'ChatGPT' },
  { id: 'gpt-5.2-pro',  label: 'GPT-5.2 Pro',  provider: 'openai', group: 'ChatGPT' },
  { id: 'gpt-4.1',      label: 'GPT-4.1',      provider: 'openai', group: 'ChatGPT' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'openai', group: 'ChatGPT' },
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', provider: 'openai', group: 'ChatGPT' },
  { id: 'gpt-4o',       label: 'GPT-4o',       provider: 'openai', group: 'ChatGPT' },
  { id: 'gpt-4o-mini',  label: 'GPT-4o Mini',  provider: 'openai', group: 'ChatGPT' },
]

export const DEFAULT_MODEL = 'gemini-2.5-pro'
export const MVP_AIRPLANE_MODEL = 'gpt-4.1-mini'

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a specialized Knowledge Graph Tutor. You receive a 'Contextual Heritage' string showing the learning path, then the conversation in this node.

Your role:
1. Answer the current question thoroughly and completely while maintaining continuity of the heritage and prior messages
2. Do NOT repeat facts already established in the heritage path or earlier in the conversation
3. Provide a complete, comprehensive answer - take as much space as needed to explain properly
4. Format your response in clear Markdown with headings, lists, and code examples where appropriate
5. Be encouraging and maintain the conversational learning flow
6. If the student asks about a specific concept they selected from a previous answer, dive deep into just that concept
7. The student will manually select parts of your answer they want to explore further. Focus on giving complete, thorough explanations.

**Node title (required on first response only):** At the end of your response, add exactly one line: CONCEPT: <short phrase>
where <short phrase> is one or two words that name the main concept you explained. Examples: "React Hooks", "Binary Search", "Newton's Laws".

**Unrelated topic only:** Add SUGGEST_NEW_NODE only when the user's latest question is clearly UNRELATED to the current conversation (a completely different subject). If the question is somewhat related or a natural follow-up, just answer in the same chat and do NOT add SUGGEST_NEW_NODE. When you do add it, use one line at the end: SUGGEST_NEW_NODE: <concept name>
where <concept name> is a short name for the unrelated new topic. Reserve this for real topic switches, not for follow-ups or related questions.`

// GPT-5.2–friendly appendix: explicit scope and output format reduce instruction drift and hallucinations.
const SYSTEM_PROMPT_GPT52_APPENDIX = `

**For this response:** Answer exactly and only what the student asked. Do not add extra features, tangents, or uncontrolled modifications. Use the required CONCEPT / SUGGEST_NEW_NODE lines only as specified above. Prefer clear structure (headings, bullets) over long narrative paragraphs.`

// ─── Gemini Provider ──────────────────────────────────────────────────────────

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

const callGemini = async (modelId, heritage, messages, imageForLastUserMessage) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file.')

  const contents = [{ role: 'user', parts: [{ text: heritage }] }]
  const messageList = Array.isArray(messages) ? messages : [{ role: 'user', content: messages }]
  const lastIndex = messageList.length - 1

  for (let i = 0; i < messageList.length; i++) {
    const msg = messageList[i]
    const role = msg.role === 'assistant' ? 'model' : 'user'
    const isLastUserMessage = role === 'user' && i === lastIndex
    const parts = []
    if (isLastUserMessage && imageForLastUserMessage?.mimeType && imageForLastUserMessage?.data) {
      parts.push({
        inlineData: {
          mimeType: imageForLastUserMessage.mimeType,
          data: imageForLastUserMessage.data,
        },
      })
    }
    parts.push({ text: msg.content || '' })
    contents.push({ role, parts })
  }

  const url = `${GEMINI_API_BASE}/models/${modelId}:generateContent?key=${apiKey}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `Gemini API request failed (${response.status})`)
  }

  const data = await response.json()
  const textPart = data.candidates?.[0]?.content?.parts?.[0]
  const content = textPart?.text?.trim() || ''
  if (!content && data.candidates?.[0]?.finishReason) {
    throw new Error(`Generation stopped: ${data.candidates[0].finishReason}`)
  }
  return content
}

// ─── OpenAI Provider ──────────────────────────────────────────────────────────

const OPENAI_API_BASE = 'https://api.openai.com/v1'

// Models that only support the Responses API (v1/responses), not Chat Completions.
const OPENAI_RESPONSES_ONLY_MODELS = ['gpt-5.2-pro']

const isGPT52 = (modelId) => typeof modelId === 'string' && modelId.startsWith('gpt-5.2')
const useResponsesAPI = (modelId) => OPENAI_RESPONSES_ONLY_MODELS.includes(modelId)

/** Build system content for OpenAI (optionally with GPT-5.2 appendix). */
const getOpenAISystemContent = (modelId) =>
  isGPT52(modelId) ? SYSTEM_PROMPT + SYSTEM_PROMPT_GPT52_APPENDIX : SYSTEM_PROMPT

/** Call OpenAI Responses API (v1/responses). Used for gpt-5.2-pro and other non-chat models. */
const callOpenAIResponses = async (modelId, heritage, messages, imageForLastUserMessage) => {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI API key not configured. Add VITE_OPENAI_API_KEY to your .env file.')

  const systemContent = getOpenAISystemContent(modelId)

  // Responses API input: array of { role: 'developer'|'user'|'assistant', content: string }
  const input = [
    { role: 'developer', content: systemContent },
    { role: 'user', content: heritage },
  ]

  const messageList = Array.isArray(messages) ? messages : [{ role: 'user', content: messages }]
  const lastIndex = messageList.length - 1

  for (let i = 0; i < messageList.length; i++) {
    const msg = messageList[i]
    const role = msg.role === 'assistant' ? 'assistant' : 'user'
    let content = msg.content || ''
    if (role === 'user' && i === lastIndex && imageForLastUserMessage?.mimeType && imageForLastUserMessage?.data) {
      content = `${content}\n[Image attached]`.trim() || '[Image attached]'
    }
    input.push({ role, content })
  }

  const response = await fetch(`${OPENAI_API_BASE}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      input,
      max_output_tokens: 8192,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `OpenAI API request failed (${response.status})`)
  }

  const data = await response.json()
  const output = data.output || []
  const textParts = []
  for (const item of output) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const block of item.content) {
        if (block.type === 'output_text' && block.text) textParts.push(block.text)
      }
    }
  }
  const content = textParts.join('\n').trim()
  if (!content) {
    const stop = data.stop_reason || data.status
    if (stop) throw new Error(`Generation stopped: ${stop}`)
  }
  return content
}

const callOpenAI = async (modelId, heritage, messages, imageForLastUserMessage) => {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI API key not configured. Add VITE_OPENAI_API_KEY to your .env file.')

  const systemContent = getOpenAISystemContent(modelId)

  const openaiMessages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: heritage },
  ]

  const messageList = Array.isArray(messages) ? messages : [{ role: 'user', content: messages }]
  const lastIndex = messageList.length - 1

  for (let i = 0; i < messageList.length; i++) {
    const msg = messageList[i]
    const role = msg.role === 'assistant' ? 'assistant' : 'user'
    const isLastUserMessage = role === 'user' && i === lastIndex

    if (isLastUserMessage && imageForLastUserMessage?.mimeType && imageForLastUserMessage?.data) {
      openaiMessages.push({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${imageForLastUserMessage.mimeType};base64,${imageForLastUserMessage.data}` },
          },
          { type: 'text', text: msg.content || '' },
        ],
      })
    } else {
      openaiMessages.push({ role, content: msg.content || '' })
    }
  }

  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: openaiMessages,
      temperature: 0.7,
      max_completion_tokens: 8192,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `OpenAI API request failed (${response.status})`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim() || ''
  if (!content && data.choices?.[0]?.finish_reason) {
    throw new Error(`Generation stopped: ${data.choices[0].finish_reason}`)
  }
  return content
}

const callOpenAIChatWithSystemPrompt = async (modelId, systemPrompt, messages, options = {}) => {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI API key not configured. Add VITE_OPENAI_API_KEY to your .env file.')

  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content || '',
    })),
  ]

  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: openaiMessages,
      temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
      max_completion_tokens: options.maxCompletionTokens || 2048,
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `OpenAI API request failed (${response.status})`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim() || ''
  if (!content && data.choices?.[0]?.finish_reason) {
    throw new Error(`Generation stopped: ${data.choices[0].finish_reason}`)
  }
  return content
}

// ─── Unified Public API ───────────────────────────────────────────────────────

/**
 * Ask AI with contextual heritage and full chat history.
 * @param {string} heritage - Path context string from getHeritageString
 * @param {Array<{role:'user'|'assistant',content:string}>} messages - Chat turns
 * @param {{ mimeType: string, data: string }|null} imageForLastUserMessage - Optional image
 * @param {string} modelId - Model ID from AI_MODELS (defaults to DEFAULT_MODEL)
 */
export const askAI = async (heritage, messages, imageForLastUserMessage = null, modelId = DEFAULT_MODEL) => {
  const model = AI_MODELS.find(m => m.id === modelId)
  if (!model) {
    return { response: `Error: Unknown model "${modelId}".`, error: `Unknown model "${modelId}"` }
  }

  try {
    let content
    if (model.provider === 'gemini') {
      content = await callGemini(modelId, heritage, messages, imageForLastUserMessage)
    } else if (model.provider === 'openai') {
      content = useResponsesAPI(modelId)
        ? await callOpenAIResponses(modelId, heritage, messages, imageForLastUserMessage)
        : await callOpenAI(modelId, heritage, messages, imageForLastUserMessage)
    } else {
      throw new Error(`Unsupported provider: ${model.provider}`)
    }

    return { response: content, error: null }
  } catch (error) {
    console.error('AI API Error:', error)
    return {
      response: `Error: ${error.message}. Please check your API key and connection.`,
      error: error.message,
    }
  }
}

const MVP_AIRPLANE_SYSTEM_PROMPT = `You are a free-form tutor helping a student learn how an airplane jet engine works.

Rules:
1. Answer in a conversational ChatGPT-style format.
2. Focus on intake, compression, combustion, turbine, exhaust, thrust, airflow, and how engine stages connect.
3. Assume the learner is intelligent but new to this topic.
4. Prefer clear explanations, concrete analogies, and short structured sections.
5. Do not mention knowledge graphs, concept nodes, or mastery labels.
6. Keep the conversation centered on airplane engines unless the student explicitly asks for a comparison.`

export const askMVPTutor = async (messages, modelId = MVP_AIRPLANE_MODEL) => {
  try {
    const response = await callOpenAIChatWithSystemPrompt(modelId, MVP_AIRPLANE_SYSTEM_PROMPT, messages)
    return { response, error: null }
  } catch (error) {
    console.error('MVP tutor error:', error)
    return {
      response: `Error: ${error.message}. Please check your API key and connection.`,
      error: error.message,
    }
  }
}

const stripCodeFence = (value) => value
  .trim()
  .replace(/^```json\s*/i, '')
  .replace(/^```\s*/i, '')
  .replace(/\s*```$/, '')

const parseDiagnosticJson = (value) => {
  const cleaned = stripCodeFence(value)
  try {
    return JSON.parse(cleaned)
  } catch (error) {
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
    }
    throw error
  }
}

const latestUserMessageLooksLowEffort = (messages) => {
  const latestUserMessage = [...(messages || [])].reverse().find((message) => message?.role === 'user')
  const content = (latestUserMessage?.content || '').trim().toLowerCase()
  if (!content) return true

  return /^(idk|i do not know|i don't know|dont know|don't know|not sure|no idea|i have no idea|unsure|i am unsure|i'm unsure|idk honestly|idk really|not really sure|i guess|maybe)[.!?\s]*$/.test(content)
}

const buildLowEffortTeachingResponse = (nodeConfig, parsed) => ({
  mastered: false,
  feedback: typeof nodeConfig?.lowEffortTeaching === 'string' && nodeConfig.lowEffortTeaching
    ? nodeConfig.lowEffortTeaching
    : typeof parsed?.feedback === 'string' && parsed.feedback
      ? parsed.feedback
      : 'Here is the key idea for this node. Read it carefully, then restate it in your own words.',
  hint: typeof nodeConfig?.lowEffortHint === 'string' && nodeConfig.lowEffortHint
    ? nodeConfig.lowEffortHint
    : typeof parsed?.hint === 'string'
      ? parsed.hint
      : 'Use one concrete mechanism or one specific example in your next reply.',
  example: typeof nodeConfig?.lowEffortExample === 'string' && nodeConfig.lowEffortExample
    ? nodeConfig.lowEffortExample
    : typeof parsed?.example === 'string'
      ? parsed.example
      : '',
  missingConcepts: Array.isArray(parsed?.missingConcepts)
    ? parsed.missingConcepts.filter((item) => typeof item === 'string')
    : [],
  nextPrompt: typeof nodeConfig?.lowEffortPrompt === 'string' && nodeConfig.lowEffortPrompt
    ? nodeConfig.lowEffortPrompt
    : typeof parsed?.nextPrompt === 'string'
      ? parsed.nextPrompt
      : nodeConfig?.question || 'Try explaining the idea again in your own words.',
  pointsToAdd: 0,
})

export const askMVPDiagnosticTutor = async (nodeConfig, messages, modelId = MVP_AIRPLANE_MODEL) => {
  const masteryGoals = Array.isArray(nodeConfig?.masteryGoals) ? nodeConfig.masteryGoals : []
  const currentScore = Number.isFinite(nodeConfig?.currentMasteryScore) ? nodeConfig.currentMasteryScore : 0
  const systemPrompt = `You are Forest's guided diagnostic tutor for one specific learning node.

Internal node context for you only:
- Title: ${nodeConfig?.title || 'Unknown concept'}
- Summary: ${nodeConfig?.summary || ''}
- Question: ${nodeConfig?.question || ''}
- Current mastery score: ${currentScore} / 100

Mastery goals:
${masteryGoals.map((goal, index) => `${index + 1}. ${goal}`).join('\n')}

Your job:
1. Read the full mini-chat for this node.
2. Evaluate the student's latest message for conceptual understanding.
3. Reply as a tutor, not as a grader only.
4. Never begin by dumping the hidden node explanation or by restating the full target answer.
5. If the student is incorrect or incomplete, correct the misunderstanding, provide a brief example, and guide them toward the right thought process without simply handing over a polished final answer.
6. If the student is partially correct, acknowledge what is right, explain what is missing, and advance them somewhat.
7. Reveal only the next useful conceptual step. Prefer a probing follow-up over a complete exposition.
8. Keep the student doing the cognitive work. Your response should sound like a tutor nudging, not a textbook giving away the solution.
9. Add mastery points based on how much closer the student got to a correct mental model.
10. Only mark the node as mastered when the cumulative mastery score should reach 100.

Return strict JSON only with this shape:
{
  "mastered": boolean,
  "feedback": "short markdown response to show in chat",
  "hint": "one concrete hint that helps the student move forward",
  "example": "one short example or analogy",
  "missingConcepts": ["concept 1", "concept 2"],
  "nextPrompt": "one follow-up prompt that pushes the student forward",
  "pointsToAdd": 0
}

Rules:
- "mastered" should be true only if the student has covered the main ideas well enough for this node and the node should now be considered 100/100.
- "pointsToAdd" must be an integer from 0 to 100.
- Use small increments for weak answers, moderate increments for partially correct answers, and enough points to reach 100 only when the student is genuinely there.
- Award points only for new, student-supplied conceptual content in the latest message.
- If the latest message is vague, disengaged, or does not add substantive new reasoning, set "pointsToAdd" to 0 and "mastered" to false.
- "feedback" should teach, not just evaluate.
- In most non-mastered turns, include both a "hint" and an "example".
- Use "feedback" to explain what is right or wrong, "hint" to give the next nudge, and "example" to make the idea more concrete.
- When the answer is wrong, explicitly correct the misconception, include one concrete example, and explain the direction they should think in next.
- Prefer one short example and one pointed follow-up over a broad explanation dump.
- If the student's latest message is tentative, hedged, or phrased as a question such as "maybe...", "could it be...?", or "is it...?", treat it as a real attempt. Respond to the substance of the idea directly instead of telling them to restate.
- When the student asks a clarifying question, answer that question briefly and then steer them back toward the node goal.
- Do not output a complete final answer for the student to copy verbatim unless mastery is already effectively reached.
- Do not reveal the whole hidden lesson in one turn just because you know the node goals.
- Keep "missingConcepts" empty when mastered is true.
- Do not wrap the JSON in markdown fences.
- Do not include any text outside the JSON.`

  try {
    const raw = await callOpenAIChatWithSystemPrompt(modelId, systemPrompt, messages, {
      temperature: 0.2,
      responseFormat: { type: 'json_object' },
    })
    const parsed = parseDiagnosticJson(raw)
    const lowEffortReply = latestUserMessageLooksLowEffort(messages)
    const normalizedPoints = Number.isFinite(parsed.pointsToAdd)
      ? Math.max(0, Math.min(100, Math.round(parsed.pointsToAdd)))
      : 0

    if (lowEffortReply) {
      return {
        response: buildLowEffortTeachingResponse(nodeConfig, parsed),
        error: null,
      }
    }

    return {
      response: {
        mastered: !!parsed.mastered,
        feedback: typeof parsed.feedback === 'string'
          ? parsed.feedback
          : 'Keep going.',
        hint: typeof parsed.hint === 'string'
          ? parsed.hint
          : '',
        example: typeof parsed.example === 'string'
          ? parsed.example
          : '',
        missingConcepts: Array.isArray(parsed.missingConcepts)
          ? parsed.missingConcepts.filter((item) => typeof item === 'string')
          : [],
        nextPrompt: typeof parsed.nextPrompt === 'string' ? parsed.nextPrompt : '',
        pointsToAdd: normalizedPoints,
      },
      error: null,
    }
  } catch (error) {
    console.error('MVP diagnostic tutor error:', error)
    return {
      response: {
        mastered: false,
        feedback: 'I could not evaluate that answer cleanly. Try restating the idea more directly.',
        missingConcepts: [],
        nextPrompt: nodeConfig?.question || 'Try answering the node question again.',
        pointsToAdd: 0,
      },
      error: error.message,
    }
  }
}
