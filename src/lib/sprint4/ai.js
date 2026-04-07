const OPENAI_API_BASE = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4.1-mini'
const REQUEST_TIMEOUT_MS = 20000
const MAX_RETRY_ATTEMPTS = 3
const BASE_RETRY_DELAY_MS = 150

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isRetryableStatus = (status) =>
  status === 408 || status === 409 || status === 429 || status >= 500

const createChatError = (message, { status = 0, retryable = false, cause = null } = {}) => {
  const error = new Error(message)
  error.status = status
  error.retryable = retryable
  if (cause) error.cause = cause
  return error
}

const isRetryableChatError = (error) => {
  if (!error) return false
  if (error.retryable === true) return true
  if (typeof error.status === 'number' && error.status > 0) return isRetryableStatus(error.status)
  if (error.name === 'AbortError') return true
  return error instanceof TypeError || /fetch failed|timed out/i.test(error.message || '')
}

const getRetryDelayMs = (attempt) =>
  BASE_RETRY_DELAY_MS * (2 ** Math.max(0, attempt - 1)) + Math.round(Math.random() * 40)

const callChatOnce = async ({ systemPrompt, messages, model, temperature, responseFormat, maxCompletionTokens }) => {
  const apiKey = getApiKey()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
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
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw createChatError(
        errorData.error?.message || `OpenAI request failed (${response.status})`,
        { status: response.status, retryable: isRetryableStatus(response.status) }
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim() || ''
    if (!content) {
      throw createChatError('OpenAI returned an empty response.', { retryable: true })
    }
    return content
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createChatError('OpenAI request timed out.', { retryable: true, cause: error })
    }
    if (error instanceof Error && typeof error.retryable === 'boolean') throw error
    throw createChatError(error instanceof Error ? error.message : 'OpenAI request failed.', {
      retryable: isRetryableChatError(error),
      cause: error instanceof Error ? error : null,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

const callChat = async ({ systemPrompt, messages, model = DEFAULT_MODEL, temperature = 0.2, responseFormat = null, maxCompletionTokens = 3000 }) => {
  let lastError = null

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const content = await callChatOnce({
        systemPrompt,
        messages,
        model,
        temperature,
        responseFormat,
        maxCompletionTokens,
      })
      if (attempt > 1) {
        console.warn(`[Sprint4AI] request recovered`, { attempt, model })
      }
      return content
    } catch (error) {
      lastError = error
      const retryable = isRetryableChatError(error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown OpenAI error'

      if (!retryable || attempt >= MAX_RETRY_ATTEMPTS) {
        console.warn(`[Sprint4AI] request failed`, {
          attempt,
          maxAttempts: MAX_RETRY_ATTEMPTS,
          retryable,
          model,
          error: errorMessage,
        })
        throw error
      }

      console.warn(`[Sprint4AI] request retry`, {
        attempt,
        maxAttempts: MAX_RETRY_ATTEMPTS,
        model,
        error: errorMessage,
      })
      await sleep(getRetryDelayMs(attempt))
    }
  }

  throw lastError || new Error('OpenAI request failed.')
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
  const clampNumericFields = (obj) => {
    if (!obj || typeof obj !== 'object') return obj
    const out = Array.isArray(obj) ? [...obj] : { ...obj }
    for (const key of Object.keys(out)) {
      if (typeof out[key] === 'number') {
        out[key] = Math.max(-1e6, Math.min(1e6, out[key]))
      } else if (typeof out[key] === 'object') {
        out[key] = clampNumericFields(out[key])
      }
    }
    if (typeof out.confidence === 'number') out.confidence = Math.max(0, Math.min(1, out.confidence))
    return out
  }

  const invoke = async (messageContent) => {
    const raw = await callChat({
      systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
      model,
      temperature,
      maxCompletionTokens,
      responseFormat: { type: 'json_object' },
    })
    const parsed = clampNumericFields(parseJson(raw))
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
