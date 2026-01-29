import React, { useState } from 'react'
import { motion } from 'framer-motion'

const TreeNode = ({
  node,
  onDrag,
  onClick,
  onHover,
  isSelected,
  scale,
  onLabelChange,
}) => {
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

  // Node has AI content
  const hasContent = !!node.aiResponse

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
    >
      {/* Circular Node */}
      <motion.div
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className={`
          relative w-14 h-14
          bg-forest-card/80 backdrop-blur-md
          border-2 ${isSelected ? 'border-forest-emerald shadow-lg shadow-forest-emerald/30' : 'border-forest-border'}
          rounded-full
          transition-all duration-150
          flex items-center justify-center
        `}
      >
        {/* Glowing gradient background */}
        <div className={`
          absolute inset-0 rounded-full 
          bg-gradient-to-br from-forest-emerald/30 to-forest-teal/20 
          ${isSelected ? 'opacity-80' : 'opacity-40'}
          transition-opacity duration-150
        `} />

        {/* Pulse animation when selected */}
        {isSelected && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-forest-emerald"
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.6, 0, 0.6],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {/* Center indicator */}
        <div className={`
          relative z-10 w-4 h-4 rounded-full shadow-lg
          ${hasContent
            ? 'bg-forest-emerald shadow-forest-emerald/50'
            : 'bg-forest-gray/50 shadow-forest-gray/30'
          }
          ${isSelected ? 'scale-110' : ''}
          transition-all duration-150
        `} />

        {/* Content indicator ring */}
        {hasContent && (
          <motion.div
            className="absolute inset-1 rounded-full border border-forest-emerald/40"
            animate={{
              opacity: [0.4, 0.8, 0.4],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}
      </motion.div>

      {/* Label */}
      {textOutside ? (
        // Text beside node when zoomed out
        <div
          className="absolute left-18 top-1/2 transform -translate-y-1/2 whitespace-nowrap pointer-events-auto"
          style={{ left: '64px' }}
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
              className="bg-forest-card/90 backdrop-blur-md border border-forest-emerald text-white text-xs px-2 py-1 rounded-lg outline-none"
            />
          ) : (
            <div className={`
              bg-forest-card/90 backdrop-blur-md border text-white text-xs px-2 py-1 rounded-lg
              ${isSelected ? 'border-forest-emerald/50' : 'border-forest-border'}
              transition-colors duration-150
            `}>
              {node.label}
            </div>
          )}
        </div>
      ) : (
        // Text below node when zoomed in
        <div
          className="absolute left-1/2 transform -translate-x-1/2 whitespace-nowrap pointer-events-auto"
          style={{ top: '64px' }}
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
              className="bg-forest-card/90 backdrop-blur-md border border-forest-emerald text-white text-sm px-3 py-1.5 rounded-lg outline-none text-center"
            />
          ) : (
            <div className={`
              text-white text-sm font-medium text-center px-2 py-1 rounded-lg
              ${isSelected ? 'bg-forest-card/80 border border-forest-emerald/30' : ''}
              transition-all duration-150
            `}>
              {node.label}
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

export default TreeNode
