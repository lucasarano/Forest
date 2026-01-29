import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const ParallaxBackground = ({ camera }) => {
  const [ghostNodes, setGhostNodes] = useState([])

  useEffect(() => {
    // Generate random ghost nodes for parallax effect
    const nodes = []
    for (let i = 0; i < 30; i++) {
      nodes.push({
        id: i,
        x: Math.random() * 2000 - 1000,
        y: Math.random() * 2000 - 1000,
        size: Math.random() * 20 + 10,
        opacity: Math.random() * 0.1 + 0.05,
        layer: Math.random() < 0.5 ? 0.3 : 0.5, // Different parallax layers
      })
    }
    setGhostNodes(nodes)
  }, [])

  // Generate some ghost connections
  const ghostConnections = []
  for (let i = 0; i < ghostNodes.length - 1; i += 3) {
    if (i + 1 < ghostNodes.length) {
      ghostConnections.push({
        from: ghostNodes[i],
        to: ghostNodes[i + 1],
      })
    }
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg className="absolute inset-0 w-full h-full">
        {/* Ghost connections */}
        {ghostConnections.map((conn, i) => {
          const parallaxX = -camera.x * conn.from.layer
          const parallaxY = -camera.y * conn.from.layer

          return (
            <line
              key={`conn-${i}`}
              x1={conn.from.x + parallaxX + window.innerWidth / 2}
              y1={conn.from.y + parallaxY + window.innerHeight / 2}
              x2={conn.to.x + parallaxX + window.innerWidth / 2}
              y2={conn.to.y + parallaxY + window.innerHeight / 2}
              stroke="rgba(52, 211, 153, 0.05)"
              strokeWidth="1"
            />
          )
        })}

        {/* Ghost nodes */}
        {ghostNodes.map((node) => {
          const parallaxX = -camera.x * node.layer
          const parallaxY = -camera.y * node.layer

          return (
            <motion.circle
              key={node.id}
              cx={node.x + parallaxX + window.innerWidth / 2}
              cy={node.y + parallaxY + window.innerHeight / 2}
              r={node.size}
              fill={`rgba(52, 211, 153, ${node.opacity})`}
              animate={{
                opacity: [node.opacity * 0.5, node.opacity, node.opacity * 0.5],
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )
        })}
      </svg>
    </div>
  )
}

export default ParallaxBackground
