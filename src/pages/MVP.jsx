import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Loader,
  Mail,
  RefreshCw,
  Send,
  SkipForward,
  User,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Logo from '../components/Logo'
import Button from '../components/Button'
import Input from '../components/Input'
import { askMVPDiagnosticTutor, askMVPTutor } from '../lib/openaiService'
import {
  AIRPLANE_INTRO_MESSAGE,
  ASSESSMENT_QUESTIONS,
  CLEARER_SYSTEM_OPTIONS,
  CONFIDENCE_LABELS,
  CONFIDENCE_OPTIONS,
  MVP_PHASES,
  PREFERRED_SYSTEM_OPTIONS,
  RATING_LABELS,
  RATING_OPTIONS,
  SURVEY_FIELDS,
  WATER_CURRICULUM,
  createInitialNodeState,
} from '../lib/mvpContent'
import {
  clearStoredMvpCache,
  clearStoredMvpToken,
  getStoredMvpToken,
  getStoredMvpCache,
  loadMvpSession,
  saveMvpProgress,
  startMvpSession,
  storeMvpCache,
  storeMvpToken,
  submitMvpAssessment,
  submitMvpSurvey,
} from '../lib/mvpService'

const createMessage = (role, content, extras = {}) => ({
  id: `mvp_msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  role,
  content,
  createdAt: new Date().toISOString(),
  ...extras,
})

const createGuidedIntroMessage = (nodeConfig) => createMessage(
  'assistant',
  `Let’s work through **${nodeConfig.title}**.\n\nWe’ll build this idea step by step. Start with your best current thinking, and I’ll guide you from there.\n\n${nodeConfig.openingPrompt || nodeConfig.question}`
)

const emptySessionData = {
  id: '',
  participantName: '',
  participantEmail: '',
  status: 'active',
  diagnosticAcknowledgedAt: null,
  waterStartedAt: null,
  waterCompletedAt: null,
  airplaneStartedAt: null,
  airplaneCompletedAt: null,
  assessmentCompletedAt: null,
  surveyCompletedAt: null,
  waterTimeMs: null,
  airplaneTimeBudgetMs: null,
  totalQuizScore: 0,
  guidedQuizScore: 0,
  freeformQuizScore: 0,
  guidedConfidenceBefore: null,
  guidedConfidenceAfter: null,
  freeformConfidenceBefore: null,
  freeformConfidenceAfter: null,
  createdAt: null,
  updatedAt: null,
}

const createDefaultSurveyState = (session = {}) => ({
  guidedConfidenceBefore: session.guidedConfidenceBefore ?? '',
  guidedConfidenceAfter: session.guidedConfidenceAfter ?? '',
  freeformConfidenceBefore: session.freeformConfidenceBefore ?? '',
  freeformConfidenceAfter: session.freeformConfidenceAfter ?? '',
  clarityRating: '',
  engagementRating: '',
  effectivenessRating: '',
  guidedUsefulness: '',
  freeformUsefulness: '',
  clearerSystem: '',
  preferredSystem: '',
  positiveAspectGuided: '',
  positiveAspectFreeform: '',
})

const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const isFinishedNode = (status) => status === 'mastered' || status === 'skipped'
const NODE_UNLOCK_THRESHOLD = 70
const ROOT_COMPLETION_THRESHOLD = 70
const ROOT_NODE_KEY = 'water-system-flow'
const hasReachedUnlockThreshold = (node) =>
  !!node && (node.status === 'skipped' || (node.masteryScore || 0) >= NODE_UNLOCK_THRESHOLD)

const getNodeColor = (masteryScore, status) => {
  if (status === 'locked') return '#374151'
  if (status === 'skipped') return '#f59e0b'
  if (status === 'mastered' || masteryScore >= 100) return '#10b981'
  if (masteryScore >= 70) return '#34d399'
  if (masteryScore >= 40) return '#6b7280'
  return '#4b5563'
}

const getCurriculumNode = (nodeKey) =>
  WATER_CURRICULUM.find((entry) => entry.key === nodeKey)

const getNodeTitleLines = (title) => {
  if (!title) return []

  const words = title.split(' ')
  const lines = []
  let currentLine = ''

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (candidate.length <= 16) {
      currentLine = candidate
      return
    }

    if (currentLine) {
      lines.push(currentLine)
    }
    currentLine = word
  })

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines.slice(0, 2)
}

const getDependencyStatus = (nodeState, nodeStates) => {
  const config = getCurriculumNode(nodeState.key)
  if (!config) return nodeState.status
  if (isFinishedNode(nodeState.status)) return nodeState.status
  if (!config.parentIds?.length) return 'active'

  const unlocked = config.parentIds.every((parentId) => {
    const parentNode = nodeStates.find((entry) => entry.key === parentId)
    return hasReachedUnlockThreshold(parentNode)
  })

  return unlocked ? 'active' : 'locked'
}

const hasRootReachedCompletionThreshold = (nodeStates) => {
  const rootNode = nodeStates.find((node) => node.key === ROOT_NODE_KEY)
  return !!rootNode && (rootNode.status === 'skipped' || (rootNode.masteryScore || 0) >= ROOT_COMPLETION_THRESHOLD)
}

const applyDependencyStatuses = (nodeStates) =>
  nodeStates.map((node) => ({
    ...node,
    status: getDependencyStatus(node, nodeStates),
  }))

const hydrateNodes = (nodeProgress) => {
  const progressByKey = new Map((nodeProgress || []).map((node) => [node.nodeKey, node]))
  const hydrated = createInitialNodeState().map((node) => {
    const saved = progressByKey.get(node.key)
    if (!saved) return node

    return {
      ...node,
      status: saved.status || node.status,
      masteryScore: saved.masteryScore || 0,
      attemptCount: saved.attemptCount || 0,
      interactionCount: saved.interactionCount || 0,
      startedAt: saved.startedAt || null,
      completedAt: saved.completedAt || null,
      durationMs: saved.durationMs || null,
      lastAnswer: saved.lastAnswer || '',
      draftAnswer: '',
      hintUnlocked: (saved.attemptCount || 0) > 0,
      messages: Array.isArray(saved.messages) ? saved.messages : [],
    }
  })
  return applyDependencyStatuses(hydrated)
}

const buildExportPayload = (sessionData, nodes, chatMessages, assessmentAnswers, survey, phase) => ({
  exportedAt: new Date().toISOString(),
  phase,
  session: sessionData,
  nodes,
  chatMessages,
  assessmentAnswers,
  survey,
})

const buildMvpLocalCache = ({
  phase,
  sessionData,
  formData,
  nodes,
  activeNodeKey,
  chatMessages,
  chatInput,
  timeRemainingMs,
  assessmentAnswers,
  survey,
}) => ({
  version: 1,
  savedAt: new Date().toISOString(),
  phase,
  session: sessionData,
  formData,
  nodeProgress: nodes.map((node) => ({
    nodeKey: node.key,
    status: node.status,
    masteryScore: node.masteryScore,
    attemptCount: node.attemptCount,
    interactionCount: node.interactionCount,
    startedAt: node.startedAt,
    completedAt: node.completedAt,
    durationMs: node.durationMs,
    lastAnswer: node.lastAnswer,
    messages: node.messages,
  })),
  activeNodeKey,
  chatMessages,
  chatInput,
  timeRemainingMs,
  assessmentAnswers: Object.values(assessmentAnswers || {}),
  surveyResponse: survey,
})

const MVP = () => {
  const [booting, setBooting] = useState(true)
  const [phase, setPhase] = useState(MVP_PHASES.ENTRY)
  const [sessionData, setSessionData] = useState(emptySessionData)
  const [sessionToken, setSessionToken] = useState('')
  const [formData, setFormData] = useState({ name: '', email: '' })
  const [formError, setFormError] = useState('')
  const [pageError, setPageError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [nodes, setNodes] = useState(createInitialNodeState())
  const [activeNodeKey, setActiveNodeKey] = useState(WATER_CURRICULUM[0].key)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [guidedLoading, setGuidedLoading] = useState(false)
  const [timeRemainingMs, setTimeRemainingMs] = useState(null)
  const [assessmentAnswers, setAssessmentAnswers] = useState({})
  const [revealedHints, setRevealedHints] = useState({})
  const [survey, setSurvey] = useState({
    ...createDefaultSurveyState(),
  })

  const chatScrollRef = useRef(null)
  const guidedScrollRef = useRef(null)
  const airplaneFinishedRef = useRef(false)
  const briefingLoggedRef = useRef(false)
  const countedNodeRef = useRef('')

  const activeNodeConfig = useMemo(() => getCurriculumNode(activeNodeKey) || WATER_CURRICULUM[0], [activeNodeKey])
  const activeNodeState = useMemo(
    () => nodes.find((node) => node.key === activeNodeKey) || nodes[0],
    [nodes, activeNodeKey]
  )

  const quizScore = useMemo(
    () => Object.values(assessmentAnswers).filter((answer) => answer?.isCorrect).length,
    [assessmentAnswers]
  )
  const totalAssessmentQuestions = ASSESSMENT_QUESTIONS.length

  const hydrateSnapshot = useCallback((snapshot, token) => {
    const nextSession = {
      ...emptySessionData,
      ...snapshot.session,
    }

    const nextNodes = hydrateNodes(snapshot.nodeProgress)
    const unfinishedNode = nextNodes.find((node) => !isFinishedNode(node.status) && node.status !== 'locked')
    const currentNode = unfinishedNode || nextNodes[nextNodes.length - 1]
    const assessmentMap = (snapshot.assessmentAnswers || []).reduce((acc, answer) => {
      acc[answer.questionKey] = answer
      return acc
    }, {})

    setSessionToken(token)
    setSessionData(nextSession)
    setFormData({
      name: nextSession.participantName || '',
      email: nextSession.participantEmail || '',
    })
    setPhase(nextSession.currentPhase || MVP_PHASES.DIAGNOSTIC_NOTICE)
    setNodes(nextNodes)
    setActiveNodeKey(currentNode?.key || WATER_CURRICULUM[0].key)
    setChatMessages(snapshot.chatMessages || [])
    setAssessmentAnswers(assessmentMap)
    setRevealedHints({})
    setSurvey(snapshot.surveyResponse || createDefaultSurveyState(nextSession))

    if (nextSession.currentPhase === MVP_PHASES.FREEFORM_AIRPLANE) {
      const budget = nextSession.airplaneTimeBudgetMs || nextSession.waterTimeMs || 0
      const elapsed = nextSession.airplaneStartedAt
        ? Math.max(0, Date.now() - new Date(nextSession.airplaneStartedAt).getTime())
        : 0
      setTimeRemainingMs(Math.max(0, budget - elapsed))
    } else if (nextSession.currentPhase === MVP_PHASES.ASSESSMENT || nextSession.currentPhase === MVP_PHASES.SURVEY || nextSession.currentPhase === MVP_PHASES.SUMMARY) {
      setTimeRemainingMs(0)
    } else {
      setTimeRemainingMs(nextSession.airplaneTimeBudgetMs || nextSession.waterTimeMs || null)
    }
  }, [])

  const hydrateLocalCache = useCallback((cache, token) => {
    if (!cache || typeof cache !== 'object') return false

    const nextSession = {
      ...emptySessionData,
      ...(cache.session || {}),
    }
    const nextNodes = hydrateNodes(cache.nodeProgress || [])
    const requestedNodeKey = typeof cache.activeNodeKey === 'string' ? cache.activeNodeKey : ''
    const availableNode = nextNodes.find((node) => node.key === requestedNodeKey && node.status !== 'locked')
    const unfinishedNode = nextNodes.find((node) => !isFinishedNode(node.status) && node.status !== 'locked')
    const currentNode = availableNode || unfinishedNode || nextNodes[nextNodes.length - 1]
    const assessmentMap = Array.isArray(cache.assessmentAnswers)
      ? cache.assessmentAnswers.reduce((acc, answer) => {
          if (answer?.questionKey) {
            acc[answer.questionKey] = answer
          }
          return acc
        }, {})
      : {}

    setSessionToken(token)
    setSessionData(nextSession)
    setFormData(cache.formData || {
      name: nextSession.participantName || '',
      email: nextSession.participantEmail || '',
    })
    setPhase(cache.phase || nextSession.currentPhase || MVP_PHASES.DIAGNOSTIC_NOTICE)
    setNodes(nextNodes)
    setActiveNodeKey(currentNode?.key || WATER_CURRICULUM[0].key)
    setChatMessages(Array.isArray(cache.chatMessages) ? cache.chatMessages : [])
    setChatInput(typeof cache.chatInput === 'string' ? cache.chatInput : '')
    setTimeRemainingMs(Number.isFinite(cache.timeRemainingMs) ? cache.timeRemainingMs : null)
    setAssessmentAnswers(assessmentMap)
    setRevealedHints({})
    setSurvey(cache.surveyResponse || createDefaultSurveyState(nextSession))
    return true
  }, [])

  useEffect(() => {
    const bootstrap = async () => {
      const storedToken = getStoredMvpToken()
      if (!storedToken) {
        setBooting(false)
        return
      }

      const cached = getStoredMvpCache(storedToken)
      if (cached) {
        hydrateLocalCache(cached, storedToken)
        void saveMvpProgress(storedToken, {
          eventLog: {
            phase: cached.phase || cached.session?.currentPhase || MVP_PHASES.ENTRY,
            eventType: 'local_recovery_used',
            payload: {
              savedAt: cached.savedAt || null,
            },
          },
        }).catch(() => {})
      }

      try {
        const data = await loadMvpSession(storedToken)
        hydrateSnapshot(data.snapshot, storedToken)
      } catch (error) {
        console.error(error)
        if (!cached) {
          clearStoredMvpToken()
          clearStoredMvpCache(storedToken)
          setPageError('Previous MVP session could not be restored. Start a new one below.')
        } else {
          setPageError('Recovered your local MVP progress. Remote sync could not be refreshed on this reload.')
        }
      } finally {
        setBooting(false)
      }
    }

    bootstrap()
  }, [hydrateLocalCache, hydrateSnapshot])

  useEffect(() => {
    if (!sessionToken || booting) return
    storeMvpCache(sessionToken, buildMvpLocalCache({
      phase,
      sessionData,
      formData,
      nodes,
      activeNodeKey,
      chatMessages,
      chatInput,
      timeRemainingMs,
      assessmentAnswers,
      survey,
    }))
  }, [
    sessionToken,
    booting,
    phase,
    sessionData,
    formData,
    nodes,
    activeNodeKey,
    chatMessages,
    chatInput,
    timeRemainingMs,
    assessmentAnswers,
    survey,
  ])

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [chatMessages])

  useEffect(() => {
    if (guidedScrollRef.current) {
      guidedScrollRef.current.scrollTop = guidedScrollRef.current.scrollHeight
    }
  }, [activeNodeState?.messages, activeNodeKey])

  const persistNode = useCallback(async (node) => {
    if (!sessionToken) return
    try {
      await saveMvpProgress(sessionToken, {
        nodeProgress: {
          nodeKey: node.key,
          status: node.status,
          masteryScore: node.masteryScore,
          attemptCount: node.attemptCount,
          interactionCount: node.interactionCount,
          startedAt: node.startedAt,
          completedAt: node.completedAt,
          durationMs: node.durationMs,
          lastAnswer: node.lastAnswer,
          messages: node.messages,
        },
      })
    } catch (error) {
      console.error(error)
      setPageError(error.message)
    }
  }, [sessionToken])

  const persistMvpActivity = useCallback(async (payload) => {
    if (!sessionToken) return
    try {
      await saveMvpProgress(sessionToken, payload)
    } catch (error) {
      console.error(error)
      setPageError(error.message)
    }
  }, [sessionToken])

  const persistSessionPatch = useCallback(async (patch) => {
    await persistMvpActivity({ sessionPatch: patch })
  }, [persistMvpActivity])

  const persistChatMessage = useCallback(async (message) => {
    await persistMvpActivity({ chatMessage: message })
  }, [persistMvpActivity])

  const persistEventLog = useCallback(async (eventType, payload = {}, eventPhase = phase) => {
    await persistMvpActivity({
      eventLog: {
        phase: eventPhase,
        eventType,
        payload,
      },
    })
  }, [persistMvpActivity, phase])

  const activateNode = useCallback((nodeKey) => {
    setActiveNodeKey(nodeKey)
  }, [])

  useEffect(() => {
    if (!nodes.length) return
    const currentNode = nodes.find((node) => node.key === activeNodeKey)
    if (currentNode && currentNode.status !== 'locked') return
    const fallbackNode = nodes.find((node) => node.status === 'active') || nodes.find((node) => !isFinishedNode(node.status))
    if (fallbackNode) {
      setActiveNodeKey(fallbackNode.key)
    }
  }, [nodes, activeNodeKey])

  useEffect(() => {
    if (phase !== MVP_PHASES.GUIDED_WATER || !activeNodeKey || !activeNodeConfig) return
    if (countedNodeRef.current === activeNodeKey) return
    countedNodeRef.current = activeNodeKey

    const now = new Date().toISOString()
    let persisted = null

    setNodes((prev) => prev.map((node) => {
      if (node.key !== activeNodeKey) return node
      const seededMessages = node.messages?.length ? node.messages : [createGuidedIntroMessage(activeNodeConfig)]
      persisted = {
        ...node,
        status: node.status === 'locked' ? 'active' : node.status,
        interactionCount: node.interactionCount + 1,
        startedAt: node.startedAt || now,
        messages: seededMessages,
      }
      return persisted
    }))

    if (persisted) {
      void persistNode(persisted)
      void persistEventLog('node_opened', {
        nodeKey: persisted.key,
        status: persisted.status,
        interactionCount: persisted.interactionCount,
      }, MVP_PHASES.GUIDED_WATER)
    }
  }, [phase, activeNodeKey, activeNodeConfig, persistNode, persistEventLog])

  useEffect(() => {
    if (phase !== MVP_PHASES.GUIDED_WATER || sessionData.waterStartedAt) return
    const startedAt = new Date().toISOString()
    setSessionData((prev) => ({ ...prev, waterStartedAt: startedAt }))
    void persistSessionPatch({ waterStartedAt: startedAt, currentPhase: MVP_PHASES.GUIDED_WATER })
  }, [phase, sessionData.waterStartedAt, persistSessionPatch])

  useEffect(() => {
    if (phase !== MVP_PHASES.FREEFORM_AIRPLANE) return

    airplaneFinishedRef.current = false
    if (!sessionData.airplaneStartedAt && !briefingLoggedRef.current) {
      briefingLoggedRef.current = true
      void persistEventLog('freeform_briefing_viewed', {
        timeBudgetMs: sessionData.airplaneTimeBudgetMs || sessionData.waterTimeMs || 0,
      }, MVP_PHASES.FREEFORM_AIRPLANE)
    }
    if (!sessionData.airplaneStartedAt) return

    if (chatMessages.length === 0) {
      const intro = createMessage('assistant', AIRPLANE_INTRO_MESSAGE)
      setChatMessages([intro])
      void persistChatMessage(intro)
    }

    if (timeRemainingMs == null) {
      setTimeRemainingMs(sessionData.airplaneTimeBudgetMs || sessionData.waterTimeMs || 0)
    }
  }, [
    phase,
    sessionData.airplaneStartedAt,
    sessionData.airplaneTimeBudgetMs,
    sessionData.waterTimeMs,
    chatMessages.length,
    persistEventLog,
    persistChatMessage,
    timeRemainingMs,
  ])

  const transitionPhase = useCallback((nextPhase, patch = {}, phaseEvent = null) => {
    const previousPhase = sessionData.currentPhase || phase
    setPhase(nextPhase)
    setSessionData((prev) => ({ ...prev, ...patch, currentPhase: nextPhase }))
    const eventLogs = [{
      phase: nextPhase,
      eventType: 'phase_changed',
      payload: {
        fromPhase: previousPhase,
        toPhase: nextPhase,
      },
    }]

    if (phaseEvent?.eventType) {
      eventLogs.push(phaseEvent)
    }

    return persistMvpActivity({ sessionPatch: { currentPhase: nextPhase, ...patch }, eventLogs })
  }, [persistMvpActivity, sessionData.currentPhase, phase])

  const completeAirplanePhase = useCallback(async (outcome = 'timeout') => {
    if (airplaneFinishedRef.current) return
    airplaneFinishedRef.current = true
    setChatLoading(false)
    setTimeRemainingMs(0)
    const completedAt = new Date().toISOString()
    await transitionPhase(
      MVP_PHASES.ASSESSMENT,
      {
        airplaneCompletedAt: completedAt,
        airplaneOutcome: outcome,
        completionReason: outcome === 'manual_finish' ? 'airplane_finished_manual' : 'airplane_finished_timeout',
      },
      {
        phase: MVP_PHASES.FREEFORM_AIRPLANE,
        eventType: outcome === 'manual_finish' ? 'conversation_finished_manual' : 'conversation_finished_timeout',
        payload: {
          completedAt,
        },
      }
    )
  }, [transitionPhase])

  useEffect(() => {
    if (phase !== MVP_PHASES.FREEFORM_AIRPLANE) return
    if (!sessionData.airplaneStartedAt) return
    if (!Number.isFinite(timeRemainingMs)) return
    if (timeRemainingMs <= 0) {
      void completeAirplanePhase()
      return
    }

    const timer = window.setInterval(() => {
      setTimeRemainingMs((prev) => {
        const next = Math.max(0, (prev || 0) - 1000)
        return next
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [phase, sessionData.airplaneStartedAt, timeRemainingMs, completeAirplanePhase])

  const handleStartSession = async (event) => {
    event.preventDefault()
    setFormError('')
    setPageError('')

    const name = formData.name.trim()
    const email = formData.email.trim()
    if (!name || !email || !/\S+@\S+\.\S+/.test(email)) {
      setFormError('Enter a valid name and email to continue.')
      return
    }
    setIsSaving(true)
    try {
      const data = await startMvpSession(name, email)
      storeMvpToken(data.sessionToken)
      hydrateSnapshot(data.snapshot, data.sessionToken)
    } catch (error) {
      console.error(error)
      setFormError(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAcknowledgeDiagnostic = async () => {
    setIsSaving(true)
    const acknowledgedAt = new Date().toISOString()
    try {
      await transitionPhase(
        MVP_PHASES.GUIDED_WATER,
        { diagnosticAcknowledgedAt: acknowledgedAt },
        {
          phase: MVP_PHASES.DIAGNOSTIC_NOTICE,
          eventType: 'diagnostic_acknowledged',
          payload: {
            acknowledgedAt,
          },
        },
      )
    } finally {
      setIsSaving(false)
    }
  }

  const finishWaterFlow = async (completedNodes, completedAt) => {
    const startedAt = sessionData.waterStartedAt || completedNodes.find((node) => node.startedAt)?.startedAt || completedAt
    const waterTimeMs = Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
    const rootNode = completedNodes.find((node) => node.key === ROOT_NODE_KEY)
    const guidedOutcome = rootNode?.status === 'skipped' ? 'root_skipped_advanced' : 'guided_mastery_threshold_reached'
    setTimeRemainingMs(waterTimeMs)
    briefingLoggedRef.current = false
    await transitionPhase(
      MVP_PHASES.FREEFORM_AIRPLANE,
      {
        waterStartedAt: startedAt,
        waterCompletedAt: completedAt,
        waterTimeMs,
        airplaneTimeBudgetMs: waterTimeMs,
        airplaneStartedAt: null,
        airplaneCompletedAt: null,
        guidedOutcome,
        completionReason: guidedOutcome === 'root_skipped_advanced' ? 'root_skipped_advanced' : null,
      },
      {
        phase: MVP_PHASES.GUIDED_WATER,
        eventType: 'guided_phase_completed',
        payload: {
          guidedOutcome,
          waterTimeMs,
          rootNodeStatus: rootNode?.status || null,
          rootMasteryScore: rootNode?.masteryScore || 0,
        },
      },
    )
  }

  const handleAdvanceToNextSection = async () => {
    if (phase !== MVP_PHASES.GUIDED_WATER) return

    setIsSaving(true)
    setPageError('')
    const completedAt = new Date().toISOString()
    const startedAt = sessionData.waterStartedAt || nodes.find((node) => node.startedAt)?.startedAt || completedAt
    const waterTimeMs = Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
    briefingLoggedRef.current = false

    try {
      await transitionPhase(
        MVP_PHASES.FREEFORM_AIRPLANE,
        {
          waterStartedAt: startedAt,
          waterCompletedAt: completedAt,
          waterTimeMs,
          airplaneTimeBudgetMs: waterTimeMs,
          airplaneStartedAt: null,
          airplaneCompletedAt: null,
          guidedOutcome: 'manual_advance',
          completionReason: 'manual_advance_guided',
        },
        {
          phase: MVP_PHASES.GUIDED_WATER,
          eventType: 'manual_section_advanced',
          payload: {
            fromSection: MVP_PHASES.GUIDED_WATER,
            toSection: MVP_PHASES.FREEFORM_AIRPLANE,
            warningAcknowledged: true,
          },
        },
      )
    } catch (error) {
      console.error(error)
      setPageError(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleNodeAnswerChange = (value) => {
    setNodes((prev) => prev.map((node) => (
      node.key === activeNodeKey
        ? { ...node, draftAnswer: value, feedback: '' }
        : node
    )))
  }

  const handleNodeSubmit = async (event) => {
    event.preventDefault()
    if (!activeNodeConfig || !activeNodeState) return

    const answer = activeNodeState.draftAnswer.trim()
    if (!answer) {
      setPageError('Enter an answer before submitting.')
      return
    }

    setPageError('')
    setGuidedLoading(true)
    const completedAt = new Date().toISOString()
    const userMessage = createMessage('user', answer)
    const provisionalMessages = [...(activeNodeState.messages || []), userMessage]
    void persistEventLog('node_answer_submitted', {
      nodeKey: activeNodeKey,
      answerLength: answer.length,
      attemptNumber: (activeNodeState.attemptCount || 0) + 1,
    }, MVP_PHASES.GUIDED_WATER)

    setNodes((prev) => prev.map((node) => (
      node.key === activeNodeKey
        ? {
            ...node,
            draftAnswer: '',
            attemptCount: node.attemptCount + 1,
            interactionCount: node.interactionCount + 1,
            lastAnswer: answer,
            hintUnlocked: true,
            messages: provisionalMessages,
          }
        : node
    )))

    try {
      const { response } = await askMVPDiagnosticTutor(
        {
          ...activeNodeConfig,
          currentMasteryScore: activeNodeState.masteryScore || 0,
        },
        provisionalMessages.map((message) => ({
          role: message.role,
          content: message.content,
        }))
      )

      const currentScore = activeNodeState.masteryScore || 0
      const nextScore = Math.min(100, currentScore + (response.pointsToAdd || 0))
      const reachedMastery = response.mastered || nextScore >= 100
      const assistantSections = [response.feedback]
      if (response.example) {
        assistantSections.push(`**Example:** ${response.example}`)
      }
      assistantSections.push(`**Progress:** ${nextScore}% mastery`)
      if (response.nextPrompt) {
        assistantSections.push(`**Next prompt:** ${response.nextPrompt}`)
      }
      const assistantContent = assistantSections.filter(Boolean).join('\n\n')
      const assistantMessage = createMessage('assistant', assistantContent, {
        hint: response.hint || '',
      })
      let persistedNode = null
      let nextNodes = []
      let newlyUnlockedNodes = []
      let reachedThreshold = false

      setNodes((prev) => {
        const updated = prev.map((node) => {
          if (node.key !== activeNodeKey) return node
          const nextNode = {
            ...node,
            feedback: response.feedback,
            masteryScore: nextScore,
            messages: [...provisionalMessages, assistantMessage],
          }

          if (reachedMastery) {
            nextNode.status = 'mastered'
            nextNode.masteryScore = 100
            nextNode.completedAt = completedAt
            nextNode.durationMs = Math.max(
              0,
              new Date(completedAt).getTime() - new Date(node.startedAt || completedAt).getTime()
            )
          }

          persistedNode = nextNode
          return nextNode
        })

        nextNodes = applyDependencyStatuses(updated)
        newlyUnlockedNodes = nextNodes.filter((node) => {
          const previousNode = updated.find((entry) => entry.key === node.key)
          return previousNode?.status === 'locked' && node.status === 'active'
        })
        reachedThreshold = currentScore < NODE_UNLOCK_THRESHOLD && nextScore >= NODE_UNLOCK_THRESHOLD
        return nextNodes
      })

      if (persistedNode) {
        await persistNode(persistedNode)
      }

      const eventLogs = [
        {
          phase: MVP_PHASES.GUIDED_WATER,
          eventType: 'ai_evaluation_returned',
          payload: {
            nodeKey: activeNodeKey,
            pointsToAdd: response.pointsToAdd || 0,
            nextScore,
            mastered: reachedMastery,
            missingConcepts: response.missingConcepts || [],
          },
        },
      ]

      if (reachedThreshold) {
        eventLogs.push({
          phase: MVP_PHASES.GUIDED_WATER,
          eventType: 'node_reached_70_percent',
          payload: {
            nodeKey: activeNodeKey,
            masteryScore: nextScore,
          },
        })
      }

      if (reachedMastery) {
        eventLogs.push({
          phase: MVP_PHASES.GUIDED_WATER,
          eventType: 'node_mastered',
          payload: {
            nodeKey: activeNodeKey,
            masteryScore: 100,
          },
        })
      }

      newlyUnlockedNodes.forEach((node) => {
        eventLogs.push({
          phase: MVP_PHASES.GUIDED_WATER,
          eventType: 'node_unlocked',
          payload: {
            nodeKey: node.key,
            masteryScore: node.masteryScore || 0,
          },
        })
      })

      if (eventLogs.length) {
        void persistMvpActivity({ eventLogs })
      }

      const rootReady = hasRootReachedCompletionThreshold(nextNodes)
      if (rootReady) {
        await finishWaterFlow(nextNodes, completedAt)
        return
      }

      if (reachedMastery) {
        const nextNode = nextNodes.find((node) => node.status === 'active' && node.key !== activeNodeKey && !isFinishedNode(node.status))
        if (nextNode) {
          countedNodeRef.current = ''
          activateNode(nextNode.key)
        }
      }
    } catch (error) {
      console.error(error)
      setPageError(error.message)
    } finally {
      setGuidedLoading(false)
    }
  }

  const handleSkipNode = async () => {
    if (!activeNodeState || activeNodeState.attemptCount < 2) return
    const completedAt = new Date().toISOString()
    let persistedNode = null
    let nextNodes = []
    let newlyUnlockedNodes = []

    setNodes((prev) => {
      const updated = prev.map((node) => {
        if (node.key !== activeNodeKey) return node
        persistedNode = {
          ...node,
          status: 'skipped',
          interactionCount: node.interactionCount + 1,
          masteryScore: node.masteryScore,
          completedAt,
          durationMs: Math.max(
            0,
            new Date(completedAt).getTime() - new Date(node.startedAt || completedAt).getTime()
          ),
          feedback: 'Node skipped. The flow will continue to the next concept.',
          messages: [
            ...(node.messages || []),
            createMessage('assistant', 'This node was skipped after repeated difficulty. The flow will continue to the next concept.'),
          ],
        }
        return persistedNode
      })

      nextNodes = applyDependencyStatuses(updated)
      newlyUnlockedNodes = nextNodes.filter((node) => {
        const previousNode = updated.find((entry) => entry.key === node.key)
        return previousNode?.status === 'locked' && node.status === 'active'
      })
      return nextNodes
    })

    if (persistedNode) {
      await persistNode(persistedNode)
      await persistMvpActivity({
        eventLogs: [
          {
            phase: MVP_PHASES.GUIDED_WATER,
            eventType: 'node_skipped',
            payload: {
              nodeKey: activeNodeKey,
            },
          },
          ...(activeNodeKey === ROOT_NODE_KEY ? [{
            phase: MVP_PHASES.GUIDED_WATER,
            eventType: 'root_skipped',
            payload: {
              nodeKey: activeNodeKey,
            },
          }] : []),
          ...newlyUnlockedNodes.map((node) => ({
            phase: MVP_PHASES.GUIDED_WATER,
            eventType: 'node_unlocked',
            payload: {
              nodeKey: node.key,
              reason: 'dependency_satisfied',
            },
          })),
        ],
      })
    }

    const rootReady = hasRootReachedCompletionThreshold(nextNodes)
    if (rootReady) {
      await finishWaterFlow(nextNodes, completedAt)
      return
    }

    const nextNode = nextNodes.find((node) => node.status === 'active' && node.key !== activeNodeKey && !isFinishedNode(node.status))
    if (nextNode) {
      countedNodeRef.current = ''
      activateNode(nextNode.key)
    }
  }

  const handleSendChat = async (event) => {
    event.preventDefault()
    if (phase !== MVP_PHASES.FREEFORM_AIRPLANE || chatLoading || !chatInput.trim() || (timeRemainingMs || 0) <= 0) return

    const userMessage = createMessage('user', chatInput.trim())
    const nextMessages = [...chatMessages, userMessage]
    setChatMessages(nextMessages)
    setChatInput('')
    setChatLoading(true)
    void persistMvpActivity({
      chatMessage: userMessage,
      eventLog: {
        phase: MVP_PHASES.FREEFORM_AIRPLANE,
        eventType: 'freeform_user_message_sent',
        payload: {
          messageId: userMessage.id,
          contentLength: userMessage.content.length,
        },
      },
    })

    const { response } = await askMVPTutor(nextMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })))

    if (airplaneFinishedRef.current || phase !== MVP_PHASES.FREEFORM_AIRPLANE) {
      setChatLoading(false)
      return
    }

    const assistantMessage = createMessage('assistant', response)
    setChatMessages((prev) => [...prev, assistantMessage])
    setChatLoading(false)
    void persistMvpActivity({
      chatMessage: assistantMessage,
      eventLog: {
        phase: MVP_PHASES.FREEFORM_AIRPLANE,
        eventType: 'freeform_assistant_message_received',
        payload: {
          messageId: assistantMessage.id,
          contentLength: assistantMessage.content.length,
        },
      },
    })
  }

  const handleBeginAirplanePhase = async () => {
    if (sessionData.airplaneStartedAt) return
    if (!survey.guidedConfidenceAfter || !survey.freeformConfidenceBefore) {
      setPageError('Complete the confidence check-in before starting the free-form phase.')
      return
    }

    setIsSaving(true)
    setPageError('')
    const startedAt = new Date().toISOString()
    const intro = createMessage('assistant', AIRPLANE_INTRO_MESSAGE)

    try {
      setSessionData((prev) => ({ ...prev, airplaneStartedAt: startedAt }))
      setChatMessages([intro])
      setTimeRemainingMs(sessionData.airplaneTimeBudgetMs || sessionData.waterTimeMs || 0)
      await persistMvpActivity({
        sessionPatch: {
          airplaneStartedAt: startedAt,
          currentPhase: MVP_PHASES.FREEFORM_AIRPLANE,
          airplaneOutcome: 'in_progress',
          guidedConfidenceAfter: Number(survey.guidedConfidenceAfter),
          freeformConfidenceBefore: Number(survey.freeformConfidenceBefore),
        },
        chatMessage: intro,
        eventLogs: [
          {
            phase: MVP_PHASES.FREEFORM_AIRPLANE,
            eventType: 'guided_confidence_after_recorded',
            payload: {
              value: Number(survey.guidedConfidenceAfter),
            },
          },
          {
            phase: MVP_PHASES.FREEFORM_AIRPLANE,
            eventType: 'freeform_confidence_before_recorded',
            payload: {
              value: Number(survey.freeformConfidenceBefore),
            },
          },
          {
            phase: MVP_PHASES.FREEFORM_AIRPLANE,
            eventType: 'freeform_phase_started',
            payload: {
              startedAt,
              timeBudgetMs: sessionData.airplaneTimeBudgetMs || sessionData.waterTimeMs || 0,
            },
          },
        ],
      })
    } catch (error) {
      console.error(error)
      setPageError(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAssessmentSubmit = async (event) => {
    event.preventDefault()
    const missingQuestion = ASSESSMENT_QUESTIONS.find((question) => !assessmentAnswers[question.key]?.selectedOption)
    if (missingQuestion) {
      setPageError(`Answer all ${ASSESSMENT_QUESTIONS.length} assessment questions before continuing.`)
      return
    }

    setIsSaving(true)
    setPageError('')
    const submittedAnswers = ASSESSMENT_QUESTIONS.map((question) => {
      const selectedOption = assessmentAnswers[question.key].selectedOption
      return {
        questionKey: question.key,
        topic: question.topic,
        selectedOption,
        isCorrect: selectedOption === question.correctOption,
      }
    })

    const totalQuizScore = submittedAnswers.filter((answer) => answer.isCorrect).length
    const guidedQuizScore = submittedAnswers
      .filter((answer) => answer.topic === 'water filtration' && answer.isCorrect)
      .length
    const freeformQuizScore = submittedAnswers
      .filter((answer) => answer.topic === 'airplane engines' && answer.isCorrect)
      .length
    try {
      await submitMvpAssessment(sessionToken, submittedAnswers, {
        totalQuizScore,
        guidedQuizScore,
        freeformQuizScore,
      })
      const completedAt = new Date().toISOString()
      setAssessmentAnswers((prev) => submittedAnswers.reduce((acc, answer) => {
        acc[answer.questionKey] = answer
        return acc
      }, { ...prev }))
      await transitionPhase(MVP_PHASES.SURVEY, {
        assessmentCompletedAt: completedAt,
        totalQuizScore,
        guidedQuizScore,
        freeformQuizScore,
      })
    } catch (error) {
      console.error(error)
      setPageError(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSurveySubmit = async (event) => {
    event.preventDefault()
    if (
      !survey.guidedConfidenceBefore ||
      !survey.freeformConfidenceAfter ||
      !survey.clarityRating ||
      !survey.engagementRating ||
      !survey.effectivenessRating ||
      !survey.guidedUsefulness ||
      !survey.freeformUsefulness ||
      !survey.clearerSystem ||
      !survey.preferredSystem ||
      !survey.positiveAspectGuided.trim() ||
      !survey.positiveAspectFreeform.trim()
    ) {
      setPageError('Complete all required survey fields before finishing.')
      return
    }

    setIsSaving(true)
    setPageError('')
    try {
      const finalizedSurvey = {
        ...survey,
        guidedConfidenceBefore: Number(survey.guidedConfidenceBefore),
        guidedConfidenceAfter: Number(survey.guidedConfidenceAfter),
        freeformConfidenceBefore: Number(survey.freeformConfidenceBefore),
        freeformConfidenceAfter: Number(survey.freeformConfidenceAfter),
        clarityRating: Number(survey.clarityRating),
        engagementRating: Number(survey.engagementRating),
        effectivenessRating: Number(survey.effectivenessRating),
        guidedUsefulness: Number(survey.guidedUsefulness),
        freeformUsefulness: Number(survey.freeformUsefulness),
        betterExperience: survey.clearerSystem,
        clearerExplanations: survey.clearerSystem,
        preferredModerateTopic: survey.preferredSystem,
        comment: '',
      }
      setSurvey(finalizedSurvey)
      const result = await submitMvpSurvey(sessionToken, finalizedSurvey)
      await transitionPhase(MVP_PHASES.SUMMARY, {
        status: 'completed',
        surveyCompletedAt: result.completedAt || new Date().toISOString(),
        guidedConfidenceBefore: Number(survey.guidedConfidenceBefore),
        freeformConfidenceAfter: Number(survey.freeformConfidenceAfter),
      })
    } catch (error) {
      console.error(error)
      setPageError(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAssessmentChoice = (questionKey, question, selectedOption) => {
    setAssessmentAnswers((prev) => ({
      ...prev,
      [questionKey]: {
        questionKey,
        topic: question.topic,
        selectedOption,
        isCorrect: selectedOption === question.correctOption,
      },
    }))
  }

  const handleExport = () => {
    const payload = buildExportPayload(sessionData, nodes, chatMessages, assessmentAnswers, survey, phase)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `forest-mvp-session-${sessionData.id || 'export'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleRestart = () => {
    clearStoredMvpCache(sessionToken || getStoredMvpToken())
    clearStoredMvpToken()
    setSessionToken('')
    setSessionData(emptySessionData)
    setPhase(MVP_PHASES.ENTRY)
    setFormData({ name: '', email: '' })
    setNodes(createInitialNodeState())
    setActiveNodeKey(WATER_CURRICULUM[0].key)
    setChatMessages([])
    setAssessmentAnswers({})
    setRevealedHints({})
    setSurvey({
      ...createDefaultSurveyState(),
    })
    setTimeRemainingMs(null)
    setPageError('')
    countedNodeRef.current = ''
  }

  const renderEntry = () => (
    <div className="max-w-xl mx-auto bg-forest-darker/70 border border-forest-border/60 backdrop-blur-xl rounded-[28px] p-8 md:p-10 shadow-2xl">
      <p className="text-xs uppercase tracking-[0.35em] text-forest-emerald mb-3">Sprint 3 prototype</p>
      <h1 className="text-4xl md:text-5xl font-semibold text-white leading-tight">
        Diagnostic learning study
      </h1>
      <p className="text-forest-light-gray mt-4 text-lg">
        Enter your information to begin the guided diagnostic flow, timed free-form AI session, assessment, and experience survey.
      </p>

      <form className="mt-8 space-y-5" onSubmit={handleStartSession}>
        <Input
          label="Full name"
          name="name"
          value={formData.name}
          onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
          icon={User}
          required
        />
        <Input
          label="Email"
          type="email"
          name="email"
          value={formData.email}
          onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
          icon={Mail}
          required
        />
        {formError && (
          <div className="rounded-xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex gap-2">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{formError}</span>
          </div>
        )}
        <Button type="submit" variant="primary" fullWidth disabled={isSaving}>
          <span className="flex items-center justify-center gap-2">
            {isSaving ? 'Starting session...' : 'Begin MVP session'}
            {isSaving ? <Loader size={18} className="animate-spin" /> : <ChevronRight size={18} />}
          </span>
        </Button>
      </form>
    </div>
  )

  const renderDiagnosticNotice = () => (
    <div className="fixed inset-0 z-30 flex items-center justify-center px-4 bg-[#030504]/80 backdrop-blur-md">
      <div className="w-full max-w-2xl rounded-[30px] border border-amber-400/30 bg-[#0d1511] shadow-2xl overflow-hidden">
        <div className="px-8 py-6 border-b border-amber-400/20 bg-gradient-to-r from-amber-500/10 to-transparent">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-300 mb-2">Required notice</p>
          <h2 className="text-3xl font-semibold text-white">You are entering a diagnostic session</h2>
        </div>
        <div className="px-8 py-8">
          <p className="text-lg text-forest-light-gray leading-8">
            In this prototype, you will first complete a guided diagnostic mastery flow on water filtration. After that, you will switch to a traditional free-form AI chat to learn how airplane engines work. You will then complete a short assessment and a comparison survey.
          </p>
          <p className="text-forest-gray mt-5">
            This notice appears for every participant in the MVP environment.
          </p>
          <div className="mt-8 flex justify-end">
            <Button variant="primary" onClick={handleAcknowledgeDiagnostic} disabled={isSaving}>
              <span className="flex items-center gap-2">
                {isSaving ? 'Opening session...' : 'Continue to diagnostics'}
                {isSaving ? <Loader size={18} className="animate-spin" /> : <ChevronRight size={18} />}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  const renderGuidedWater = () => (
    <div className="grid lg:grid-cols-[360px_minmax(0,1fr)] gap-6">
      <aside className="rounded-[28px] border border-forest-border/60 bg-forest-darker/60 backdrop-blur-xl p-6">
        <p className="text-xs uppercase tracking-[0.35em] text-forest-emerald mb-3">Guided diagnostic</p>
        <h2 className="text-2xl font-semibold text-white">Water filtration</h2>
        <p className="text-forest-light-gray mt-3 text-sm leading-6">
          Bring each prerequisite node to at least 70% mastery, or skip it, to unlock higher concepts. The airplane phase starts once the root concept reaches 70% or is skipped.
        </p>

        <div className="mt-6 rounded-3xl border border-white/5 bg-black/20 p-4">
          <svg viewBox="0 0 360 360" className="w-full h-auto">
            {WATER_CURRICULUM.flatMap((node) =>
              (node.parentIds || []).map((parentId) => {
                const parent = getCurriculumNode(parentId)
                if (!parent) return null
                return (
                  <line
                    key={`${parentId}-${node.key}`}
                    x1={parent.x}
                    y1={parent.y}
                    x2={node.x}
                    y2={node.y}
                    stroke="#1f2d27"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                  />
                )
              })
            )}

            {nodes.map((nodeState) => {
              const nodeConfig = getCurriculumNode(nodeState.key)
              if (!nodeConfig) return null
              const isSelected = activeNodeKey === nodeState.key
              const color = getNodeColor(nodeState.masteryScore || 0, nodeState.status)
              const titleLines = getNodeTitleLines(nodeConfig.title)
              return (
                <g
                  key={nodeState.key}
                  onClick={() => {
                    if (nodeState.status === 'locked') return
                    countedNodeRef.current = ''
                    activateNode(nodeState.key)
                  }}
                  className={nodeState.status === 'locked' ? '' : 'cursor-pointer'}
                >
                  <circle
                    cx={nodeConfig.x}
                    cy={nodeConfig.y}
                    r={isSelected ? 32 : 28}
                    fill={color}
                    opacity={nodeState.status === 'locked' ? 0.55 : 0.92}
                    stroke={isSelected ? '#e5e7eb' : 'transparent'}
                    strokeWidth="2"
                  />
                  <text
                    x={nodeConfig.x}
                    y={nodeConfig.y - 2}
                    textAnchor="middle"
                    fill="white"
                    fontSize="12"
                    fontWeight="700"
                    style={{ pointerEvents: 'none' }}
                  >
                    {nodeState.masteryScore || 0}%
                  </text>
                  <text
                    x={nodeConfig.x}
                    y={nodeConfig.y + 44}
                    textAnchor="middle"
                    fill={nodeState.status === 'locked' ? '#6b7280' : '#e5e7eb'}
                    fontSize="12"
                    fontWeight="600"
                    style={{ pointerEvents: 'none' }}
                  >
                    {titleLines.map((line, lineIndex) => (
                      <tspan
                        key={`${nodeState.key}-title-${lineIndex}`}
                        x={nodeConfig.x}
                        dy={lineIndex === 0 ? 0 : 14}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        <div className="mt-6 space-y-3">
          {nodes.map((node, index) => {
            const content = WATER_CURRICULUM[index]
            const statusStyles = {
              active: 'border-forest-emerald bg-forest-emerald/10 text-white',
              mastered: 'border-emerald-300/40 bg-emerald-400/10 text-white',
              skipped: 'border-amber-300/40 bg-amber-400/10 text-white',
              locked: 'border-forest-border bg-black/20 text-forest-gray',
            }

            return (
              <button
                key={node.key}
                type="button"
                disabled={node.status === 'locked'}
                onClick={() => {
                  countedNodeRef.current = ''
                  activateNode(node.key)
                }}
                className={`w-full text-left rounded-2xl border px-4 py-4 transition-colors ${statusStyles[node.status]}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] opacity-70">{content.kicker}</p>
                    <p className="mt-1 font-medium">{content.title}</p>
                  </div>
                  {node.status === 'mastered' && <CheckCircle2 size={18} className="text-emerald-300 shrink-0" />}
                  {node.status === 'skipped' && <SkipForward size={18} className="text-amber-300 shrink-0" />}
                </div>
                <div className="mt-3 text-xs opacity-75 flex items-center justify-between">
                  <span>{node.attemptCount} attempts</span>
                  <span>{node.masteryScore || 0}% mastery</span>
                </div>
                {content.parentIds?.length > 0 && (
                  <p className="mt-2 text-[11px] opacity-65">
                    Unlocks after 70% or skip on: {content.parentIds.map((id) => getCurriculumNode(id)?.title || id).join(', ')}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      </aside>

      <section className="rounded-[28px] border border-forest-border/60 bg-forest-darker/60 backdrop-blur-xl p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-forest-emerald mb-3">{activeNodeConfig.kicker}</p>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-3xl font-semibold text-white">{activeNodeConfig.title}</h3>
            <p className="text-forest-light-gray mt-2">{activeNodeConfig.summary}</p>
          </div>
          <div className="rounded-full border border-forest-border px-4 py-2 text-sm text-forest-light-gray">
            Status: <span className="text-white capitalize">{activeNodeState?.status}</span>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-white/5 bg-black/20 p-5">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-forest-light-gray">Node mastery progress</span>
            <span className="text-white font-medium">{activeNodeState?.masteryScore || 0}%</span>
          </div>
          <div className="mt-3 h-3 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-forest-emerald to-forest-teal transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, activeNodeState?.masteryScore || 0))}%` }}
            />
          </div>
          <p className="mt-3 text-sm text-forest-gray">
            Forest adds points as your explanation gets closer to a correct mental model. Higher concepts unlock at 70%, and full node mastery still requires 100%.
          </p>
        </div>

        <div className="mt-6 rounded-3xl border border-white/5 bg-black/20 overflow-hidden">
          <div ref={guidedScrollRef} className="max-h-[420px] overflow-y-auto px-6 py-6 space-y-5">
            {(activeNodeState?.messages || []).map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-3xl rounded-3xl px-5 py-4 border ${message.role === 'user'
                  ? 'bg-forest-emerald text-forest-darker border-forest-emerald'
                  : 'bg-black/30 text-white border-forest-border/60'
                  }`}>
                  {message.role === 'assistant' ? (
                    <div>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.content}
                        </ReactMarkdown>
                      </div>
                      {message.hint && (
                        <div className="mt-4 rounded-2xl border border-forest-border/60 bg-white/5 px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              const nextVisible = !revealedHints[message.id]
                              setRevealedHints((prev) => ({
                                ...prev,
                                [message.id]: nextVisible,
                              }))
                              void persistEventLog(nextVisible ? 'hint_shown' : 'hint_hidden', {
                                nodeKey: activeNodeKey,
                                messageId: message.id,
                              }, MVP_PHASES.GUIDED_WATER)
                            }}
                            className="text-sm font-medium text-forest-emerald hover:text-emerald-300 transition-colors"
                          >
                            {revealedHints[message.id] ? 'Hide hint' : 'Show hint'}
                          </button>
                          {revealedHints[message.id] && (
                            <p className="mt-3 text-sm leading-6 text-forest-light-gray whitespace-pre-line">
                              {message.hint}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="whitespace-pre-line">{message.content}</p>
                  )}
                </div>
              </div>
            ))}
            {guidedLoading && (
              <div className="flex justify-start">
                <div className="rounded-3xl border border-forest-border/60 bg-black/20 px-5 py-4 text-forest-light-gray flex items-center gap-3">
                  <Loader size={18} className="animate-spin text-forest-emerald" />
                  Forest is evaluating your answer and guiding the next step...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleNodeSubmit} className="border-t border-forest-border/30 px-6 py-5 bg-black/15">
            <p className="text-sm text-forest-light-gray mb-3">
              Respond in your own words. Forest will check your answer with AI and coach you toward mastery.
            </p>
            <div className="flex gap-3 items-end">
              <textarea
                value={activeNodeState?.draftAnswer || ''}
                onChange={(event) => handleNodeAnswerChange(event.target.value)}
                disabled={guidedLoading || activeNodeState?.status === 'mastered'}
                className="flex-1 min-h-[110px] rounded-3xl border border-forest-border bg-black/20 px-5 py-4 text-white focus:outline-none focus:border-forest-emerald disabled:opacity-50"
                placeholder={activeNodeState?.status === 'mastered' ? 'Node mastered. Moving forward.' : 'Answer the tutor in your own words.'}
              />
              <Button type="submit" variant="primary" disabled={guidedLoading || !(activeNodeState?.draftAnswer || '').trim() || activeNodeState?.status === 'mastered'}>
                <span className="flex items-center gap-2">
                  Send
                  <Send size={18} />
                </span>
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {activeNodeState?.attemptCount >= 2 && activeNodeState?.status !== 'mastered' && (
                <Button type="button" variant="secondary" onClick={handleSkipNode} disabled={guidedLoading}>
                  <span className="flex items-center gap-2">
                    I&apos;m stuck, skip this node
                    <SkipForward size={18} />
                  </span>
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={handleAdvanceToNextSection}
                disabled={guidedLoading || isSaving}
              >
                Advance to next section
              </Button>
              <div className="rounded-full border border-forest-border px-4 py-2 text-sm text-forest-light-gray">
                Attempts: <span className="text-white">{activeNodeState?.attemptCount || 0}</span>
              </div>
              <div className="rounded-full border border-forest-border px-4 py-2 text-sm text-forest-light-gray">
                Progress: <span className="text-white">{activeNodeState?.masteryScore || 0}%</span>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-amber-200/90">
              Warning: this will skip the current guided section and may not accurately describe the intended learning process.
            </p>
          </form>
        </div>
      </section>
    </div>
  )

  const renderAirplaneChat = () => (
    <div className="rounded-[28px] border border-forest-border/60 bg-forest-darker/60 backdrop-blur-xl overflow-hidden">
      <div className="border-b border-forest-border/40 px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-forest-emerald mb-2">Free-form AI</p>
          <h2 className="text-3xl font-semibold text-white">How an airplane engine works</h2>
        </div>
        <div className="rounded-full border border-forest-border px-4 py-2 flex items-center gap-2 text-white">
          <Clock3 size={16} className="text-forest-emerald" />
          <span>{formatDuration(sessionData.airplaneStartedAt ? (timeRemainingMs || 0) : (sessionData.airplaneTimeBudgetMs || sessionData.waterTimeMs || 0))}</span>
        </div>
      </div>

      {!sessionData.airplaneStartedAt ? (
        <div className="px-6 py-10 md:px-10 md:py-12">
          <div className="max-w-3xl rounded-[28px] border border-emerald-400/20 bg-emerald-400/5 p-8">
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-300 mb-3">Transition</p>
            <h3 className="text-3xl font-semibold text-white">You reached mastery for the guided concept</h3>
            <p className="mt-4 text-forest-light-gray leading-7">
              You have reached the mastery threshold for the water-filtration concept map. Next, you will move into the traditional free-form LLM experience to learn how an airplane engine works.
            </p>
            <div className="mt-6 rounded-3xl border border-white/5 bg-black/20 p-5">
              <p className="text-sm text-white font-medium">Instructions</p>
              <ul className="mt-3 space-y-2 text-sm text-forest-light-gray leading-6 list-disc pl-5">
                <li>Use this phase like a normal ChatGPT-style conversation.</li>
                <li>Ask any questions you want about airplane engines, including compressors, combustion, turbines, airflow, and thrust.</li>
                <li>Your time limit will exactly match the time you spent in the guided water-filtration phase.</li>
                <li>When the timer ends, you will automatically continue to the assessment.</li>
              </ul>
            </div>
            <div className="mt-6 rounded-3xl border border-white/5 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.25em] text-forest-emerald mb-2">Time budget</p>
              <p className="text-2xl font-semibold text-white">{formatDuration(sessionData.airplaneTimeBudgetMs || sessionData.waterTimeMs || 0)}</p>
              <p className="mt-2 text-sm text-forest-gray">
                The timer starts when you enter the free-form LLM phase.
              </p>
            </div>
            <div className="mt-6 space-y-6">
              <div>
                <p className="text-sm font-medium text-forest-light-gray mb-3">
                  How confident are you now in your ability to explain the first topic you learned with the Guided Diagnostic System after walking through the learning process?
                </p>
                <div className="grid gap-3 md:grid-cols-5">
                  {CONFIDENCE_OPTIONS.map((option) => (
                    <label key={`guided-after-${option}`} className="rounded-2xl border border-forest-border px-4 py-4 flex items-start gap-3 cursor-pointer hover:border-forest-emerald">
                      <input
                        type="radio"
                        name="guidedConfidenceAfter"
                        checked={`${survey.guidedConfidenceAfter}` === `${option}`}
                        onChange={() => setSurvey((prev) => ({ ...prev, guidedConfidenceAfter: `${option}` }))}
                        className="mt-1"
                      />
                      <span className="text-forest-light-gray">{CONFIDENCE_LABELS[option]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-forest-light-gray mb-3">
                  How confident were you in your ability to explain the first topic you learned with the Free-Form AI Learning Experience before you participated?
                </p>
                <div className="grid gap-3 md:grid-cols-5">
                  {CONFIDENCE_OPTIONS.map((option) => (
                    <label key={`freeform-before-${option}`} className="rounded-2xl border border-forest-border px-4 py-4 flex items-start gap-3 cursor-pointer hover:border-forest-emerald">
                      <input
                        type="radio"
                        name="freeformConfidenceBefore"
                        checked={`${survey.freeformConfidenceBefore}` === `${option}`}
                        onChange={() => setSurvey((prev) => ({ ...prev, freeformConfidenceBefore: `${option}` }))}
                        className="mt-1"
                      />
                      <span className="text-forest-light-gray">{CONFIDENCE_LABELS[option]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-8">
              <Button variant="primary" onClick={handleBeginAirplanePhase} disabled={isSaving}>
                <span className="flex items-center gap-2">
                  {isSaving ? 'Starting free-form phase...' : 'Begin free-form AI phase'}
                  {isSaving ? <Loader size={18} className="animate-spin" /> : <ChevronRight size={18} />}
                </span>
              </Button>
            </div>
          </div>
        </div>
      ) : (
      <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] min-h-[620px]">
        <aside className="border-r border-forest-border/30 bg-black/15 p-6">
          <p className="text-sm text-forest-light-gray leading-7">
            This is the traditional LLM phase. Ask any follow-up questions you want about airplane engines until the timer expires.
          </p>
          <div className="mt-6 rounded-3xl border border-white/5 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.25em] text-forest-emerald mb-2">Time budget</p>
            <p className="text-2xl font-semibold text-white">{formatDuration(sessionData.airplaneTimeBudgetMs || sessionData.waterTimeMs || 0)}</p>
            <p className="text-sm text-forest-gray mt-2">
              This exactly matches your guided water-filtration completion time.
            </p>
          </div>
          <div className="mt-6">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => void completeAirplanePhase('manual_finish')}
              disabled={chatLoading || airplaneFinishedRef.current}
            >
              Finish conversation now
            </Button>
            <p className="mt-3 text-xs leading-5 text-forest-gray">
              Use this if you are done learning and want to move straight to the assessment before the timer ends.
            </p>
          </div>
        </aside>

        <div className="flex flex-col min-h-[620px]">
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {chatMessages.map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-3xl rounded-3xl px-5 py-4 border ${message.role === 'user'
                  ? 'bg-forest-emerald text-forest-darker border-forest-emerald'
                  : 'bg-black/20 text-white border-forest-border/60'
                  }`}>
                  {message.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-line">{message.content}</p>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="rounded-3xl border border-forest-border/60 bg-black/20 px-5 py-4 text-forest-light-gray flex items-center gap-3">
                  <Loader size={18} className="animate-spin text-forest-emerald" />
                  Forest is responding...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSendChat} className="border-t border-forest-border/30 px-6 py-5 bg-black/15">
            <div className="flex gap-3 items-end">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                disabled={chatLoading || (timeRemainingMs || 0) <= 0}
                className="flex-1 min-h-[88px] rounded-3xl border border-forest-border bg-black/20 px-5 py-4 text-white focus:outline-none focus:border-forest-emerald disabled:opacity-50"
                placeholder={(timeRemainingMs || 0) <= 0 ? 'Time is up. Moving to assessment.' : 'Ask about compressors, turbines, combustion, thrust, or anything else.'}
              />
              <Button type="submit" variant="primary" disabled={chatLoading || !chatInput.trim() || (timeRemainingMs || 0) <= 0}>
                <span className="flex items-center gap-2">
                  Send
                  <Send size={18} />
                </span>
              </Button>
            </div>
          </form>
        </div>
      </div>
      )}
    </div>
  )

  const renderAssessment = () => (
    <form onSubmit={handleAssessmentSubmit} className="rounded-[28px] border border-forest-border/60 bg-forest-darker/60 backdrop-blur-xl p-6 md:p-8">
      <p className="text-xs uppercase tracking-[0.35em] text-forest-emerald mb-3">Assessment</p>
      <h2 className="text-3xl font-semibold text-white">Eight-question retention check</h2>
      <p className="text-forest-light-gray mt-3">
        Answer four questions on water filtration and four on airplane engines.
      </p>

      <div className="mt-8 space-y-6">
        {ASSESSMENT_QUESTIONS.map((question, index) => (
          <div key={question.key} className="rounded-3xl border border-white/5 bg-black/20 p-5">
            <p className="text-xs uppercase tracking-[0.25em] text-forest-emerald/80 mb-2">{question.topic}</p>
            <h3 className="text-lg font-medium text-white">
              {index + 1}. {question.prompt}
            </h3>
            <div className="mt-4 grid gap-3">
              {question.options.map((option) => (
                <label key={option} className="rounded-2xl border border-forest-border px-4 py-3 flex items-start gap-3 cursor-pointer hover:border-forest-emerald">
                  <input
                    type="radio"
                    name={question.key}
                    checked={assessmentAnswers[question.key]?.selectedOption === option}
                    onChange={() => handleAssessmentChoice(question.key, question, option)}
                    className="mt-1"
                  />
                  <span className="text-forest-light-gray">{option}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <Button type="submit" variant="primary" disabled={isSaving}>
          <span className="flex items-center gap-2">
            {isSaving ? 'Submitting...' : 'Continue to survey'}
            {isSaving ? <Loader size={18} className="animate-spin" /> : <ChevronRight size={18} />}
          </span>
        </Button>
      </div>
    </form>
  )

  const renderSurvey = () => (
    <form onSubmit={handleSurveySubmit} className="rounded-[28px] border border-forest-border/60 bg-forest-darker/60 backdrop-blur-xl p-6 md:p-8">
      <p className="text-xs uppercase tracking-[0.35em] text-forest-emerald mb-3">Experience survey</p>
      <h2 className="text-3xl font-semibold text-white">Compare the two experiences</h2>

      <div className="mt-8 space-y-7">
        <div>
          <h3 className="text-lg font-medium text-white mb-3">
            How confident are you now in your ability to explain the first topic you learned with the Free-Form AI Learning Experience after walking through the learning process?
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {CONFIDENCE_OPTIONS.map((option) => (
              <label key={`freeform-after-${option}`} className="rounded-2xl border border-forest-border px-4 py-4 flex items-start gap-3 cursor-pointer hover:border-forest-emerald">
                <input
                  type="radio"
                  name="freeformConfidenceAfter"
                  checked={`${survey.freeformConfidenceAfter}` === `${option}`}
                  onChange={() => setSurvey((prev) => ({ ...prev, freeformConfidenceAfter: `${option}` }))}
                  className="mt-1 shrink-0"
                />
                <span className="text-forest-light-gray text-sm leading-6">{CONFIDENCE_LABELS[option]}</span>
              </label>
            ))}
          </div>
        </div>

        {SURVEY_FIELDS.map((field) => (
          <div key={field.key}>
            <h3 className="text-lg font-medium text-white mb-3">{field.label}</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {RATING_OPTIONS.map((option) => (
                <label key={option} className="rounded-2xl border border-forest-border px-4 py-4 flex items-start gap-3 cursor-pointer hover:border-forest-emerald">
                  <input
                    type="radio"
                    name={field.key}
                    checked={`${survey[field.key]}` === `${option}`}
                    onChange={() => setSurvey((prev) => ({ ...prev, [field.key]: `${option}` }))}
                    className="mt-1 shrink-0"
                  />
                  <span className="text-forest-light-gray text-sm leading-6">{RATING_LABELS[option]}</span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <div>
          <h3 className="text-lg font-medium text-white mb-3">How useful would you rate the Guided Diagnostic System?</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {RATING_OPTIONS.map((option) => (
              <label key={`guided-usefulness-${option}`} className="rounded-2xl border border-forest-border px-4 py-4 flex items-start gap-3 cursor-pointer hover:border-forest-emerald">
                <input
                  type="radio"
                  name="guidedUsefulness"
                  checked={`${survey.guidedUsefulness}` === `${option}`}
                  onChange={() => setSurvey((prev) => ({ ...prev, guidedUsefulness: `${option}` }))}
                  className="mt-1 shrink-0"
                />
                <span className="text-forest-light-gray text-sm leading-6">{RATING_LABELS[option]}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium text-white mb-3">How useful would you rate the Free-Form AI Learning Experience?</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {RATING_OPTIONS.map((option) => (
              <label key={`freeform-usefulness-${option}`} className="rounded-2xl border border-forest-border px-4 py-4 flex items-start gap-3 cursor-pointer hover:border-forest-emerald">
                <input
                  type="radio"
                  name="freeformUsefulness"
                  checked={`${survey.freeformUsefulness}` === `${option}`}
                  onChange={() => setSurvey((prev) => ({ ...prev, freeformUsefulness: `${option}` }))}
                  className="mt-1 shrink-0"
                />
                <span className="text-forest-light-gray text-sm leading-6">{RATING_LABELS[option]}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium text-white mb-3">Which learning experience provided the clearer, easier-to-follow explanations?</h3>
          <div className="grid gap-3 md:grid-cols-3">
            {CLEARER_SYSTEM_OPTIONS.map((option) => (
              <label key={option} className="rounded-2xl border border-forest-border px-4 py-4 flex items-start gap-3 cursor-pointer hover:border-forest-emerald">
                <input
                  type="radio"
                  name="clearerSystem"
                  checked={survey.clearerSystem === option}
                  onChange={() => setSurvey((prev) => ({ ...prev, clearerSystem: option }))}
                  className="mt-1"
                />
                <span className="text-forest-light-gray">{option}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium text-white mb-3">If you had to learn a new, moderately difficult topic, which system would you prefer to use?</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {PREFERRED_SYSTEM_OPTIONS.map((option) => (
              <label key={option} className="rounded-2xl border border-forest-border px-4 py-4 flex items-start gap-3 cursor-pointer hover:border-forest-emerald">
                <input
                  type="radio"
                  name="preferredSystem"
                  checked={survey.preferredSystem === option}
                  onChange={() => setSurvey((prev) => ({ ...prev, preferredSystem: option }))}
                  className="mt-1"
                />
                <span className="text-forest-light-gray">{option}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-lg font-medium text-white mb-3">
            What was the most positive aspect of the Guided Diagnostic System for learning this topic?
          </label>
          <textarea
            value={survey.positiveAspectGuided}
            onChange={(event) => setSurvey((prev) => ({ ...prev, positiveAspectGuided: event.target.value }))}
            className="w-full min-h-[140px] rounded-3xl border border-forest-border bg-black/20 px-5 py-4 text-white focus:outline-none focus:border-forest-emerald"
            placeholder="For example: structure, questions, pace, checkpoints, progression..."
          />
        </div>

        <div>
          <label className="block text-lg font-medium text-white mb-3">
            What was the most positive aspect of the Free-Form AI Learning Experience for learning this topic?
          </label>
          <textarea
            value={survey.positiveAspectFreeform}
            onChange={(event) => setSurvey((prev) => ({ ...prev, positiveAspectFreeform: event.target.value }))}
            className="w-full min-h-[140px] rounded-3xl border border-forest-border bg-black/20 px-5 py-4 text-white focus:outline-none focus:border-forest-emerald"
            placeholder="For example: responsiveness, control, detail, flexibility..."
          />
        </div>

        <div>
          <h3 className="text-lg font-medium text-white mb-3">
            How confident were you in your ability to explain the first topic you learned with the Guided Diagnostic System before you participated?
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {CONFIDENCE_OPTIONS.map((option) => (
              <label
                key={`guided-before-${option}`}
                className="rounded-2xl border border-forest-border px-4 py-4 flex items-start gap-3 cursor-pointer hover:border-forest-emerald"
              >
                <input
                  type="radio"
                  name="guidedConfidenceBefore"
                  checked={`${survey.guidedConfidenceBefore}` === `${option}`}
                  onChange={() => setSurvey((prev) => ({ ...prev, guidedConfidenceBefore: `${option}` }))}
                  className="mt-1 shrink-0"
                />
                <span className="text-forest-light-gray text-sm leading-6">{CONFIDENCE_LABELS[option]}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <Button type="submit" variant="primary" disabled={isSaving}>
          <span className="flex items-center gap-2">
            {isSaving ? 'Finishing...' : 'Finish MVP session'}
            {isSaving ? <Loader size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          </span>
        </Button>
      </div>
    </form>
  )

  const renderSummary = () => (
    <div className="rounded-[28px] border border-forest-border/60 bg-forest-darker/60 backdrop-blur-xl p-6 md:p-8">
      <p className="text-xs uppercase tracking-[0.35em] text-forest-emerald mb-3">Summary</p>
      <h2 className="text-4xl font-semibold text-white">MVP prototype complete</h2>
      <p className="text-forest-light-gray mt-4 max-w-3xl">
        This participant completed the guided diagnostic flow, timed free-form AI session, assessment, and comparison survey.
      </p>

      <div className="mt-8 grid md:grid-cols-3 gap-4">
        <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
          <p className="text-sm text-forest-gray">Water mastery time</p>
          <p className="text-3xl font-semibold text-white mt-2">{formatDuration(sessionData.waterTimeMs || 0)}</p>
        </div>
        <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
          <p className="text-sm text-forest-gray">Airplane chat budget</p>
          <p className="text-3xl font-semibold text-white mt-2">{formatDuration(sessionData.airplaneTimeBudgetMs || 0)}</p>
        </div>
        <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
          <p className="text-sm text-forest-gray">Quiz score</p>
          <p className="text-3xl font-semibold text-white mt-2">{quizScore}/{totalAssessmentQuestions}</p>
          <p className="mt-2 text-sm text-forest-light-gray">
            Guided: {sessionData.guidedQuizScore || 0}/4 · Free-form: {sessionData.freeformQuizScore || 0}/4
          </p>
        </div>
      </div>

      <div className="mt-8 grid lg:grid-cols-2 gap-6">
        <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
          <h3 className="text-xl font-medium text-white">Node outcomes</h3>
          <div className="mt-4 space-y-3">
            {nodes.map((node, index) => (
              <div key={node.key} className="flex items-center justify-between text-sm text-forest-light-gray">
                <span>{WATER_CURRICULUM[index].title}</span>
                <span className="capitalize text-white">
                  {node.status} · {node.masteryScore || 0}% · {node.attemptCount} attempts · {node.interactionCount} interactions
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
          <h3 className="text-xl font-medium text-white">Survey responses</h3>
        <div className="mt-4 space-y-3 text-sm text-forest-light-gray">
          <p><span className="text-white">Guided confidence before:</span> {survey.guidedConfidenceBefore}</p>
          <p><span className="text-white">Guided confidence after:</span> {survey.guidedConfidenceAfter}</p>
          <p><span className="text-white">Free-form confidence before:</span> {survey.freeformConfidenceBefore}</p>
          <p><span className="text-white">Free-form confidence after:</span> {survey.freeformConfidenceAfter}</p>
          <p><span className="text-white">Clearer system:</span> {survey.clearerSystem}</p>
          <p><span className="text-white">Preferred system:</span> {survey.preferredSystem}</p>
          <p><span className="text-white">Guided positive aspect:</span> {survey.positiveAspectGuided}</p>
          <p><span className="text-white">Free-form positive aspect:</span> {survey.positiveAspectFreeform}</p>
        </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={handleExport}>
          <span className="flex items-center gap-2">
            Export session JSON
            <Download size={18} />
          </span>
        </Button>
        <Button variant="ghost" onClick={handleRestart}>
          <span className="flex items-center gap-2">
            Start a new session
            <RefreshCw size={18} />
          </span>
        </Button>
      </div>
    </div>
  )

  const renderCurrentPhase = () => {
    if (phase === MVP_PHASES.ENTRY) return renderEntry()
    if (phase === MVP_PHASES.GUIDED_WATER) return renderGuidedWater()
    if (phase === MVP_PHASES.FREEFORM_AIRPLANE) return renderAirplaneChat()
    if (phase === MVP_PHASES.ASSESSMENT) return renderAssessment()
    if (phase === MVP_PHASES.SURVEY) return renderSurvey()
    if (phase === MVP_PHASES.SUMMARY) return renderSummary()
    return renderEntry()
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <KnowledgeGraph opacity={0.22} />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.16),_transparent_36%),linear-gradient(180deg,_rgba(5,8,7,0.9),_rgba(5,8,7,1))]" />

      <header className="relative z-10 border-b border-forest-border/30 bg-forest-darker/20 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Logo size="md" clickable />
          <div className="flex items-center gap-4 text-sm text-forest-light-gray">
            <span className="hidden md:inline">Forest MVP prototype</span>
            <Link to="/" className="text-forest-emerald hover:text-forest-teal">Back to home</Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-10">
        {pageError && (
          <div className="mb-6 rounded-2xl border border-red-500/60 bg-red-500/10 px-4 py-3 text-red-100 flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{pageError}</span>
          </div>
        )}

        {!booting && phase !== MVP_PHASES.ENTRY && (
          <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-forest-light-gray">
            <div className="rounded-full border border-forest-border px-4 py-2">
              Participant: <span className="text-white">{sessionData.participantName || 'Unknown'}</span>
            </div>
            <div className="rounded-full border border-forest-border px-4 py-2">
              Phase: <span className="text-white capitalize">{phase.replace('_', ' ')}</span>
            </div>
            {sessionData.waterTimeMs != null && (
              <div className="rounded-full border border-forest-border px-4 py-2">
                Guided time: <span className="text-white">{formatDuration(sessionData.waterTimeMs)}</span>
              </div>
            )}
          </div>
        )}

        {booting ? (
          <div className="min-h-[60vh] flex items-center justify-center">
            <div className="rounded-3xl border border-forest-border/60 bg-forest-darker/60 backdrop-blur-xl px-8 py-6 flex items-center gap-4 text-white">
              <Loader size={22} className="animate-spin text-forest-emerald" />
              Restoring MVP session...
            </div>
          </div>
        ) : (
          renderCurrentPhase()
        )}
      </main>

      {phase === MVP_PHASES.DIAGNOSTIC_NOTICE && renderDiagnosticNotice()}
    </div>
  )
}

export default MVP
