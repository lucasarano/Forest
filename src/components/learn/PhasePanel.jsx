import React, { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Circle, Clock, Lock, RotateCcw, SkipForward, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { PHASES, PHASE_LABELS, PHASE_ORDER, PHASE_STATES } from '../../lib/tutor/constants'

const stateConfig = {
  [PHASE_STATES.LOCKED]:      { label: 'Locked',       color: 'text-forest-gray',       border: 'border-forest-border',        bg: 'bg-forest-darker/60', icon: Lock },
  [PHASE_STATES.ACTIVE]:      { label: 'Active',       color: 'text-forest-emerald',    border: 'border-forest-emerald',        bg: 'bg-forest-emerald/10', icon: Circle },
  [PHASE_STATES.IN_PROGRESS]: { label: 'In progress',  color: 'text-amber-400',         border: 'border-amber-400/60',          bg: 'bg-amber-500/10', icon: Circle },
  [PHASE_STATES.PASSED]:      { label: 'Passed',       color: 'text-blue-400',          border: 'border-blue-500/50',           bg: 'bg-blue-500/10', icon: CheckCircle2 },
  [PHASE_STATES.NEEDS_REVIEW]:{ label: 'Needs review', color: 'text-red-400',           border: 'border-red-500/50',            bg: 'bg-red-500/10', icon: AlertTriangle },
  [PHASE_STATES.REOPENED]:    { label: 'Reopened',     color: 'text-red-400',           border: 'border-red-500/60',            bg: 'bg-red-500/10', icon: RotateCcw },
  [PHASE_STATES.SKIPPED]:     { label: 'Skipped',      color: 'text-forest-gray',       border: 'border-forest-border',         bg: 'bg-forest-darker/60', icon: SkipForward },
  [PHASE_STATES.DEFERRED]:    { label: 'Deferred',     color: 'text-purple-300',        border: 'border-purple-500/40',         bg: 'bg-purple-500/10', icon: Clock },
}

const PhasePanel = ({ node }) => {
  const prevPhasesRef = useRef({})
  const [flash, setFlash] = useState(null) // phase that just moved backward

  useEffect(() => {
    if (!node) return
    const prev = prevPhasesRef.current
    const current = {}
    for (const phase of PHASE_ORDER) current[phase] = node.phases?.[phase]?.state
    // Detect backward movement: any phase moving from PASSED -> REOPENED/NEEDS_REVIEW.
    for (const phase of PHASE_ORDER) {
      if (prev[phase] === PHASE_STATES.PASSED &&
          (current[phase] === PHASE_STATES.REOPENED || current[phase] === PHASE_STATES.NEEDS_REVIEW)) {
        setFlash(phase)
        setTimeout(() => setFlash(null), 1400)
      }
    }
    prevPhasesRef.current = current
  }, [node])

  if (!node) {
    return (
      <div className="h-full w-full flex items-center justify-center p-6 text-sm text-forest-gray">
        No active concept.
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col gap-4 p-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] text-forest-emerald font-semibold">Mastery panel</p>
        <h3 className="mt-1 text-base font-semibold text-white leading-tight">{node.title}</h3>
        {node.reason && !node.isRoot ? (
          <p className="mt-1 text-xs text-forest-light-gray/90 italic">Opened because: {node.reason}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {PHASE_ORDER.map((phase) => {
          const rec = node.phases?.[phase] || { state: PHASE_STATES.LOCKED }
          const cfg = stateConfig[rec.state] || stateConfig[PHASE_STATES.LOCKED]
          const Icon = cfg.icon
          const isActive = node.currentPhase === phase && rec.state !== PHASE_STATES.PASSED && rec.state !== PHASE_STATES.SKIPPED
          const flashing = flash === phase
          return (
            <motion.div
              key={phase}
              layout
              animate={flashing ? { x: [0, -8, 8, -4, 0] } : { x: 0 }}
              transition={{ duration: 0.8 }}
              className={`rounded-xl border ${cfg.border} ${cfg.bg} px-3 py-2.5 ${isActive ? 'ring-1 ring-forest-emerald/60' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon size={14} className={cfg.color} />
                  <span className="text-sm font-medium text-white">{PHASE_LABELS[phase]}</span>
                </div>
                <span className={`text-[11px] uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
              </div>
              {rec.attempts > 0 ? (
                <div className="mt-1 flex items-center gap-2 text-[11px] text-forest-gray">
                  <span>Attempts: {rec.attempts}</span>
                  {typeof rec.confidence === 'number' ? <span>· Confidence: {(rec.confidence * 100).toFixed(0)}%</span> : null}
                  {rec.reopenCount > 0 ? <span className="text-red-400/90">· Reopened ×{rec.reopenCount}</span> : null}
                </div>
              ) : null}
            </motion.div>
          )
        })}
      </div>

      <AnimatePresence>
        {flash ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            Jumped back to revisit {PHASE_LABELS[flash]}.
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export default PhasePanel
