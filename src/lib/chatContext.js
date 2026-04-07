const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

const toBoolean = (value, fallback = true) => (typeof value === 'boolean' ? value : fallback)

const safeString = (value) => (typeof value === 'string' ? value : '')

export const INCLUDE_PARENT_CONTEXT_KEY = '__includeParentContext'

export const memoryOverrideKey = (sourceNodeId, memoryId) => `${sourceNodeId}:${memoryId}`

/**
 * Ensure every message has IDs, turn IDs, timestamps, and include flags.
 * Legacy messages are upgraded in-memory while preserving order/content.
 */
export const normalizeMessages = (messages) => {
  if (!Array.isArray(messages)) return []

  let currentTurnId = null

  return messages.map((raw, index) => {
    const role = raw?.role === 'assistant' ? 'assistant' : 'user'
    const id = safeString(raw?.id) || makeId('msg')
    const createdAt = safeString(raw?.createdAt) || new Date(Date.now() + index).toISOString()

    let turnId = safeString(raw?.turnId)
    if (!turnId) {
      if (role === 'user') {
        currentTurnId = makeId('turn')
        turnId = currentTurnId
      } else {
        turnId = currentTurnId || makeId('turn')
      }
    } else if (role === 'user') {
      currentTurnId = turnId
    }

    return {
      ...raw,
      id,
      role,
      turnId,
      content: safeString(raw?.content),
      includeInContext: toBoolean(raw?.includeInContext, true),
      createdAt,
    }
  })
}

/** Group normalized messages into Q/A turns. */
export const buildTurns = (messages) => {
  const normalized = normalizeMessages(messages)
  const turnMap = new Map()
  const turnOrder = []

  for (const msg of normalized) {
    const tid = msg.turnId || makeId('turn')
    if (!turnMap.has(tid)) {
      turnMap.set(tid, {
        id: tid,
        messages: [],
        userMessage: null,
        assistantMessage: null,
        includeInContext: true,
      })
      turnOrder.push(tid)
    }

    const turn = turnMap.get(tid)
    turn.messages.push(msg)
    if (msg.role === 'user' && !turn.userMessage) turn.userMessage = msg
    if (msg.role === 'assistant') turn.assistantMessage = msg
  }

  return turnOrder.map((id) => {
    const turn = turnMap.get(id)
    const included = turn.messages.some((m) => m.includeInContext !== false)
    return { ...turn, includeInContext: included }
  })
}

const truncate = (text, max = 120) => {
  const value = (text || '').trim().replace(/\s+/g, ' ')
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

/** Deterministic local summary used by the context rail. */
export const summarizeTurn = (turn) => ({
  question: truncate(turn?.userMessage?.content || '', 110) || 'No question',
  answer: truncate(turn?.assistantMessage?.content || '', 150) || 'No answer yet',
})

/**
 * Include only messages marked as context, but always include the pending turn
 * currently being sent to the model.
 */
export const filterMessagesForModel = (messages, pendingTurnId = null) => {
  const normalized = normalizeMessages(messages)
  return normalized.filter((msg) =>
    msg.includeInContext !== false || (pendingTurnId && msg.turnId === pendingTurnId)
  )
}

const normalizeMemories = (memories) => {
  if (!Array.isArray(memories)) return []
  return memories
    .filter(Boolean)
    .map((raw) => ({
      id: safeString(raw.id) || makeId('mem'),
      title: safeString(raw.title),
      reason: safeString(raw.reason),
      content: safeString(raw.content),
      enabled: toBoolean(raw.enabled, true),
      createdAt: safeString(raw.createdAt) || new Date().toISOString(),
      updatedAt: safeString(raw.updatedAt) || new Date().toISOString(),
    }))
}

const normalizeOverrides = (overrides) => {
  if (!overrides || typeof overrides !== 'object') return {}
  const next = {}
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'boolean') next[key] = value
  }
  return next
}

/**
 * Build the effective memory list for a root→active path.
 * Nearest override in the path wins.
 */
export const collectEffectiveMemories = (pathNodes) => {
  if (!Array.isArray(pathNodes) || pathNodes.length === 0) return []

  const byKey = new Map()
  const order = []

  for (const node of pathNodes) {
    const sourceNodeId = node?.id
    if (!sourceNodeId) continue
    const sourceNodeLabel = safeString(node?.label) || 'Node'
    const memories = normalizeMemories(node?.memories)

    for (const memory of memories) {
      const key = memoryOverrideKey(sourceNodeId, memory.id)
      const entry = {
        key,
        memoryId: memory.id,
        sourceNodeId,
        sourceNodeLabel,
        memory,
        baseEnabled: memory.enabled !== false,
        effectiveEnabled: memory.enabled !== false,
        overriddenByNodeId: null,
      }
      byKey.set(key, entry)
      order.push(key)
    }
  }

  for (const node of pathNodes) {
    const ownerNodeId = node?.id
    const overrides = normalizeOverrides(node?.memoryOverrides)
    for (const [key, value] of Object.entries(overrides)) {
      const entry = byKey.get(key)
      if (!entry) continue
      entry.effectiveEnabled = value
      entry.overriddenByNodeId = ownerNodeId
    }
  }

  return order.map((key) => byKey.get(key)).filter(Boolean)
}
