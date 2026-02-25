import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, ArrowRight, Trophy, RotateCcw } from 'lucide-react'
import MockLayout from '../MockLayout'
import Button from '../../components/Button'
import {
  getCourseById, getAssignmentById, conceptNodes, diagnosticQuestions,
  getNodeMasteryColor,
} from '../data/mockData'

const TestMode = () => {
  const { courseId, assignmentId } = useParams()
  const navigate = useNavigate()
  const course = getCourseById(courseId)
  const assignment = getAssignmentById(assignmentId)
  const nodes = conceptNodes[assignmentId] || []

  const allQuestions = nodes.flatMap(n =>
    (diagnosticQuestions[n.id] || []).map(q => ({ ...q, nodeId: n.id, nodeLabel: n.label }))
  )

  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [results, setResults] = useState([])
  const [finished, setFinished] = useState(false)

  if (!course || !assignment) {
    return (
      <MockLayout role="student" breadcrumbs={[{ label: 'Dashboard', to: '/mockup/student' }, { label: 'Not Found' }]}>
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <p className="text-forest-light-gray">Not found.</p>
        </div>
      </MockLayout>
    )
  }

  if (allQuestions.length === 0) {
    return (
      <MockLayout
        role="student"
        breadcrumbs={[
          { label: 'Dashboard', to: '/mockup/student' },
          { label: course.code, to: `/mockup/student/course/${courseId}` },
          { label: 'Test' },
        ]}
      >
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <p className="text-forest-light-gray text-lg">No diagnostic questions available for this assignment.</p>
        </div>
      </MockLayout>
    )
  }

  const currentQ = allQuestions[currentIndex]
  const isCorrect = selectedAnswer === currentQ?.correctIndex
  const totalCorrect = results.filter(r => r.correct).length
  const progress = ((currentIndex + (showResult ? 1 : 0)) / allQuestions.length) * 100

  const handleSelect = (optionIndex) => {
    if (showResult) return
    setSelectedAnswer(optionIndex)
  }

  const handleSubmit = () => {
    if (selectedAnswer === null) return
    setShowResult(true)
    setResults(prev => [...prev, {
      questionId: currentQ.id,
      nodeId: currentQ.nodeId,
      correct: selectedAnswer === currentQ.correctIndex,
    }])
  }

  const handleNext = () => {
    if (currentIndex + 1 >= allQuestions.length) {
      setFinished(true)
      return
    }
    setCurrentIndex(prev => prev + 1)
    setSelectedAnswer(null)
    setShowResult(false)
  }

  const handleRestart = () => {
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setResults([])
    setFinished(false)
  }

  const masteryScore = Math.round((totalCorrect / allQuestions.length) * 100)

  // Summary view
  if (finished) {
    const nodeScores = {}
    results.forEach(r => {
      if (!nodeScores[r.nodeId]) nodeScores[r.nodeId] = { correct: 0, total: 0 }
      nodeScores[r.nodeId].total++
      if (r.correct) nodeScores[r.nodeId].correct++
    })

    return (
      <MockLayout
        role="student"
        breadcrumbs={[
          { label: 'Dashboard', to: '/mockup/student' },
          { label: course.code, to: `/mockup/student/course/${courseId}` },
          { label: assignment.name, to: `/mockup/student/course/${courseId}/graph/${assignmentId}` },
          { label: 'Test Results' },
        ]}
      >
        <div className="max-w-2xl mx-auto px-6 py-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center mb-8"
          >
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: getNodeMasteryColor(masteryScore) }}
            >
              <Trophy size={40} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {masteryScore >= 80 ? 'Mastery Achieved!' :
               masteryScore >= 60 ? 'Good Progress!' : 'Keep Practicing!'}
            </h1>
            <p className="text-forest-light-gray">
              You scored <span className="text-white font-semibold">{totalCorrect}/{allQuestions.length}</span> ({masteryScore}%)
            </p>
          </motion.div>

          {/* Per-node breakdown */}
          <div className="space-y-3 mb-8">
            {nodes.map(node => {
              const score = nodeScores[node.id]
              if (!score) return null
              const pct = Math.round((score.correct / score.total) * 100)
              return (
                <div key={node.id} className="bg-forest-card/60 border border-forest-border/40 rounded-lg px-5 py-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">{node.label}</span>
                    <span className={`text-sm font-medium ${
                      pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {score.correct}/{score.total} correct
                    </span>
                  </div>
                  <div className="w-full h-2 bg-forest-dark rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6 }}
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, #374151, ${getNodeMasteryColor(pct)})`,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex gap-3 justify-center">
            <Button variant="secondary" onClick={handleRestart} className="flex items-center gap-2 !text-sm">
              <RotateCcw size={16} /> Retake Test
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate(`/mockup/student/course/${courseId}/graph/${assignmentId}`)}
              className="flex items-center gap-2 !text-sm"
            >
              Back to Graph
            </Button>
          </div>
        </div>
      </MockLayout>
    )
  }

  return (
    <MockLayout
      role="student"
      breadcrumbs={[
        { label: 'Dashboard', to: '/mockup/student' },
        { label: course.code, to: `/mockup/student/course/${courseId}` },
        { label: assignment.name, to: `/mockup/student/course/${courseId}/graph/${assignmentId}` },
        { label: 'Diagnostic Test' },
      ]}
    >
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-sm text-forest-gray mb-2">
            <span>Question {currentIndex + 1} of {allQuestions.length}</span>
            <span className="text-forest-light-gray font-medium">
              {totalCorrect} correct so far
            </span>
          </div>
          <div className="w-full h-2 bg-forest-dark rounded-full overflow-hidden">
            <motion.div
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
              className="h-full rounded-full bg-gradient-to-r from-forest-emerald to-forest-teal"
            />
          </div>
        </div>

        {/* Question Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQ.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-forest-card/70 border border-forest-border/50 rounded-xl p-6 mb-6"
          >
            <div className="mb-1">
              <span className="text-xs text-forest-emerald bg-forest-emerald/10 px-2 py-1 rounded">
                {currentQ.nodeLabel}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-white mt-3 mb-6">
              {currentQ.question}
            </h2>

            <div className="space-y-3">
              {currentQ.options.map((option, i) => {
                let borderColor = 'border-forest-border/40'
                let bgColor = 'bg-forest-dark/30'
                let textColor = 'text-forest-light-gray'

                if (showResult) {
                  if (i === currentQ.correctIndex) {
                    borderColor = 'border-emerald-500/60'
                    bgColor = 'bg-emerald-500/10'
                    textColor = 'text-emerald-400'
                  } else if (i === selectedAnswer && !isCorrect) {
                    borderColor = 'border-red-500/60'
                    bgColor = 'bg-red-500/10'
                    textColor = 'text-red-400'
                  }
                } else if (selectedAnswer === i) {
                  borderColor = 'border-forest-emerald/60'
                  bgColor = 'bg-forest-emerald/10'
                  textColor = 'text-white'
                }

                return (
                  <motion.button
                    key={i}
                    whileHover={!showResult ? { scale: 1.01 } : {}}
                    whileTap={!showResult ? { scale: 0.99 } : {}}
                    onClick={() => handleSelect(i)}
                    className={`w-full text-left px-5 py-3.5 rounded-lg border ${borderColor} ${bgColor} ${textColor} transition-all flex items-center gap-3`}
                  >
                    <span className="w-7 h-7 rounded-full border border-current flex items-center justify-center text-xs font-medium flex-shrink-0">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-sm">{option}</span>
                    {showResult && i === currentQ.correctIndex && (
                      <CheckCircle size={18} className="text-emerald-400 ml-auto" />
                    )}
                    {showResult && i === selectedAnswer && !isCorrect && i !== currentQ.correctIndex && (
                      <XCircle size={18} className="text-red-400 ml-auto" />
                    )}
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Feedback */}
        <AnimatePresence>
          {showResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mb-6 rounded-lg px-5 py-3.5 border ${
                isCorrect
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              <div className="flex items-center gap-2">
                {isCorrect ? <CheckCircle size={18} /> : <XCircle size={18} />}
                <span className="font-medium">
                  {isCorrect ? 'Correct!' : 'Incorrect'}
                </span>
              </div>
              {!isCorrect && (
                <p className="text-sm mt-1 opacity-80">
                  The correct answer was: {currentQ.options[currentQ.correctIndex]}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="flex justify-end">
          {!showResult ? (
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={selectedAnswer === null}
              className="flex items-center gap-2 !text-sm"
            >
              Submit Answer
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleNext}
              className="flex items-center gap-2 !text-sm"
            >
              {currentIndex + 1 >= allQuestions.length ? 'See Results' : 'Next Question'}
              <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </MockLayout>
  )
}

export default TestMode
