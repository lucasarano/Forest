import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Focus, Lock, SkipForward, Sparkles, Star, RotateCcw, Circle } from 'lucide-react'
import { NODE_STATES } from '../../lib/tutor/constants'

const NODE_RADIUS = 28

const statusConfig = {
  [NODE_STATES.LOCKED]: {
    bg: 'rgba(20, 27, 23, 0.6)', border: '#1f2d27', glow: null,
    icon: Lock, dotColor: 'rgba(107, 114, 128, 0.5)',
  },
  [NODE_STATES.ACTIVE]: {
    bg: 'rgba(52, 211, 153, 0.12)', border: '#34d399', glow: 'rgba(52, 211, 153, 0.3)',
    icon: Sparkles, dotColor: '#34d399',
  },
  [NODE_STATES.IN_PROGRESS]: {
    bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(251, 191, 36, 0.5)', glow: 'rgba(245, 158, 11, 0.25)',
    icon: Circle, dotColor: '#f59e0b',
  },
  [NODE_STATES.NEEDS_REVIEW]: {
    bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(248, 113, 113, 0.6)', glow: 'rgba(239, 68, 68, 0.3)',
    icon: RotateCcw, dotColor: '#f87171',
  },
  [NODE_STATES.MASTERED]: {
    bg: 'rgba(59, 130, 246, 0.2)', border: '#60a5fa', glow: 'rgba(96, 165, 250, 0.4)',
    icon: Star, dotColor: '#93c5fd',
  },
  [NODE_STATES.SKIPPED]: {
    bg: 'rgba(107, 114, 128, 0.15)', border: 'rgba(107, 114, 128, 0.5)', glow: null,
    icon: SkipForward, dotColor: '#6b7280',
  },
}

const getConfig = (status) => statusConfig[status] || statusConfig[NODE_STATES.LOCKED]

const DynamicConceptMap = ({ nodes, activeNodeId, stack = [], onSelect }) => {
  const containerRef = useRef(null)
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 })
  const cameraRef = useRef(camera)
  cameraRef.current = camera

  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)

  const safeNodes = Array.isArray(nodes) ? nodes : []
  const nodeMap = new Map(safeNodes.map((n) => [n.id, n]))
  const stackSet = new Set(stack || [])

  const centerAndFit = useCallback(() => {
    const el = containerRef.current
    if (!el || safeNodes.length === 0) return
    const rect = el.getBoundingClientRect()
    const padX = 80, padY = 80
    const xs = safeNodes.filter((n) => n.layout).map((n) => n.layout.x)
    const ys = safeNodes.filter((n) => n.layout).map((n) => n.layout.y)
    if (!xs.length) return
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const contentW = maxX - minX + padX * 2
    const contentH = maxY - minY + padY * 2
    const cx = (minX + maxX) / 2
    const scale = Math.min(rect.width / contentW, rect.height / contentH, 1.2)
    const clamped = Math.max(0.3, Math.min(2.5, scale))
    setCamera({
      x: rect.width / 2 - cx * clamped,
      y: rect.height - padY - maxY * clamped,
      scale: clamped,
    })
  }, [safeNodes])

  useEffect(() => { centerAndFit() }, [safeNodes.length])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cam = cameraRef.current
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const wx = (mx - cam.x) / cam.scale, wy = (my - cam.y) / cam.scale
    const next = Math.min(2.5, Math.max(0.3, cam.scale + -e.deltaY * 0.003))
    setCamera({ x: mx - wx * next, y: my - wy * next, scale: next })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('.concept-node')) return
    isPanningRef.current = true
    setIsPanning(true)
    panStartRef.current = { x: e.clientX, y: e.clientY }
  }, [])
  const handleMouseMove = useCallback((e) => {
    if (!isPanningRef.current) return
    const dx = e.clientX - panStartRef.current.x
    const dy = e.clientY - panStartRef.current.y
    panStartRef.current = { x: e.clientX, y: e.clientY }
    setCamera((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
  }, [])
  const handleMouseUp = useCallback(() => { isPanningRef.current = false; setIsPanning(false) }, [])

  return (
    <div className="relative h-full w-full bg-forest-darker overflow-hidden rounded-xl border border-forest-border">
      <div ref={containerRef} className="w-full h-full" style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(rgba(52, 211, 153, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(52, 211, 153, 0.04) 1px, transparent 1px)`,
          backgroundSize: `${50 * camera.scale}px ${50 * camera.scale}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }} />
        <div style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
          transformOrigin: '0 0', position: 'absolute', width: '100%', height: '100%', willChange: 'transform',
        }}>
          <svg className="absolute pointer-events-none" style={{ width: '100%', height: '100%', overflow: 'visible', left: 0, top: 0 }}>
            {safeNodes.map((node) => {
              if (!node.parentId) return null
              const parent = nodeMap.get(node.parentId)
              if (!parent?.layout || !node.layout) return null
              const inStack = stackSet.has(node.id) && stackSet.has(parent.id)
              return (
                <line key={`${node.id}-${parent.id}`}
                  x1={parent.layout.x} y1={parent.layout.y} x2={node.layout.x} y2={node.layout.y}
                  stroke={inStack ? 'rgba(52, 211, 153, 0.7)' : 'rgba(148, 163, 184, 0.25)'}
                  strokeWidth={inStack ? 2.5 : 1.2} />
              )
            })}
          </svg>
          {safeNodes.map((node) => {
            if (!node.layout) return null
            const isActive = node.id === activeNodeId
            const inStack = stackSet.has(node.id)
            const cfg = getConfig(node.status)
            const Icon = cfg.icon
            const r = NODE_RADIUS
            return (
              <div key={node.id} className="absolute concept-node"
                style={{ left: node.layout.x, top: node.layout.y, transform: 'translate(-50%, -50%)' }}
                onClick={(e) => { e.stopPropagation(); onSelect?.(node.id) }}>
                <div className="relative flex items-center justify-center" style={{
                  width: r * 2, height: r * 2, borderRadius: '50%',
                  background: cfg.bg, border: `2px solid ${cfg.border}`,
                  boxShadow: isActive ? `0 0 16px 4px rgba(52, 211, 153, 0.4)`
                    : inStack ? `0 0 10px 2px rgba(52, 211, 153, 0.25)`
                      : cfg.glow ? `0 0 8px 2px ${cfg.glow}` : 'none',
                }}>
                  {isActive && <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: '#34d399' }} />}
                  <div className="relative z-10 flex items-center justify-center">
                    <Icon size={16} style={{ color: cfg.dotColor }} />
                  </div>
                </div>
                <div className="absolute left-1/2 whitespace-nowrap pointer-events-none" style={{ top: r * 2 + 6, transform: 'translateX(-50%)', maxWidth: 160 }}>
                  <div className={`text-xs font-medium text-center px-2 py-0.5 rounded-md truncate ${isActive ? 'bg-forest-card/90 border border-forest-emerald/40 text-white' : inStack ? 'text-forest-emerald/90' : 'text-forest-light-gray'}`}>
                    {node.title}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="absolute top-3 left-3 z-10 pointer-events-none">
        <div className="rounded-lg bg-forest-card/80 backdrop-blur-md border border-forest-border px-3 py-1.5">
          <p className="text-[10px] uppercase tracking-[0.25em] text-forest-emerald font-semibold">Concept Graph</p>
        </div>
      </div>
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
        {safeNodes.length > 0 && (
          <button type="button" onClick={centerAndFit} className="p-2 bg-forest-card/80 backdrop-blur-md border border-forest-border rounded-lg text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors" title="Center and fit">
            <Focus size={16} />
          </button>
        )}
        <div className="bg-forest-card/80 backdrop-blur-md border border-forest-border rounded-lg px-2.5 py-1.5 text-xs text-forest-light-gray">
          <span className="text-forest-emerald">{(camera.scale * 100).toFixed(0)}%</span>
        </div>
      </div>
      <div className="absolute bottom-3 left-3 z-10">
        <div className="flex items-center gap-3 rounded-lg bg-forest-card/80 backdrop-blur-md border border-forest-border px-3 py-1.5 flex-wrap">
          <span className="flex items-center gap-1 text-[10px] text-forest-gray"><span className="w-2 h-2 rounded-full bg-forest-gray/50" /> Locked</span>
          <span className="flex items-center gap-1 text-[10px] text-forest-emerald"><span className="w-2 h-2 rounded-full bg-forest-emerald" /> Active</span>
          <span className="flex items-center gap-1 text-[10px] text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-400" /> In progress</span>
          <span className="flex items-center gap-1 text-[10px] text-red-400"><span className="w-2 h-2 rounded-full bg-red-400" /> Needs review</span>
          <span className="flex items-center gap-1 text-[10px] text-blue-400"><span className="w-2 h-2 rounded-full bg-blue-400" /> Mastered</span>
        </div>
      </div>
    </div>
  )
}

export default DynamicConceptMap
