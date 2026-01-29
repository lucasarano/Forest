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
    })
    currentNode = nodesArray.find(n => n.id === currentNode.parentId)
  }

  return path
}

/**
 * Format contextual heritage string for AI
 */
export const prepareAIPayload = (contextPath, newQuestion) => {
  let heritage = "Contextual Heritage:\n"

  contextPath.forEach((node, i) => {
    if (i === 0) {
      heritage += `Root Topic: "${node.label}"`
      if (node.question) {
        heritage += ` (Original question: "${node.question}")`
      }
      heritage += '\n'
    } else {
      heritage += `  ↳ Level ${i}: "${node.label}"`
      if (node.contextAnchor) {
        heritage += ` (branched from: "${node.contextAnchor}")`
      }
      if (node.question) {
        heritage += ` - Asked: "${node.question}"`
      }
      heritage += '\n'
    }
  })

  heritage += `\nCurrent Question: ${newQuestion}`

  return {
    heritage,
    question: newQuestion,
    fullPrompt: heritage,
  }
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
