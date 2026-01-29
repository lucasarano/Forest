/**
 * Parse model response for CONCEPT (node title) and SUGGEST_NEW_NODE (topic drift)
 * Model may end with lines: CONCEPT: <short phrase> and/or SUGGEST_NEW_NODE: <concept>
 */

/**
 * @param {string} rawResponse
 * @returns {{ content: string, concept: string | null, suggestNewNode: string | null }}
 */
export function parseModelResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'string') {
    return { content: rawResponse || '', concept: null, suggestNewNode: null }
  }

  let concept = null
  let suggestNewNode = null
  const lines = rawResponse.split('\n')
  const keep = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const conceptMatch = line.match(/^CONCEPT:\s*(.+)$/i)
    const suggestMatch = line.match(/^SUGGEST_NEW_NODE:\s*(.+)$/i)
    if (conceptMatch) {
      concept = conceptMatch[1].trim()
    } else if (suggestMatch) {
      suggestNewNode = suggestMatch[1].trim()
    } else {
      keep.push(line)
    }
  }

  const content = keep.join('\n').trim()
  return { content, concept, suggestNewNode }
}
