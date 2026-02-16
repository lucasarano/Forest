import React from 'react'

const TreeEdge = React.memo(({ source, target, isHovered, isInActivePath }) => {
  const dx = target.x - source.x
  const dy = target.y - source.y
  const length = Math.sqrt(dx * dx + dy * dy)

  if (length === 0) return null

  const perpX = -dy / length
  const perpY = dx / length

  const parentWidth = isHovered ? 16 : 12
  const childWidth = isHovered ? 1.5 : 0.8

  const segments = 20
  const topPoints = []
  const bottomPoints = []

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const widthT = Math.pow(1 - t, 3)
    const width = childWidth + (parentWidth - childWidth) * widthT
    const x = source.x + dx * t
    const y = source.y + dy * t
    topPoints.push(`${x + perpX * width},${y + perpY * width}`)
    bottomPoints.unshift(`${x - perpX * width},${y - perpY * width}`)
  }

  const polygonPoints = [...topPoints, ...bottomPoints].join(' ')
  const isActive = isHovered || isInActivePath

  const glowColor = isInActivePath ? 'rgba(251, 191, 36, 0.2)' : 'rgba(52, 211, 153, 0.12)'
  const mainColor = isInActivePath ? 'rgba(251, 191, 36, 0.5)' : 'rgba(52, 211, 153, 0.35)'
  const lineColor = isInActivePath ? 'rgba(251, 191, 36, 0.8)' : 'rgba(52, 211, 153, 0.6)'
  const particleColor = isInActivePath ? '#fbbf24' : '#34d399'

  return (
    <g>
      {/* Glow effect */}
      <polygon
        points={polygonPoints}
        fill={glowColor}
        stroke="none"
        className={isActive ? 'edge-glow-active' : ''}
        style={isActive ? undefined : { opacity: 0.15 }}
      />

      {/* Main tapered shape */}
      <polygon
        points={polygonPoints}
        fill={mainColor}
        stroke="none"
        className={isActive ? 'edge-main-active' : ''}
        style={isActive ? undefined : { opacity: 0.4 }}
      />

      {/* Center guide line */}
      <line
        x1={source.x}
        y1={source.y}
        x2={target.x}
        y2={target.y}
        stroke={lineColor}
        strokeWidth={isActive ? 1.5 : 0.8}
        strokeLinecap="round"
      />

      {/* Pulse along the edge when hovered or in active path */}
      {isActive && (
        <line
          x1={source.x}
          y1={source.y}
          x2={target.x}
          y2={target.y}
          stroke={particleColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="8 16"
          className="edge-dash-animate"
          style={{ opacity: 0.9 }}
        />
      )}
    </g>
  )
})

TreeEdge.displayName = 'TreeEdge'

export default TreeEdge
