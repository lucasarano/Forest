import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { motion } from 'framer-motion'
import { Focus } from 'lucide-react'
import TreeNode from './TreeNode'
import TreeEdge from './TreeEdge'
import { getActivePath } from '../../lib/contextEngine'

const STORAGE_KEY = 'forest-learning-tree'

const TreeCanvas = forwardRef(({
  nodes,
  edges,
  setNodes,
  setEdges,
  activeNodeId,
  setActiveNodeId,
  activePath,
  setActivePath,
  onDoubleClickNode,
}, ref) => {
  const canvasRef = useRef(null)
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 })
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const [isPanning, setIsPanning] = useState(false)
  const [hoveredNode, setHoveredNode] = useState(null)

  // Refs for stable callbacks (avoid stale closures)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges
  const activeNodeIdRef = useRef(activeNodeId)
  activeNodeIdRef.current = activeNodeId

  // Panning refs (avoid state updates on every mouse move)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const panDeltaRef = useRef({ dx: 0, dy: 0 })
  const panRafRef = useRef(null)

  // Load camera from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        setCamera(data.camera || { x: 0, y: 0, scale: 1 })
      }
    } catch (error) {
      console.error('Failed to load camera from localStorage:', error)
    }
  }, [])

  // Debounced save of camera to localStorage
  const cameraSaveTimerRef = useRef(null)
  useEffect(() => {
    if (cameraSaveTimerRef.current) clearTimeout(cameraSaveTimerRef.current)
    cameraSaveTimerRef.current = setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        const data = saved ? JSON.parse(saved) : {}
        data.camera = camera
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      } catch (error) {
        console.error('Failed to save camera to localStorage:', error)
      }
      cameraSaveTimerRef.current = null
    }, 500)
    return () => {
      if (cameraSaveTimerRef.current) clearTimeout(cameraSaveTimerRef.current)
    }
  }, [camera])

  // Center view on all nodes and zoom to fit
  const centerAndFit = useCallback(() => {
    if (!canvasRef.current || nodesRef.current.length === 0) return
    const rect = canvasRef.current.getBoundingClientRect()
    const viewW = rect.width
    const viewH = rect.height

    const padding = 80
    const ns = nodesRef.current
    const minX = Math.min(...ns.map(n => n.position.x))
    const maxX = Math.max(...ns.map(n => n.position.x))
    const minY = Math.min(...ns.map(n => n.position.y))
    const maxY = Math.max(...ns.map(n => n.position.y))

    const contentW = maxX - minX + padding * 2
    const contentH = maxY - minY + padding * 2
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    const scaleX = viewW / contentW
    const scaleY = viewH / contentH
    const scale = Math.min(scaleX, scaleY, 1.2)
    const scaleClamped = Math.max(0.2, Math.min(3, scale))

    setCamera({
      x: viewW / 2 - centerX * scaleClamped,
      y: viewH / 2 - centerY * scaleClamped,
      scale: scaleClamped,
    })
  }, [])

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    centerOnNode: (nodeId) => {
      const node = nodesRef.current.find(n => n.id === nodeId)
      if (node && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect()
        setCamera(prev => ({
          ...prev,
          x: rect.width / 2 - node.position.x * prev.scale,
          y: rect.height / 2 - node.position.y * prev.scale,
        }))
      }
    },
    centerAndFit,
    getCamera: () => cameraRef.current,
  }), [centerAndFit])

  // Generate unique ID
  const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Create root node on double click (only on canvas, not on nodes)
  const handleDoubleClick = useCallback((e) => {
    if (e.target.closest('.tree-node')) return

    const rect = canvasRef.current.getBoundingClientRect()
    const cam = cameraRef.current
    const x = (e.clientX - rect.left - cam.x) / cam.scale
    const y = (e.clientY - rect.top - cam.y) / cam.scale

    const newNode = {
      id: generateId(),
      label: `Node ${nodesRef.current.length + 1}`,
      position: { x, y },
      parentId: null,
      question: '',
      aiResponse: '',
      contextAnchor: '',
      highlights: [],
      messages: [],
    }

    setNodes(prev => [...prev, newNode])
    setActiveNodeId(newNode.id)
    setActivePath([])
  }, [setNodes, setActiveNodeId, setActivePath])

  // ─── Panning with RAF batching ───────────────────────────────────────────────

  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('.tree-node')) return
    isPanningRef.current = true
    setIsPanning(true)
    panStartRef.current = { x: e.clientX, y: e.clientY }
    panDeltaRef.current = { dx: 0, dy: 0 }
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!isPanningRef.current) return

    const dx = e.clientX - panStartRef.current.x
    const dy = e.clientY - panStartRef.current.y
    panStartRef.current = { x: e.clientX, y: e.clientY }

    panDeltaRef.current.dx += dx
    panDeltaRef.current.dy += dy

    if (panRafRef.current === null) {
      panRafRef.current = requestAnimationFrame(() => {
        const { dx: totalDx, dy: totalDy } = panDeltaRef.current
        panDeltaRef.current = { dx: 0, dy: 0 }
        setCamera(prev => ({
          ...prev,
          x: prev.x + totalDx,
          y: prev.y + totalDy,
        }))
        panRafRef.current = null
      })
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    if (!isPanningRef.current) return
    isPanningRef.current = false
    setIsPanning(false)

    // Flush any pending delta
    if (panRafRef.current !== null) {
      cancelAnimationFrame(panRafRef.current)
      panRafRef.current = null
    }
    const { dx, dy } = panDeltaRef.current
    if (dx !== 0 || dy !== 0) {
      panDeltaRef.current = { dx: 0, dy: 0 }
      setCamera(prev => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy,
      }))
    }
  }, [])

  // ─── Zoom with mouse wheel ───────────────────────────────────────────────────

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const cam = cameraRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const worldX = (mouseX - cam.x) / cam.scale
    const worldY = (mouseY - cam.y) / cam.scale

    const zoomSpeed = 0.003
    const delta = -e.deltaY * zoomSpeed
    const newScale = Math.min(3, Math.max(0.2, cam.scale + delta))

    const newX = mouseX - worldX * newScale
    const newY = mouseY - worldY * newScale

    setCamera({ x: newX, y: newY, scale: newScale })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false })
      return () => canvas.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  // ─── Stable node callbacks (never change → React.memo on TreeNode works) ────

  const handleNodeDrag = useCallback((nodeId, newPosition) => {
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, position: newPosition } : n
    ))
  }, [setNodes])

  const handleLabelChange = useCallback((nodeId, newLabel) => {
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, label: newLabel } : n
    ))
  }, [setNodes])

  const handleNodeClick = useCallback((nodeId) => {
    if (activeNodeIdRef.current === nodeId) {
      setActiveNodeId(null)
      setActivePath([])
    } else {
      setActiveNodeId(nodeId)
      const pathEdgeIds = getActivePath(nodeId, nodesRef.current, edgesRef.current)
      setActivePath(pathEdgeIds)
    }
  }, [setActiveNodeId, setActivePath])

  return (
    <div
      ref={canvasRef}
      className="w-full h-full bg-forest-darker overflow-hidden relative"
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Grid Background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(52, 211, 153, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(52, 211, 153, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: `${50 * camera.scale}px ${50 * camera.scale}px`,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }}
      />

      {/* Canvas Transform Container */}
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
        <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          {edges.map(edge => {
            const source = nodes.find(n => n.id === edge.sourceId)
            const target = nodes.find(n => n.id === edge.targetId)
            if (!source || !target) return null

            const isInActivePath = activePath.includes(edge.id)

            return (
              <TreeEdge
                key={edge.id}
                source={source.position}
                target={target.position}
                isHovered={hoveredNode === edge.sourceId || hoveredNode === edge.targetId}
                isInActivePath={isInActivePath}
              />
            )
          })}
        </svg>

        {/* Nodes */}
        {nodes.map(node => (
          <TreeNode
            key={node.id}
            node={node}
            onDrag={handleNodeDrag}
            onClick={handleNodeClick}
            onHover={setHoveredNode}
            onLabelChange={handleLabelChange}
            isSelected={activeNodeId === node.id}
            scale={camera.scale}
            onDoubleClickNode={onDoubleClickNode}
          />
        ))}
      </div>

      {/* Instructions Overlay */}
      {nodes.length === 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-forest-light-gray"
          >
            <p className="text-xl font-semibold mb-2 text-forest-emerald">Start your Learning Tree</p>
            <p className="text-base">Double-click anywhere to create your first node</p>
          </motion.div>
        </div>
      )}

      {/* Canvas controls: Center + Zoom indicator */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2">
        {nodes.length > 0 && (
          <button
            type="button"
            onClick={centerAndFit}
            className="p-2 bg-forest-card/80 backdrop-blur-md border border-forest-border rounded-lg text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors"
            title="Center and fit all nodes"
          >
            <Focus size={18} />
          </button>
        )}
        <div className="bg-forest-card/80 backdrop-blur-md border border-forest-border rounded-lg px-3 py-2 text-xs text-forest-light-gray">
          <span className="text-forest-emerald">{(camera.scale * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  )
})

TreeCanvas.displayName = 'TreeCanvas'

export default TreeCanvas
