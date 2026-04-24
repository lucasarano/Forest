import assert from 'node:assert/strict'
import test from 'node:test'

import { ACTIONS, PHASES } from '../src/lib/tutor/constants.js'
import { routePhase as routeTransfer } from '../src/lib/tutor/phases/transfer.js'
import { createInitialState, getActiveNode, pushSubtopic } from '../src/lib/tutor/state.js'

test('transfer router asks an in-place why follow-up when outcome is right but mechanism is thin', () => {
  const decision = routeTransfer({
    node: { isRoot: false },
    evaluation: {
      appliedCorrectly: 0.9,
      confidence: 0.5,
      correctOutcomeButMissingWhy: true,
      exposesCausalWeakness: true,
    },
  })

  assert.equal(decision.action, ACTIONS.GUIDE)
  assert.equal(decision.phase, PHASES.TRANSFER)
  assert.equal(decision.reason, 'missing_why')
})

test('transfer router still reopens causality when the transferred outcome is wrong', () => {
  const decision = routeTransfer({
    node: { isRoot: false },
    evaluation: {
      appliedCorrectly: 0.2,
      confidence: 0.2,
      correctOutcomeButMissingWhy: false,
      exposesCausalWeakness: true,
    },
  })

  assert.equal(decision.action, ACTIONS.REOPEN)
  assert.equal(decision.targetPhase, PHASES.CAUSALITY)
})

test('subtopic state preserves quick prerequisite metadata', () => {
  const initial = createInitialState({
    concept: {
      id: 'concept-1',
      title: 'Internal Communication in Computers',
      seedQuestion: 'What moves data around inside a computer?',
    },
  })

  const state = pushSubtopic(initial, {
    title: 'What an SSD is',
    question: 'What is an SSD?',
    reason: 'The student asked what SSD means.',
    parentId: 'root',
    blockedPhase: PHASES.EXPLANATION,
    detourKind: 'quick_prerequisite',
    prerequisiteTerm: 'SSD',
  })

  const child = getActiveNode(state)
  assert.equal(child.detourKind, 'quick_prerequisite')
  assert.equal(child.prerequisiteTerm, 'SSD')
  assert.equal(child.returnBlockedAt, PHASES.EXPLANATION)
})
