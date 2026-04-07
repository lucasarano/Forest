import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Loader,
  Send,
  Sparkles,
  TreePine,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import DynamicConceptMap from '../components/sprint4/DynamicConceptMap'
import Button from '../components/Button'
import Logo from '../components/Logo'
import {
  advancePhase,
  getActiveNode,
  getGuidedProgress,
  getTimeRemainingMs,
  startSession,
  submitEvaluation,
  submitSurvey,
  submitTurn,
} from '../lib/mvpV2Service'
import { SPRINT4_CONDITIONS, SPRINT4_PHASES, NODE_STATES } from '../lib/sprint4/constants'

const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const SURVEY_FIELDS = [
  { key: 'clarity', label: 'This learning experience made the concept clear.' },
  { key: 'confidence', label: 'I finished with stronger confidence in my understanding.' },
  { key: 'usefulness', label: 'The feedback felt useful rather than generic.' },
]

const statusLabel = (status) => {
  if (status === NODE_STATES.MASTERED_INDEPENDENTLY) return 'Mastered'
  if (status === NODE_STATES.MASTERED_WITH_SUPPORT) return 'Mastered (supported)'
  if (status === NODE_STATES.PARTIAL) return 'Partial'
  if (status === NODE_STATES.ACTIVE) return 'Active'
  return 'Locked'
}

const MVPV2 = () => {
  const [searchParams] = useSearchParams()
  const studyConfigId = searchParams.get('study') || ''
  const [booting, setBooting] = useState(true)
  const [sessionToken, setSessionToken] = useState('')
  const [snapshot, setSnapshot] = useState(null)
  const [input, setInput] = useState('')
  const [pageError, setPageError] = useState('')
  const [loading, setLoading] = useState(false)
  const [timeRemainingMs, setTimeRemainingMs] = useState(0)
  const [evaluationAnswers, setEvaluationAnswers] = useState({})
  const [survey, setSurvey] = useState({ clarity: '', confidence: '', usefulness: '', comment: '' })

  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const sessionTokenRef = useRef(sessionToken)
  sessionTokenRef.current = sessionToken
  const chatScrollRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const bootstrap = async () => {
      if (!studyConfigId) { setBooting(false); return }
      try {
        const started = await startSession({ studyConfigId })
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
  }, [studyConfigId])

  useEffect(() => {
    if (!snapshot?.session || snapshot.session.phase !== SPRINT4_PHASES.LEARNING) return undefined
    setTimeRemainingMs(getTimeRemainingMs(snapshot.session))
    const timer = window.setInterval(() => {
      const current = snapshotRef.current
      if (!current?.session) return
      setTimeRemainingMs(getTimeRemainingMs(current.session))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [snapshot?.session?.id, snapshot?.session?.phase])

  useEffect(() => {
    const token = sessionTokenRef.current
    const current = snapshotRef.current
    if (!token || !current?.session || current.session.phase !== SPRINT4_PHASES.LEARNING) return
    if (timeRemainingMs > 0) return
    void (async () => {
      try {
        const next = await advancePhase({ token, phase: SPRINT4_PHASES.EVALUATION })
        setSnapshot(next.snapshot)
      } catch (error) {
        setPageError(error.message)
      }
    })()
  }, [timeRemainingMs])

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [snapshot?.session?.messages?.length])

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

  const handleSubmitTurn = async (helpRequested = false) => {
    if (!sessionToken || !snapshot?.session || loading) return
    if (!helpRequested && !input.trim()) return
    setLoading(true)
    setPageError('')
    try {
      const result = await submitTurn({
        token: sessionToken,
        activeNodeId: activeNode?.id || snapshot.session.currentNodeId,
        userMessage: input.trim(),
        helpRequested,
      })
      setSnapshot(result.snapshot)
      setInput('')
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

  const handleSubmitSurvey = async (event) => {
    event.preventDefault()
    if (!sessionToken) return
    if (SURVEY_FIELDS.some((f) => !survey[f.key])) { setPageError('Complete the short survey before finishing.'); return }
    setLoading(true)
    setPageError('')
    try {
      const next = await submitSurvey({ token: sessionToken, survey })
      setSnapshot(next.snapshot)
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (booting) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader size={32} className="animate-spin text-forest-emerald" />
          <p className="text-forest-light-gray text-sm">Initializing Sprint 4 session...</p>
        </div>
      </div>
    )
  }

  if (!studyConfigId) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker flex items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg text-center px-6">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-forest-card border-2 border-forest-emerald/40 flex items-center justify-center">
            <TreePine size={32} className="text-forest-emerald" />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2">Study link required</h1>
          <p className="text-forest-light-gray mb-8">
            This controlled prototype starts from a researcher-created study config. Open the participant link from the admin page.
          </p>
          <Link to="/mvp-v2-admin">
            <Button type="button">Open Sprint 4 Admin</Button>
          </Link>
        </motion.div>
      </div>
    )
  }

  if (snapshot?.session?.phase === SPRINT4_PHASES.LEARNING) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker flex flex-col">
        {/* Top bar */}
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
              timeRemainingMs < 60000
                ? 'border-red-500/50 bg-red-500/10 text-red-300'
                : 'border-forest-border bg-forest-card text-forest-light-gray'
            }`}>
              <Clock3 size={13} />
              {formatDuration(timeRemainingMs)}
            </span>
            <button
              type="button"
              onClick={() => advancePhase({ token: sessionToken, phase: SPRINT4_PHASES.EVALUATION })
                .then((next) => setSnapshot(next.snapshot))
                .catch((error) => setPageError(error.message))}
              className="px-3 py-1 rounded-lg text-xs border border-forest-border text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors"
            >
              Finish early
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className={`flex-1 min-h-0 flex ${isGuided ? 'flex-col lg:flex-row' : 'flex-col'}`}>
          {/* Concept map (guided only) */}
          {isGuided && (
            <div className="lg:w-[48%] xl:w-[45%] h-[40vh] lg:h-full border-b lg:border-b-0 lg:border-r border-forest-border">
              <DynamicConceptMap
                nodes={snapshot.session.graphNodes}
                activeNodeId={snapshot.session.currentNodeId}
                onSelect={handleNodeSelect}
              />
            </div>
          )}

          {/* Chat panel */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Active node header (guided only) */}
            {isGuided && activeNode && (
              <div className="flex-shrink-0 border-b border-forest-border bg-forest-card/30 px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-forest-emerald font-semibold">Active Focus</p>
                    <h2 className="text-lg font-semibold text-white truncate mt-0.5">{activeNode.title}</h2>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="rounded-md bg-forest-card border border-forest-border px-2 py-0.5 text-[11px] text-forest-light-gray">
                      {statusLabel(activeNode.status)}
                    </span>
                    <span className="rounded-md bg-forest-card border border-forest-border px-2 py-0.5 text-[11px] text-forest-light-gray">
                      Recall {activeNode.successfulRecallCount || 0}/2
                    </span>
                  </div>
                </div>
                {activeNode.summary && (
                  <p className="text-xs text-forest-gray mt-1.5 line-clamp-2">{activeNode.summary}</p>
                )}
              </div>
            )}

            {/* Control arm header */}
            {!isGuided && (
              <div className="flex-shrink-0 border-b border-forest-border bg-forest-card/30 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-forest-emerald font-semibold">Free-form Learning</p>
                <h2 className="text-lg font-semibold text-white mt-0.5">{snapshot.studyConfig.seedConcept}</h2>
              </div>
            )}

            {/* Messages */}
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

            {/* Input */}
            <div className="flex-shrink-0 border-t border-forest-border bg-forest-card/50 p-3">
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
                  {isGuided && (
                    <button
                      type="button"
                      onClick={() => void handleSubmitTurn(true)}
                      disabled={loading}
                      className="px-3 py-2 rounded-xl text-xs border border-forest-border bg-forest-card text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Sparkles size={13} />
                      Stuck
                    </button>
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

        {/* Error toast */}
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
                  {SURVEY_FIELDS.map((field) => (
                    <div key={field.key}>
                      <p className="mb-2 text-sm text-white">{field.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {[1, 2, 3, 4, 5].map((value) => (
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
