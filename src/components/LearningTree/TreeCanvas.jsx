import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { motion } from 'framer-motion'
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
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState(null)

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

  // Save camera to localStorage whenever it changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      const data = saved ? JSON.parse(saved) : {}
      data.camera = camera
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save camera to localStorage:', error)
    }
  }, [camera])

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    centerOnNode: (nodeId) => {
      const node = nodes.find(n => n.id === nodeId)
      if (node && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect()
        setCamera(prev => ({
          ...prev,
          x: rect.width / 2 - node.position.x * prev.scale,
          y: rect.height / 2 - node.position.y * prev.scale,
        }))
      }
    },
    getCamera: () => camera,
  }))

  // Generate unique ID
  const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Create root node on double click (only on canvas, not on nodes)
  const handleDoubleClick = (e) => {
    // Don't create node if clicking on an existing node
    if (e.target.closest('.tree-node')) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left - camera.x) / camera.scale
    const y = (e.clientY - rect.top - camera.y) / camera.scale

    const newNode = {
      id: generateId(),
      label: `Node ${nodes.length + 1}`,
      position: { x, y },
      parentId: null,
      question: '',
      aiResponse: '',
      contextAnchor: '',
      highlights: [],
      messages: [],
    }

    setNodes([...nodes, newNode])

    // Auto-select the new node
    setActiveNodeId(newNode.id)
    setActivePath([])
  }

  // Handle canvas panning
  const handleMouseDown = (e) => {
    // Only pan if clicking on the canvas itself (not on nodes)
    if (e.target.closest('.tree-node')) return

    setIsPanning(true)
    setPanStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x
      const dy = e.clientY - panStart.y

      setCamera(prev => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy,
      }))

      setPanStart({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  // Handle zoom with mouse wheel - centered on cursor
  const handleWheel = (e) => {
    e.preventDefault()

    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Mouse position in world coordinates (before zoom)
    const worldX = (mouseX - camera.x) / camera.scale
    const worldY = (mouseY - camera.y) / camera.scale

    const zoomSpeed = 0.003
    const delta = -e.deltaY * zoomSpeed
    const newScale = Math.min(3, Math.max(0.2, camera.scale + delta))

    // Adjust camera position so zoom happens at mouse cursor
    const newX = mouseX - worldX * newScale
    const newY = mouseY - worldY * newScale

    setCamera({ x: newX, y: newY, scale: newScale })
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false })
      return () => canvas.removeEventListener('wheel', handleWheel)
    }
  }, [camera])

  // Update node position
  const handleNodeDrag = (nodeId, newPosition) => {
    setNodes(nodes.map(n =>
      n.id === nodeId ? { ...n, position: newPosition } : n
    ))
  }

  // Update node label
  const handleLabelChange = (nodeId, newLabel) => {
    setNodes(nodes.map(n =>
      n.id === nodeId ? { ...n, label: newLabel } : n
    ))
  }

  // Click node to select
  const handleNodeClick = (nodeId) => {
    if (activeNodeId === nodeId) {
      // Clicking the same node again - deselect
      setActiveNodeId(null)
      setActivePath([])
    } else {
      // Select this node
      setActiveNodeId(nodeId)
      // Calculate and highlight active path
      const pathEdgeIds = getActivePath(nodeId, nodes, edges)
      setActivePath(pathEdgeIds)
    }
  }

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

      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-4 bg-forest-card/80 backdrop-blur-md border border-forest-border rounded-lg px-3 py-2 text-xs text-forest-light-gray">
        <span className="text-forest-emerald">{(camera.scale * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
})

TreeCanvas.displayName = 'TreeCanvas'

export default TreeCanvas
