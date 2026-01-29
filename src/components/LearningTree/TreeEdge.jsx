import React from 'react'
import { motion } from 'framer-motion'

const TreeEdge = ({ source, target, isHovered }) => {
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

  return (
    <g>
      {/* Glow effect - exponentially tapered */}
      <motion.polygon
        points={polygonPoints}
        fill="rgba(52, 211, 153, 0.12)"
        stroke="none"
        animate={{
          opacity: isHovered ? [0.15, 0.35, 0.15] : 0.12,
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
        fill="rgba(52, 211, 153, 0.35)"
        stroke="none"
        animate={{
          opacity: isHovered ? [0.4, 0.7, 0.4] : 0.4,
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
        stroke="rgba(52, 211, 153, 0.6)"
        strokeWidth={isHovered ? 1.2 : 0.8}
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

      {/* Animated particle when hovered - shrinks exponentially */}
      {isHovered && (
        <motion.circle
          cx={source.x}
          cy={source.y}
          r="5"
          fill="#34d399"
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
