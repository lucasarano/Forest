import React, { useState } from 'react'
import { motion } from 'framer-motion'

const TreeNode = ({ node, onDrag, onClick, onHover, isSelected, scale, onLabelChange }) => {
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(node.label)

  // Determine if text should be outside (when zoomed out)
  const textOutside = scale < 0.6

  const handleMouseDown = (e) => {
    e.stopPropagation()
    setIsDragging(true)
    setDragStart({
      x: e.clientX / scale - node.position.x,
      y: e.clientY / scale - node.position.y,
    })
  }

  const handleMouseMove = (e) => {
    if (isDragging) {
      const newX = e.clientX / scale - dragStart.x
      const newY = e.clientY / scale - dragStart.y
      onDrag(node.id, { x: newX, y: newY })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleDoubleClick = (e) => {
    e.stopPropagation()
    setIsEditing(true)
    setEditValue(node.label)
  }

  const handleBlur = () => {
    setIsEditing(false)
    if (editValue.trim() && editValue !== node.label) {
      onLabelChange(node.id, editValue.trim())
    } else {
      setEditValue(node.label)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur()
    } else if (e.key === 'Escape') {
      setEditValue(node.label)
      setIsEditing(false)
    }
  }

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragStart])

  return (
    <motion.div
      className="absolute cursor-pointer tree-node"
      style={{
        left: node.position.x,
        top: node.position.y,
        x: '-50%',
        y: '-50%',
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation()
        if (!isEditing) {
          onClick(node.id)
        }
      }}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      whileHover={{ scale: 1.05 }}
      animate={{
        scale: isSelected ? 1.1 : 1,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* Circular Node */}
      <div
        className={`
          relative w-12 h-12
          bg-forest-card/60 backdrop-blur-md
          border-2 ${isSelected ? 'border-forest-emerald' : 'border-forest-border'}
          rounded-full shadow-xl
          transition-all duration-100
          flex items-center justify-center
        `}
      >
        {/* Glowing effect */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-forest-emerald/20 to-forest-teal/20 opacity-50" />

        {/* Pulse animation when selected */}
        {isSelected && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-forest-emerald"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.5, 0, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {/* Center glow dot */}
        <div className="relative z-10 w-3 h-3 bg-forest-emerald rounded-full shadow-lg shadow-forest-emerald/50" />
      </div>

      {/* Label - inside or outside based on zoom */}
      {textOutside ? (
        // Text outside node when zoomed out
        <div
          className="absolute left-16 top-1/2 transform -translate-y-1/2 whitespace-nowrap pointer-events-auto"
          style={{ minWidth: '100px' }}
        >
          {isEditing ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              className="bg-forest-card/80 backdrop-blur-md border border-forest-emerald text-white text-xs px-2 py-1 rounded outline-none"
            />
          ) : (
            <div className="bg-forest-card/80 backdrop-blur-md border border-forest-border text-white text-xs px-2 py-1 rounded">
              {node.label}
            </div>
          )}
        </div>
      ) : (
        // Text inside/below node when zoomed in
        <div
          className="absolute left-1/2 transform -translate-x-1/2 whitespace-nowrap pointer-events-auto"
          style={{ top: '56px' }}
        >
          {isEditing ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              className="bg-forest-card/80 backdrop-blur-md border border-forest-emerald text-white text-sm px-2 py-1 rounded outline-none text-center"
            />
          ) : (
            <div className="text-white text-sm font-medium text-center">
              {node.label}
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

export default TreeNode
