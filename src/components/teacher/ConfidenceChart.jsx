import React, { useMemo, useState } from 'react'

const PHASES = ['explanation', 'causality', 'transfer', 'recall']
const PHASE_COLORS = {
  explanation: '#10b981', // emerald
  causality: '#3b82f6',   // blue
  transfer: '#f59e0b',    // amber
  recall: '#a855f7',      // purple
}
const PHASE_THRESHOLDS = { explanation: 0.7, causality: 0.7, transfer: 0.65, recall: 0.65 }

const W = 800
const H = 260
const P = { top: 20, right: 20, bottom: 32, left: 40 }

const ConfidenceChart = ({ series = [], nodeFilter = 'all' }) => {
  const [hover, setHover] = useState(null)

  const points = useMemo(() => {
    const filtered = nodeFilter === 'all' ? series : series.filter((p) => p.nodeId === nodeFilter)
    return filtered.filter((p) => Number.isFinite(p.confidence))
  }, [series, nodeFilter])

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[260px] rounded-xl border border-white/10 bg-white/5 text-xs text-gray-500">
        No confidence data yet — the student hasn't completed a full turn.
      </div>
    )
  }

  const minX = Math.min(...points.map((p) => p.turnIndex))
  const maxX = Math.max(...points.map((p) => p.turnIndex))
  const xDomain = maxX - minX || 1
  const plotW = W - P.left - P.right
  const plotH = H - P.top - P.bottom
  const xAt = (x) => P.left + ((x - minX) / xDomain) * plotW
  const yAt = (y) => P.top + (1 - Math.max(0, Math.min(1, y))) * plotH

  const byPhase = PHASES.map((phase) => ({
    phase,
    points: points.filter((p) => p.phase === phase),
  })).filter((s) => s.points.length > 0)

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * W
    let best = null
    let bestDist = Infinity
    for (const p of points) {
      const d = Math.abs(xAt(p.turnIndex) - mx)
      if (d < bestDist) { bestDist = d; best = p }
    }
    setHover(best)
  }

  const tickXs = []
  const step = Math.max(1, Math.ceil(xDomain / 8))
  for (let i = minX; i <= maxX; i += step) tickXs.push(i)

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-white">Confidence over turns</h4>
        <div className="flex gap-3 text-xs">
          {PHASES.map((ph) => (
            <span key={ph} className="flex items-center gap-1.5 capitalize text-gray-300">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: PHASE_COLORS[ph] }} />
              {ph}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {/* y-axis grid + thresholds */}
        {[0, 0.25, 0.5, 0.7, 0.75, 1].map((y) => (
          <g key={y}>
            <line x1={P.left} x2={W - P.right} y1={yAt(y)} y2={yAt(y)} stroke={y === 0.7 ? '#10b98155' : '#ffffff12'} strokeDasharray={y === 0.7 ? '4 4' : '0'} />
            <text x={P.left - 6} y={yAt(y) + 3} fontSize="10" textAnchor="end" fill="#9ca3af">{y.toFixed(2)}</text>
          </g>
        ))}
        {/* x-axis ticks */}
        {tickXs.map((x) => (
          <text key={x} x={xAt(x)} y={H - P.bottom + 14} fontSize="10" textAnchor="middle" fill="#9ca3af">t{x}</text>
        ))}
        {/* polylines */}
        {byPhase.map(({ phase, points: ps }) => {
          const sorted = [...ps].sort((a, b) => a.turnIndex - b.turnIndex)
          const d = sorted.map((p) => `${xAt(p.turnIndex)},${yAt(p.confidence)}`).join(' ')
          return (
            <g key={phase}>
              <polyline fill="none" stroke={PHASE_COLORS[phase]} strokeWidth="2" points={d} />
              {sorted.map((p, i) => (
                <circle key={i} cx={xAt(p.turnIndex)} cy={yAt(p.confidence)} r={hover === p ? 5 : 3} fill={PHASE_COLORS[phase]} stroke="#0b0b0b" strokeWidth="1" />
              ))}
            </g>
          )
        })}
        {/* hover marker */}
        {hover && (
          <g pointerEvents="none">
            <line x1={xAt(hover.turnIndex)} x2={xAt(hover.turnIndex)} y1={P.top} y2={H - P.bottom} stroke="#ffffff30" />
            <rect x={Math.min(xAt(hover.turnIndex) + 8, W - 200)} y={yAt(hover.confidence) - 30} width="190" height="38" rx="6" fill="#111827" stroke="#ffffff20" />
            <text x={Math.min(xAt(hover.turnIndex) + 14, W - 194)} y={yAt(hover.confidence) - 14} fontSize="10" fill="#e5e7eb">
              turn {hover.turnIndex} · <tspan fill={PHASE_COLORS[hover.phase] || '#fff'}>{hover.phase}</tspan> · {hover.confidence.toFixed(2)}
            </text>
            <text x={Math.min(xAt(hover.turnIndex) + 14, W - 194)} y={yAt(hover.confidence) - 2} fontSize="9" fill="#9ca3af">
              {(hover.nodeTitle || '').slice(0, 34)}
            </text>
          </g>
        )}
      </svg>
      <p className="text-[10px] text-gray-500 mt-1">Dashed line = pass threshold (≈0.7).</p>
    </div>
  )
}

export default ConfidenceChart
