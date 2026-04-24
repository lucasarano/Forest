// Recall Scheduler.
// Delays recall until the student has done work on other nodes/phases.
// Keeps recall honest — not immediate re-asking of just-taught material.

import { RECALL_INTERFERENCE_TURNS, PHASES, PHASE_STATES } from '../constants.js'
import { scheduleRecall as stateScheduleRecall, clearRecall } from '../state.js'

// Called after a node finishes explanation+causality+transfer.
// Stamps a readyAtTurn on the recall queue and sets recall phase to deferred.
export const schedule = (state, nodeId) => {
  const readyAtTurn = state.turnIndex + RECALL_INTERFERENCE_TURNS
  return stateScheduleRecall(state, nodeId, readyAtTurn, 'post_transfer')
}

// Returns a nodeId if any queued recall is due, else null.
export const nextDueRecall = (state) => {
  const due = state.recallQueue.find((entry) => entry.readyAtTurn <= state.turnIndex)
  return due ? due.nodeId : null
}

export const clear = (state, nodeId) => clearRecall(state, nodeId)

// Is the node's recall phase in a state where we should run recall now?
export const nodeIsReadyForRecall = (node) => {
  const recall = node.phases[PHASES.RECALL]
  if (!recall) return false
  return recall.state === PHASE_STATES.DEFERRED || recall.state === PHASE_STATES.ACTIVE
}
