/**
 * AI Service for Knowledge Graph Tutor (Gemini)
 * Uses Google Gemini for fast chat completions.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const CHAT_MODEL = 'gemini-2.5-flash-lite' // lower demand, cost-efficient; fallback: gemini-2.0-flash

/**
 * Ask AI with contextual heritage and full chat history
 * @param {string} heritage - Path context string from getHeritageString
 * @param {Array<{role:'user'|'assistant',content:string}>} messages - Current node chat (user/assistant turns)
 */
export const askAI = async (heritage, messages) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY

  if (!apiKey) {
    console.error('Gemini API key not found. Please add VITE_GEMINI_API_KEY to your .env file.')
    return {
      response: 'Error: Gemini API key not configured. Please add your API key to the .env file.',
      expansionIdeas: [],
      error: 'Missing API key'
    }
  }

  const systemPrompt = `You are a specialized Knowledge Graph Tutor. You receive a 'Contextual Heritage' string showing the learning path, then the conversation in this node.

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

  // Gemini contents: alternate user / model. First message is heritage as user.
  const contents = [{ role: 'user', parts: [{ text: heritage }] }]

  const messageList = Array.isArray(messages) ? messages : [{ role: 'user', content: messages }]
  for (const msg of messageList) {
    const role = msg.role === 'assistant' ? 'model' : 'user'
    contents.push({ role, parts: [{ text: msg.content || '' }] })
  }

  const url = `${GEMINI_API_BASE}/models/${CHAT_MODEL}:generateContent?key=${apiKey}`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const message = errorData.error?.message || `Gemini API request failed (${response.status})`
      throw new Error(message)
    }

    const data = await response.json()
    const textPart = data.candidates?.[0]?.content?.parts?.[0]
    const content = textPart?.text?.trim() || ''

    if (!content && data.candidates?.[0]?.finishReason) {
      throw new Error(`Generation stopped: ${data.candidates[0].finishReason}`)
    }

    return {
      response: content,
      error: null,
    }
  } catch (error) {
    console.error('Gemini API Error:', error)
    return {
      response: `Error: ${error.message}. Please check your API key and connection.`,
      error: error.message,
    }
  }
}
