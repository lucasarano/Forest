const OPENAI_API_BASE = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4.1-mini'

const readEnv = (key) => {
  if (typeof process !== 'undefined' && process?.env?.[key]) {
    return process.env[key]
  }

  if (typeof import.meta !== 'undefined' && import.meta?.env?.[key]) {
    return import.meta.env[key]
  }

  return ''
}

const stripCodeFence = (value) => value
  .trim()
  .replace(/^```json\s*/i, '')
  .replace(/^```\s*/i, '')
  .replace(/\s*```$/, '')

const parseJson = (value) => {
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

const getApiKey = () => {
  const apiKey = readEnv('OPENAI_API_KEY') || readEnv('VITE_OPENAI_API_KEY')
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Add OPENAI_API_KEY or VITE_OPENAI_API_KEY to your environment.')
  }
  return apiKey
}

const callChat = async ({ systemPrompt, messages, model = DEFAULT_MODEL, temperature = 0.2, responseFormat = null, maxCompletionTokens = 3000 }) => {
  const apiKey = getApiKey()
  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_completion_tokens: maxCompletionTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error?.message || `OpenAI request failed (${response.status})`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim() || ''
  if (!content) {
    throw new Error('OpenAI returned an empty response.')
  }
  return content
}

export const callTextPrompt = async ({
  systemPrompt,
  messages,
  model = DEFAULT_MODEL,
  temperature = 0.4,
  maxCompletionTokens = 1200,
}) => callChat({
  systemPrompt,
  messages,
  model,
  temperature,
  maxCompletionTokens,
})

export const callStructuredPrompt = async ({
  systemPrompt,
  userPrompt,
  schema,
  model = DEFAULT_MODEL,
  temperature = 0.2,
  maxCompletionTokens = 3500,
}) => {
  const invoke = async (messageContent) => {
    const raw = await callChat({
      systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
      model,
      temperature,
      maxCompletionTokens,
      responseFormat: { type: 'json_object' },
    })
    const parsed = parseJson(raw)
    const result = schema.safeParse(parsed)
    return { raw, result }
  }

  const firstPass = await invoke(userPrompt)
  if (firstPass.result.success) return firstPass.result.data

  const repairPrompt = [
    'The previous JSON failed validation.',
    `Validation errors: ${JSON.stringify(firstPass.result.error.issues)}`,
    `Previous JSON: ${firstPass.raw}`,
    'Return corrected JSON only.',
  ].join('\n\n')

  const secondPass = await invoke(repairPrompt)
  if (secondPass.result.success) return secondPass.result.data

  throw new Error(`Structured output validation failed: ${JSON.stringify(secondPass.result.error.issues)}`)
}
