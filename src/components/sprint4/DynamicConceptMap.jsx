import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Compass, Lock, Sparkles, AlertCircle, Focus } from 'lucide-react'
import { NODE_STATES } from '../../lib/sprint4/constants'

const NODE_RADIUS = 28

const statusConfig = {
  [NODE_STATES.LOCKED]: {
    bg: 'rgba(20, 27, 23, 0.6)',
    border: '#1f2d27',
    glow: null,
    cssClass: '',
    icon: Lock,
    dotColor: 'rgba(107, 114, 128, 0.5)',
  },
  [NODE_STATES.ACTIVE]: {
    bg: 'rgba(52, 211, 153, 0.12)',
    border: '#34d399',
    glow: 'rgba(52, 211, 153, 0.3)',
    cssClass: '',
    icon: Sparkles,
    dotColor: '#34d399',
  },
  [NODE_STATES.PARTIAL]: {
    bg: 'rgba(245, 158, 11, 0.1)',
    border: 'rgba(251, 191, 36, 0.5)',
    glow: 'rgba(245, 158, 11, 0.25)',
    cssClass: 's4-node-partial',
    icon: AlertCircle,
    dotColor: '#f59e0b',
  },
  [NODE_STATES.MASTERED_WITH_SUPPORT]: {
    bg: 'rgba(34, 211, 238, 0.1)',
    border: 'rgba(34, 211, 238, 0.5)',
    glow: 'rgba(34, 211, 238, 0.25)',
    cssClass: 's4-node-mastered-sup',
    icon: CheckCircle2,
    dotColor: '#22d3ee',
  },
  [NODE_STATES.MASTERED_INDEPENDENTLY]: {
    bg: 'rgba(52, 211, 153, 0.15)',
    border: '#34d399',
    glow: 'rgba(52, 211, 153, 0.3)',
    cssClass: 's4-node-mastered-ind',
    icon: CheckCircle2,
    dotColor: '#34d399',
  },
}

const getConfig = (status) => statusConfig[status] || statusConfig[NODE_STATES.LOCKED]

const DynamicConceptMap = ({ nodes, activeNodeId, onSelect }) => {
  const containerRef = useRef(null)
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 })
  const cameraRef = useRef(camera)
  cameraRef.current = camera

  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)

  const safeNodes = Array.isArray(nodes) ? nodes : []
  const nodeMap = new Map(safeNodes.map((n) => [n.id, n]))

  const centerAndFit = useCallback(() => {
    const el = containerRef.current
    if (!el || safeNodes.length === 0) return
    const rect = el.getBoundingClientRect()
    const padding = 80

    const xs = safeNodes.filter((n) => n.layout).map((n) => n.layout.x)
    const ys = safeNodes.filter((n) => n.layout).map((n) => n.layout.y)
    if (!xs.length) return

    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    const contentW = maxX - minX + padding * 2
    const contentH = maxY - minY + padding * 2
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    const scaleX = rect.width / contentW
    const scaleY = rect.height / contentH
    const scale = Math.min(scaleX, scaleY, 1.2)
    const clamped = Math.max(0.3, Math.min(2.5, scale))

    setCamera({
      x: rect.width / 2 - cx * clamped,
      y: rect.height / 2 - cy * clamped,
      scale: clamped,
    })
  }, [safeNodes])

  useEffect(() => {
    centerAndFit()
  }, [safeNodes.length])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const cam = cameraRef.current
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const wx = (mx - cam.x) / cam.scale
    const wy = (my - cam.y) / cam.scale
    const delta = -e.deltaY * 0.003
    const next = Math.min(2.5, Math.max(0.3, cam.scale + delta))
    setCamera({ x: mx - wx * next, y: my - wy * next, scale: next })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('.s4-map-node')) return
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

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false
    setIsPanning(false)
  }, [])

  return (
    <div className="relative h-full w-full bg-forest-darker overflow-hidden rounded-xl border border-forest-border">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(52, 211, 153, 0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(52, 211, 153, 0.04) 1px, transparent 1px)
            `,
            backgroundSize: `${50 * camera.scale}px ${50 * camera.scale}px`,
            backgroundPosition: `${camera.x}px ${camera.y}px`,
          }}
        />

        {/* Transform container */}
        <div
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
            transformOrigin: '0 0',
            position: 'absolute',
            width: '100%',
            height: '100%',
            willChange: 'transform',
          }}
        >
          {/* Edges */}
          <svg
            className="absolute pointer-events-none"
            style={{ width: '100%', height: '100%', overflow: 'visible', left: 0, top: 0 }}
          >
            {safeNodes.flatMap((node) =>
              (node.parentIds || []).map((parentId) => {
                const parent = nodeMap.get(parentId)
                if (!parent?.layout || !node.layout) return null
                const isActive = node.id === activeNodeId || parentId === activeNodeId
                return (
                  <line
                    key={`${node.id}-${parentId}`}
                    x1={parent.layout.x}
                    y1={parent.layout.y}
                    x2={node.layout.x}
                    y2={node.layout.y}
                    stroke={isActive ? 'rgba(52, 211, 153, 0.5)' : 'rgba(148, 163, 184, 0.2)'}
                    strokeWidth={isActive ? 2 : 1.2}
                    className={`s4-edge ${isActive ? 's4-edge-active' : ''}`}
                  />
                )
              })
            )}
          </svg>

          {/* Nodes */}
          {safeNodes.map((node) => {
            if (!node.layout) return null
            const isActive = node.id === activeNodeId
            const cfg = getConfig(node.status)
            const IconComponent = cfg.icon
            const r = NODE_RADIUS

            return (
              <div
                key={node.id}
                className={`absolute s4-map-node ${cfg.cssClass}`}
                style={{
                  left: node.layout.x,
                  top: node.layout.y,
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect?.(node.id)
                }}
              >
                {/* Outer circle */}
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    width: r * 2,
                    height: r * 2,
                    borderRadius: '50%',
                    background: cfg.bg,
                    border: `2px solid ${cfg.border}`,
                    boxShadow: isActive
                      ? `0 0 16px 4px rgba(52, 211, 153, 0.4)`
                      : cfg.glow
                        ? `0 0 8px 2px ${cfg.glow}`
                        : 'none',
                  }}
                >
                  {/* Pulse ring for active node */}
                  {isActive && (
                    <div
                      className="absolute inset-0 rounded-full border-2 s4-node-active-ring"
                      style={{ borderColor: '#34d399' }}
                    />
                  )}

                  {/* Center dot / icon */}
                  <div className="relative z-10 flex items-center justify-center">
                    <IconComponent
                      size={16}
                      style={{ color: cfg.dotColor }}
                    />
                  </div>
                </div>

                {/* Label below node */}
                <div
                  className="absolute left-1/2 whitespace-nowrap pointer-events-none"
                  style={{
                    top: r * 2 + 6,
                    transform: 'translateX(-50%)',
                    maxWidth: 140,
                  }}
                >
                  <div
                    className={`text-xs font-medium text-center px-2 py-0.5 rounded-md truncate ${
                      isActive
                        ? 'bg-forest-card/90 border border-forest-emerald/40 text-white'
                        : 'text-forest-light-gray'
                    }`}
                  >
                    {node.title}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Map header */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none">
        <div className="rounded-lg bg-forest-card/80 backdrop-blur-md border border-forest-border px-3 py-1.5">
          <p className="text-[10px] uppercase tracking-[0.25em] text-forest-emerald font-semibold">Dynamic Map</p>
        </div>
      </div>

      {/* Center + zoom controls */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
        {safeNodes.length > 0 && (
          <button
            type="button"
            onClick={centerAndFit}
            className="p-2 bg-forest-card/80 backdrop-blur-md border border-forest-border rounded-lg text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors"
            title="Center and fit"
          >
            <Focus size={16} />
          </button>
        )}
        <div className="bg-forest-card/80 backdrop-blur-md border border-forest-border rounded-lg px-2.5 py-1.5 text-xs text-forest-light-gray">
          <span className="text-forest-emerald">{(camera.scale * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10">
        <div className="flex items-center gap-3 rounded-lg bg-forest-card/80 backdrop-blur-md border border-forest-border px-3 py-1.5">
          <span className="flex items-center gap-1 text-[10px] text-forest-gray">
            <span className="w-2 h-2 rounded-full bg-forest-gray/50" /> Locked
          </span>
          <span className="flex items-center gap-1 text-[10px] text-forest-emerald">
            <span className="w-2 h-2 rounded-full bg-forest-emerald" /> Active
          </span>
          <span className="flex items-center gap-1 text-[10px] text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Partial
          </span>
          <span className="flex items-center gap-1 text-[10px] text-cyan-400">
            <span className="w-2 h-2 rounded-full bg-cyan-400" /> Mastered
          </span>
        </div>
      </div>
    </div>
  )
}

export default DynamicConceptMap
