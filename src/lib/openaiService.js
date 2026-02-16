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
