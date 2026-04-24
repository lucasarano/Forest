// Return Manager.
// Handles popping the stack after a child concept is sufficient, and deciding
// what the parent should do next: usually re-test the phase that was blocked.

import {
  PHASES,
  PHASE_STATES,
  ACTIONS,
  NODE_STATES,
} from '../constants.js'
import { popStack, setPhaseState, markNodeStatus } from '../state.js'

// Decide whether a child is "sufficient" to return from. Conservative policy:
// explanation and causality must be passed. Transfer/Recall are bonus.
export const childIsSufficient = (childNode) => {
  const explanation = childNode.phases[PHASES.EXPLANATION].state
  const causality = childNode.phases[PHASES.CAUSALITY].state
  return (
    explanation === PHASE_STATES.PASSED &&
    (causality === PHASE_STATES.PASSED || causality === PHASE_STATES.SKIPPED)
  )
}

// Pop child off the stack and reopen the parent at the blocked phase.
// Marks the returned node with a status so the graph reflects it.
export const returnToParent = (state, { childNode, newChildStatus }) => {
  let next = popStack(state)
  next = markNodeStatus(next, childNode.id, newChildStatus || NODE_STATES.MASTERED)
  const parentId = childNode.parentId
  if (!parentId || !next.nodes[parentId]) return next

  const blockedPhase = childNode.returnBlockedAt || PHASES.CAUSALITY
  next = setPhaseState(next, parentId, blockedPhase, PHASE_STATES.REOPENED, {
    reopenCount: (next.nodes[parentId].phases[blockedPhase].reopenCount || 0) + 1,
  })
  next = {
    ...next,
    nodes: {
      ...next.nodes,
      [parentId]: {
        ...next.nodes[parentId],
        currentPhase: blockedPhase,
        status: NODE_STATES.ACTIVE,
      },
    },
  }
  return next
}

// Policy for when a child is skipped instead of learned: return to parent,
// continue the blocked phase but with lower confidence requirement recorded.
export const returnFromSkip = (state, { childNode }) => {
  let next = popStack(state)
  next = markNodeStatus(next, childNode.id, NODE_STATES.SKIPPED)
  const parentId = childNode.parentId
  if (!parentId || !next.nodes[parentId]) return next

  const blockedPhase = childNode.returnBlockedAt || PHASES.CAUSALITY
  // Mark the blocked phase as "needs_review" — the student skipped a prerequisite,
  // so downstream evaluation should be stricter.
  next = setPhaseState(next, parentId, blockedPhase, PHASE_STATES.NEEDS_REVIEW)
  next = {
    ...next,
    nodes: {
      ...next.nodes,
      [parentId]: {
        ...next.nodes[parentId],
        currentPhase: blockedPhase,
        status: NODE_STATES.ACTIVE,
      },
    },
  }
  return next
}

// Exports a synchronous decision: should we return right now?
// Runtime calls this after each completed turn on a child node.
export const shouldReturn = (activeNode) => {
  if (!activeNode || activeNode.isRoot) return false
  return childIsSufficient(activeNode)
}

export { ACTIONS }
