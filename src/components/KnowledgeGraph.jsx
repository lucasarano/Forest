import React, { useEffect, useRef } from 'react'

const KnowledgeGraph = ({ opacity = 0.3 }) => {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    let animationFrameId
    let nodes = []
    let previousWidth = window.innerWidth
    let previousHeight = window.innerHeight

    // Initialize canvas and nodes
    canvas.width = previousWidth
    canvas.height = previousHeight

    const nodeCount = 60
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 2.5 + 3.5,
      })
    }

    const resizeCanvas = () => {
      const newWidth = window.innerWidth
      const newHeight = window.innerHeight

      // Calculate scale factors
      const scaleX = newWidth / previousWidth
      const scaleY = newHeight / previousHeight

      // Scale node positions proportionally
      nodes.forEach(node => {
        node.x *= scaleX
        node.y *= scaleY
      })

      canvas.width = newWidth
      canvas.height = newHeight

      previousWidth = newWidth
      previousHeight = newHeight
    }

    let resizeTimeout
    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(resizeCanvas, 100)
    }

    window.addEventListener('resize', handleResize)

    const animate = () => {
      // Clear the canvas completely
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Update and draw nodes
      nodes.forEach((node, i) => {
        // Update position
        node.x += node.vx
        node.y += node.vy

        // Bounce off edges with some padding
        if (node.x < 0 || node.x > canvas.width) {
          node.vx *= -1
          node.x = Math.max(0, Math.min(canvas.width, node.x))
        }
        if (node.y < 0 || node.y > canvas.height) {
          node.vy *= -1
          node.y = Math.max(0, Math.min(canvas.height, node.y))
        }

        // Draw connections first (so they appear behind nodes)
        nodes.forEach((otherNode, j) => {
          if (i >= j) return // Only draw each connection once

          const dx = otherNode.x - node.x
          const dy = otherNode.y - node.y
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < 180) {
            ctx.beginPath()
            ctx.moveTo(node.x, node.y)
            ctx.lineTo(otherNode.x, otherNode.y)
            const lineOpacity = (1 - distance / 180) * opacity * 0.6
            ctx.strokeStyle = `rgba(52, 211, 153, ${lineOpacity})`
            ctx.lineWidth = 1.5
            ctx.stroke()
          }
        })
      })

      // Draw nodes on top (solid color)
      nodes.forEach((node) => {
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(52, 211, 153, ${Math.min(opacity + 0.2, 1)})`
        ctx.fill()
      })

      animationFrameId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimeout)
      cancelAnimationFrame(animationFrameId)
    }
  }, [opacity])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1 }}
    />
  )
}

export default KnowledgeGraph
