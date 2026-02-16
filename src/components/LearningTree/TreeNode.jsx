import React, { useState, useRef, useCallback, useEffect } from 'react'

const TreeNode = React.memo(({
  node,
  onDrag,
  onClick,
  onHover,
  isSelected,
  scale,
  onLabelChange,
  onDoubleClickNode,
}) => {
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragRafRef = useRef(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(node.label)

  // Refs for values used inside drag closures (avoids stale captures)
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const onDragRef = useRef(onDrag)
  onDragRef.current = onDrag
  const nodeIdRef = useRef(node.id)
  nodeIdRef.current = node.id

  const textOutside = scale < 0.6
  const hasContent = (node.messages?.some(m => m.role === 'assistant')) || !!node.aiResponse

  // Sync editValue when label changes externally
  useEffect(() => {
    setEditValue(node.label)
  }, [node.label])

  const handleMouseDown = useCallback((e) => {
    e.stopPropagation()
    isDraggingRef.current = true
    const s = scaleRef.current
    dragStartRef.current = {
      x: e.clientX / s - node.position.x,
      y: e.clientY / s - node.position.y,
    }

    let latestPos = null

    const onMouseMove = (ev) => {
      if (!isDraggingRef.current) return
      const s = scaleRef.current
      latestPos = {
        x: ev.clientX / s - dragStartRef.current.x,
        y: ev.clientY / s - dragStartRef.current.y,
      }
      if (dragRafRef.current === null) {
        dragRafRef.current = requestAnimationFrame(() => {
          if (latestPos) onDragRef.current(nodeIdRef.current, latestPos)
          dragRafRef.current = null
        })
      }
    }

    const onMouseUp = () => {
      isDraggingRef.current = false
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current)
        if (latestPos) onDragRef.current(nodeIdRef.current, latestPos)
        dragRafRef.current = null
      }
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [node.position.x, node.position.y])

  const handleDoubleClick = useCallback((e) => {
    e.stopPropagation()
    if (onDoubleClickNode) {
      onDoubleClickNode(node.id)
    } else {
      setIsEditing(true)
      setEditValue(node.label)
    }
  }, [node.id, node.label, onDoubleClickNode])

  const handleBlur = useCallback(() => {
    setIsEditing(false)
    if (editValue.trim() && editValue !== node.label) {
      onLabelChange(node.id, editValue.trim())
    } else {
      setEditValue(node.label)
    }
  }, [editValue, node.label, node.id, onLabelChange])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.target.blur()
    } else if (e.key === 'Escape') {
      setEditValue(node.label)
      setIsEditing(false)
    }
  }, [node.label])

  const handleClick = useCallback((e) => {
    e.stopPropagation()
    if (!isEditing) onClick(node.id)
  }, [isEditing, node.id, onClick])

  const handleMouseEnter = useCallback(() => onHover(node.id), [node.id, onHover])
  const handleMouseLeave = useCallback(() => onHover(null), [onHover])

  return (
    <div
      className="absolute cursor-pointer tree-node"
      style={{
        left: node.position.x,
        top: node.position.y,
        transform: 'translate(-50%, -50%)',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Circular Node */}
      <div
        className={`
          relative w-14 h-14
          bg-forest-card/80 backdrop-blur-md
          border-2 ${isSelected ? 'border-forest-emerald shadow-lg shadow-forest-emerald/30' : 'border-forest-border'}
          rounded-full
          flex items-center justify-center
          node-circle
        `}
      >
        {/* Glowing gradient background */}
        <div className={`
          absolute inset-0 rounded-full 
          bg-gradient-to-br from-forest-emerald/30 to-forest-teal/20 
          ${isSelected ? 'opacity-80' : 'opacity-40'}
          transition-opacity duration-150
        `} />

        {/* Pulse animation when selected - CSS driven */}
        {isSelected && (
          <div className="absolute inset-0 rounded-full border-2 border-forest-emerald node-pulse-ring" />
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

        {/* Content indicator ring - CSS driven */}
        {hasContent && (
          <div className="absolute inset-1 rounded-full border border-forest-emerald/40 node-content-ring" />
        )}
      </div>

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
    </div>
  )
})

TreeNode.displayName = 'TreeNode'

export default TreeNode
