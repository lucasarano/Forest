import assert from 'node:assert/strict'
import test, { afterEach, before } from 'node:test'

import { callTextPrompt } from './ai.js'

const originalFetch = global.fetch

const createChatResponse = (content, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => (
    status >= 200 && status < 300
      ? { choices: [{ message: { content } }] }
      : { error: { message: content } }
  ),
})

const createFetchSequence = (steps) => {
  let index = 0
  const fetchStub = async () => {
    const step = steps[Math.min(index, steps.length - 1)]
    index += 1
    if (typeof step === 'function') return step()
    return step
  }
  fetchStub.calls = () => index
  return fetchStub
}

before(() => {
  process.env.OPENAI_API_KEY = 'test-key'
})

afterEach(() => {
  global.fetch = originalFetch
})

test('callTextPrompt retries transient failures and eventually succeeds', async () => {
  const fetchStub = createFetchSequence([
    () => { throw new TypeError('fetch failed') },
    () => { throw new TypeError('fetch failed') },
    createChatResponse('Recovered response'),
  ])
  global.fetch = fetchStub

  const result = await callTextPrompt({
    systemPrompt: 'You are a tutor.',
    messages: [{ role: 'user', content: 'hello' }],
  })

  assert.equal(result, 'Recovered response')
  assert.equal(fetchStub.calls(), 3)
})
