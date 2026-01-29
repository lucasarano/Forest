/**
 * Context Engine for Learning Tree
 * Handles context path building and AI payload preparation
 */

/**
 * Build context path from a node to the root
 * Returns array of nodes from root to current node
 */
export const buildContextPath = (nodeId, nodesArray) => {
  const path = []
  let currentNode = nodesArray.find(n => n.id === nodeId)

  while (currentNode) {
    path.unshift({
      id: currentNode.id,
      label: currentNode.label,
      question: currentNode.question,
      contextAnchor: currentNode.contextAnchor,
      aiResponse: currentNode.aiResponse,
      messages: currentNode.messages,
    })
    currentNode = nodesArray.find(n => n.id === currentNode.parentId)
  }

  return path
}

/**
 * Get heritage string (path context) for AI - no current question
 */
export const getHeritageString = (contextPath) => {
  let heritage = "Contextual Heritage:\n"
  contextPath.forEach((node, i) => {
    const firstQ = node.question || node.messages?.[0]?.content
    if (i === 0) {
      heritage += `Root Topic: "${node.label}"`
      if (firstQ) heritage += ` (Original question: "${firstQ}")`
      heritage += '\n'
    } else {
      heritage += `  ↳ Level ${i}: "${node.label}"`
      if (node.contextAnchor) heritage += ` (branched from: "${node.contextAnchor}")`
      if (firstQ) heritage += ` - Asked: "${firstQ}"`
      heritage += '\n'
    }
  })
  return heritage
}

/**
 * Format contextual heritage string for AI (legacy: includes current question in one string)
 */
export const prepareAIPayload = (contextPath, newQuestion) => {
  const heritage = getHeritageString(contextPath) + (newQuestion ? `\nCurrent Question: ${newQuestion}` : '')
  return { heritage, question: newQuestion, fullPrompt: heritage }
}

/**
 * Get all edge IDs in the path from node to root
 * Used for visual highlighting of active path
 */
export const getActivePath = (nodeId, nodesArray, edgesArray) => {
  const pathEdges = []
  let currentNode = nodesArray.find(n => n.id === nodeId)

  while (currentNode && currentNode.parentId) {
    const edge = edgesArray.find(e =>
      e.targetId === currentNode.id && e.sourceId === currentNode.parentId
    )
    if (edge) {
      pathEdges.push(edge.id)
    }
    currentNode = nodesArray.find(n => n.id === currentNode.parentId)
  }

  return pathEdges
}

/**
 * Get all node IDs in the path from node to root
 */
export const getActiveNodePath = (nodeId, nodesArray) => {
  const pathNodes = []
  let currentNode = nodesArray.find(n => n.id === nodeId)

  while (currentNode) {
    pathNodes.unshift(currentNode.id)
    currentNode = nodesArray.find(n => n.id === currentNode.parentId)
  }

  return pathNodes
}
