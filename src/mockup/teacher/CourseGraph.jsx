import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { graphAssignments, conceptNodes, getClassMastery, getTeacherNodeColor } from '../data/mockData'

const CourseGraph = ({ courseId }) => {
  const navigate = useNavigate()
  const [hoveredNode, setHoveredNode] = useState(null)

  const assignments = graphAssignments[courseId] || []
  const allNodes = assignments.flatMap(a =>
    (conceptNodes[a.id] || []).map(n => ({
      ...n,
      assignmentId: a.id,
      mastery: getClassMastery(n.id, courseId),
    }))
  )

  const allEdges = []
  assignments.forEach(a => {
    const nodes = conceptNodes[a.id] || []
    nodes.forEach(n => {
      n.parentIds.forEach(pid => {
        allEdges.push({ from: pid, to: n.id })
      })
    })
  })

  const svgWidth = 1000
  const svgHeight = 640
  const nodeRadius = 42

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold text-white">Course Concept Graph</h2>
        <div className="flex items-center gap-4 ml-auto text-xs text-forest-gray">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Mastered
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Moderate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Struggling
          </span>
        </div>
      </div>

      <div className="bg-forest-card/60 border border-forest-border/40 rounded-xl p-6 overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full"
          style={{ minWidth: 800, maxHeight: 640 }}
        >
          {/* Edges */}
          {allEdges.map((edge, i) => {
            const from = allNodes.find(n => n.id === edge.from)
            const to = allNodes.find(n => n.id === edge.to)
            if (!from || !to) return null
            return (
              <line
                key={i}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#1f2d27"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            )
          })}

          {/* Nodes */}
          {allNodes.map(node => {
            const color = getTeacherNodeColor(node.mastery)
            const isHovered = hoveredNode === node.id
            return (
              <g
                key={node.id}
                onClick={() => navigate(`/mockup/teacher/course/${courseId}/node/${node.id}`)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer"
              >
                {/* Glow for struggling nodes */}
                {node.mastery < 40 && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={nodeRadius + 8}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={2}
                    opacity={0.3}
                  >
                    <animate
                      attributeName="opacity"
                      values="0.1;0.4;0.1"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isHovered ? nodeRadius + 4 : nodeRadius}
                  fill={color}
                  opacity={isHovered ? 1 : 0.85}
                  style={{ transition: 'all 0.2s ease' }}
                />

                {/* Text wrapping for long labels */}
                {(() => {
                  const words = node.label.split(' ')
                  if (words.length === 1 || node.label.length <= 15) {
                    return (
                      <>
                        <text
                          x={node.x}
                          y={node.y - 10}
                          textAnchor="middle"
                          fill="white"
                          fontSize={12}
                          fontWeight="600"
                          style={{ pointerEvents: 'none' }}
                        >
                          {node.label}
                        </text>
                        <text
                          x={node.x}
                          y={node.y + 8}
                          textAnchor="middle"
                          fill="white"
                          fontSize={13}
                          fontWeight="700"
                          opacity={0.9}
                          style={{ pointerEvents: 'none' }}
                        >
                          {node.mastery}%
                        </text>
                      </>
                    )
                  }
                  // Multi-line text for longer labels
                  const midPoint = Math.ceil(words.length / 2)
                  const line1 = words.slice(0, midPoint).join(' ')
                  const line2 = words.slice(midPoint).join(' ')
                  return (
                    <>
                      <text
                        x={node.x}
                        y={node.y - 18}
                        textAnchor="middle"
                        fill="white"
                        fontSize={11}
                        fontWeight="600"
                        style={{ pointerEvents: 'none' }}
                      >
                        {line1}
                      </text>
                      <text
                        x={node.x}
                        y={node.y - 6}
                        textAnchor="middle"
                        fill="white"
                        fontSize={11}
                        fontWeight="600"
                        style={{ pointerEvents: 'none' }}
                      >
                        {line2}
                      </text>
                      <text
                        x={node.x}
                        y={node.y + 12}
                        textAnchor="middle"
                        fill="white"
                        fontSize={13}
                        fontWeight="700"
                        opacity={0.9}
                        style={{ pointerEvents: 'none' }}
                      >
                        {node.mastery}%
                      </text>
                    </>
                  )
                })()}

                {node.mastery < 40 && (
                  <g transform={`translate(${node.x + nodeRadius - 6}, ${node.y - nodeRadius + 6})`}>
                    <circle cx={0} cy={0} r={8} fill="#1f1f1f" />
                    <text x={0} y={4} textAnchor="middle" fill="#ef4444" fontSize={11} fontWeight="bold">!</text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Struggling concepts callout */}
      {allNodes.filter(n => n.mastery < 40).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 bg-red-900/20 border border-red-800/40 rounded-lg px-5 py-3.5 flex items-start gap-3"
        >
          <AlertTriangle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-red-300 font-medium text-sm">Attention Required</p>
            <p className="text-red-400/70 text-sm mt-0.5">
              {allNodes.filter(n => n.mastery < 40).map(n => n.label).join(', ')} — students are struggling with these concepts. Click a node for details.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default CourseGraph
