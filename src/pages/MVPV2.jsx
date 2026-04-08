import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader,
  MessageSquare,
  Mic,
  Pause,
  Play,
  Send,
  SkipForward,
  Sparkles,
  TreePine,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import DynamicConceptMap from '../components/sprint4/DynamicConceptMap'
import MicButton from '../components/sprint4/MicButton'
import SkipNodeModal from '../components/sprint4/SkipNodeModal'
import DocUpload from '../components/sprint4/DocUpload'
import MCQPrompt from '../components/sprint4/MCQPrompt'
import Button from '../components/Button'
import Logo from '../components/Logo'
import { useTabVisibility } from '../hooks/useTabVisibility'
import {
  advancePhase,
  getActiveNode,
  getGuidedProgress,
  getTimeRemainingMs,
  skipNode,
  startSession,
  submitEvaluation,
  submitSelfReport,
  submitSurvey,
  submitTurn,
  trackEvents,
} from '../lib/mvpV2Service'
import { BUILTIN_STUDY_ID, SPRINT4_CONDITIONS, SPRINT4_PHASES, NODE_STATES, PROMPT_KINDS } from '../lib/sprint4/constants'

const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const RATING_VALUES = [1, 2, 3, 4, 5]

const SURVEY_FIELDS = [
  { key: 'clarity', label: 'This learning experience made the concept clear.' },
  { key: 'confidence', label: 'I finished with stronger confidence in my understanding.' },
  { key: 'usefulness', label: 'The feedback felt useful rather than generic.' },
]

const ADDITIONAL_SURVEY_FIELDS = [
  {
    key: 'perceivedUnderstanding',
    label: 'I leave this session feeling that I understand the concept well.',
  },
  {
    key: 'mentalEffort',
    label: 'How mentally effortful did this session feel?',
    minLabel: 'Light',
    maxLabel: 'Intense',
  },
  {
    key: 'voiceComfort',
    label: 'How comfortable did you feel using voice input during the session?',
    minLabel: 'Not comfortable',
    maxLabel: 'Very comfortable',
  },
]

const PREFERRED_MODALITY_OPTIONS = ['Text', 'Voice', 'Voice + Text']
const PREFERRED_SYSTEM_OPTIONS = ['Forest', 'Traditional LLM', 'No preference']
const REQUIRED_SURVEY_KEYS = [
  ...SURVEY_FIELDS.map((field) => field.key),
  ...ADDITIONAL_SURVEY_FIELDS.map((field) => field.key),
  'preferredModality',
  'preferredSystem',
]

const createDefaultSurveyState = () => ({
  clarity: '',
  confidence: '',
  usefulness: '',
  perceivedUnderstanding: '',
  mentalEffort: '',
  preferredModality: '',
  voiceComfort: '',
  preferredSystem: '',
  comment: '',
})

const createSurveyPreviewSnapshot = () => {
  const now = new Date().toISOString()
  return {
    studyConfig: {
      id: 'preview-survey-feedback',
      seedConcept: 'AVL tree rotations',
      conceptSummary: 'AVL tree rotations',
      timeBudgetMs: 18 * 60 * 1000,
      evaluationBundle: { prompts: [] },
    },
    session: {
      id: 'preview-survey-feedback',
      studyConfigId: 'preview-survey-feedback',
      condition: SPRINT4_CONDITIONS.GUIDED,
      phase: SPRINT4_PHASES.SURVEY,
      status: 'active',
      currentNodeId: '',
      turnIndex: 7,
      startedAt: now,
      learningCompletedAt: now,
      evaluationCompletedAt: now,
      surveyCompletedAt: null,
      timeBudgetMs: 18 * 60 * 1000,
      graphNodes: [],
      messages: [],
      evaluationScores: [],
      surveyResponse: null,
    },
  }
}

const statusLabel = (status) => {
  if (status === NODE_STATES.MASTERED_INDEPENDENTLY) return 'Mastered'
  if (status === NODE_STATES.MASTERED_WITH_SUPPORT) return 'Mastered (supported)'
  if (status === NODE_STATES.SKIPPED) return 'Skipped'
  if (status === NODE_STATES.PARTIAL) return 'Partial'
  if (status === NODE_STATES.ACTIVE) return 'Active'
  return 'Locked'
}

const callFreeformLLM = async (messages) => {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) throw new Error('OpenAI API key not configured')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4.1-mini', messages, max_tokens: 1024 }),
  })
  if (!res.ok) throw new Error(`LLM request failed: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

const INTAKE_COURSES = [
  'CS 1331 - Intro to OOP',
  'CS 1332 - Data Structures & Algorithms',
  'CS 2050 - Intro to Discrete Math',
  'CS 2110 - Computer Organization & Programming',
  'CS 2340 - Objects & Design',
  'MATH 2551 - Multivariable Calculus',
  'MATH 2552 - Differential Equations',
  'CS 3510 - Design & Analysis of Algorithms',
  'Other',
]

const MVPV2 = () => {
  const [searchParams] = useSearchParams()
  const studyConfigId = searchParams.get('study')?.trim() || BUILTIN_STUDY_ID
  const forceCondition = searchParams.get('condition')?.trim() || ''
  const forceNew = searchParams.get('new') === '1'
  const previewMode = searchParams.get('preview')?.trim() || ''
  const isSurveyPreview = previewMode === 'survey-feedback'
  const [intakeCompleted, setIntakeCompleted] = useState(false)
  const [intakeData, setIntakeData] = useState({ name: '', email: '', course: '' })
  const [intakeErrors, setIntakeErrors] = useState({})
  const [booting, setBooting] = useState(true)
  const [sessionToken, setSessionToken] = useState('')
  const [snapshot, setSnapshot] = useState(null)
  const [input, setInput] = useState('')
  const [pageError, setPageError] = useState('')
  const [loading, setLoading] = useState(false)
  const [timeRemainingMs, setTimeRemainingMs] = useState(0)
  const [evaluationAnswers, setEvaluationAnswers] = useState({})
  const [survey, setSurvey] = useState(createDefaultSurveyState)
  const [skipModalNode, setSkipModalNode] = useState(null)
  const [paused, setPaused] = useState(false)
  const pausedAtRef = useRef(null)
  const [selfReportRating, setSelfReportRating] = useState(0)
  const [selfReportText, setSelfReportText] = useState('')
  const [speechUsedForCurrent, setSpeechUsedForCurrent] = useState(false)

  // Within-subject flow: guided → recap → freeform → evaluation → survey → summary
  const [flowPhase, setFlowPhase] = useState(null) // null | 'guided_recap' | 'freeform'
  const [guidedDurationMs, setGuidedDurationMs] = useState(0)
  const [freeformMessages, setFreeformMessages] = useState([])
  const [freeformInput, setFreeformInput] = useState('')
  const [freeformTimeRemainingMs, setFreeformTimeRemainingMs] = useState(0)
  const [freeformLoading, setFreeformLoading] = useState(false)
  const freeformScrollRef = useRef(null)

  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const sessionTokenRef = useRef(sessionToken)
  sessionTokenRef.current = sessionToken
  const chatScrollRef = useRef(null)

  const { flushEvents } = useTabVisibility()

  const handleIntakeSubmit = () => {
    const errors = {}
    if (!intakeData.name.trim()) errors.name = 'Name is required'
    if (!intakeData.email.trim()) errors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(intakeData.email.trim())) errors.email = 'Enter a valid email'
    if (!intakeData.course) errors.course = 'Please select a course'
    if (Object.keys(errors).length) { setIntakeErrors(errors); return }
    setIntakeErrors({})
    setIntakeCompleted(true)
  }

  useEffect(() => {
    if (isSurveyPreview) {
      setIntakeCompleted(true)
    }
  }, [isSurveyPreview])

  useEffect(() => {
    if (!intakeCompleted) return
    let cancelled = false
    const bootstrap = async () => {
      if (isSurveyPreview) {
        setSessionToken('__preview__')
        setSnapshot(createSurveyPreviewSnapshot())
        setTimeRemainingMs(0)
        setSurvey(createDefaultSurveyState())
        setBooting(false)
        return
      }
      if (!studyConfigId) { setBooting(false); return }
      try {
        const started = await startSession({ studyConfigId, forceCondition, forceNew })
        if (cancelled) return
        setSessionToken(started.sessionToken)
        setSnapshot(started.snapshot)
        setTimeRemainingMs(getTimeRemainingMs(started.snapshot.session))
      } catch (error) {
        if (!cancelled) setPageError(error.message)
      } finally {
        if (!cancelled) setBooting(false)
      }
    }
    bootstrap()
    return () => { cancelled = true }
  }, [intakeCompleted, forceCondition, forceNew, isSurveyPreview, studyConfigId])

  useEffect(() => {
    if (!snapshot?.session || snapshot.session.phase !== SPRINT4_PHASES.LEARNING) return undefined
    if (flowPhase) return undefined
    if (paused) {
      if (!pausedAtRef.current) pausedAtRef.current = Date.now()
      return undefined
    }
    if (pausedAtRef.current) {
      const pausedFor = Date.now() - pausedAtRef.current
      pausedAtRef.current = null
      setSnapshot((prev) => {
        if (!prev?.session?.startedAt) return prev
        return {
          ...prev,
          session: {
            ...prev.session,
            startedAt: new Date(new Date(prev.session.startedAt).getTime() + pausedFor).toISOString(),
          },
        }
      })
    }
    setTimeRemainingMs(getTimeRemainingMs(snapshot.session))
    const timer = window.setInterval(() => {
      const current = snapshotRef.current
      if (!current?.session) return
      setTimeRemainingMs(getTimeRemainingMs(current.session))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [snapshot?.session?.id, snapshot?.session?.phase, paused, flowPhase])

  useEffect(() => {
    if (flowPhase) return
    const current = snapshotRef.current
    if (!current?.session || current.session.phase !== SPRINT4_PHASES.LEARNING) return
    if (timeRemainingMs > 0) return
    const budget = current.session.timeBudgetMs || 0
    setGuidedDurationMs(budget)
    setFlowPhase('guided_recap')
  }, [timeRemainingMs, flowPhase])

  useEffect(() => {
    if (flowPhase !== 'freeform') return undefined
    if (freeformTimeRemainingMs <= 0) return undefined
    const timer = window.setInterval(() => {
      setFreeformTimeRemainingMs((prev) => Math.max(0, prev - 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [flowPhase, freeformTimeRemainingMs])

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [snapshot?.session?.messages?.length])

  useEffect(() => {
    if (!sessionToken || !snapshot?.session || snapshot.session.phase !== SPRINT4_PHASES.LEARNING) return undefined
    const interval = window.setInterval(() => {
      const events = flushEvents()
      if (events.length > 0) {
        trackEvents({ token: sessionToken, events }).catch(() => {})
      }
    }, 30000)
    return () => window.clearInterval(interval)
  }, [sessionToken, snapshot?.session?.phase, flushEvents])

  const isGuided = snapshot?.session?.condition === SPRINT4_CONDITIONS.GUIDED
  const activeNode = useMemo(() => getActiveNode(snapshot), [snapshot])
  const progress = useMemo(() => getGuidedProgress(snapshot), [snapshot])

  const visibleMessages = useMemo(() => {
    const messages = (snapshot?.session?.messages || []).filter((m) => m.visibleToStudent !== false)
    if (!isGuided || !activeNode) return messages
    return messages.filter((m) => m.nodeId === activeNode.id || !m.nodeId)
  }, [snapshot, isGuided, activeNode])

  const evaluationPrompts = snapshot?.studyConfig?.evaluationBundle?.prompts || []
  const evaluationScores = snapshot?.session?.evaluationScores || []
  const evaluationSummary = snapshot?.session?.evaluationSummary || ''

  const isSpeechEncouraged = isGuided && activeNode && activeNode.promptKind === PROMPT_KINDS.ASSESS && (activeNode.attempts || 0) === 0

  const handleSubmitTurn = async (helpRequested = false, overrideMessage) => {
    const message = overrideMessage ?? input
    if (!sessionToken || !snapshot?.session || loading) return
    if (!helpRequested && !message.trim()) return
    setLoading(true)
    setPageError('')
    try {
      const result = await submitTurn({
        token: sessionToken,
        activeNodeId: activeNode?.id || snapshot.session.currentNodeId,
        userMessage: message.trim(),
        helpRequested,
        metadata: { speechBased: speechUsedForCurrent },
      })
      setSnapshot(result.snapshot)
      setInput('')
      setSpeechUsedForCurrent(false)
      setTimeRemainingMs(result.timeRemainingMs)
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleNodeSelect = (nodeId) => {
    if (!snapshot?.session) return
    const node = (snapshot.session.graphNodes || []).find((n) => n.id === nodeId)
    if (!node || node.status === NODE_STATES.LOCKED) return
    setSnapshot((prev) => ({
      ...prev,
      session: { ...prev.session, currentNodeId: nodeId },
    }))
  }

  const handleMCQAnswer = (selection) => {
    const answerText = selection.isCorrect
      ? `I selected: "${selection.selectedText}" (correct)`
      : `I selected: "${selection.selectedText}" — I thought this was right but I see it's related to the misconception: ${selection.misconceptionLabel || 'unknown'}`
    void handleSubmitTurn(false, answerText)
  }

  const handleSkipConfirm = async (reason) => {
    if (!sessionToken || !skipModalNode) return
    setPageError('')
    try {
      const result = await skipNode({ token: sessionToken, nodeId: skipModalNode.id, reason })
      setSnapshot(result.snapshot)
    } catch (error) {
      setPageError(error.message)
    }
    setSkipModalNode(null)
  }

  const handleTranscript = (text) => {
    if (text) {
      setInput((prev) => (prev ? `${prev} ${text}` : text))
      setSpeechUsedForCurrent(true)
    }
  }

  const handleSubmitSelfReport = async () => {
    if (!sessionToken || !selfReportRating) return
    setLoading(true)
    setPageError('')
    try {
      const result = await submitSelfReport({ token: sessionToken, rating: selfReportRating, text: selfReportText })
      setSnapshot(result.snapshot)
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitEvaluation = async (event) => {
    event.preventDefault()
    if (!sessionToken || !snapshot) return
    const answers = evaluationPrompts.map((p) => ({ promptId: p.id, answer: (evaluationAnswers[p.id] || '').trim() }))
    if (answers.some((a) => !a.answer)) { setPageError('Answer all evaluation prompts before continuing.'); return }
    setLoading(true)
    setPageError('')
    try {
      const next = await submitEvaluation({ token: sessionToken, answers })
      setSnapshot(next.snapshot)
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFinishGuided = () => {
    const session = snapshotRef.current?.session
    const budget = session?.timeBudgetMs || 0
    const remaining = getTimeRemainingMs(session)
    setGuidedDurationMs(Math.max(budget - remaining, 60000))
    setFlowPhase('guided_recap')
  }

  const handleStartFreeform = () => {
    const seedConcept = snapshot?.studyConfig?.seedConcept || 'this concept'
    setFreeformMessages([
      {
        id: 'system-init',
        role: 'assistant',
        content: `You're now in free-form mode. Ask me anything about **${seedConcept}** — I'll do my best to help you learn. There's no structure here; just chat naturally.`,
      },
    ])
    setFreeformInput('')
    setFreeformTimeRemainingMs(guidedDurationMs)
    setFlowPhase('freeform')
  }

  const handleFreeformSend = async () => {
    const text = freeformInput.trim()
    if (!text || freeformLoading) return
    const seedConcept = snapshot?.studyConfig?.seedConcept || 'this concept'
    const userMsg = { id: `user-${Date.now()}`, role: 'user', content: text }
    const updated = [...freeformMessages, userMsg]
    setFreeformMessages(updated)
    setFreeformInput('')
    setFreeformLoading(true)
    try {
      const apiMessages = [
        { role: 'system', content: `You are a helpful tutor for the concept "${seedConcept}". Teach conversationally. Use short sections and concrete examples. Stay focused on the seed concept unless the learner explicitly changes scope.` },
        ...updated.filter((m) => m.role !== 'system' && m.id !== 'system-init').map((m) => ({ role: m.role, content: m.content })),
      ]
      const reply = await callFreeformLLM(apiMessages)
      setFreeformMessages((prev) => [...prev, { id: `assistant-${Date.now()}`, role: 'assistant', content: reply }])
    } catch (error) {
      setPageError(error.message)
    } finally {
      setFreeformLoading(false)
    }
  }

  const handleFinishFreeform = async () => {
    setLoading(true)
    setPageError('')
    try {
      const next = await advancePhase({ token: sessionToken, phase: SPRINT4_PHASES.EVALUATION })
      setSnapshot(next.snapshot)
      setFlowPhase(null)
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (freeformScrollRef.current) freeformScrollRef.current.scrollTop = freeformScrollRef.current.scrollHeight
  }, [freeformMessages.length])

  useEffect(() => {
    if (flowPhase !== 'freeform' || freeformTimeRemainingMs > 0) return
    void handleFinishFreeform()
  }, [flowPhase, freeformTimeRemainingMs])

  const handleSubmitSurvey = async (event) => {
    event.preventDefault()
    if (!sessionToken) return
    if (REQUIRED_SURVEY_KEYS.some((key) => !survey[key])) { setPageError('Complete the short survey before finishing.'); return }
    setLoading(true)
    setPageError('')
    try {
      if (isSurveyPreview) {
        const completedAt = new Date().toISOString()
        setSnapshot((prev) => (prev ? {
          ...prev,
          session: {
            ...prev.session,
            phase: SPRINT4_PHASES.SUMMARY,
            status: 'completed',
            surveyCompletedAt: completedAt,
            surveyResponse: { ...survey },
          },
        } : prev))
        return
      }
      const next = await submitSurvey({ token: sessionToken, survey })
      setSnapshot(next.snapshot)
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (!intakeCompleted) {
    const updateField = (key, value) => {
      setIntakeData((prev) => ({ ...prev, [key]: value }))
      setIntakeErrors((prev) => { const next = { ...prev }; delete next[key]; return next })
    }
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker">
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-xl px-5 pb-14 pt-8">
            <div className="flex items-center gap-3 mb-10">
              <Logo variant="full" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-forest-gray">Sprint 4</span>
            </div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-xl border border-forest-border bg-forest-card/40 p-6">
                <p className="text-[10px] uppercase tracking-[0.25em] text-forest-emerald font-semibold">Welcome</p>
                <h1 className="mt-3 text-2xl font-semibold text-white">Before we begin</h1>
                <p className="mt-2 text-sm text-forest-light-gray leading-relaxed">
                  Please provide your details so we can personalize the session and track your progress.
                </p>

                <div className="mt-6 space-y-5">
                  <div>
                    <label htmlFor="intake-name" className="block text-sm font-medium text-white mb-1.5">Full name</label>
                    <input
                      id="intake-name"
                      type="text"
                      value={intakeData.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      placeholder="Jane Doe"
                      className={`w-full rounded-xl border ${intakeErrors.name ? 'border-red-500/70' : 'border-forest-border'} bg-forest-darker/60 px-4 py-3 text-sm text-white outline-none transition focus:border-forest-emerald placeholder:text-forest-gray`}
                    />
                    {intakeErrors.name && <p className="mt-1 text-xs text-red-400">{intakeErrors.name}</p>}
                  </div>

                  <div>
                    <label htmlFor="intake-email" className="block text-sm font-medium text-white mb-1.5">Email address</label>
                    <input
                      id="intake-email"
                      type="email"
                      value={intakeData.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      placeholder="jdoe3@gatech.edu"
                      className={`w-full rounded-xl border ${intakeErrors.email ? 'border-red-500/70' : 'border-forest-border'} bg-forest-darker/60 px-4 py-3 text-sm text-white outline-none transition focus:border-forest-emerald placeholder:text-forest-gray`}
                    />
                    {intakeErrors.email && <p className="mt-1 text-xs text-red-400">{intakeErrors.email}</p>}
                  </div>

                  <div>
                    <label htmlFor="intake-course" className="block text-sm font-medium text-white mb-1.5">Current course</label>
                    <select
                      id="intake-course"
                      value={intakeData.course}
                      onChange={(e) => updateField('course', e.target.value)}
                      className={`w-full rounded-xl border ${intakeErrors.course ? 'border-red-500/70' : 'border-forest-border'} bg-forest-darker/60 px-4 py-3 text-sm outline-none transition focus:border-forest-emerald ${intakeData.course ? 'text-white' : 'text-forest-gray'}`}
                    >
                      <option value="" disabled>Select your course</option>
                      {INTAKE_COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    {intakeErrors.course && <p className="mt-1 text-xs text-red-400">{intakeErrors.course}</p>}
                  </div>
                </div>

                <div className="mt-8">
                  <Button onClick={handleIntakeSubmit} fullWidth>
                    <span className="flex items-center justify-center gap-2">
                      <ArrowRight size={16} />
                      Continue
                    </span>
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
        {pageError && <ErrorToast message={pageError} onDismiss={() => setPageError('')} />}
      </div>
    )
  }

  if (booting) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader size={32} className="animate-spin text-forest-emerald" />
          <p className="text-forest-light-gray text-sm">Initializing session...</p>
        </div>
      </div>
    )
  }

  if (snapshot?.session?.phase === SPRINT4_PHASES.SELF_REPORT) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker">
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-2xl px-5 pb-14 pt-8">
            <div className="flex items-center gap-3 mb-8">
              <Logo variant="full" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-forest-gray">Sprint 4</span>
            </div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-xl border border-forest-border bg-forest-card/40 p-6">
                <p className="text-[10px] uppercase tracking-[0.25em] text-forest-emerald font-semibold">Before we begin</p>
                <h1 className="mt-3 text-2xl font-semibold text-white">Self-assessment</h1>
                <p className="mt-3 text-sm text-forest-light-gray">
                  You'll be studying: <span className="font-medium text-white">{snapshot.studyConfig?.seedConcept}</span>
                </p>

                <div className="mt-6">
                  <p className="text-sm text-white mb-3">How well do you understand this concept right now?</p>
                  <div className="flex gap-2">
                    {RATING_VALUES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSelfReportRating(value)}
                        className={`rounded-lg border px-5 py-2.5 text-sm transition ${
                          selfReportRating === value
                            ? 'border-forest-emerald/60 bg-forest-emerald/15 text-white'
                            : 'border-forest-border bg-forest-card/50 text-forest-light-gray hover:border-forest-emerald/30'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-[10px] text-forest-gray mt-1.5 px-1">
                    <span>No idea</span>
                    <span>Expert</span>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-sm text-white mb-2">Briefly describe what you already know (optional)</p>
                  <textarea
                    value={selfReportText}
                    onChange={(e) => setSelfReportText(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-forest-border bg-forest-darker/60 px-4 py-3 text-sm text-white outline-none transition focus:border-forest-emerald"
                    placeholder="I know that..."
                  />
                </div>

                <div className="mt-6">
                  <Button onClick={handleSubmitSelfReport} disabled={!selfReportRating || loading}>
                    <span className="flex items-center gap-2">
                      {loading ? <Loader size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                      Begin learning
                    </span>
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
        {pageError && <ErrorToast message={pageError} onDismiss={() => setPageError('')} />}
      </div>
    )
  }

  if (!flowPhase && snapshot?.session?.phase === SPRINT4_PHASES.LEARNING) {
    const lastMessage = visibleMessages[visibleMessages.length - 1]
    const mcqData = lastMessage?.metadata?.mcq

    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker flex flex-col">
        <div className="flex-shrink-0 h-12 border-b border-forest-border bg-forest-card/50 flex items-center justify-between px-4 z-20">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <Logo variant="full" />
            </Link>
            <span className="text-[10px] uppercase tracking-[0.25em] text-forest-gray hidden md:inline">Sprint 4</span>
          </div>

          <div className="flex items-center gap-2">
            {isGuided && (
              <span className="rounded-lg bg-forest-card border border-forest-border px-3 py-1 text-xs text-forest-light-gray">
                Mastered {progress.mastered}/{progress.total}
              </span>
            )}
            <span className={`rounded-lg border px-3 py-1 text-xs font-medium flex items-center gap-1.5 ${
              paused
                ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300'
                : timeRemainingMs < 60000
                  ? 'border-red-500/50 bg-red-500/10 text-red-300'
                  : 'border-forest-border bg-forest-card text-forest-light-gray'
            }`}>
              <Clock3 size={13} />
              {paused ? 'Paused' : formatDuration(timeRemainingMs)}
            </span>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className={`px-2 py-1 rounded-lg text-xs border transition-colors flex items-center gap-1 ${
                paused
                  ? 'border-forest-emerald/50 text-forest-emerald hover:bg-forest-emerald/10'
                  : 'border-forest-border text-forest-light-gray hover:text-yellow-300 hover:border-yellow-500/50'
              }`}
              title={paused ? 'Resume timer' : 'Pause timer'}
            >
              {paused ? <Play size={12} /> : <Pause size={12} />}
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={handleFinishGuided}
              className="px-3 py-1 rounded-lg text-xs border border-forest-border text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors"
            >
              Finish guided
            </button>
          </div>
        </div>

        <div className={`flex-1 min-h-0 flex ${isGuided ? 'flex-col lg:flex-row' : 'flex-col'}`}>
          {isGuided && (
            <div className="lg:w-[48%] xl:w-[45%] h-[40vh] lg:h-full border-b lg:border-b-0 lg:border-r border-forest-border">
              <DynamicConceptMap
                nodes={snapshot.session.graphNodes}
                activeNodeId={snapshot.session.currentNodeId}
                onSelect={handleNodeSelect}
              />
            </div>
          )}

          <div className="flex-1 min-h-0 flex flex-col">
            {isGuided && activeNode && (() => {
              const bs = activeNode.bestScores || {}
              const dims = [
                { key: 'Expl', val: bs.explanation || 0, goal: 2 },
                { key: 'Causal', val: bs.causalReasoning || 0, goal: 2 },
                { key: 'Transfer', val: bs.transfer || 0, goal: 1 },
                { key: 'Recall', val: activeNode.successfulRecallCount || 0, goal: 1 },
              ]
              return (
                <div className="flex-shrink-0 border-b border-forest-border bg-forest-card/30 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-forest-emerald font-semibold">Active Focus</p>
                      <h2 className="text-lg font-semibold text-white truncate mt-0.5">{activeNode.title}</h2>
                    </div>
                    <span className="rounded-md bg-forest-card border border-forest-border px-2 py-0.5 text-[11px] text-forest-light-gray flex-shrink-0">
                      {statusLabel(activeNode.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {dims.map((d) => (
                      <div key={d.key} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-forest-gray">{d.key}</span>
                        <span className={`text-[11px] font-medium tabular-nums ${
                          d.val >= d.goal ? 'text-forest-emerald' : 'text-forest-light-gray'
                        }`}>
                          {d.val}/{d.goal}
                        </span>
                      </div>
                    ))}
                  </div>
                  {activeNode.summary && (
                    <p className="text-xs text-forest-gray mt-1.5 line-clamp-2">{activeNode.summary}</p>
                  )}
                </div>
              )
            })()}

            {!isGuided && (
              <div className="flex-shrink-0 border-b border-forest-border bg-forest-card/30 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-forest-emerald font-semibold">Free-form Learning</p>
                <h2 className="text-lg font-semibold text-white mt-0.5">{snapshot.studyConfig.seedConcept}</h2>
              </div>
            )}

            {isSpeechEncouraged && (
              <div className="flex-shrink-0 bg-forest-emerald/5 border-b border-forest-emerald/20 px-4 py-2.5 flex items-center gap-2">
                <Mic size={14} className="text-forest-emerald animate-pulse" />
                <p className="text-xs text-forest-emerald">
                  Try explaining this concept in your own words using the microphone — speaking helps you think!
                </p>
              </div>
            )}

            <div ref={chatScrollRef} className="flex-1 overflow-y-auto min-h-0">
              <div className="p-4 space-y-3">
                {visibleMessages.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-16 h-16 mb-4 rounded-full bg-forest-card border border-forest-border flex items-center justify-center">
                      <Send size={24} className="text-forest-emerald/50" />
                    </div>
                    <p className="text-forest-light-gray mb-1">Start the conversation</p>
                    <p className="text-sm text-forest-gray">Send your first response below.</p>
                  </div>
                )}

                {visibleMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-xl px-4 py-3 animate-fade-in-up ${
                      message.role === 'assistant'
                        ? 'bg-forest-card/80 border border-forest-border'
                        : 'bg-forest-emerald/10 border border-forest-emerald/30'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] mb-1.5 font-semibold text-forest-emerald/70">
                      {message.role === 'assistant' ? 'Forest' : 'You'}
                    </p>
                    <div className="prose prose-invert max-w-none text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}

                {mcqData && !loading && (
                  <MCQPrompt mcq={mcqData} onSelect={handleMCQAnswer} />
                )}

                <AnimatePresence>
                  {loading && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="rounded-xl px-4 py-3 bg-forest-card/80 flex items-center gap-1.5 w-fit"
                    >
                      <span className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-forest-emerald/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-forest-emerald/80 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-forest-emerald/80 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                      <span className="text-xs text-forest-gray">Thinking...</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="flex-shrink-0 border-t border-forest-border bg-forest-card/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <DocUpload token={sessionToken} onUploadComplete={(r) => setSnapshot(r.snapshot)} disabled={loading} />
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); void handleSubmitTurn(false) }}
                className="flex gap-2"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSubmitTurn(false)
                    }
                  }}
                  rows={2}
                  disabled={loading}
                  placeholder={isGuided
                    ? 'Explain in your own words, answer the prompt, or refine your reasoning...'
                    : `Ask about ${snapshot.studyConfig.seedConcept}...`}
                  className="flex-1 px-4 py-2.5 bg-forest-darker border border-forest-border rounded-xl text-white text-sm placeholder-forest-gray focus:outline-none focus:border-forest-emerald transition-colors disabled:opacity-60 resize-none"
                />
                <div className="flex flex-col gap-1.5">
                  <MicButton
                    onTranscript={handleTranscript}
                    disabled={loading}
                    highlight={isSpeechEncouraged}
                  />
                  {isGuided && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleSubmitTurn(true)}
                        disabled={loading}
                        className="px-3 py-2 rounded-xl text-xs border border-forest-border bg-forest-card text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Sparkles size={13} />
                        Stuck
                      </button>
                      {activeNode && !['mastered_independently', 'mastered_with_support', 'skipped'].includes(activeNode.status) && (
                        <button
                          type="button"
                          onClick={() => setSkipModalNode(activeNode)}
                          disabled={loading}
                          className="px-3 py-2 rounded-xl text-xs border border-forest-border bg-forest-card text-forest-light-gray hover:text-amber-400 hover:border-amber-400/50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <SkipForward size={13} />
                          Skip
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="px-4 py-2 bg-forest-emerald text-forest-darker rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm font-medium"
                  >
                    {loading ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                    Send
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {skipModalNode && (
          <SkipNodeModal
            nodeTitle={skipModalNode.title}
            onConfirm={handleSkipConfirm}
            onCancel={() => setSkipModalNode(null)}
          />
        )}

        {pageError && <ErrorToast message={pageError} onDismiss={() => setPageError('')} />}
      </div>
    )
  }

  if (flowPhase === 'guided_recap') {
    const nodes = snapshot?.session?.graphNodes || []
    const mastered = nodes.filter((n) => ['mastered_independently', 'mastered_with_support'].includes(n.status)).length
    const skipped = nodes.filter((n) => n.status === 'skipped').length
    const totalTurns = snapshot?.session?.turnIndex || 0
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker">
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-3xl px-5 pb-14 pt-8">
            <div className="flex items-center gap-3 mb-8">
              <Logo variant="full" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-forest-gray">Guided Session Complete</span>
            </div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-xl border border-forest-border bg-forest-card/40 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-forest-emerald/15 border border-forest-emerald/30">
                    <TreePine size={20} className="text-forest-emerald" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-forest-emerald font-semibold">Phase 1 Complete</p>
                    <h1 className="text-2xl font-semibold text-white">Guided learning recap</h1>
                  </div>
                </div>
                <p className="mt-3 text-sm text-forest-light-gray">
                  You explored <span className="text-white font-medium">{snapshot?.studyConfig?.seedConcept}</span> through Forest's guided diagnostic flow.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-forest-border bg-forest-darker/50 p-3 text-center">
                    <p className="text-2xl font-semibold text-forest-emerald">{mastered}</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-forest-gray mt-1">Mastered</p>
                  </div>
                  <div className="rounded-lg border border-forest-border bg-forest-darker/50 p-3 text-center">
                    <p className="text-2xl font-semibold text-white">{nodes.length}</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-forest-gray mt-1">Total Nodes</p>
                  </div>
                  <div className="rounded-lg border border-forest-border bg-forest-darker/50 p-3 text-center">
                    <p className="text-2xl font-semibold text-white">{totalTurns}</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-forest-gray mt-1">Interactions</p>
                  </div>
                  <div className="rounded-lg border border-forest-border bg-forest-darker/50 p-3 text-center">
                    <p className="text-2xl font-semibold text-white">{skipped}</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-forest-gray mt-1">Skipped</p>
                  </div>
                </div>

                {nodes.length > 0 && (
                  <div className="mt-6 h-[300px] rounded-xl overflow-hidden border border-forest-border">
                    <DynamicConceptMap nodes={nodes} activeNodeId={snapshot?.session?.currentNodeId} />
                  </div>
                )}

                <div className="mt-6 rounded-xl border border-forest-emerald/20 bg-forest-emerald/5 p-4">
                  <div className="flex items-start gap-3">
                    <MessageSquare size={18} className="text-forest-emerald mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-white">Next: free-form learning</p>
                      <p className="mt-1 text-sm text-forest-light-gray">
                        You'll now learn the same concept using a traditional LLM chat — no structure, no nodes, just conversation.
                        You'll have <span className="text-white font-medium">{formatDuration(guidedDurationMs)}</span> (the same time you spent in guided mode).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <Button onClick={handleStartFreeform} fullWidth>
                    <span className="flex items-center justify-center gap-2">
                      <ArrowRight size={16} />
                      Continue to free-form learning
                    </span>
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
        {pageError && <ErrorToast message={pageError} onDismiss={() => setPageError('')} />}
      </div>
    )
  }

  if (flowPhase === 'freeform') {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker flex flex-col">
        <div className="flex-shrink-0 h-12 border-b border-forest-border bg-forest-card/50 flex items-center justify-between px-4 z-20">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <Logo variant="full" />
            </Link>
            <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.2em] text-amber-300 font-semibold">
              Free-form
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-lg border px-3 py-1 text-xs font-medium flex items-center gap-1.5 ${
              freeformTimeRemainingMs < 60000
                ? 'border-red-500/50 bg-red-500/10 text-red-300'
                : 'border-forest-border bg-forest-card text-forest-light-gray'
            }`}>
              <Clock3 size={13} />
              {formatDuration(freeformTimeRemainingMs)}
            </span>
            <button
              type="button"
              onClick={handleFinishFreeform}
              disabled={loading}
              className="px-3 py-1 rounded-lg text-xs border border-forest-border text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors disabled:opacity-50"
            >
              Finish
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-shrink-0 border-b border-forest-border bg-forest-card/30 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400 font-semibold">Free-form Learning</p>
            <h2 className="text-lg font-semibold text-white mt-0.5">{snapshot?.studyConfig?.seedConcept}</h2>
            <p className="text-xs text-forest-gray mt-1">Chat freely — ask questions, explore ideas, learn at your own pace.</p>
          </div>

          <div ref={freeformScrollRef} className="flex-1 overflow-y-auto min-h-0">
            <div className="p-4 space-y-3">
              {freeformMessages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl px-4 py-3 animate-fade-in-up ${
                    message.role === 'assistant'
                      ? 'bg-forest-card/80 border border-forest-border'
                      : 'bg-amber-500/10 border border-amber-500/30'
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-[0.2em] mb-1.5 font-semibold text-amber-400/70">
                    {message.role === 'assistant' ? 'LLM' : 'You'}
                  </p>
                  <div className="prose prose-invert max-w-none text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                </div>
              ))}

              <AnimatePresence>
                {freeformLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="rounded-xl px-4 py-3 bg-forest-card/80 flex items-center gap-1.5 w-fit"
                  >
                    <span className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-amber-400/80 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-amber-400/80 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    <span className="text-xs text-forest-gray">Thinking...</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex-shrink-0 border-t border-forest-border bg-forest-card/50 p-3">
            <form
              onSubmit={(e) => { e.preventDefault(); void handleFreeformSend() }}
              className="flex gap-2"
            >
              <textarea
                value={freeformInput}
                onChange={(e) => setFreeformInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleFreeformSend() }
                }}
                rows={2}
                disabled={freeformLoading}
                placeholder={`Ask about ${snapshot?.studyConfig?.seedConcept || 'the concept'}...`}
                className="flex-1 px-4 py-2.5 bg-forest-darker border border-forest-border rounded-xl text-white text-sm placeholder-forest-gray focus:outline-none focus:border-amber-400 transition-colors disabled:opacity-60 resize-none"
              />
              <button
                type="submit"
                disabled={freeformLoading || !freeformInput.trim()}
                className="px-4 py-2 bg-amber-500 text-forest-darker rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm font-medium self-end"
              >
                {freeformLoading ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                Send
              </button>
            </form>
          </div>
        </div>

        {pageError && <ErrorToast message={pageError} onDismiss={() => setPageError('')} />}
      </div>
    )
  }

  if (snapshot?.session?.phase === SPRINT4_PHASES.EVALUATION) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker">
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-3xl px-5 pb-14 pt-8">
            <div className="flex items-center gap-3 mb-8">
              <Logo variant="full" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-forest-gray">Sprint 4 Evaluation</span>
            </div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-xl border border-forest-border bg-forest-card/40 p-6">
                <p className="text-[10px] uppercase tracking-[0.25em] text-forest-emerald font-semibold">External Evaluation</p>
                <h1 className="mt-3 text-2xl font-semibold text-white">Show what you understand</h1>
                <p className="mt-3 text-sm text-forest-light-gray">
                  This post-test is scored independently. Answer all three prompts in your own words.
                </p>

                <form className="mt-6 space-y-5" onSubmit={handleSubmitEvaluation}>
                  {evaluationPrompts.map((prompt) => (
                    <div key={prompt.id} className="rounded-xl border border-forest-border bg-forest-darker/60 p-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-forest-emerald/70 font-semibold">{prompt.title}</p>
                      <p className="mt-2 text-sm text-white">{prompt.prompt}</p>
                      <textarea
                        value={evaluationAnswers[prompt.id] || ''}
                        onChange={(e) => setEvaluationAnswers((prev) => ({ ...prev, [prompt.id]: e.target.value }))}
                        rows={4}
                        className="mt-3 w-full rounded-xl border border-forest-border bg-forest-card/50 px-4 py-3 text-sm text-white outline-none transition focus:border-forest-emerald"
                        placeholder="Write your answer here."
                      />
                    </div>
                  ))}

                  <Button type="submit" disabled={loading}>
                    <span className="flex items-center gap-2">
                      {loading ? <Loader size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                      Submit evaluation
                    </span>
                  </Button>
                </form>
              </div>
            </motion.div>
          </div>
        </div>
        {pageError && <ErrorToast message={pageError} onDismiss={() => setPageError('')} />}
      </div>
    )
  }

  if (snapshot?.session?.phase === SPRINT4_PHASES.SURVEY) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker">
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-2xl px-5 pb-14 pt-8">
            <div className="flex items-center gap-3 mb-8">
              <Logo variant="full" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-forest-gray">Sprint 4 Survey</span>
            </div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-xl border border-forest-border bg-forest-card/40 p-6">
                <p className="text-[10px] uppercase tracking-[0.25em] text-forest-emerald font-semibold">Session Survey</p>
                <h1 className="mt-3 text-2xl font-semibold text-white">Short reflection</h1>

                <form className="mt-6 space-y-5" onSubmit={handleSubmitSurvey}>
                  {isSurveyPreview && (
                    <div className="rounded-xl border border-forest-emerald/25 bg-forest-emerald/10 px-4 py-3 text-sm text-forest-light-gray">
                      Preview mode: this shows the expanded Sprint 4 feedback form with the additional study columns. Finishing the form stays local to this browser session.
                    </div>
                  )}

                  {SURVEY_FIELDS.map((field) => (
                    <div key={field.key}>
                      <p className="mb-2 text-sm text-white">{field.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {RATING_VALUES.map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setSurvey((prev) => ({ ...prev, [field.key]: `${value}` }))}
                            className={`rounded-lg border px-4 py-2 text-sm transition ${
                              survey[field.key] === `${value}`
                                ? 'border-forest-emerald/60 bg-forest-emerald/15 text-white'
                                : 'border-forest-border bg-forest-card/50 text-forest-light-gray hover:border-forest-emerald/30'
                            }`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {ADDITIONAL_SURVEY_FIELDS.map((field) => (
                    <div key={field.key}>
                      <p className="mb-2 text-sm text-white">{field.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {RATING_VALUES.map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setSurvey((prev) => ({ ...prev, [field.key]: `${value}` }))}
                            className={`rounded-lg border px-4 py-2 text-sm transition ${
                              survey[field.key] === `${value}`
                                ? 'border-forest-emerald/60 bg-forest-emerald/15 text-white'
                                : 'border-forest-border bg-forest-card/50 text-forest-light-gray hover:border-forest-emerald/30'
                            }`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                      {(field.minLabel || field.maxLabel) && (
                        <div className="mt-1.5 flex justify-between px-1 text-[10px] text-forest-gray">
                          <span>{field.minLabel || ''}</span>
                          <span>{field.maxLabel || ''}</span>
                        </div>
                      )}
                    </div>
                  ))}

                  <div>
                    <p className="mb-2 text-sm text-white">Which modality felt best for this session?</p>
                    <div className="grid gap-2 md:grid-cols-3">
                      {PREFERRED_MODALITY_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setSurvey((prev) => ({ ...prev, preferredModality: option }))}
                          className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                            survey.preferredModality === option
                              ? 'border-forest-emerald/60 bg-forest-emerald/15 text-white'
                              : 'border-forest-border bg-forest-card/50 text-forest-light-gray hover:border-forest-emerald/30'
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm text-white">If you had to keep learning with one system, which would you prefer?</p>
                    <div className="grid gap-2 md:grid-cols-3">
                      {PREFERRED_SYSTEM_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setSurvey((prev) => ({ ...prev, preferredSystem: option }))}
                          className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                            survey.preferredSystem === option
                              ? 'border-forest-emerald/60 bg-forest-emerald/15 text-white'
                              : 'border-forest-border bg-forest-card/50 text-forest-light-gray hover:border-forest-emerald/30'
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-sm text-white">Anything notable about the experience?</p>
                    <textarea
                      value={survey.comment}
                      onChange={(e) => setSurvey((prev) => ({ ...prev, comment: e.target.value }))}
                      rows={3}
                      className="w-full rounded-xl border border-forest-border bg-forest-darker/60 px-4 py-3 text-sm text-white outline-none transition focus:border-forest-emerald"
                      placeholder="Optional comment."
                    />
                  </div>

                  <Button type="submit" disabled={loading}>
                    <span className="flex items-center gap-2">
                      {loading ? <Loader size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      Finish session
                    </span>
                  </Button>
                </form>
              </div>
            </motion.div>
          </div>
        </div>
        {pageError && <ErrorToast message={pageError} onDismiss={() => setPageError('')} />}
      </div>
    )
  }

  if (snapshot?.session?.phase === SPRINT4_PHASES.SUMMARY) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker">
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-4xl px-5 pb-14 pt-8">
            <div className="flex items-center gap-3 mb-8">
              <Logo variant="full" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-forest-gray">Sprint 4 Complete</span>
            </div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-xl border border-forest-border bg-forest-card/40 p-6">
                <p className="text-[10px] uppercase tracking-[0.25em] text-forest-emerald font-semibold">Summary</p>
                <h1 className="mt-3 text-2xl font-semibold text-white">Session complete</h1>
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  <span className="rounded-lg border border-forest-border bg-forest-card px-3 py-1 text-forest-light-gray">
                    {snapshot.studyConfig.seedConcept}
                  </span>
                  <span className="rounded-lg border border-forest-border bg-forest-card px-3 py-1 text-forest-light-gray">
                    {isGuided ? 'Guided dynamic map' : 'Free-form control'}
                  </span>
                </div>

                {!!evaluationScores.length && (
                  <div className="mt-6 rounded-xl border border-forest-border bg-forest-darker/50 p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-forest-emerald/70 font-semibold mb-4">External Evaluation</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      {evaluationScores.map((score) => (
                        <div key={score.promptId} className="rounded-lg border border-forest-border bg-forest-card/50 p-3">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-forest-gray">{score.promptId}</p>
                          <p className="mt-2 text-2xl font-semibold text-white">{score.score}/2</p>
                          <p className="mt-1.5 text-xs text-forest-light-gray">{score.rationale}</p>
                        </div>
                      ))}
                    </div>
                    {evaluationSummary && <p className="mt-4 text-sm text-forest-light-gray">{evaluationSummary}</p>}
                  </div>
                )}

                {snapshot.session.surveyResponse && (
                  <div className="mt-6 rounded-xl border border-forest-border bg-forest-darker/50 p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-forest-emerald/70 font-semibold mb-4">Feedback Snapshot</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <SummaryMetric label="Clarity" value={snapshot.session.surveyResponse.clarity} />
                      <SummaryMetric label="Confidence" value={snapshot.session.surveyResponse.confidence} />
                      <SummaryMetric label="Usefulness" value={snapshot.session.surveyResponse.usefulness} />
                      <SummaryMetric label="Understanding" value={snapshot.session.surveyResponse.perceivedUnderstanding} />
                      <SummaryMetric label="Mental effort" value={snapshot.session.surveyResponse.mentalEffort} />
                      <SummaryMetric label="Voice comfort" value={snapshot.session.surveyResponse.voiceComfort} />
                      <SummaryMetric label="Preferred modality" value={snapshot.session.surveyResponse.preferredModality} />
                      <SummaryMetric label="Preferred system" value={snapshot.session.surveyResponse.preferredSystem} />
                    </div>
                  </div>
                )}

                {isGuided && (
                  <div className="mt-6 h-[400px] rounded-xl overflow-hidden">
                    <DynamicConceptMap
                      nodes={snapshot.session.graphNodes}
                      activeNodeId={snapshot.session.currentNodeId}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    )
  }

  return null
}

const SummaryMetric = ({ label, value }) => (
  <div className="rounded-lg border border-forest-border bg-forest-card/50 px-3 py-2.5">
    <p className="text-[10px] uppercase tracking-[0.18em] text-forest-gray">{label}</p>
    <p className="mt-1.5 text-sm text-white">{value || '—'}</p>
  </div>
)

const ErrorToast = ({ message, onDismiss }) => (
  <div className="fixed bottom-4 right-4 z-30 max-w-md">
    <div
      className="rounded-xl border border-red-500/30 bg-red-900/60 backdrop-blur px-4 py-3 text-sm text-red-100 cursor-pointer"
      onClick={onDismiss}
    >
      <span className="flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        {message}
      </span>
    </div>
  </div>
)

export default MVPV2
