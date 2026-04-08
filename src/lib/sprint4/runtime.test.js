import assert from 'node:assert/strict'
import test, { afterEach, before } from 'node:test'

import {
  __test,
  buildInitialLearningMessages,
  createInitialSessionSnapshot,
  generateStudyArtifacts,
  runGuidedTurn,
} from './runtime.js'
import {
  createEmptyDimensionScores,
  NODE_STATES,
  NODE_TYPES,
  PROMPT_KINDS,
  SPRINT4_CONDITIONS,
  SPRINT4_GRAPH_MODELS,
  SPRINT4_PHASES,
} from './constants.js'

const originalFetch = global.fetch

const createChatResponse = (content, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => (
    status >= 200 && status < 300
      ? { choices: [{ message: { content } }] }
      : { error: { message: content } }
  ),
})

const createFetchSequence = (steps) => {
  let index = 0
  const fetchStub = async () => {
    const step = steps[Math.min(index, steps.length - 1)]
    index += 1
    if (typeof step === 'function') return step()
    return step
  }
  fetchStub.calls = () => index
  return fetchStub
}

const createAssessmentPayload = (overrides = {}) => ({
  explanation: 0,
  causalReasoning: 0,
  transfer: 0,
  misconceptionResistance: 0,
  misconceptionDetected: false,
  misconceptionLabel: '',
  misconceptionReason: '',
  missingConcepts: [],
  strengths: [],
  subtopicSuggestions: [],
  recommendedAction: PROMPT_KINDS.TEACH,
  conciseRationale: 'The learner needs clarification.',
  tutorFocus: 'Clarify the missing idea in plain language.',
  confidence: 0.6,
  ...overrides,
})

const createMcqPayload = (overrides = {}) => ({
  question: 'Which explanation best matches the correct mechanism?',
  correctAnswer: 'The model steps in the direction opposite the gradient so the loss decreases locally.',
  distractors: [
    {
      text: 'The model increases the gradient to move faster toward the highest loss.',
      misconceptionLabel: 'gradient direction confusion',
    },
    {
      text: 'The model resets all weights to zero after every mistake.',
      misconceptionLabel: 'weight reset misconception',
    },
  ],
  explanation: 'The correct choice follows the negative gradient, which points toward a local decrease in loss.',
  ...overrides,
})

const createDynamicNode = ({
  id,
  title,
  summary,
  parentIds = [],
  status = NODE_STATES.ACTIVE,
  clarificationDepth = 1,
  simpleGoodTurnCount = 0,
  derivedFromTopic,
}) => ({
  id,
  title,
  summary,
  initialPrompt: `Let's focus on ${title.toLowerCase()}. What does it mean here?`,
  parentIds,
  isRoot: false,
  nodeType: NODE_TYPES.DYNAMIC,
  status,
  promptKind: PROMPT_KINDS.ASSESS,
  supportLevel: 0,
  withSupportUsed: false,
  successfulRecallCount: 0,
  recallScheduledAtTurn: null,
  bestScores: createEmptyDimensionScores(),
  misconceptionStreak: 0,
  attempts: 0,
  lastMcqAtAttempt: 0,
  checkpointMcqCompleted: false,
  pendingMcqMode: '',
  lastAssessmentSummary: '',
  simpleGoodTurnCount,
  partialStruggleCount: 0,
  clarificationDepth,
  derivedFromTopic,
  rubric: null,
  promptPack: null,
  orderIndex: 1,
  depth: 0,
})

const createLearningFixture = async (seedConcept = 'How does gradient descent minimize loss in machine learning') => {
  const studyConfig = await generateStudyArtifacts(seedConcept)
  const firstNode = studyConfig.graphNodes[0]
  const initialSession = createInitialSessionSnapshot({
    studyConfigId: 'study-1',
    studyConfig,
    condition: SPRINT4_CONDITIONS.GUIDED,
  })

  return {
    studyConfig,
    session: {
      ...initialSession,
      phase: SPRINT4_PHASES.LEARNING,
      startedAt: new Date('2026-04-07T21:50:00.000Z').toISOString(),
      messages: buildInitialLearningMessages({
        studyConfig,
        firstNode,
        condition: SPRINT4_CONDITIONS.GUIDED,
      }),
    },
  }
}

before(() => {
  process.env.OPENAI_API_KEY = 'test-key'
})

afterEach(() => {
  global.fetch = originalFetch
})

test('new study configs start with a single root node in root_dynamic mode', async () => {
  const { studyConfig, session } = await createLearningFixture()

  assert.equal(studyConfig.graphModel, SPRINT4_GRAPH_MODELS.ROOT_DYNAMIC)
  assert.equal(studyConfig.graphNodes.length, 1)
  assert.equal(studyConfig.graphNodes[0].nodeType, NODE_TYPES.ROOT)
  assert.equal(session.graphModel, SPRINT4_GRAPH_MODELS.ROOT_DYNAMIC)
  assert.equal(session.graphNodes.length, 1)
  assert.equal(session.currentNodeId, studyConfig.graphNodes[0].id)
})

test('confusion parsing normalizes explicit missing concepts', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const rootNode = studyConfig.graphNodes[0]

  const unknownInfo = __test.inferConfusionInfo({
    userMessage: "I don't know what a model prediction is",
    assessment: createAssessmentPayload(),
    node: rootNode,
    session,
  })
  const understandInfo = __test.inferConfusionInfo({
    userMessage: "I don't understand model prediction",
    assessment: createAssessmentPayload(),
    node: rootNode,
    session,
  })

  assert.equal(unknownInfo.topic, 'model prediction')
  assert.equal(unknownInfo.source, 'explicit')
  assert.equal(understandInfo.topic, 'model prediction')
  assert.equal(understandInfo.source, 'explicit')
})

test("bare 'I don't know' opens a dynamic child using inferred context", async () => {
  const { session, studyConfig } = await createLearningFixture()
  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      missingConcepts: ['model prediction'],
      subtopicSuggestions: [{ title: 'model prediction', reason: 'Missing foundation.' }],
      conciseRationale: 'The learner explicitly said they do not know model prediction.',
      tutorFocus: 'Clarify model prediction.',
    }))),
    createChatResponse(JSON.stringify({
      reason: 'Clarify the missing prerequisite concept.',
      newNodes: [{
        id: 'model-prediction',
        title: 'Model prediction',
        summary: 'Explain what a model prediction is before returning to loss.',
        initialPrompt: 'What is a model prediction in simple terms?',
        parentIds: [],
      }],
      retargetNodeId: '',
    })),
    createChatResponse("Let's focus on model prediction. What do you think it means?"),
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session,
    studyConfig,
    userMessage: "I don't know",
    helpRequested: false,
  })

  assert.equal(result.session.graphNodes.length, 2)
  assert.equal(fetchStub.calls(), 3)

  const rootNode = result.session.graphNodes.find((node) => node.nodeType === NODE_TYPES.ROOT)
  const childNode = result.session.graphNodes.find((node) => node.nodeType === NODE_TYPES.DYNAMIC)

  assert.equal(rootNode.status, NODE_STATES.LOCKED)
  assert.deepEqual(rootNode.parentIds, [childNode.id])
  assert.equal(childNode.derivedFromTopic, 'model prediction')
  assert.equal(childNode.clarificationDepth, 1)
  assert.equal(result.session.currentNodeId, childNode.id)
})

test("explicit confusion about parameters creates a dynamic child branch", async () => {
  const { session, studyConfig } = await createLearningFixture()
  const rootNode = studyConfig.graphNodes[0]
  const workingSession = {
    ...session,
    messages: [
      ...session.messages,
      {
        id: 'user-gradient',
        role: 'user',
        content: 'What is a gradient',
        nodeId: rootNode.id,
      },
      {
        id: 'assistant-gradient',
        role: 'assistant',
        content: "Great, let's start by understanding what a gradient is. Gradient descent uses this information to update the model's parameters. What part of this explanation would you like to explore more?",
        nodeId: rootNode.id,
      },
    ],
  }
  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      missingConcepts: ['parameters'],
      subtopicSuggestions: [{ title: 'parameters', reason: 'The learner explicitly said they do not understand parameters.' }],
      conciseRationale: 'The learner explicitly said they do not understand parameters.',
      tutorFocus: 'Clarify what parameters are before returning to gradient descent.',
    }))),
    createChatResponse(JSON.stringify({
      reason: 'Clarify the missing concept parameters.',
      newNodes: [{
        id: 'parameters',
        title: 'Parameters',
        summary: 'Explain what parameters are in a machine learning model.',
        initialPrompt: 'In simple terms, what are parameters in a machine learning model?',
        parentIds: [],
      }],
      retargetNodeId: '',
    })),
    createChatResponse("Let's focus on parameters. In simple terms, what are they in a machine learning model?"),
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session: workingSession,
    studyConfig,
    userMessage: 'i dont understand what parameters are',
    helpRequested: false,
  })

  const childNode = result.session.graphNodes.find((node) => node.nodeType === NODE_TYPES.DYNAMIC)

  assert.equal(fetchStub.calls(), 3)
  assert.equal(childNode.derivedFromTopic, 'parameters')
  assert.equal(result.session.currentNodeId, childNode.id)
})

test('dynamic nodes do not complete after two shallow directionally correct turns', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const rootNode = {
    ...studyConfig.graphNodes[0],
    status: NODE_STATES.LOCKED,
    parentIds: ['model-prediction'],
  }
  const dynamicNode = createDynamicNode({
    id: 'model-prediction',
    title: 'Model prediction',
    summary: 'Explain what a model prediction is.',
    derivedFromTopic: 'model prediction',
  })
  const workingSession = {
    ...session,
    graphNodes: [rootNode, dynamicNode],
    currentNodeId: dynamicNode.id,
  }

  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      explanation: 1,
      causalReasoning: 1,
      conciseRationale: 'The learner gave a directionally correct answer.',
      tutorFocus: 'Ask for one more concise explanation.',
    }))),
    createChatResponse('Good start. Try one more explanation in your own words.'),
    createChatResponse(JSON.stringify(createAssessmentPayload({
      explanation: 1,
      causalReasoning: 1,
      conciseRationale: 'The learner was directionally correct again.',
      tutorFocus: 'Acknowledge and return to the parent concept.',
    }))),
    createChatResponse("Nice. Now let's return to the main idea."),
  ])
  global.fetch = fetchStub

  const afterFirstTurn = await runGuidedTurn({
    session: workingSession,
    studyConfig,
    userMessage: 'It is the answer the model guesses.',
    helpRequested: false,
  })
  const afterSecondTurn = await runGuidedTurn({
    session: afterFirstTurn.session,
    studyConfig,
    userMessage: 'It is what the model predicts as the output.',
    helpRequested: false,
  })

  const childNode = afterSecondTurn.session.graphNodes.find((node) => node.id === dynamicNode.id)
  const unlockedRoot = afterSecondTurn.session.graphNodes.find((node) => node.id === rootNode.id)

  assert.equal(afterFirstTurn.session.currentNodeId, dynamicNode.id)
  assert.equal(afterFirstTurn.session.graphNodes.find((node) => node.id === dynamicNode.id).simpleGoodTurnCount, 1)
  assert.equal(childNode.status, NODE_STATES.PARTIAL)
  assert.equal(childNode.simpleGoodTurnCount, 2)
  assert.equal(unlockedRoot.status, NODE_STATES.LOCKED)
  assert.equal(afterSecondTurn.session.currentNodeId, dynamicNode.id)
})

test('dynamic nodes master only after a stronger second explanation', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const rootNode = {
    ...studyConfig.graphNodes[0],
    status: NODE_STATES.LOCKED,
    parentIds: ['model-prediction'],
  }
  const dynamicNode = createDynamicNode({
    id: 'model-prediction',
    title: 'Model prediction',
    summary: 'Explain what a model prediction is.',
    derivedFromTopic: 'model prediction',
  })
  const workingSession = {
    ...session,
    graphNodes: [rootNode, dynamicNode],
    currentNodeId: dynamicNode.id,
  }

  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      explanation: 1,
      causalReasoning: 1,
      conciseRationale: 'The learner gave a basic mechanism-level answer.',
      tutorFocus: 'Ask for a fuller explanation of how the prediction is produced.',
    }))),
    createChatResponse('Good start. Now explain how the model produces that prediction.'),
    createChatResponse(JSON.stringify(createAssessmentPayload({
      explanation: 2,
      causalReasoning: 1,
      conciseRationale: 'The learner explained the mechanism more clearly.',
      tutorFocus: 'Acknowledge and reconnect to the parent concept.',
    }))),
    createChatResponse("Nice. Now let's return to the main idea."),
  ])
  global.fetch = fetchStub

  const afterFirstTurn = await runGuidedTurn({
    session: workingSession,
    studyConfig,
    userMessage: 'It is the output the model produces from the input.',
    helpRequested: false,
  })
  const afterSecondTurn = await runGuidedTurn({
    session: afterFirstTurn.session,
    studyConfig,
    userMessage: 'The model combines the learned weights with the input to produce the prediction.',
    helpRequested: false,
  })

  const childNode = afterSecondTurn.session.graphNodes.find((node) => node.id === dynamicNode.id)
  const unlockedRoot = afterSecondTurn.session.graphNodes.find((node) => node.id === rootNode.id)

  assert.equal(childNode.status, NODE_STATES.MASTERED_INDEPENDENTLY)
  assert.equal(childNode.simpleGoodTurnCount, 2)
  assert.equal(unlockedRoot.status, NODE_STATES.ACTIVE)
  assert.equal(afterSecondTurn.session.currentNodeId, rootNode.id)
})

test('keyword-only answers do not increment clarification progress', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const rootNode = {
    ...studyConfig.graphNodes[0],
    status: NODE_STATES.LOCKED,
    parentIds: ['loss-function'],
  }
  const dynamicNode = createDynamicNode({
    id: 'loss-function',
    title: 'Loss function',
    summary: 'Explain what the loss function represents.',
    derivedFromTopic: 'loss function',
  })
  const workingSession = {
    ...session,
    graphNodes: [rootNode, dynamicNode],
    currentNodeId: dynamicNode.id,
  }

  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      explanation: 0,
      causalReasoning: 0,
      conciseRationale: 'The learner only repeated the term without explaining it.',
      tutorFocus: 'Define what the loss function measures and ask for a plain-language explanation.',
    }))),
    createChatResponse("Let's clarify what the loss function measures before moving on."),
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session: workingSession,
    studyConfig,
    userMessage: 'loss function',
    helpRequested: false,
  })

  const childNode = result.session.graphNodes.find((node) => node.id === dynamicNode.id)
  assert.equal(childNode.simpleGoodTurnCount, 0)
  assert.equal(childNode.promptKind, PROMPT_KINDS.TEACH)
})

test('root nodes emit a checkpoint MCQ after partial core understanding', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      explanation: 1,
      causalReasoning: 1,
      conciseRationale: 'The learner has partial causal understanding of gradient descent.',
      tutorFocus: 'Check whether they can distinguish the correct mechanism from nearby misconceptions.',
    }))),
    createChatResponse(JSON.stringify(createMcqPayload())),
    createChatResponse('Choose the option that best explains how gradient descent reduces loss.'),
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session,
    studyConfig,
    userMessage: 'It updates the weights in a direction that lowers the loss.',
    helpRequested: false,
  })

  const rootNode = result.session.graphNodes.find((node) => node.nodeType === NODE_TYPES.ROOT)
  assert.equal(rootNode.promptKind, PROMPT_KINDS.MCQ)
  assert.equal(rootNode.pendingMcqMode, 'checkpoint')
  assert.equal(rootNode.checkpointMcqCompleted, false)
  assert.ok(result.tutorMessage.metadata.mcq)
})

test('dynamic nodes can emit a checkpoint MCQ after repeated partial struggle', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const rootNode = {
    ...studyConfig.graphNodes[0],
    status: NODE_STATES.LOCKED,
    parentIds: ['negative-gradient'],
  }
  const dynamicNode = createDynamicNode({
    id: 'negative-gradient',
    title: 'Negative gradient',
    summary: 'Explain why moving opposite the gradient lowers the loss.',
    derivedFromTopic: 'negative gradient',
  })
  const workingSession = {
    ...session,
    graphNodes: [rootNode, dynamicNode],
    currentNodeId: dynamicNode.id,
  }

  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      explanation: 1,
      causalReasoning: 0,
      conciseRationale: 'The learner named the right idea but did not explain why it works.',
      tutorFocus: 'Ask what moving opposite the gradient accomplishes.',
    }))),
    createChatResponse('You are close. Explain why moving opposite the gradient helps.'),
    createChatResponse(JSON.stringify(createAssessmentPayload({
      explanation: 1,
      causalReasoning: 0,
      conciseRationale: 'The learner is still partial after another attempt.',
      tutorFocus: 'Use a quick checkpoint to surface the exact confusion.',
    }))),
    createChatResponse(JSON.stringify(createMcqPayload({
      question: 'Which option best explains why stepping opposite the gradient lowers loss?'
    }))),
    createChatResponse('Pick the explanation that best matches what the negative gradient tells us.'),
  ])
  global.fetch = fetchStub

  const afterFirstTurn = await runGuidedTurn({
    session: workingSession,
    studyConfig,
    userMessage: 'It means we move opposite the slope.',
    helpRequested: false,
  })
  const afterSecondTurn = await runGuidedTurn({
    session: afterFirstTurn.session,
    studyConfig,
    userMessage: 'We go away from the gradient.',
    helpRequested: false,
  })

  const childNode = afterSecondTurn.session.graphNodes.find((node) => node.id === dynamicNode.id)
  assert.equal(childNode.partialStruggleCount, 2)
  assert.equal(childNode.promptKind, PROMPT_KINDS.MCQ)
  assert.equal(childNode.pendingMcqMode, 'checkpoint')
  assert.ok(afterSecondTurn.tutorMessage.metadata.mcq)
})

test('a correct checkpoint MCQ does not grant recall credit', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const rootNode = {
    ...studyConfig.graphNodes[0],
    promptKind: PROMPT_KINDS.MCQ,
    pendingMcqMode: 'checkpoint',
    checkpointMcqCompleted: false,
    status: NODE_STATES.PARTIAL,
    successfulRecallCount: 0,
    attempts: 2,
    lastMcqAtAttempt: 2,
  }
  const workingSession = {
    ...session,
    graphNodes: [rootNode],
    currentNodeId: rootNode.id,
  }

  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      explanation: 0,
      causalReasoning: 0,
      conciseRationale: 'The learner selected the correct option but has not explained it yet.',
      tutorFocus: 'Ask them to explain why the correct option is right.',
    }))),
    createChatResponse('Correct choice. Now explain why that option is right in your own words.'),
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session: workingSession,
    studyConfig,
    userMessage: 'I selected: "The model steps in the direction opposite the gradient so the loss decreases locally." (correct)',
    helpRequested: false,
  })

  const updatedRoot = result.session.graphNodes.find((node) => node.id === rootNode.id)
  assert.equal(updatedRoot.successfulRecallCount, 0)
  assert.equal(updatedRoot.checkpointMcqCompleted, true)
  assert.equal(updatedRoot.promptKind, PROMPT_KINDS.REASSESS)
})

test('after an MCQ the flow returns to open-ended follow-up instead of mastering immediately', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const rootNode = {
    ...studyConfig.graphNodes[0],
    promptKind: PROMPT_KINDS.MCQ,
    pendingMcqMode: 'checkpoint',
    checkpointMcqCompleted: false,
    status: NODE_STATES.PARTIAL,
    successfulRecallCount: 0,
    attempts: 2,
    lastMcqAtAttempt: 2,
  }
  const workingSession = {
    ...session,
    graphNodes: [rootNode],
    currentNodeId: rootNode.id,
  }

  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      explanation: 0,
      causalReasoning: 0,
      conciseRationale: 'The learner chose the correct option but still owes an explanation.',
      tutorFocus: 'Prompt for a why/how explanation rather than closing the node.',
    }))),
    createChatResponse('That option is right. Why does following the negative gradient lower the loss?'),
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session: workingSession,
    studyConfig,
    userMessage: 'I selected: "The model steps in the direction opposite the gradient so the loss decreases locally." (correct)',
    helpRequested: false,
  })

  const updatedRoot = result.session.graphNodes.find((node) => node.id === rootNode.id)
  assert.equal(updatedRoot.status, NODE_STATES.PARTIAL)
  assert.equal(updatedRoot.promptKind, PROMPT_KINDS.REASSESS)
  assert.equal(result.tutorMessage.metadata.mcq, undefined)
})

test('explicit confusion on a dynamic node creates a deeper child branch', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const rootNode = {
    ...studyConfig.graphNodes[0],
    status: NODE_STATES.LOCKED,
    parentIds: ['model-prediction'],
  }
  const dynamicNode = createDynamicNode({
    id: 'model-prediction',
    title: 'Model prediction',
    summary: 'Explain what a model prediction is.',
    derivedFromTopic: 'model prediction',
  })
  const workingSession = {
    ...session,
    graphNodes: [rootNode, dynamicNode],
    currentNodeId: dynamicNode.id,
  }

  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      missingConcepts: ['weights'],
      conciseRationale: 'The learner is explicitly confused about weights.',
      tutorFocus: 'Clarify weights first.',
    }))),
    createChatResponse(JSON.stringify({
      reason: 'Clarify the deeper missing concept.',
      newNodes: [{
        id: 'weights',
        title: 'Weights',
        summary: 'Explain what weights are in a model.',
        initialPrompt: 'What do you think model weights are?',
        parentIds: [],
      }],
      retargetNodeId: '',
    })),
    createChatResponse("Let's focus on weights. What do you think they do?"),
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session: workingSession,
    studyConfig,
    userMessage: "I don't understand weights",
    helpRequested: false,
  })

  assert.equal(result.session.graphNodes.length, 3)
  const childNode = result.session.graphNodes.find((node) => node.id === dynamicNode.id)
  const deeperNode = result.session.graphNodes.find((node) => node.id === 'weights')

  assert.equal(childNode.status, NODE_STATES.LOCKED)
  assert.deepEqual(childNode.parentIds, ['weights'])
  assert.equal(deeperNode.nodeType, NODE_TYPES.DYNAMIC)
  assert.equal(deeperNode.clarificationDepth, 2)
  assert.equal(result.session.currentNodeId, 'weights')
})

test('clarification branching stops at depth 3 and falls back to teaching on the current node', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const rootNode = {
    ...studyConfig.graphNodes[0],
    status: NODE_STATES.LOCKED,
    parentIds: ['deep-node'],
  }
  const deepNode = createDynamicNode({
    id: 'deep-node',
    title: 'Deep node',
    summary: 'A depth-capped clarification node.',
    clarificationDepth: 3,
    derivedFromTopic: 'deep node',
  })
  const workingSession = {
    ...session,
    graphNodes: [rootNode, deepNode],
    currentNodeId: deepNode.id,
  }

  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      missingConcepts: ['weights'],
      conciseRationale: 'The learner is explicitly confused again.',
      tutorFocus: 'Teach directly instead of branching again.',
    }))),
    createChatResponse("Let's stay here and clarify this step directly."),
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session: workingSession,
    studyConfig,
    userMessage: "I don't understand weights",
    helpRequested: false,
  })

  assert.equal(fetchStub.calls(), 2)
  assert.equal(result.session.graphNodes.length, 2)
  assert.equal(result.session.currentNodeId, deepNode.id)
})

test('repeated confusion on an ancestor topic does not create a duplicate child node', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const masteredChild = createDynamicNode({
    id: 'model-prediction',
    title: 'Model prediction',
    summary: 'Explain what a model prediction is.',
    status: NODE_STATES.MASTERED_INDEPENDENTLY,
    simpleGoodTurnCount: 2,
    derivedFromTopic: 'model prediction',
  })
  const rootNode = {
    ...studyConfig.graphNodes[0],
    status: NODE_STATES.ACTIVE,
    parentIds: [masteredChild.id],
  }
  const workingSession = {
    ...session,
    graphNodes: [rootNode, masteredChild],
    currentNodeId: rootNode.id,
  }

  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      missingConcepts: ['model prediction'],
      conciseRationale: 'The learner is confused about a previously clarified topic.',
      tutorFocus: 'Teach directly without creating a duplicate branch.',
    }))),
    createChatResponse("Let's review model prediction directly before moving on."),
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session: workingSession,
    studyConfig,
    userMessage: "I don't know what a model prediction is",
    helpRequested: false,
  })

  assert.equal(fetchStub.calls(), 2)
  assert.equal(result.session.graphNodes.length, 2)
  assert.equal(result.session.currentNodeId, rootNode.id)
})

test('help-requested empty turn inherits recent explicit confusion and branches', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const rootNode = studyConfig.graphNodes[0]
  const workingSession = {
    ...session,
    turnIndex: 2,
    messages: [
      ...session.messages,
      {
        id: 'user-gradient',
        role: 'user',
        content: 'What is a gradient',
        nodeId: rootNode.id,
      },
      {
        id: 'assistant-gradient',
        role: 'assistant',
        content: "Great, let's start by understanding what a gradient is. Gradient descent uses this information to update the model's parameters. What part of this explanation would you like to explore more? For example, would you like to see how the parameters are updated mathematically?",
        nodeId: rootNode.id,
      },
      {
        id: 'user-parameters',
        role: 'user',
        content: 'i dont understand what parameters are',
        nodeId: rootNode.id,
      },
      {
        id: 'assistant-reset',
        role: 'assistant',
        content: "Let's explore: How does gradient descent minimize loss in machine learning. In your own words, explain what you understand about this topic so far.",
        nodeId: rootNode.id,
      },
    ],
    evidenceRecords: [
      {
        id: 'ev-1',
        nodeId: rootNode.id,
        turnIndex: 1,
        promptKind: PROMPT_KINDS.TEACH,
        scores: createEmptyDimensionScores(),
        misconceptionDetected: false,
        misconceptionLabel: '',
        misconceptionReason: '',
        missingConcepts: [],
        strengths: [],
        rationale: 'Prior teaching turn.',
        supportUsed: true,
        createdAt: new Date().toISOString(),
      },
    ],
  }
  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify({
      reason: 'Clarify parameters after the learner asked for help.',
      newNodes: [{
        id: 'parameters',
        title: 'Parameters',
        summary: 'Explain what parameters are in a machine learning model.',
        initialPrompt: 'In simple terms, what are parameters in a machine learning model?',
        parentIds: [],
      }],
      retargetNodeId: '',
    })),
    createChatResponse("Let's focus on parameters. In simple terms, what are they in a machine learning model?"),
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session: workingSession,
    studyConfig,
    userMessage: '',
    helpRequested: true,
  })

  const childNode = result.session.graphNodes.find((node) => node.nodeType === NODE_TYPES.DYNAMIC)

  assert.equal(fetchStub.calls(), 2)
  assert.equal(childNode.derivedFromTopic, 'parameters')
  assert.equal(result.session.currentNodeId, childNode.id)
  assert.equal(result.session.graphNodes.length, 2)
})

test('learning completion requires root mastery and no unresolved dynamic children', () => {
  const rootNode = {
    id: 'root',
    nodeType: NODE_TYPES.ROOT,
    status: NODE_STATES.MASTERED_INDEPENDENTLY,
  }
  const doneChild = {
    id: 'child',
    nodeType: NODE_TYPES.DYNAMIC,
    status: NODE_STATES.MASTERED_INDEPENDENTLY,
  }
  const blockedChild = {
    id: 'blocked-child',
    nodeType: NODE_TYPES.DYNAMIC,
    status: NODE_STATES.ACTIVE,
  }

  assert.equal(__test.getLearningCompleted({
    session: { graphModel: SPRINT4_GRAPH_MODELS.ROOT_DYNAMIC },
    graphNodes: [rootNode, doneChild],
  }), true)
  assert.equal(__test.getLearningCompleted({
    session: { graphModel: SPRINT4_GRAPH_MODELS.ROOT_DYNAMIC },
    graphNodes: [rootNode, blockedChild],
  }), false)
})

test('assessment retry exhaustion falls back and still opens a clarification branch', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const rootNode = studyConfig.graphNodes[0]
  const workingSession = {
    ...session,
    messages: [
      ...session.messages,
      {
        id: 'assistant-context',
        role: 'assistant',
        content: 'To make sure we are aligned, do you know what a model prediction is?',
        nodeId: rootNode.id,
        visibleToStudent: true,
        metadata: {},
        createdAt: new Date().toISOString(),
      },
    ],
  }
  const fetchStub = createFetchSequence([
    () => { throw new TypeError('fetch failed') },
    () => { throw new TypeError('fetch failed') },
    () => { throw new TypeError('fetch failed') },
    createChatResponse(JSON.stringify({
      reason: 'Clarify the inferred confusion topic.',
      newNodes: [{
        id: 'model-prediction',
        title: 'Model prediction',
        summary: 'Explain what a model prediction is.',
        initialPrompt: 'What is a model prediction?',
        parentIds: [],
      }],
      retargetNodeId: '',
    })),
    createChatResponse("Let's focus on model prediction. What do you think it means?"),
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session: workingSession,
    studyConfig,
    userMessage: "I don't know",
    helpRequested: false,
  })

  const childNode = result.session.graphNodes.find((node) => node.nodeType === NODE_TYPES.DYNAMIC)
  assert.equal(fetchStub.calls(), 5)
  assert.equal(childNode.derivedFromTopic, 'model prediction')
  assert.equal(result.session.currentNodeId, childNode.id)
})

test('planner retry exhaustion falls back to a deterministic clarification node', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      missingConcepts: ['model prediction'],
      conciseRationale: 'The learner explicitly said they do not know model prediction.',
      tutorFocus: 'Clarify model prediction.',
    }))),
    () => { throw new TypeError('fetch failed') },
    () => { throw new TypeError('fetch failed') },
    () => { throw new TypeError('fetch failed') },
    createChatResponse("Let's focus on model prediction. What do you think it means?"),
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session,
    studyConfig,
    userMessage: "I don't know what a model prediction is",
    helpRequested: false,
  })

  const childNode = result.session.graphNodes.find((node) => node.nodeType === NODE_TYPES.DYNAMIC)
  assert.equal(fetchStub.calls(), 5)
  assert.equal(childNode.derivedFromTopic, 'model prediction')
  assert.equal(childNode.title, 'Model prediction')
})

test('tutor retry exhaustion falls back to a deterministic tutor message', async () => {
  const { session, studyConfig } = await createLearningFixture()
  const fetchStub = createFetchSequence([
    createChatResponse(JSON.stringify(createAssessmentPayload({
      explanation: 0,
      causalReasoning: 0,
      conciseRationale: 'The learner needs a clearer explanation.',
      tutorFocus: 'Clarify the concept briefly and ask a narrow follow-up.',
    }))),
    () => { throw new TypeError('fetch failed') },
    () => { throw new TypeError('fetch failed') },
    () => { throw new TypeError('fetch failed') },
  ])
  global.fetch = fetchStub

  const result = await runGuidedTurn({
    session,
    studyConfig,
    userMessage: 'Not sure.',
    helpRequested: false,
  })

  assert.equal(fetchStub.calls(), 4)
  assert.match(result.tutorMessage.content, /Let's focus on/i)
  assert.equal(result.session.turnIndex, 1)
})
