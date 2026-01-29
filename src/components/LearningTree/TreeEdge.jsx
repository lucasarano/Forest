import React from 'react'
import { motion } from 'framer-motion'

const TreeEdge = ({ source, target, isHovered, isInActivePath }) => {
  // Calculate perpendicular vector for width
  const dx = target.x - source.x
  const dy = target.y - source.y
  const length = Math.sqrt(dx * dx + dy * dy)

  // Perpendicular unit vector
  const perpX = -dy / length
  const perpY = dx / length

  // Parent and child widths
  const parentWidth = isHovered ? 16 : 12
  const childWidth = isHovered ? 1.5 : 0.8

  // Create exponentially tapered shape with multiple segments
  const segments = 20 // Number of segments for smooth exponential taper
  const points = []

  // Calculate points along one side (top)
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    // Exponential easing function (power of 3 for more dramatic taper)
    const widthT = Math.pow(1 - t, 3)
    const width = childWidth + (parentWidth - childWidth) * widthT

    const x = source.x + dx * t
    const y = source.y + dy * t

    points.push({ x: x + perpX * width, y: y + perpY * width })
  }

  // Add points along other side (bottom) in reverse
  for (let i = segments; i >= 0; i--) {
    const t = i / segments
    const widthT = Math.pow(1 - t, 3)
    const width = childWidth + (parentWidth - childWidth) * widthT

    const x = source.x + dx * t
    const y = source.y + dy * t

    points.push({ x: x - perpX * width, y: y - perpY * width })
  }

  const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ')

  // Colors based on state (active path = golden, normal = emerald)
  const glowColor = isInActivePath ? 'rgba(251, 191, 36, 0.2)' : 'rgba(52, 211, 153, 0.12)'
  const mainColor = isInActivePath ? 'rgba(251, 191, 36, 0.5)' : 'rgba(52, 211, 153, 0.35)'
  const lineColor = isInActivePath ? 'rgba(251, 191, 36, 0.8)' : 'rgba(52, 211, 153, 0.6)'
  const particleColor = isInActivePath ? '#fbbf24' : '#34d399'

  return (
    <g>
      {/* Glow effect - exponentially tapered */}
      <motion.polygon
        points={polygonPoints}
        fill={glowColor}
        stroke="none"
        animate={{
          opacity: isHovered || isInActivePath ? [0.2, 0.4, 0.2] : 0.15,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Main tapered shape */}
      <motion.polygon
        points={polygonPoints}
        fill={mainColor}
        stroke="none"
        animate={{
          opacity: isHovered || isInActivePath ? [0.5, 0.8, 0.5] : 0.4,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Center guide line */}
      <motion.line
        x1={source.x}
        y1={source.y}
        x2={target.x}
        y2={target.y}
        stroke={lineColor}
        strokeWidth={isHovered || isInActivePath ? 1.5 : 0.8}
        strokeLinecap="round"
        animate={{
          strokeDashoffset: isHovered ? [0, 20] : 0,
        }}
        style={{
          strokeDasharray: isHovered ? '8 8' : 'none',
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Animated particle when hovered or in active path */}
      {(isHovered || isInActivePath) && (
        <motion.circle
          cx={source.x}
          cy={source.y}
          r="5"
          fill={particleColor}
          animate={{
            cx: [source.x, target.x],
            cy: [source.y, target.y],
            r: [5, 1.5],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: [0.4, 0, 1, 1], // Exponential easing
          }}
        />
      )}
    </g>
  )
}

export default TreeEdge
