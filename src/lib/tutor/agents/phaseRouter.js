// Global Phase Router.
// Consumes the phase-specific router's proposal plus global policy (stack
// depth, sibling child count, reopen loop detection) and returns the final
// action the runtime should execute.
//
// Deterministic. No LLM calls. No prose.

import {
  ACTIONS,
  MAX_CHILDREN_PER_NODE,
  MAX_STACK_DEPTH,
  PHASE_ORDER,
  PHASES,
  PHASE_STATES,
} from '../constants.js'

const MAX_REOPEN_COUNT = 2
const MAX_PHASE_ATTEMPTS = 4

export const route = ({ state, activeNode, proposal }) => {
  if (!activeNode || !proposal) return { action: ACTIONS.CONTINUE }

  const { action } = proposal
  const phaseRecord = activeNode.phases[proposal.phase]

  // 1. OPEN_SUBTOPIC — cap by stack depth + child fan-out. Downgrade to GUIDE
  //    (teach forward) rather than REMEDIATE (re-lecture) when capped.
  if (action === ACTIONS.OPEN_SUBTOPIC) {
    if (state.stack.length >= MAX_STACK_DEPTH) {
      return { ...proposal, action: ACTIONS.GUIDE, downgraded: 'stack_depth_cap' }
    }
    if ((activeNode.childIds || []).length >= MAX_CHILDREN_PER_NODE) {
      return { ...proposal, action: ACTIONS.GUIDE, downgraded: 'child_cap' }
    }
    return proposal
  }

  // 2. REOPEN — cap reopen loops per phase.
  if (action === ACTIONS.REOPEN) {
    const target = proposal.targetPhase
    const targetRec = activeNode.phases[target]
    if (targetRec && targetRec.reopenCount >= MAX_REOPEN_COUNT) {
      return { ...proposal, action: ACTIONS.GUIDE, downgraded: 'reopen_cap' }
    }
    return proposal
  }

  // 3. REMEDIATE / GUIDE — if we've tried too many times, force advance to
  //    avoid getting the student permanently stuck.
  if ((action === ACTIONS.REMEDIATE || action === ACTIONS.GUIDE) && phaseRecord?.attempts >= MAX_PHASE_ATTEMPTS) {
    return { ...proposal, action: ACTIONS.ADVANCE, downgraded: 'attempt_cap' }
  }

  return proposal
}

// Given a node, return the next phase that should be visited after the
// current one passes. Recall is scheduled (deferred), not visited inline,
// so once transfer passes we call COMPLETE_NODE and the scheduler handles recall.
export const phaseAfter = (phase) => {
  const idx = PHASE_ORDER.indexOf(phase)
  if (idx < 0) return PHASES.EXPLANATION
  if (idx >= PHASE_ORDER.length - 1) return null
  return PHASE_ORDER[idx + 1]
}

// Returns the first unsatisfied phase on a node (used when reopening or
// resuming after return).
export const firstUnsatisfiedPhase = (node) => {
  for (const phase of PHASE_ORDER) {
    const rec = node.phases[phase]
    if (!rec) continue
    if (rec.state === PHASE_STATES.PASSED) continue
    if (rec.state === PHASE_STATES.SKIPPED) continue
    return phase
  }
  return null
}
