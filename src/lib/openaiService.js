/**
 * OpenAI Service for Knowledge Graph Tutor
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

/**
 * Ask AI with contextual heritage
 */
export const askAI = async (heritage, question) => {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY

  if (!apiKey) {
    console.error('OpenAI API key not found. Please add VITE_OPENAI_API_KEY to your .env file.')
    return {
      response: 'Error: OpenAI API key not configured. Please add your API key to the .env file.',
      expansionIdeas: [],
      error: 'Missing API key'
    }
  }

  const systemPrompt = `You are a specialized Knowledge Graph Tutor. You receive a 'Contextual Heritage' string showing the learning path that led to the current question.

Your role:
1. Answer the current question thoroughly and completely while maintaining continuity of the heritage
2. Do NOT repeat facts already established in the heritage path
3. Provide a complete, comprehensive answer - take as much space as needed to explain properly
4. Format your response in clear Markdown with headings, lists, and code examples where appropriate
5. Be encouraging and maintain the conversational learning flow
6. If the student asks about a specific concept they selected from a previous answer, dive deep into just that concept

The student will manually select parts of your answer they want to explore further. Focus on giving complete, thorough explanations.`

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: heritage }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error?.message || 'OpenAI API request failed')
    }

    const data = await response.json()
    const content = data.choices[0].message.content

    return {
      response: content,
      error: null
    }
  } catch (error) {
    console.error('OpenAI API Error:', error)
    return {
      response: `Error: ${error.message}. Please check your API key and connection.`,
      error: error.message
    }
  }
}
