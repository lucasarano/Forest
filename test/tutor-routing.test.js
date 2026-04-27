import assert from 'node:assert/strict'
import test from 'node:test'

import { ACTIONS, PHASES } from '../src/lib/tutor/constants.js'
import { routePhase as routeTransfer } from '../src/lib/tutor/phases/transfer.js'
import { routePhase as routeCausality } from '../src/lib/tutor/phases/causality.js'
import { createInitialState, getActiveNode, markGoalsCovered, pushSubtopic } from '../src/lib/tutor/state.js'

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

test('transfer router breaks the missing_why loop after repeated turns and advances', () => {
  const decision = routeTransfer({
    node: { isRoot: false },
    evaluation: {
      appliedCorrectly: 0.9,
      confidence: 0.5,
      correctOutcomeButMissingWhy: true,
      exposesCausalWeakness: true,
    },
    phaseRecord: {
      attempts: 3,
      confidence: 0.5,
      evidence: [
        { raw: { correctOutcomeButMissingWhy: true } },
        { raw: { correctOutcomeButMissingWhy: false } },
        { raw: { correctOutcomeButMissingWhy: true } },
      ],
    },
  })

  assert.equal(decision.action, ACTIONS.ADVANCE)
  assert.equal(decision.reason, 'missing_why_loop_break')
})

test('transfer router advances on uncovered goals once attempts pile up and this turn passes', () => {
  const decision = routeTransfer({
    node: { isRoot: true },
    evaluation: {
      appliedCorrectly: 0.85,
      confidence: 0.8,
      correctOutcomeButMissingWhy: false,
      exposesCausalWeakness: false,
    },
    phaseRecord: {
      attempts: 4,
      confidence: 0.55,
      evidence: [],
    },
    goals: ['goal-a', 'goal-b'],
    goalsCovered: [true, false],
  })

  assert.equal(decision.action, ACTIONS.ADVANCE)
  assert.equal(decision.reason, 'attempts_with_passing_confidence')
})

test('causality router advances when recent turns show consistent passing confidence', () => {
  const decision = routeCausality({
    node: { isRoot: true },
    evaluation: {
      confidence: 0.85,
      magicalLanguage: false,
      explanationFoundationWeak: false,
      localOrPrerequisite: 'local',
      suspectedPrerequisiteGap: null,
    },
    phaseRecord: {
      attempts: 3,
      confidence: 0.5,
      evidence: [
        { raw: { confidence: 0.4 } },
        { raw: { confidence: 0.78 } },
        { raw: { confidence: 0.85 } },
      ],
    },
    goals: ['goal-a', 'goal-b', 'goal-c'],
    goalsCovered: [true, true, false],
  })

  assert.equal(decision.action, ACTIONS.ADVANCE)
  assert.equal(decision.reason, 'consistent_passing')
})

test('flat goalsCovered reflects the union of all phase coverage arrays', () => {
  const initial = createInitialState({
    concept: {
      id: 'concept-1',
      title: 'Photosynthesis',
      seedQuestion: 'How do plants make food from light?',
      conceptGoals: [
        'Inputs and outputs of photosynthesis',
        'Role of chlorophyll',
        'Light reactions and Calvin cycle',
      ],
    },
  })

  // Mark goal 0 covered in explanation, goal 1 in causality, goal 2 in transfer.
  let state = markGoalsCovered(initial, [0], PHASES.EXPLANATION)
  state = markGoalsCovered(state, [1], PHASES.CAUSALITY)
  state = markGoalsCovered(state, [2], PHASES.TRANSFER)

  // The flat goalsCovered (read by the UI) should show 3/3 covered, not 1/3.
  assert.deepEqual(state.goalsCovered, [true, true, true])
  assert.equal(state.goalsCoveredByPhase[PHASES.EXPLANATION][0], true)
  assert.equal(state.goalsCoveredByPhase[PHASES.CAUSALITY][1], true)
  assert.equal(state.goalsCoveredByPhase[PHASES.TRANSFER][2], true)
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
