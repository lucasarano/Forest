const NODE_SPACING_X = 200
const NODE_SPACING_Y = 160

const getLogicalLevels = (nodes) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const cache = new Map()

  const visit = (nodeId, trail = new Set()) => {
    if (cache.has(nodeId)) return cache.get(nodeId)
    if (trail.has(nodeId)) return 0

    const node = nodeMap.get(nodeId)
    if (!node) return 0

    const nextTrail = new Set(trail)
    nextTrail.add(nodeId)

    const parentLevels = (node.parentIds || []).map((parentId) => visit(parentId, nextTrail))
    const level = parentLevels.length ? Math.max(...parentLevels) + 1 : 0
    cache.set(nodeId, level)
    return level
  }

  nodes.forEach((node) => visit(node.id))
  return cache
}

const getRenderedLevels = (nodes) => {
  const childrenMap = new Map()
  nodes.forEach((node) => {
    for (const parentId of node.parentIds || []) {
      const list = childrenMap.get(parentId) || []
      list.push(node.id)
      childrenMap.set(parentId, list)
    }
  })

  const cache = new Map()

  const visit = (nodeId, trail = new Set()) => {
    if (cache.has(nodeId)) return cache.get(nodeId)
    if (trail.has(nodeId)) return 0

    const nextTrail = new Set(trail)
    nextTrail.add(nodeId)

    const childLevels = (childrenMap.get(nodeId) || []).map((childId) => visit(childId, nextTrail))
    const level = childLevels.length ? Math.max(...childLevels) + 1 : 0
    cache.set(nodeId, level)
    return level
  }

  nodes.forEach((node) => visit(node.id))
  return cache
}

export const computeDynamicMapLayout = (nodes) => {
  if (!Array.isArray(nodes) || nodes.length === 0) return []

  const levels = getLogicalLevels(nodes)
  const renderedLevels = getRenderedLevels(nodes)
  const maxRenderedLevel = Math.max(...nodes.map((node) => renderedLevels.get(node.id) || 0))

  const buckets = new Map()
  nodes.forEach((node) => {
    const renderedLevel = renderedLevels.get(node.id) || 0
    const list = buckets.get(renderedLevel) || []
    list.push(node)
    buckets.set(renderedLevel, list)
  })

  const totalRows = maxRenderedLevel + 1

  const laid = [...nodes]
    .sort((left, right) => {
      const levelDiff = (renderedLevels.get(right.id) || 0) - (renderedLevels.get(left.id) || 0)
      if (levelDiff !== 0) return levelDiff
      return (left.orderIndex || 0) - (right.orderIndex || 0)
    })
    .map((node) => {
      const level = levels.get(node.id) || 0
      const renderedLevel = renderedLevels.get(node.id) || 0
      const siblings = (buckets.get(renderedLevel) || [])
        .slice()
        .sort((left, right) => (left.orderIndex || 0) - (right.orderIndex || 0))
      const index = siblings.findIndex((entry) => entry.id === node.id)
      const span = siblings.length

      const x = span === 1 ? 0 : (index - (span - 1) / 2) * NODE_SPACING_X
      const y = totalRows <= 1 ? 0 : (maxRenderedLevel - renderedLevel) * NODE_SPACING_Y

      return {
        ...node,
        layout: { x, y, level, renderedLevel },
      }
    })

  if (laid.length === 0) return laid

  const minX = Math.min(...laid.map((n) => n.layout.x))
  const maxX = Math.max(...laid.map((n) => n.layout.x))
  const centerX = (minX + maxX) / 2

  return laid.map((node) => ({
    ...node,
    layout: {
      ...node.layout,
      x: node.layout.x - centerX,
    },
  }))
}
