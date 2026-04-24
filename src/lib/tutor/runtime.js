// Recursive Mastery Graph — runtime.
//
// Entry points:
//   initializeState(concept)              -> starting state
//   generateOpeningTurn(state)            -> first tutor message (probe) for root
//   runTurn(state, { studentMessage })    -> full agentic loop for one student turn
//   acceptSubtopicOffer(state)            -> dive into the offered subtopic
//   skipSubtopicOffer(state)              -> mark offer skipped, continue parent
//   returnFromActiveNode(state)           -> pop stack (student pressed "Return")
//
// The runtime is the only place that mutates state. Agents return structured
// observations; the Phase Router picks a deterministic action; the runtime
// applies it.

import {
  ACTIONS,
  MESSAGE_ROLES,
  NODE_STATES,
  PHASES,
  PHASE_ORDER,
  PHASE_STATES,
  PASS_THRESHOLDS,
  ROOT_NODE_ID,
} from './constants.js'
import {
  appendMessage,
  createInitialState,
  getActiveNode,
  logEvent,
  markGoalsCovered,
  markNodeStatus,
  pushSubtopic,
  recordEvidence,
  setOffer,
  setPhaseState,
  setRecallPlan,
  setRestartAvailable,
  withNode,
} from './state.js'
import { route as routeGlobal, phaseAfter, firstUnsatisfiedPhase } from './agents/phaseRouter.js'
import { inferSubtopic } from './agents/subtopicInference.js'
import { classifyIntent, fulfillOffer, answerClarification, inviteAttempt } from './agents/intentClassifier.js'
import {
  schedule as scheduleRecall,
  nextDueRecall,
  clear as clearRecallQueue,
  nodeIsReadyForRecall,
} from './agents/recallScheduler.js'
import {
  returnToParent,
  returnFromSkip,
  shouldReturn,
} from './agents/returnManager.js'

import * as explanation from './phases/explanation.js'
import * as causality from './phases/causality.js'
import * as transfer from './phases/transfer.js'
import * as recall from './phases/recall.js'

const PHASE_MODULES = {
  [PHASES.EXPLANATION]: explanation,
  [PHASES.CAUSALITY]: causality,
  [PHASES.TRANSFER]: transfer,
  [PHASES.RECALL]: recall,
}

const QUICK_PREREQUISITE = 'quick_prerequisite'

const trimText = (s, max = 80) => {
  if (!s) return ''
  const flat = String(s).replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

const lastTutorMessage = (node) => {
  const msgs = node?.messages || []
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    if (msgs[i].role === MESSAGE_ROLES.TUTOR || msgs[i].role === MESSAGE_ROLES.SYSTEM) {
      return msgs[i].content || ''
    }
  }
  return ''
}

const isShortAffirmation = (text) =>
  /^(y|yes|yeah|yep|sure|ok|okay|makes sense|got it|i get it|understood|sounds good)[.! ]*$/i
    .test(`${text || ''}`.trim())

const isComprehensionCheckAccept = ({ node, studentMessage }) => {
  if (!isShortAffirmation(studentMessage)) return false
  const last = lastTutorMessage(node).toLowerCase()
  return (
    /\bmake[s]? sense\b/.test(last) ||
    /\bso far\?*$/.test(last.trim()) ||
    /\bfollowing\b/.test(last) ||
    /\bwith me\b/.test(last)
  )
}

const isQuickPrerequisiteNode = (node) => node?.detourKind === QUICK_PREREQUISITE

// Build the kwargs passed into phase agents. Goals and goalsCovered are only
// meaningful on the root node; children never have their own goals. The
// goalsCovered array is resolved per-phase so each phase sees its own coverage
// state (explanation/causality/transfer have independent gates).
const agentKwargs = (state, node, phaseOverride = null) => {
  const phase = phaseOverride || node?.currentPhase
  if (!node?.isRoot) return { goals: [], goalsCovered: [] }
  const goals = state.conceptGoals || []
  const byPhase = state.goalsCoveredByPhase || {}
  const covered = Array.isArray(byPhase[phase])
    ? byPhase[phase]
    : (phase === PHASES.EXPLANATION ? (state.goalsCovered || []) : goals.map(() => false))
  return { goals, goalsCovered: covered }
}

const logAgent = (agent, detail = {}) => {
  const ts = new Date().toISOString()
  const parts = Object.entries(detail)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${typeof v === 'string' ? `"${trimText(v, 60)}"` : JSON.stringify(v)}`)
  console.log(`[${ts}] [AGENT:${agent}] ${parts.join(' ')}`)
}

export const initializeState = ({ concept }) => createInitialState({ concept })

// ─── Public: restart a session with the same concept ──────────────
// Wipes state back to fresh and generates the opening turn. Called when the
// student chose "restart" from a recall miss.
export const restartSession = async (inputState) => {
  const rootNode = inputState.nodes?.[ROOT_NODE_ID]
  const concept = {
    id: inputState.conceptId,
    title: rootNode?.title || '',
    seedQuestion: rootNode?.question || '',
    conceptSummary: inputState.conceptSummary || '',
    conceptGoals: inputState.conceptGoals || [],
  }
  let fresh = createInitialState({ concept })
  fresh = logEvent(fresh, 'session_restarted', { fromTurnIndex: inputState.turnIndex })
  return await generateOpeningTurn(fresh)
}

// ─── Public: opening turn ─────────────────────────────────────────
// Called once after session start so the student sees an explanation probe.
export const generateOpeningTurn = async (state) => {
  const activeNode = getActiveNode(state)
  const phase = activeNode.currentPhase
  const mod = PHASE_MODULES[phase]
  logAgent('PROBE', { phase, mode: 'initial', node: activeNode.title })
  const question = await mod.probe({ node: activeNode, mode: 'initial', ...agentKwargs(state, activeNode) })
  logAgent('PROBE:OUT', { phase, probe: question })
  let next = appendMessage(state, activeNode.id, {
    role: MESSAGE_ROLES.TUTOR,
    content: question,
    phase,
  })
  next = withNode(next, activeNode.id, (node) => ({
    ...node,
    phases: {
      ...node.phases,
      [phase]: {
        ...node.phases[phase],
        state: PHASE_STATES.ACTIVE,
        lastProbe: question,
      },
    },
  }))
  return { state: next, tutorMessage: question }
}

// ─── Public: one full agentic turn ────────────────────────────────
export const runTurn = async (inputState, { studentMessage }) => {
  let state = { ...inputState, turnIndex: inputState.turnIndex + 1, lastTurnAt: new Date().toISOString() }
  const activeNode = getActiveNode(state)
  if (!activeNode) throw new Error('No active node')

  // Record the student's utterance on the active node & active phase.
  state = appendMessage(state, activeNode.id, {
    role: MESSAGE_ROLES.STUDENT,
    content: studentMessage,
    phase: activeNode.currentPhase,
  })
  state = markNodeStatus(state, activeNode.id, NODE_STATES.IN_PROGRESS)

  // Decide whether we're doing a phase turn or a scheduled recall check.
  const dueRecallNodeId = nextDueRecall(state)
  if (dueRecallNodeId && dueRecallNodeId !== activeNode.id) {
    // We won't hijack the student's current node mid-stream. Recall runs when
    // the student is already on that node (e.g., after a return). We just
    // leave the recall in the queue. The runtime will pick it up when the
    // stack lands on that node.
  }

  const phase = activeNode.currentPhase
  const mod = PHASE_MODULES[phase]

  logAgent('TURN', { node: activeNode.title, phase, turn: state.turnIndex, student: studentMessage })

  // 0. Intent classification. Short-circuits non-attempt turns so the phase
  //    evaluator only sees genuine answer attempts.
  let intent = { intent: 'attempt', rationale: 'default' }
  try {
    logAgent('INTENT', { phase, node: activeNode.title })
    intent = await classifyIntent({ node: getActiveNode(state), studentAnswer: studentMessage })
    logAgent('INTENT:OUT', { intent: intent.intent, rationale: intent.rationale })
  } catch (error) {
    logAgent('INTENT:ERR', { error: error.message })
    intent = { intent: 'attempt', rationale: 'classifier_failed' }
  }

  if (typeof mod.probe === 'function' && isComprehensionCheckAccept({ node: getActiveNode(state), studentMessage })) {
    logAgent('CHECKIN_ACCEPT', { phase, node: activeNode.title, classifiedAs: intent.intent })
    const probe = await mod.probe({
      node: getActiveNode(state),
      mode: 'checkin',
      ...agentKwargs(state, getActiveNode(state)),
    })
    logAgent('PROBE:OUT', { phase, probe })
    state = applyProbe(state, activeNode.id, phase, probe, PHASE_STATES.IN_PROGRESS)
    state = logEvent(state, 'intent_handled', { intent: 'checkin_accept', phase, classifiedAs: intent.intent })
    return { state, tutorMessage: probe, decision: { action: ACTIONS.CONTINUE, via: 'checkin_accept' } }
  }

  if (intent.intent === 'accept') {
    logAgent('FULFILL_OFFER', { phase, node: activeNode.title })
    const text = await fulfillOffer({ node: getActiveNode(state), studentAnswer: studentMessage })
    logAgent('FULFILL_OFFER:OUT', { text })
    state = applyProbe(state, activeNode.id, phase, text, PHASE_STATES.IN_PROGRESS)
    state = logEvent(state, 'intent_handled', { intent: 'accept', phase })
    return { state, tutorMessage: text, decision: { action: ACTIONS.CONTINUE, via: 'fulfill_offer' } }
  }
  if (intent.intent === 'question') {
    logAgent('ANSWER_CLARIFICATION', { phase, node: activeNode.title })
    const text = await answerClarification({ node: getActiveNode(state), studentAnswer: studentMessage })
    logAgent('ANSWER_CLARIFICATION:OUT', { text })
    state = applyProbe(state, activeNode.id, phase, text, PHASE_STATES.IN_PROGRESS)
    state = logEvent(state, 'intent_handled', { intent: 'question', phase })
    return { state, tutorMessage: text, decision: { action: ACTIONS.CONTINUE, via: 'answer_clarification' } }
  }
  if (intent.intent === 'prerequisite_question') {
    // Student named a specific term/concept they don't know — treat as a prerequisite
    // gap and offer to dive into a subtopic, rather than answering inline.
    const term = (intent.prerequisiteTerm || '').trim()
    logAgent('PREREQUISITE_QUESTION', { phase, node: activeNode.title, term })
    try {
      const hint = term
        ? `Student asked "what is ${term}" — treat as prerequisite concept to open as a subtopic.`
        : 'Student asked about an unfamiliar term — treat as prerequisite concept.'
      const subtopic = await inferSubtopic({
        node: getActiveNode(state),
        phase,
        hint,
        studentAnswer: studentMessage,
      })
      logAgent('SUBTOPIC_INFER:OUT', {
        title: subtopic.title,
        reason: subtopic.reason,
        skippable: subtopic.skippable,
      })
      const offer = {
        parentId: activeNode.id,
        blockedPhase: phase,
        title: subtopic.title,
        question: subtopic.question,
        reason: subtopic.reason,
        skippable: subtopic.skippable !== false,
        createdAtTurn: state.turnIndex,
        // Preserve why we branched so the child chat can open with context.
        triggerStudentText: studentMessage,
        triggerProbe: activeNode.phases?.[phase]?.lastProbe || '',
        detourKind: QUICK_PREREQUISITE,
        prerequisiteTerm: term,
      }
      state = setOffer(state, offer)
      const tutorMessage = [
        `Looks like **${subtopic.title}** is worth a quick detour.`,
        `Why: ${subtopic.reason}`,
        'You can **Dive in**, **Skip for now**, or ask **Why is this needed?**',
      ].join('\n\n')
      state = appendMessage(state, activeNode.id, {
        role: MESSAGE_ROLES.SYSTEM,
        content: tutorMessage,
        phase,
      })
      state = logEvent(state, 'intent_handled', { intent: 'prerequisite_question', phase, term })
      return {
        state,
        tutorMessage,
        decision: { action: ACTIONS.OPEN_SUBTOPIC, via: 'prerequisite_question' },
        offer,
      }
    } catch (error) {
      logAgent('SUBTOPIC_INFER:ERR', { error: error.message })
      // Fall back to inline clarification if subtopic inference fails.
      const text = await answerClarification({ node: getActiveNode(state), studentAnswer: studentMessage })
      state = applyProbe(state, activeNode.id, phase, text, PHASE_STATES.IN_PROGRESS)
      state = logEvent(state, 'intent_handled', { intent: 'prerequisite_question', phase, downgraded: 'infer_failed' })
      return { state, tutorMessage: text, decision: { action: ACTIONS.CONTINUE, via: 'prerequisite_question_fallback' } }
    }
  }
  if (intent.intent === 'giveup') {
    // The student explicitly said they're stuck ("i don't know", "no idea",
    // "i don't understand"). Don't re-ask — TEACH. Use the phase's guide if it
    // has one, otherwise fall back to remediate with a minimal synthetic
    // evaluation so the teach-forward agent has something to work with.
    const teach = typeof mod.guide === 'function' ? mod.guide : mod.remediate
    const syntheticEval = {
      confidence: 0,
      rationale: 'Student said they do not know — teach forward with a concrete mini-step.',
      direction: 'colder',
      magicalLanguage: false,
      plainLanguage: 0,
      capturedConcept: 0,
      circular: false,
      parroting: false,
      preservedStructure: 0,
      appliedCorrectly: 0,
      wordingConfusion: false,
    }
    logAgent('GIVEUP_TEACH', { phase, node: activeNode.title, via: mod.guide ? 'guide' : 'remediate' })
    const text = await teach({
      node: getActiveNode(state),
      evaluation: syntheticEval,
      ...agentKwargs(state, getActiveNode(state)),
    })
    logAgent('GIVEUP_TEACH:OUT', { text })
    state = applyProbe(state, activeNode.id, phase, text, PHASE_STATES.IN_PROGRESS)
    state = logEvent(state, 'intent_handled', { intent: 'giveup', phase })
    return { state, tutorMessage: text, decision: { action: ACTIONS.GUIDE, via: 'giveup_teach' } }
  }
  if (intent.intent === 'nonanswer') {
    logAgent('INVITE_ATTEMPT', { phase, node: activeNode.title })
    const text = await inviteAttempt({ node: getActiveNode(state) })
    logAgent('INVITE_ATTEMPT:OUT', { text })
    state = applyProbe(state, activeNode.id, phase, text, PHASE_STATES.IN_PROGRESS)
    state = logEvent(state, 'intent_handled', { intent: 'nonanswer', phase })
    return { state, tutorMessage: text, decision: { action: ACTIONS.CONTINUE, via: 'invite_attempt' } }
  }
  // 'decline' and 'attempt' fall through to the evaluator. A decline is still
  // evidence about the student's state (they didn't want the offer), so we let
  // the phase evaluator run — it will score low and typically REMEDIATE, which
  // is fine: the next probe will take a different angle.

  // ── Recall phase takes a separate path: evaluator is per-plan-entry and the
  //    decision is simple correct/wrong with plan advancement in the runtime.
  if (phase === PHASES.RECALL) {
    return await runRecallTurn(state, { studentMessage })
  }

  // 1. Phase evaluator produces structured observation.
  let evaluation
  try {
    logAgent('EVALUATE', { phase, node: activeNode.title })
    evaluation = await mod.evaluate({
      node: getActiveNode(state),
      studentAnswer: studentMessage,
      ...agentKwargs(state, getActiveNode(state)),
    })
    logAgent('EVALUATE:OUT', {
      phase,
      confidence: evaluation.confidence,
      rationale: evaluation.rationale,
      prereqGap: evaluation.suspectedPrerequisiteGap || null,
      goalsAddressed: evaluation.goalsAddressed || [],
    })
  } catch (error) {
    logAgent('EVALUATE:ERR', { phase, error: error.message })
    // If the evaluator fails, stay in phase and show a graceful remediation.
    return composeFailureTurn(state, activeNode.id, phase, error)
  }

  state = recordEvidence(state, activeNode.id, phase, {
    confidence: evaluation.confidence,
    rationale: evaluation.rationale,
    probe: activeNode.phases[phase].lastProbe || '',
    score: evaluation.confidence,
    raw: evaluation,
  })

  // Merge any goals the evaluator said were demonstrated on this turn into the
  // root-level coverage tracker. Applies on the root node during the three
  // mastery phases (explanation, causality, transfer). Each phase has its own
  // coverage array so all three gate advancement on all goals.
  if (
    getActiveNode(state)?.isRoot
    && (phase === PHASES.EXPLANATION || phase === PHASES.CAUSALITY || phase === PHASES.TRANSFER)
    && Array.isArray(evaluation.goalsAddressed)
    && evaluation.goalsAddressed.length > 0
  ) {
    const indices = evaluation.goalsAddressed.map((n) => Number(n) - 1).filter((i) => i >= 0)
    const beforeByPhase = state.goalsCoveredByPhase || {}
    const before = Array.isArray(beforeByPhase[phase]) ? beforeByPhase[phase].slice() : (state.conceptGoals || []).map(() => false)
    state = markGoalsCovered(state, indices, phase)
    const afterByPhase = state.goalsCoveredByPhase || {}
    const after = afterByPhase[phase] || []
    const newlyCovered = (state.conceptGoals || [])
      .map((_, i) => (before[i] !== true && after[i] === true ? i + 1 : null))
      .filter(Boolean)
    if (newlyCovered.length) {
      logAgent('GOALS_COVERED', { phase, newly: newlyCovered, total: after.filter(Boolean).length, of: (state.conceptGoals || []).length })
      state = logEvent(state, 'goals_covered', { phase, newly: newlyCovered })
    }
  }

  // 2. Optional micro-causal check (explanation phase only).
  let micro = null
  if (phase === PHASES.EXPLANATION && evaluation.confidence >= PASS_THRESHOLDS[phase]) {
    try {
      logAgent('MICRO_CAUSAL', { phase, node: activeNode.title })
      micro = await explanation.microCausalCheck({
        node: getActiveNode(state),
        studentAnswer: studentMessage,
        lastProbe: activeNode.phases[phase].lastProbe || '',
        ...agentKwargs(state, getActiveNode(state)),
      })
      logAgent('MICRO_CAUSAL:OUT', { stillHolds: micro?.stillHolds, rationale: micro?.rationale })
    } catch (error) {
      logAgent('MICRO_CAUSAL:ERR', { error: error.message })
      micro = null
    }
  }

  // 3. Phase-specific router proposes an action.
  const proposal = mod.routePhase({
    node: getActiveNode(state),
    evaluation,
    micro,
    phaseRecord: getActiveNode(state).phases[phase],
    ...agentKwargs(state, getActiveNode(state)),
  })
  logAgent('PHASE_ROUTER', { phase, proposal: proposal.action, reason: proposal.reason || null })

  // 4. Global router applies policy caps.
  const decision = routeGlobal({ state, activeNode: getActiveNode(state), proposal })
  logAgent('GLOBAL_ROUTER', {
    phase,
    proposal: proposal.action,
    decision: decision.action,
    downgraded: decision.downgraded || null,
    targetPhase: decision.targetPhase || null,
  })

  state = logEvent(state, 'phase_decision', {
    nodeId: activeNode.id,
    phase,
    confidence: evaluation.confidence,
    proposal: proposal.action,
    decision: decision.action,
    downgraded: decision.downgraded || null,
  })

  // 5. Execute the decision.
  return applyDecision(state, decision, { studentMessage, evaluation })
}

// Helper: build a tutor message + new state based on the decision.
const applyDecision = async (inputState, decision, { studentMessage, evaluation }) => {
  let state = inputState
  const active = getActiveNode(state)
  const phase = active.currentPhase
  const mod = PHASE_MODULES[phase]

  switch (decision.action) {
    case ACTIONS.CONTINUE: {
      logAgent('PROBE', { phase, mode: 'continue', node: active.title })
      const probe = await mod.probe({ node: active, mode: 'continue', ...agentKwargs(state, active) })
      logAgent('PROBE:OUT', { phase, probe })
      state = applyProbe(state, active.id, phase, probe, PHASE_STATES.IN_PROGRESS)
      return { state, tutorMessage: probe, decision }
    }

    case ACTIONS.REMEDIATE: {
      logAgent('REMEDIATE', { phase, node: active.title })
      const text = await mod.remediate({ node: active, evaluation, ...agentKwargs(state, active) })
      logAgent('REMEDIATE:OUT', { phase, text })
      state = applyProbe(state, active.id, phase, text, PHASE_STATES.IN_PROGRESS)
      return { state, tutorMessage: text, decision }
    }

    case ACTIONS.GUIDE: {
      // Teach forward or ask a focused follow-up instead of re-lecturing.
      // Phases without a guide agent fall back to their remediation agent.
      const guideFn = typeof mod.guide === 'function' ? mod.guide : mod.remediate
      logAgent('GUIDE', { phase, node: active.title })
      const text = await guideFn({ node: active, evaluation, ...agentKwargs(state, active) })
      logAgent('GUIDE:OUT', { phase, text })
      state = applyProbe(state, active.id, phase, text, PHASE_STATES.IN_PROGRESS)
      return { state, tutorMessage: text, decision }
    }

    case ACTIONS.ADVANCE: {
      // Mark current phase as passed.
      state = setPhaseState(state, active.id, phase, PHASE_STATES.PASSED, {
        passes: active.phases[phase].passes + 1,
        passedAt: new Date().toISOString(),
      })

      if (!active.isRoot && isQuickPrerequisiteNode(active) && phase === PHASES.EXPLANATION) {
        state = setPhaseState(state, active.id, PHASES.CAUSALITY, PHASE_STATES.SKIPPED)
        state = setPhaseState(state, active.id, PHASES.TRANSFER, PHASE_STATES.SKIPPED)
        state = setPhaseState(state, active.id, PHASES.RECALL, PHASE_STATES.SKIPPED)

        const child = getActiveNode(state)
        const popped = returnToParent(state, { childNode: child, newChildStatus: NODE_STATES.MASTERED })
        const parent = getActiveNode(popped)
        const parentPhase = parent.currentPhase
        const parentMod = PHASE_MODULES[parentPhase]
        const term = child.prerequisiteTerm || child.title
        const msg = `Good — that is enough to use **${term}** back in **${parent.title}**.`
        let returned = appendMessage(popped, parent.id, {
          role: MESSAGE_ROLES.SYSTEM,
          content: msg,
          phase: parentPhase,
        })
        const parentProbe = await parentMod.probe({
          node: getActiveNode(returned),
          mode: 'resume',
          ...agentKwargs(returned, getActiveNode(returned)),
        })
        returned = applyProbe(returned, parent.id, parentPhase, parentProbe, PHASE_STATES.IN_PROGRESS)
        returned = logEvent(returned, 'quick_prerequisite_returned', {
          nodeId: child.id,
          parentId: parent.id,
          term,
        })
        return {
          state: returned,
          tutorMessage: `${msg}\n\n${parentProbe}`,
          decision: { ...decision, action: ACTIONS.RETURN, via: 'quick_prerequisite' },
        }
      }

      const nextPhase = phaseAfter(phase)

      // Root node: when transfer is satisfied, transition immediately into
      // the RECALL phase and run the plan-based recall inline (3 questions
      // per learning goal). No deferral — the homework ends when the plan
      // completes or the student opts to restart.
      if (nextPhase === PHASES.RECALL && active.isRoot) {
        const goals = Array.isArray(state.conceptGoals) ? state.conceptGoals : []
        const plan = recall.buildPlan({ goals })
        state = setRecallPlan(state, plan)
        state = withNode(state, active.id, (node) => ({
          ...node,
          currentPhase: PHASES.RECALL,
          phases: {
            ...node.phases,
            [PHASES.RECALL]: { ...node.phases[PHASES.RECALL], state: PHASE_STATES.ACTIVE },
          },
        }))
        const firstEntry = recall.currentEntry(plan)
        const firstGoal = firstEntry && firstEntry.goalIndex !== null && firstEntry.goalIndex !== undefined
          ? goals[firstEntry.goalIndex]
          : null
        logAgent('RECALL_PROBE', {
          mode: 'initial',
          goalIndex: firstEntry?.goalIndex ?? null,
          attempt: firstEntry?.attempt ?? 0,
        })
        const firstProbe = await recall.probeForGoal({
          node: getActiveNode(state),
          goal: firstGoal,
          goalIndex: firstEntry?.goalIndex ?? null,
          attempt: firstEntry?.attempt ?? 0,
          priorAsked: [],
        })
        logAgent('RECALL_PROBE:OUT', { probe: firstProbe })
        const planWithAsked = {
          ...plan,
          entries: plan.entries.map((e, i) => (i === 0 ? { ...e, asked: firstProbe } : e)),
        }
        state = setRecallPlan(state, planWithAsked)
        const total = plan.entries.length
        const intro = `Great — you've covered explanation, causality, and transfer for **${active.title}**. One last thing: a quick recall check (${total} short question${total === 1 ? '' : 's'}) to make sure the key ideas stuck. You can answer in a sentence.`
        state = appendMessage(state, active.id, { role: MESSAGE_ROLES.SYSTEM, content: intro, phase: PHASES.RECALL })
        state = applyProbe(state, active.id, PHASES.RECALL, firstProbe, PHASE_STATES.ACTIVE)
        state = logEvent(state, 'recall_plan_started', { total, goals: goals.length })
        return { state, tutorMessage: `${intro}\n\n${firstProbe}`, decision }
      }

      if (!nextPhase || nextPhase === PHASES.RECALL) {
        // Non-root child: defer recall and return to parent.
        state = setPhaseState(state, active.id, PHASES.RECALL, PHASE_STATES.DEFERRED)
        state = scheduleRecall(state, active.id)
        const nextNode = getActiveNode(state)
        // Mark the node as mastered-pending-recall (not full mastery yet).
        state = markNodeStatus(state, active.id, NODE_STATES.MASTERED)

        // If we're on a child, return to parent; else the student can wait for recall.
        if (!nextNode.isRoot) {
          const popped = returnToParent(state, { childNode: nextNode })
          const msg = `Nice — you've covered ${nextNode.title}. Returning to ${state.nodes[nextNode.parentId]?.title || 'the parent concept'}.`
          let returned = appendMessage(popped, nextNode.parentId, {
            role: MESSAGE_ROLES.SYSTEM,
            content: msg,
            phase: popped.nodes[nextNode.parentId]?.currentPhase,
          })
          // Kick off a new probe on the parent's resumed phase.
          const parent = getActiveNode(returned)
          const parentPhase = parent.currentPhase
          const parentMod = PHASE_MODULES[parentPhase]
          const parentProbe = await parentMod.probe({ node: parent, mode: 'resume', ...agentKwargs(returned, parent) })
          returned = applyProbe(returned, parent.id, parentPhase, parentProbe, PHASE_STATES.IN_PROGRESS)
          return { state: returned, tutorMessage: `${msg}\n\n${parentProbe}`, decision }
        }

        const closing = `Great — you've covered the key phases for ${active.title}. I'll check your recall of it a bit later.`
        state = appendMessage(state, active.id, { role: MESSAGE_ROLES.TUTOR, content: closing, phase })
        return { state, tutorMessage: closing, decision }
      }

      // Advance to the next phase in-place.
      state = withNode(state, active.id, (node) => ({
        ...node,
        currentPhase: nextPhase,
        phases: {
          ...node.phases,
          [nextPhase]: { ...node.phases[nextPhase], state: PHASE_STATES.ACTIVE },
        },
      }))
      const nextMod = PHASE_MODULES[nextPhase]
      logAgent('PROBE', { phase: nextPhase, mode: 'initial', node: active.title, reason: 'phase_advanced' })
      const nextProbe = await nextMod.probe({
        node: getActiveNode(state),
        mode: 'initial',
        ...agentKwargs(state, getActiveNode(state)),
      })
      logAgent('PROBE:OUT', { phase: nextPhase, probe: nextProbe })
      state = applyProbe(state, active.id, nextPhase, nextProbe, PHASE_STATES.ACTIVE)
      return { state, tutorMessage: nextProbe, decision }
    }

    case ACTIONS.REOPEN: {
      const target = decision.targetPhase
      state = setPhaseState(state, active.id, target, PHASE_STATES.REOPENED, {
        reopenCount: active.phases[target].reopenCount + 1,
      })
      state = withNode(state, active.id, (node) => ({ ...node, currentPhase: target }))
      const targetMod = PHASE_MODULES[target]
      logAgent('PROBE', { phase: target, mode: 'reopen', node: active.title })
      const targetProbe = await targetMod.probe({
        node: getActiveNode(state),
        mode: 'reopen',
        ...agentKwargs(state, getActiveNode(state)),
      })
      logAgent('PROBE:OUT', { phase: target, probe: targetProbe })
      state = applyProbe(state, active.id, target, targetProbe, PHASE_STATES.IN_PROGRESS)
      const msg = `Let's revisit ${target} on ${active.title} — your last answer suggests we should tighten that up.\n\n${targetProbe}`
      return { state, tutorMessage: msg, decision }
    }

    case ACTIONS.OPEN_SUBTOPIC: {
      let subtopic
      try {
        logAgent('SUBTOPIC_INFER', { parent: active.title, phase, hint: decision.reason || evaluation.suspectedPrerequisiteGap })
        subtopic = await inferSubtopic({
          node: active,
          phase,
          hint: decision.reason || evaluation.suspectedPrerequisiteGap || evaluation.rationale,
          studentAnswer: studentMessage,
        })
        logAgent('SUBTOPIC_INFER:OUT', { title: subtopic.title, reason: subtopic.reason, skippable: subtopic.skippable })
      } catch (error) {
        logAgent('SUBTOPIC_INFER:ERR', { error: error.message })
        // If inference fails, fall back to remediation.
        logAgent('REMEDIATE', { phase, node: active.title, reason: 'subtopic_infer_failed' })
        const text = await mod.remediate({ node: active, evaluation, ...agentKwargs(state, active) })
        state = applyProbe(state, active.id, phase, text, PHASE_STATES.IN_PROGRESS)
        return { state, tutorMessage: text, decision: { ...decision, action: ACTIONS.REMEDIATE, downgraded: 'subtopic_infer_failed' } }
      }

      // Present the offer to the student; they choose dive/skip.
      const offer = {
        parentId: active.id,
        blockedPhase: phase,
        title: subtopic.title,
        question: subtopic.question,
        reason: subtopic.reason,
        skippable: subtopic.skippable !== false,
        createdAtTurn: state.turnIndex,
        triggerStudentText: studentMessage,
        triggerProbe: active.phases?.[phase]?.lastProbe || '',
      }
      state = setOffer(state, offer)
      const tutorMessage = [
        `I think we need a quick detour: **${subtopic.title}**.`,
        `Why: ${subtopic.reason}`,
        `You can **Dive in**, **Skip for now**, or ask **Why is this needed?**`,
      ].join('\n\n')
      state = appendMessage(state, active.id, { role: MESSAGE_ROLES.SYSTEM, content: tutorMessage, phase })
      return { state, tutorMessage, decision, offer }
    }

    case ACTIONS.COMPLETE_NODE: {
      state = setPhaseState(state, active.id, PHASES.RECALL, PHASE_STATES.PASSED, {
        passedAt: new Date().toISOString(),
      })
      state = markNodeStatus(state, active.id, NODE_STATES.MASTERED)
      state = clearRecallQueue(state, active.id)

      if (active.isRoot) {
        const finalMsg = `You've mastered **${active.title}**. Nice work.`
        state = { ...state, completed: true, status: 'completed' }
        state = appendMessage(state, active.id, { role: MESSAGE_ROLES.TUTOR, content: finalMsg, phase })
        return { state, tutorMessage: finalMsg, decision }
      }

      const popped = returnToParent(state, { childNode: active })
      const parent = getActiveNode(popped)
      const parentPhase = parent.currentPhase
      const parentMod = PHASE_MODULES[parentPhase]
      const parentProbe = await parentMod.probe({ node: parent, mode: 'resume', ...agentKwargs(popped, parent) })
      let returned = applyProbe(popped, parent.id, parentPhase, parentProbe, PHASE_STATES.IN_PROGRESS)
      const msg = `You've finished **${active.title}**. Returning to **${parent.title}**.\n\n${parentProbe}`
      returned = appendMessage(returned, parent.id, { role: MESSAGE_ROLES.SYSTEM, content: msg, phase: parentPhase })
      return { state: returned, tutorMessage: msg, decision }
    }

    default:
      return { state, tutorMessage: '(no-op)', decision }
  }
}

// ─── Subtopic offer controls (from UI) ────────────────────────────
export const acceptSubtopicOffer = async (inputState) => {
  if (!inputState.offer) return { state: inputState, tutorMessage: null }
  const originalOffer = inputState.offer
  let state = pushSubtopic(inputState, {
    title: originalOffer.title,
    question: originalOffer.question,
    reason: originalOffer.reason,
    parentId: originalOffer.parentId,
    blockedPhase: originalOffer.blockedPhase,
    skippable: originalOffer.skippable,
    detourKind: originalOffer.detourKind || null,
    prerequisiteTerm: originalOffer.prerequisiteTerm || '',
  })
  state = logEvent(state, 'subtopic_opened', {
    parentId: originalOffer.parentId,
    title: originalOffer.title,
    blockedPhase: originalOffer.blockedPhase,
  })
  const childNode = getActiveNode(state)
  state = markNodeStatus(state, childNode.id, NODE_STATES.ACTIVE)

  // Seed the child chat with the ORIGINATING context so the student remembers
  // why they're here. Show the parent's last probe and their own confusion/question.
  const parent = state.nodes[originalOffer.parentId]
  const contextLines = []
  if (originalOffer.triggerProbe) {
    contextLines.push(`Back in **${parent?.title || 'the parent concept'}**, I asked:`)
    contextLines.push(`> ${originalOffer.triggerProbe.trim()}`)
  }
  if (originalOffer.triggerStudentText) {
    contextLines.push(`You said: "${originalOffer.triggerStudentText.trim()}"`)
  }
  contextLines.push(`So let's pause and build up **${childNode.title}** first — then come back.`)
  const contextMsg = contextLines.join('\n\n')
  state = appendMessage(state, childNode.id, {
    role: MESSAGE_ROLES.SYSTEM,
    content: contextMsg,
    phase: PHASES.EXPLANATION,
  })

  const mod = PHASE_MODULES[PHASES.EXPLANATION]
  const triggerText = [
    originalOffer.triggerProbe ? `Parent question: ${originalOffer.triggerProbe}` : '',
    originalOffer.triggerStudentText ? `Student said: "${originalOffer.triggerStudentText}"` : '',
  ].filter(Boolean).join('\n')
  const intro = typeof mod.introduce === 'function'
    ? await mod.introduce({
        node: childNode,
        triggerText,
        parentTitle: parent?.title || '',
      })
    : await mod.probe({ node: childNode, mode: 'initial', ...agentKwargs(state, childNode) })
  logAgent('INTRODUCE:OUT', { phase: PHASES.EXPLANATION, node: childNode.title, text: intro })
  state = applyProbe(state, childNode.id, PHASES.EXPLANATION, intro, PHASE_STATES.ACTIVE)
  return { state, tutorMessage: `${contextMsg}\n\n${intro}` }
}

export const skipSubtopicOffer = async (inputState) => {
  if (!inputState.offer) return { state: inputState, tutorMessage: null }
  const offer = inputState.offer
  let state = setOffer(inputState, null)
  state = logEvent(state, 'subtopic_skipped', { parentId: offer.parentId, title: offer.title, blockedPhase: offer.blockedPhase })

  // Treat the skip like a needs_review flag on the parent's blocked phase and
  // continue with a remediation probe in that phase.
  state = setPhaseState(state, offer.parentId, offer.blockedPhase, PHASE_STATES.NEEDS_REVIEW)
  const parent = state.nodes[offer.parentId]
  const mod = PHASE_MODULES[offer.blockedPhase]
  const probe = await mod.probe({ node: parent, mode: 'post_skip', ...agentKwargs(state, parent) })
  state = applyProbe(state, offer.parentId, offer.blockedPhase, probe, PHASE_STATES.IN_PROGRESS)
  const msg = `Skipped **${offer.title}**. Continuing with ${parent.title}.\n\n${probe}`
  return { state, tutorMessage: msg }
}

// Student pressed "Return" while working on a skippable child node.
export const returnFromActiveNode = async (inputState, { viaSkip = true } = {}) => {
  const active = getActiveNode(inputState)
  if (!active || active.isRoot) return { state: inputState, tutorMessage: null }

  let state = viaSkip
    ? returnFromSkip(inputState, { childNode: active })
    : returnToParent(inputState, { childNode: active })

  state = logEvent(state, viaSkip ? 'node_skipped_by_student' : 'node_returned_by_student', {
    nodeId: active.id,
    parentId: active.parentId,
  })

  const parent = getActiveNode(state)
  const parentPhase = parent.currentPhase
  const mod = PHASE_MODULES[parentPhase]
  const probe = await mod.probe({ node: parent, mode: 'resume', ...agentKwargs(state, parent) })
  state = applyProbe(state, parent.id, parentPhase, probe, PHASE_STATES.IN_PROGRESS)
  const msg = `Returning to **${parent.title}**.\n\n${probe}`
  return { state, tutorMessage: msg }
}

// ─── Recall phase turn ────────────────────────────────────────────
// Runs per-plan-entry: evaluate the student's answer against the current
// recall question, then either advance the plan (correct) or coach + re-ask
// (wrong). When the plan is complete, hand off to COMPLETE_NODE.
const runRecallTurn = async (inputState, { studentMessage }) => {
  let state = inputState
  const active = getActiveNode(state)
  const plan = state.recallPlan

  if (!plan || !Array.isArray(plan.entries) || plan.entries.length === 0) {
    // Defensive: plan missing. Complete the node rather than loop forever.
    return await applyDecision(state, { action: ACTIONS.COMPLETE_NODE }, { studentMessage, evaluation: null })
  }

  const entry = recall.currentEntry(plan)
  if (!entry) {
    return await applyDecision(state, { action: ACTIONS.COMPLETE_NODE }, { studentMessage, evaluation: null })
  }

  const goals = Array.isArray(state.conceptGoals) ? state.conceptGoals : []
  const goal = entry.goalIndex !== null && entry.goalIndex !== undefined ? goals[entry.goalIndex] : null

  let evaluation
  try {
    logAgent('RECALL_EVALUATE', { node: active.title, goalIndex: entry.goalIndex, attempt: entry.attempt })
    evaluation = await recall.evaluate({ node: active, studentAnswer: studentMessage, goal })
    logAgent('RECALL_EVALUATE:OUT', {
      correct: evaluation.correct,
      confidence: evaluation.confidence,
      rationale: evaluation.rationale,
    })
  } catch (error) {
    logAgent('RECALL_EVALUATE:ERR', { error: error.message })
    return composeFailureTurn(state, active.id, PHASES.RECALL, error)
  }

  state = recordEvidence(state, active.id, PHASES.RECALL, {
    confidence: evaluation.confidence,
    rationale: evaluation.rationale,
    probe: active.phases[PHASES.RECALL].lastProbe || '',
    score: evaluation.confidence,
    raw: evaluation,
  })

  if (!evaluation.correct) {
    // Coach with the correct idea and re-ask the same question.
    logAgent('RECALL_GUIDE', { node: active.title, goalIndex: entry.goalIndex })
    const text = await recall.guide({ node: active, evaluation, goal })
    logAgent('RECALL_GUIDE:OUT', { text })
    const updatedPlan = {
      ...plan,
      totalWrong: (plan.totalWrong || 0) + 1,
      entries: plan.entries.map((e, i) => (
        i === plan.currentIndex ? { ...e, status: 'wrong', answer: studentMessage } : e
      )),
    }
    state = setRecallPlan(state, updatedPlan)
    state = setRestartAvailable(state, true)
    state = applyProbe(state, active.id, PHASES.RECALL, text, PHASE_STATES.IN_PROGRESS)
    state = logEvent(state, 'recall_wrong', {
      goalIndex: entry.goalIndex,
      attempt: entry.attempt,
      totalWrong: updatedPlan.totalWrong,
    })
    return { state, tutorMessage: text, decision: { action: ACTIONS.GUIDE, via: 'recall_wrong', phase: PHASES.RECALL } }
  }

  // Correct — mark entry passed and advance the plan index.
  const priorAsked = plan.entries
    .map((e) => e?.asked)
    .filter(Boolean)
  const advanced = {
    ...plan,
    currentIndex: plan.currentIndex + 1,
    entries: plan.entries.map((e, i) => (
      i === plan.currentIndex ? { ...e, status: 'passed', answer: studentMessage } : e
    )),
  }
  state = setRecallPlan(state, advanced)
  state = logEvent(state, 'recall_correct', { goalIndex: entry.goalIndex, attempt: entry.attempt })

  if (recall.planComplete(advanced)) {
    // All recall questions answered correctly — finish the node.
    return await applyDecision(state, { action: ACTIONS.COMPLETE_NODE, phase: PHASES.RECALL }, { studentMessage, evaluation })
  }

  // Generate the next probe for the new current entry.
  const nextEntry = recall.currentEntry(advanced)
  const nextGoal = nextEntry && nextEntry.goalIndex !== null && nextEntry.goalIndex !== undefined
    ? goals[nextEntry.goalIndex]
    : null
  logAgent('RECALL_PROBE', {
    mode: 'continue',
    goalIndex: nextEntry?.goalIndex ?? null,
    attempt: nextEntry?.attempt ?? 0,
  })
  const nextProbe = await recall.probeForGoal({
    node: active,
    goal: nextGoal,
    goalIndex: nextEntry?.goalIndex ?? null,
    attempt: nextEntry?.attempt ?? 0,
    priorAsked,
  })
  logAgent('RECALL_PROBE:OUT', { probe: nextProbe })

  const planWithAsked = {
    ...advanced,
    entries: advanced.entries.map((e, i) => (
      i === advanced.currentIndex ? { ...e, asked: nextProbe } : e
    )),
  }
  state = setRecallPlan(state, planWithAsked)
  state = applyProbe(state, active.id, PHASES.RECALL, nextProbe, PHASE_STATES.ACTIVE)
  return {
    state,
    tutorMessage: nextProbe,
    decision: { action: ACTIONS.CONTINUE, via: 'recall_advance', phase: PHASES.RECALL },
  }
}

// ─── internal helpers ────────────────────────────────────────────
const applyProbe = (state, nodeId, phase, probe, newPhaseState) => {
  let next = appendMessage(state, nodeId, { role: MESSAGE_ROLES.TUTOR, content: probe, phase })
  next = withNode(next, nodeId, (node) => ({
    ...node,
    currentPhase: phase,
    phases: {
      ...node.phases,
      [phase]: {
        ...node.phases[phase],
        state: newPhaseState || node.phases[phase].state,
        lastProbe: probe,
      },
    },
  }))
  return next
}

const composeFailureTurn = (state, nodeId, phase, error) => {
  const msg = 'Sorry, I had trouble processing that. Could you try restating your answer in a sentence or two?'
  const next = appendMessage(state, nodeId, { role: MESSAGE_ROLES.TUTOR, content: msg, phase })
  return {
    state: next,
    tutorMessage: msg,
    decision: { action: ACTIONS.REMEDIATE, phase, error: error?.message || 'evaluator_error' },
  }
}

export { ROOT_NODE_ID, PHASES, PHASE_STATES, ACTIONS, NODE_STATES, PHASE_ORDER }
