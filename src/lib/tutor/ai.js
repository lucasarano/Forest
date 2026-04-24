// Thin OpenAI wrapper used by every agent. Supports JSON-schema responses
// via zod, with a single self-repair retry on validation failure.

import { DEFAULT_MODEL } from './constants.js'

const OPENAI_API_BASE = 'https://api.openai.com/v1'
const REQUEST_TIMEOUT_MS = 25000
const MAX_RETRY_ATTEMPTS = 3
const BASE_RETRY_DELAY_MS = 200

const readEnv = (key) => {
  if (typeof process !== 'undefined' && process?.env?.[key]) return process.env[key]
  if (typeof import.meta !== 'undefined' && import.meta?.env?.[key]) return import.meta.env[key]
  return ''
}

const apiKey = () => {
  const key = readEnv('OPENAI_API_KEY') || readEnv('VITE_OPENAI_API_KEY')
  if (!key) throw new Error('OPENAI_API_KEY is not set')
  return key
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const stripCodeFence = (value) => value
  .trim()
  .replace(/^```json\s*/i, '')
  .replace(/^```\s*/i, '')
  .replace(/\s*```$/, '')

const parseJson = (value) => {
  const cleaned = stripCodeFence(value)
  try { return JSON.parse(cleaned) } catch {
    const first = cleaned.indexOf('{')
    const last = cleaned.lastIndexOf('}')
    if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1))
    throw new Error('Agent returned invalid JSON')
  }
}

const callOnce = async ({ systemPrompt, messages, model, temperature, responseFormat, maxCompletionTokens }) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        max_completion_tokens: maxCompletionTokens,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        ...(responseFormat ? { response_format: responseFormat } : {}),
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      const msg = err?.error?.message || `OpenAI request failed (${response.status})`
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500
      const error = new Error(msg)
      error.retryable = retryable
      throw error
    }
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim() || ''
    if (!content) {
      const error = new Error('OpenAI returned empty content')
      error.retryable = true
      throw error
    }
    return content
  } catch (error) {
    if (error?.name === 'AbortError') {
      const err = new Error('OpenAI request timed out')
      err.retryable = true
      throw err
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

const callWithRetry = async (opts) => {
  let lastError = null
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await callOnce(opts)
    } catch (error) {
      lastError = error
      if (!error?.retryable || attempt === MAX_RETRY_ATTEMPTS) break
      await sleep(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1))
    }
  }
  throw lastError || new Error('OpenAI request failed')
}

// Global formatting rules appended to every prose-producing agent. The chat
// renders Markdown + KaTeX, so math must be in LaTeX delimiters.
const FORMATTING_RULES = [
  '',
  'FORMATTING:',
  '- Output is rendered as Markdown with KaTeX math support.',
  '- Use LaTeX for ALL math. Inline math in $...$, display math in $$...$$.',
  '- Use LaTeX for variables, expressions, fractions, summations, functions — even short ones.',
  '  Good: "the call $f(n-1) + f(n-2)$", "$O(n \\log n)$", "$\\sum_{i=0}^{n} i$".',
  '  Bad: "the call f(n-1) + f(n-2)", "O(n log n)", raw "^" or "_" for exponents/subscripts.',
  '- Code (snippets, pseudocode) goes in fenced code blocks with a language hint.',
  '- Do NOT escape dollar signs that are meant as math delimiters.',
].join('\n')

export const callText = async ({
  systemPrompt,
  userPrompt,
  messages = null,
  model = DEFAULT_MODEL,
  temperature = 0.5,
  maxCompletionTokens = 700,
}) => callWithRetry({
  systemPrompt: `${systemPrompt}\n${FORMATTING_RULES}`,
  messages: messages || [{ role: 'user', content: userPrompt }],
  model,
  temperature,
  maxCompletionTokens,
  responseFormat: null,
})

// Returns a zod-validated object. Retries once with a repair message on failure.
export const callJson = async ({
  systemPrompt,
  userPrompt,
  schema,
  model = DEFAULT_MODEL,
  temperature = 0.2,
  maxCompletionTokens = 900,
}) => {
  const invoke = async (content) => {
    const raw = await callWithRetry({
      systemPrompt,
      messages: [{ role: 'user', content }],
      model,
      temperature,
      maxCompletionTokens,
      responseFormat: { type: 'json_object' },
    })
    const parsed = parseJson(raw)
    const validated = schema.safeParse(parsed)
    return { raw, validated }
  }

  const first = await invoke(userPrompt)
  if (first.validated.success) return first.validated.data

  const repair = [
    'Your previous JSON failed validation.',
    `Errors: ${JSON.stringify(first.validated.error.issues).slice(0, 800)}`,
    `Previous JSON: ${first.raw}`,
    'Return corrected JSON only. No prose, no code fences.',
  ].join('\n\n')

  const second = await invoke(repair)
  if (second.validated.success) return second.validated.data

  throw new Error(`Agent JSON validation failed: ${JSON.stringify(second.validated.error.issues).slice(0, 400)}`)
}
