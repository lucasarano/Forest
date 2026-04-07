const NODE_SPACING_X = 200
const NODE_SPACING_Y = 160

const getLevels = (nodes) => {
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

export const computeDynamicMapLayout = (nodes) => {
  if (!Array.isArray(nodes) || nodes.length === 0) return []

  const levels = getLevels(nodes)
  const maxLevel = Math.max(...levels.values(), 0)
  const buckets = new Map()

  nodes.forEach((node) => {
    const level = levels.get(node.id) || 0
    const renderedLevel = maxLevel - level
    const list = buckets.get(renderedLevel) || []
    list.push(node)
    buckets.set(renderedLevel, list)
  })

  const totalRows = buckets.size || 1

  const laid = [...nodes]
    .sort((left, right) => {
      const levelDiff = (levels.get(left.id) || 0) - (levels.get(right.id) || 0)
      if (levelDiff !== 0) return levelDiff
      return (left.orderIndex || 0) - (right.orderIndex || 0)
    })
    .map((node) => {
      const level = levels.get(node.id) || 0
      const renderedLevel = maxLevel - level
      const siblings = (buckets.get(renderedLevel) || [])
        .slice()
        .sort((left, right) => (left.orderIndex || 0) - (right.orderIndex || 0))
      const index = siblings.findIndex((entry) => entry.id === node.id)
      const span = siblings.length

      const x = span === 1 ? 0 : (index - (span - 1) / 2) * NODE_SPACING_X
      const y = totalRows <= 1 ? 0 : renderedLevel * NODE_SPACING_Y

      return {
        ...node,
        layout: { x, y, level, renderedLevel },
      }
    })

  if (laid.length === 0) return laid

  const minX = Math.min(...laid.map((n) => n.layout.x))
  const maxX = Math.max(...laid.map((n) => n.layout.x))
  const minY = Math.min(...laid.map((n) => n.layout.y))
  const maxY = Math.max(...laid.map((n) => n.layout.y))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return laid.map((node) => ({
    ...node,
    layout: {
      ...node.layout,
      x: node.layout.x - centerX,
      y: node.layout.y - centerY,
    },
  }))
}
