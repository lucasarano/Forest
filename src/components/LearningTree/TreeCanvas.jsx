import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import TreeNode from './TreeNode'
import TreeEdge from './TreeEdge'
import ParallaxBackground from './ParallaxBackground'

const TreeCanvas = () => {
  const canvasRef = useRef(null)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState(null)
  const [showPlusMenu, setShowPlusMenu] = useState(null)

  // Generate unique ID
  const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Create root node on double click (only on canvas, not on nodes)
  const handleDoubleClick = (e) => {
    // Don't create node if clicking on an existing node
    if (e.target.closest('.tree-node')) return

    // Close menu if open
    if (showPlusMenu) {
      setShowPlusMenu(null)
      return
    }

    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left - camera.x) / camera.scale
    const y = (e.clientY - rect.top - camera.y) / camera.scale

    const newNode = {
      id: generateId(),
      label: `Node ${nodes.length + 1}`,
      position: { x, y },
      parentId: null,
    }

    setNodes([...nodes, newNode])
  }

  // Handle canvas panning
  const handleMouseDown = (e) => {
    // Only pan if clicking on the canvas itself (not on nodes)
    if (e.target.closest('.tree-node')) return

    // Close plus menu when clicking on empty canvas
    if (showPlusMenu) {
      setShowPlusMenu(null)
    }

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

  // Create child node
  const handleCreateChild = (parentId) => {
    const parent = nodes.find(n => n.id === parentId)
    if (!parent) return

    const angle = Math.random() * Math.PI * 2
    const distance = 150
    const newNode = {
      id: generateId(),
      label: `Node ${nodes.length + 1}`,
      position: {
        x: parent.position.x + Math.cos(angle) * distance,
        y: parent.position.y + Math.sin(angle) * distance,
      },
      parentId: parentId,
    }

    const newEdge = {
      id: `edge_${parentId}_${newNode.id}`,
      sourceId: parentId,
      targetId: newNode.id,
    }

    setNodes([...nodes, newNode])
    setEdges([...edges, newEdge])
    setShowPlusMenu(null)
  }

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

  // Click node to show plus menu
  const handleNodeClick = (nodeId) => {
    setShowPlusMenu(showPlusMenu === nodeId ? null : nodeId)
  }

  // Delete node and its children
  const handleDeleteNode = (nodeId) => {
    const deleteRecursive = (id) => {
      const children = nodes.filter(n => n.parentId === id)
      children.forEach(child => deleteRecursive(child.id))
      setNodes(prev => prev.filter(n => n.id !== id))
      setEdges(prev => prev.filter(e => e.sourceId !== id && e.targetId !== id))
    }
    deleteRecursive(nodeId)
    setShowPlusMenu(null)
  }

  return (
    <div
      ref={canvasRef}
      className="fixed inset-0 bg-forest-darker overflow-hidden"
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

      {/* Parallax Background */}
      <ParallaxBackground camera={camera} />

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

            return (
              <TreeEdge
                key={edge.id}
                source={source.position}
                target={target.position}
                isHovered={hoveredNode === edge.sourceId || hoveredNode === edge.targetId}
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
            isSelected={showPlusMenu === node.id}
            scale={camera.scale}
          />
        ))}

        {/* Plus Menu */}
        <AnimatePresence>
          {showPlusMenu && nodes.find(n => n.id === showPlusMenu) && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="absolute z-50 bg-forest-card/90 backdrop-blur-md border border-forest-emerald rounded-lg p-2 shadow-xl pointer-events-auto"
              style={{
                left: nodes.find(n => n.id === showPlusMenu).position.x + 60,
                top: nodes.find(n => n.id === showPlusMenu).position.y - 40,
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleCreateChild(showPlusMenu)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="px-3 py-2 text-forest-emerald hover:bg-forest-emerald/20 rounded transition-colors duration-100 flex items-center gap-2 w-full"
              >
                <span className="text-xl">+</span>
                <span className="text-sm">Add Child</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteNode(showPlusMenu)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="px-3 py-2 text-red-400 hover:bg-red-500/20 rounded transition-colors duration-100 flex items-center gap-2 mt-1 w-full"
              >
                <span className="text-xl">×</span>
                <span className="text-sm">Delete</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Instructions Overlay */}
      {nodes.length === 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-forest-light-gray"
          >
            <p className="text-2xl font-semibold mb-2 text-forest-emerald">Welcome to your Learning Tree</p>
            <p className="text-lg">Double-click anywhere to create your first node</p>
            <p className="text-sm mt-2 opacity-70">Click nodes to add children • Drag to move • Scroll to zoom</p>
          </motion.div>
        </div>
      )}

      {/* Controls Info */}
      <div className="absolute bottom-4 left-4 bg-forest-card/80 backdrop-blur-md border border-forest-border rounded-lg p-3 text-sm text-forest-light-gray">
        <div className="flex flex-col gap-1">
          <div><span className="text-forest-emerald">Nodes:</span> {nodes.length}</div>
          <div><span className="text-forest-emerald">Zoom:</span> {(camera.scale * 100).toFixed(0)}%</div>
          <div className="text-xs opacity-70 mt-1">Double-click to create</div>
        </div>
      </div>
    </div>
  )
}

export default TreeCanvas
