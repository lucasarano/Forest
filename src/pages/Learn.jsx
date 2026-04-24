import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  CornerUpLeft,
  HelpCircle,
  Loader,
  LogOut,
  RotateCcw,
  Send,
  SkipForward,
  Sparkles,
  Target,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import DynamicConceptMap from '../components/learn/DynamicConceptMap'
import PhasePanel from '../components/learn/PhasePanel'
import ConceptStackBar from '../components/learn/ConceptStackBar'
import MicButton from '../components/learn/MicButton'
import Logo from '../components/Logo'
import { useAuth } from '../lib/auth'
import {
  acceptOffer,
  fetchCatalog,
  restartTutorSession,
  returnFromActive,
  skipOffer,
  startTutorSession,
  submitTutorTurn,
} from '../lib/api'

const Learn = () => {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const studentName = (profile?.display_name || user?.email?.split('@')[0] || '').trim()
  const [selectionStep, setSelectionStep] = useState('course')
  const [selection, setSelection] = useState({ courseId: '', homeworkId: '', conceptId: '' })
  const [catalog, setCatalog] = useState(null)
  const [catalogLoading, setCatalogLoading] = useState(true)

  const [booting, setBooting] = useState(false)
  const [sessionToken, setSessionToken] = useState('')
  const [snapshot, setSnapshot] = useState(null)
  const [input, setInput] = useState('')
  const [pageError, setPageError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showReason, setShowReason] = useState(false)

  const chatScrollRef = useRef(null)

  const selectedCourse = useMemo(
    () => (catalog?.courses || []).find((c) => c.id === selection.courseId) || null,
    [catalog, selection.courseId],
  )
  const selectedHomework = useMemo(
    () => (selectedCourse?.homeworks || []).find((h) => h.id === selection.homeworkId) || null,
    [selectedCourse, selection.homeworkId],
  )

  const state = snapshot?.state
  const nodesObj = state?.nodes || {}
  const nodesArray = useMemo(() => Object.values(nodesObj), [nodesObj])
  const stack = state?.stack || []
  const activeNodeId = stack.length ? stack[stack.length - 1] : null
  const activeNode = activeNodeId ? nodesObj[activeNodeId] : null
  const offer = state?.offer || null
  const completed = !!state?.completed
  const conceptGoals = state?.conceptGoals || []
  const goalsCovered = state?.goalsCovered || []
  const restartAvailable = !!state?.restartAvailable

  const visibleMessages = useMemo(() => {
    if (!activeNode) return []
    return activeNode.messages || []
  }, [activeNode])

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [visibleMessages.length, offer, completed])

  useEffect(() => { setShowReason(false) }, [offer?.parentId, offer?.title])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setCatalogLoading(true)
      try {
        const data = await fetchCatalog()
        if (!cancelled) setCatalog(data)
      } catch (error) {
        if (!cancelled) setPageError(error.message)
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/', { replace: true })
  }

  const handleSelectCourse = (courseId) => {
    setSelection({ courseId, homeworkId: '', conceptId: '' })
    setSelectionStep('homework')
  }
  const handleSelectHomework = (homeworkId) => {
    setSelection((prev) => ({ ...prev, homeworkId, conceptId: '' }))
    setSelectionStep('concept')
  }
  const handleSelectConcept = async (conceptId) => {
    setSelection((prev) => ({ ...prev, conceptId }))
    setSelectionStep('run')
    setBooting(true)
    setPageError('')
    try {
      const started = await startTutorSession({ conceptId, studentName, forceNew: true })
      setSessionToken(started.sessionToken)
      setSnapshot(started.snapshot)
    } catch (error) {
      setPageError(error.message)
    } finally {
      setBooting(false)
    }
  }

  const handleSubmitTurn = async (overrideMessage) => {
    const message = (overrideMessage ?? input).trim()
    if (!sessionToken || !state || loading || !message) return
    setLoading(true)
    setPageError('')
    try {
      const result = await submitTutorTurn({ token: sessionToken, studentMessage: message })
      setSnapshot(result.snapshot)
      setInput('')
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptOffer = async () => {
    if (!sessionToken || loading) return
    setLoading(true)
    setPageError('')
    try {
      const result = await acceptOffer({ token: sessionToken })
      setSnapshot(result.snapshot)
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSkipOffer = async () => {
    if (!sessionToken || loading) return
    setLoading(true)
    setPageError('')
    try {
      const result = await skipOffer({ token: sessionToken })
      setSnapshot(result.snapshot)
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReturn = async () => {
    if (!sessionToken || loading) return
    setLoading(true)
    setPageError('')
    try {
      const result = await returnFromActive({ token: sessionToken, viaSkip: true })
      setSnapshot(result.snapshot)
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRestart = async () => {
    if (!sessionToken || loading) return
    const confirmed = typeof window !== 'undefined'
      ? window.confirm('Restart this homework from the beginning? Your progress will reset.')
      : true
    if (!confirmed) return
    setLoading(true)
    setPageError('')
    try {
      const result = await restartTutorSession({ token: sessionToken })
      setSnapshot(result.snapshot)
      setInput('')
    } catch (error) {
      setPageError(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleTranscript = (text) => {
    if (text) setInput((prev) => (prev ? `${prev} ${text}` : text))
  }

  const handleNodeSelect = () => {}  // concept graph is informational; active node is driven by stack

  /* ── Picker ─────────────────────────────────────────── */
  if (selectionStep !== 'run') {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker">
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-2xl px-5 pb-14 pt-8">
            <div className="flex items-center justify-between mb-10">
              <Logo variant="full" />
              <div className="flex items-center gap-3 text-xs text-forest-light-gray">
                <span className="hidden sm:inline">{studentName || user?.email}</span>
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-forest-border hover:text-white hover:border-forest-emerald/50 transition"
                >
                  <LogOut size={12} /> Sign out
                </button>
              </div>
            </div>

            {catalogLoading && !catalog && (
              <div className="flex items-center gap-2 text-forest-light-gray text-sm">
                <Loader size={14} className="animate-spin" /> Loading courses...
              </div>
            )}

            {selectionStep === 'course' && catalog && (
              <PickerList
                eyebrow="Step 1 of 3"
                title="Pick a course"
                subtitle={`Hi, ${studentName} — which course are you studying?`}
                items={(catalog?.courses || []).map((c) => ({
                  id: c.id,
                  title: c.title,
                  description: c.description,
                  caption: `${(c.homeworks || []).length} homework${(c.homeworks || []).length === 1 ? '' : 's'}`,
                }))}
                onSelect={handleSelectCourse}
                emptyLabel="No courses available yet. Ask your teacher to create one."
              />
            )}

            {selectionStep === 'homework' && selectedCourse && (
              <PickerList
                eyebrow="Step 2 of 3"
                title="Pick a homework"
                subtitle={selectedCourse.title}
                onBack={() => { setSelection({ courseId: '', homeworkId: '', conceptId: '' }); setSelectionStep('course') }}
                backLabel="Change course"
                items={(selectedCourse.homeworks || []).map((h) => ({
                  id: h.id,
                  title: h.title,
                  description: h.description,
                  caption: `${(h.concepts || []).length} concept${(h.concepts || []).length === 1 ? '' : 's'}`,
                }))}
                onSelect={handleSelectHomework}
                emptyLabel="No homeworks in this course yet."
              />
            )}

            {selectionStep === 'concept' && selectedHomework && (
              <PickerList
                eyebrow="Step 3 of 3"
                title="Pick a concept"
                subtitle={`${selectedCourse?.title} · ${selectedHomework.title}`}
                onBack={() => { setSelection((prev) => ({ ...prev, homeworkId: '', conceptId: '' })); setSelectionStep('homework') }}
                backLabel="Change homework"
                items={(selectedHomework.concepts || []).map((c) => ({ id: c.id, title: c.title }))}
                onSelect={handleSelectConcept}
                emptyLabel="No concepts in this homework yet."
              />
            )}
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

  const canReturn = stack.length > 1 && activeNode && !activeNode.isRoot && activeNode.skippable

  return (
    <div className="relative w-full h-screen overflow-hidden bg-forest-darker flex flex-col">
      <div className="flex-shrink-0 h-12 border-b border-forest-border bg-forest-card/50 flex items-center justify-between px-4 z-20">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2"><Logo variant="full" /></Link>
        </div>
        <div className="flex items-center gap-2">
          {completed ? (
            <span className="rounded-lg border border-forest-emerald/50 bg-forest-emerald/10 text-forest-emerald px-3 py-1 text-xs font-medium flex items-center gap-1.5">
              <CheckCircle2 size={13} /> Session complete
            </span>
          ) : (
            <span className="rounded-lg bg-forest-card border border-forest-border px-3 py-1 text-xs text-forest-light-gray">
              Turn {state?.turnIndex ?? 0}
            </span>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 border-b border-forest-border bg-forest-card/30 px-4 py-2.5">
        <ConceptStackBar stack={stack} nodes={nodesObj} onReturn={handleReturn} canReturn={canReturn} />
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="lg:w-[38%] xl:w-[36%] h-[30vh] lg:h-full border-b lg:border-b-0 lg:border-r border-forest-border">
          <DynamicConceptMap
            nodes={nodesArray}
            activeNodeId={activeNodeId}
            stack={stack}
            onSelect={handleNodeSelect}
          />
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          {conceptGoals.length > 0 && activeNode?.isRoot && (
            <GoalsPanel goals={conceptGoals} covered={goalsCovered} />
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

              {visibleMessages.map((message) => {
                const isTutor = message.role === 'tutor'
                const isSystem = message.role === 'system'
                return (
                  <div
                    key={message.id}
                    className={`rounded-xl px-4 py-3 animate-fade-in-up ${
                      isSystem
                        ? 'bg-forest-darker/50 border border-forest-border text-forest-light-gray'
                        : isTutor
                          ? 'bg-forest-card/80 border border-forest-border'
                          : 'bg-forest-emerald/10 border border-forest-emerald/30'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] mb-1.5 font-semibold text-forest-emerald/70">
                      {isSystem ? 'System' : isTutor ? 'Forest' : 'You'}
                    </p>
                    <div className="prose prose-invert max-w-none text-sm">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                )
              })}

              {restartAvailable && !completed && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3"
                >
                  <RotateCcw size={16} className="mt-0.5 shrink-0 text-amber-400" />
                  <div className="flex-1">
                    <p className="text-sm text-white">Want to go through this concept from the start?</p>
                    <p className="mt-0.5 text-xs text-forest-light-gray">
                      You can keep answering the recall question, or restart the homework to revisit the whole teaching flow.
                    </p>
                    <button
                      type="button"
                      onClick={handleRestart}
                      className="mt-2 px-3 py-1.5 bg-amber-500/15 border border-amber-500/40 text-amber-200 rounded-lg text-xs font-medium hover:bg-amber-500/25 transition flex items-center gap-1.5"
                    >
                      <RotateCcw size={12} /> Restart homework
                    </button>
                  </div>
                </motion.div>
              )}

              {offer && !loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4"
                >
                  <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400 font-semibold">Subtopic suggested</p>
                  <h3 className="mt-2 text-base font-semibold text-white">{offer.title}</h3>
                  {showReason && (
                    <p className="mt-2 text-sm text-forest-light-gray">{offer.reason}</p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleAcceptOffer}
                      className="px-4 py-2 bg-forest-emerald text-forest-darker rounded-lg text-sm font-medium hover:brightness-110 transition flex items-center gap-1.5"
                    >
                      <ArrowRight size={14} /> Dive in
                    </button>
                    {offer.skippable && (
                      <button
                        type="button"
                        onClick={handleSkipOffer}
                        className="px-4 py-2 bg-forest-card border border-forest-border rounded-lg text-sm text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition flex items-center gap-1.5"
                      >
                        <SkipForward size={14} /> Skip for now
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowReason((v) => !v)}
                      className="px-4 py-2 bg-forest-card border border-forest-border rounded-lg text-sm text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition flex items-center gap-1.5"
                    >
                      <HelpCircle size={14} /> {showReason ? 'Hide reason' : 'Why is this needed?'}
                    </button>
                  </div>
                </motion.div>
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

              {completed && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-forest-emerald/40 bg-forest-emerald/5 p-5 text-center"
                >
                  <Sparkles size={28} className="text-forest-emerald mx-auto" />
                  <h2 className="mt-2 text-lg font-semibold text-white">Concept mastered</h2>
                  <p className="mt-1 text-sm text-forest-light-gray">
                    You've worked through every phase of this concept. Great session.
                  </p>
                </motion.div>
              )}
            </div>
          </div>

          {!completed && (
            <div className="flex-shrink-0 border-t border-forest-border bg-forest-card/50 p-3">
              <form
                onSubmit={(e) => { e.preventDefault(); void handleSubmitTurn() }}
                className="flex gap-2"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSubmitTurn()
                    }
                  }}
                  rows={2}
                  disabled={loading || !!offer}
                  placeholder={offer ? 'Choose Dive in or Skip above to continue.' : 'Explain in your own words...'}
                  className="flex-1 px-4 py-2.5 bg-forest-darker border border-forest-border rounded-xl text-white text-sm placeholder-forest-gray focus:outline-none focus:border-forest-emerald transition-colors disabled:opacity-60 resize-none"
                />
                <div className="flex flex-col gap-1.5">
                  <MicButton onTranscript={handleTranscript} disabled={loading || !!offer} />
                  {canReturn && (
                    <button
                      type="button"
                      onClick={handleReturn}
                      disabled={loading}
                      className="px-3 py-2 rounded-xl text-xs border border-forest-border bg-forest-card text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <CornerUpLeft size={13} /> Return
                    </button>
                  )}
                  {restartAvailable && !canReturn && (
                    <button
                      type="button"
                      onClick={handleRestart}
                      disabled={loading}
                      className="px-3 py-2 rounded-xl text-xs border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <RotateCcw size={13} /> Restart
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={loading || !input.trim() || !!offer}
                    className="px-4 py-2 bg-forest-emerald text-forest-darker rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm font-medium"
                  >
                    {loading ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                    Send
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="lg:w-[28%] xl:w-[26%] h-[30vh] lg:h-full border-t lg:border-t-0 lg:border-l border-forest-border bg-forest-card/20 overflow-y-auto">
          <PhasePanel node={activeNode} />
        </div>
      </div>

      {pageError && <ErrorToast message={pageError} onDismiss={() => setPageError('')} />}
    </div>
  )
}

const GoalsPanel = ({ goals = [], covered = [] }) => {
  const [open, setOpen] = useState(true)
  const total = goals.length
  const done = goals.reduce((n, _, i) => n + (covered[i] === true ? 1 : 0), 0)
  return (
    <div className="flex-shrink-0 border-b border-forest-border bg-forest-card/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-forest-card/50 transition"
      >
        <span className="flex items-center gap-2">
          <Target size={14} className="text-forest-emerald" />
          <span className="text-[10px] uppercase tracking-[0.22em] font-semibold text-forest-emerald">
            Requirements for understanding
          </span>
          <span className="text-xs text-forest-light-gray">· {done}/{total} covered</span>
        </span>
        <ChevronDown
          size={14}
          className={`text-forest-light-gray transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <ul className="px-4 pb-3 pt-1 space-y-1.5">
          {goals.map((goal, i) => {
            const isDone = covered[i] === true
            return (
              <li key={i} className="flex items-start gap-2 text-sm">
                {isDone ? (
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-forest-emerald" />
                ) : (
                  <Circle size={14} className="mt-0.5 shrink-0 text-forest-gray" />
                )}
                <span className={isDone ? 'text-forest-light-gray line-through' : 'text-white'}>
                  {goal}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const PickerList = ({ eyebrow, title, subtitle, items = [], onSelect, emptyLabel, onBack, backLabel }) => (
  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
    <div className="rounded-xl border border-forest-border bg-forest-card/40 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-forest-emerald font-semibold">{eyebrow}</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-forest-light-gray">{subtitle}</p>}
        </div>
        {onBack && (
          <button type="button" onClick={onBack} className="text-xs text-forest-light-gray hover:text-forest-emerald">
            {backLabel || 'Back'}
          </button>
        )}
      </div>

      <div className="mt-6 space-y-2">
        {items.length === 0 && <p className="text-sm text-forest-gray">{emptyLabel}</p>}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="w-full text-left rounded-xl border border-forest-border bg-forest-darker/60 px-4 py-3 text-sm text-white hover:border-forest-emerald/60 transition"
          >
            <p className="font-medium">{item.title}</p>
            {item.description && <p className="mt-1 text-xs text-forest-light-gray">{item.description}</p>}
            {item.caption && <p className="mt-1 text-[10px] text-forest-gray">{item.caption}</p>}
          </button>
        ))}
      </div>
    </div>
  </motion.div>
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

export default Learn
