// Tree layout for the concept graph. Every node has 0 or 1 parent in this
// tutor, so the layout is a simple depth-by-sibling-index grid.

const NODE_SPACING_X = 200
const NODE_SPACING_Y = 160

export const computeDynamicMapLayout = (nodes) => {
  if (!Array.isArray(nodes) || nodes.length === 0) return []

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const depthCache = new Map()

  const depthOf = (id, seen = new Set()) => {
    if (depthCache.has(id)) return depthCache.get(id)
    if (seen.has(id)) return 0
    const node = byId.get(id)
    if (!node) return 0
    if (!node.parentId) {
      depthCache.set(id, 0)
      return 0
    }
    seen.add(id)
    const d = depthOf(node.parentId, seen) + 1
    depthCache.set(id, d)
    return d
  }

  const rows = new Map()
  for (const node of nodes) {
    const d = depthOf(node.id)
    const list = rows.get(d) || []
    list.push(node)
    rows.set(d, list)
  }

  const maxDepth = Math.max(...rows.keys())

  // Siblings with a common parent cluster together; sort by createdAt to stay stable.
  for (const [, list] of rows) {
    list.sort((a, b) => {
      const pa = a.parentId || ''
      const pb = b.parentId || ''
      if (pa !== pb) return pa < pb ? -1 : 1
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    })
  }

  const positioned = []
  for (let d = 0; d <= maxDepth; d += 1) {
    const row = rows.get(d) || []
    const span = row.length
    row.forEach((node, index) => {
      const x = span === 1 ? 0 : (index - (span - 1) / 2) * NODE_SPACING_X
      const y = (maxDepth - d) * NODE_SPACING_Y
      positioned.push({ ...node, layout: { x, y, depth: d } })
    })
  }

  // Center on origin.
  const xs = positioned.map((n) => n.layout.x)
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
  return positioned.map((n) => ({ ...n, layout: { ...n.layout, x: n.layout.x - centerX } }))
}
