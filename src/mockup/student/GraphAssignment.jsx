import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ClipboardCheck, MessageCircle } from 'lucide-react'
import MockLayout from '../MockLayout'
import Button from '../../components/Button'
import {
  getCourseById, getAssignmentById, conceptNodes, studentMastery, getNodeMasteryColor,
} from '../data/mockData'

const CURRENT_STUDENT = 's1'

const GraphAssignment = () => {
  const { courseId, assignmentId } = useParams()
  const navigate = useNavigate()
  const [hoveredNode, setHoveredNode] = useState(null)

  const course = getCourseById(courseId)
  const assignment = getAssignmentById(assignmentId)
  const nodes = conceptNodes[assignmentId] || []

  if (!course || !assignment) {
    return (
      <MockLayout role="student" breadcrumbs={[{ label: 'Dashboard', to: '/mockup/student' }, { label: 'Not Found' }]}>
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <p className="text-forest-light-gray">Assignment not found.</p>
        </div>
      </MockLayout>
    )
  }

  const nodesWithMastery = nodes.map(n => ({
    ...n,
    mastery: studentMastery[CURRENT_STUDENT]?.[n.id] ?? 0,
  }))

  const edges = []
  nodes.forEach(n => {
    n.parentIds.forEach(pid => {
      edges.push({ from: pid, to: n.id })
    })
  })

  const svgWidth = 1000
  const svgHeight = 640
  const nodeRadius = 42

  return (
    <MockLayout
      role="student"
      breadcrumbs={[
        { label: 'Dashboard', to: '/mockup/student' },
        { label: course.code, to: `/mockup/student/course/${courseId}` },
        { label: assignment.name },
      ]}
    >
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl xl:text-3xl font-bold text-white mb-1">{assignment.name}</h1>
            <p className="text-forest-light-gray text-sm">
              Click on a concept node to study with AI, or take a test to prove mastery
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => navigate(`/mockup/student/course/${courseId}/graph/${assignmentId}/test`)}
            className="!text-sm flex items-center gap-2"
          >
            <ClipboardCheck size={16} />
            Take Test
          </Button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 mb-4 text-xs text-forest-gray">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#10b981' }} /> Strong (Mastered)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#6b7280' }} /> Moderate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#374151' }} /> Weak (Needs Work)
          </span>
        </div>

        {/* Graph */}
        <div className="bg-forest-card/60 border border-forest-border/40 rounded-xl p-6 overflow-x-auto">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full"
            style={{ minWidth: 800, maxHeight: 640 }}
          >
            {/* Edges */}
            {edges.map((edge, i) => {
              const from = nodesWithMastery.find(n => n.id === edge.from)
              const to = nodesWithMastery.find(n => n.id === edge.to)
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
            {nodesWithMastery.map(node => {
              const color = getNodeMasteryColor(node.mastery)
              const isHovered = hoveredNode === node.id
              const glowOpacity = node.mastery >= 80 ? 0.4 : 0

              return (
                <g
                  key={node.id}
                  onClick={() => navigate(`/mockup/student/course/${courseId}/graph/${assignmentId}/node/${node.id}`)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  className="cursor-pointer"
                >
                  {/* Green glow for mastered nodes */}
                  {glowOpacity > 0 && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={nodeRadius + 10}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={2}
                      opacity={glowOpacity}
                    >
                      <animate
                        attributeName="opacity"
                        values={`${glowOpacity * 0.5};${glowOpacity};${glowOpacity * 0.5}`}
                        dur="3s"
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

                  {/* Chat icon hint */}
                  {isHovered && (
                    <g transform={`translate(${node.x + nodeRadius - 4}, ${node.y - nodeRadius + 4})`}>
                      <circle cx={0} cy={0} r={10} fill="#141b17" stroke="#1f2d27" strokeWidth={1} />
                      <text x={0} y={4} textAnchor="middle" fill="#34d399" fontSize={10}>💬</text>
                    </g>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {/* Node List */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {nodesWithMastery.map(node => (
            <motion.div
              key={node.id}
              whileHover={{ scale: 1.02 }}
              onClick={() => navigate(`/mockup/student/course/${courseId}/graph/${assignmentId}/node/${node.id}`)}
              className="bg-forest-card/50 border border-forest-border/30 rounded-lg px-4 py-3 cursor-pointer hover:border-forest-emerald/30 transition-colors flex items-center gap-3"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: getNodeMasteryColor(node.mastery) }}
              >
                {node.mastery}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{node.label}</p>
                <p className="text-xs text-forest-gray flex items-center gap-1">
                  <MessageCircle size={10} /> Chat to study
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </MockLayout>
  )
}

export default GraphAssignment
