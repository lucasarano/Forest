import React, { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Bot, User, Zap } from 'lucide-react'
import MockLayout from '../MockLayout'
import {
  getCourseById, getAssignmentById, getNodeById, studentMastery,
  getNodeMasteryColor, nodeChatMessages, getRandomAIResponse,
} from '../data/mockData'

const CURRENT_STUDENT = 's1'

const NodeChat = () => {
  const { courseId, assignmentId, nodeId } = useParams()
  const course = getCourseById(courseId)
  const assignment = getAssignmentById(assignmentId)
  const node = getNodeById(nodeId)

  const initialMastery = studentMastery[CURRENT_STUDENT]?.[nodeId] ?? 0
  const [mastery, setMastery] = useState(initialMastery)
  const [messages, setMessages] = useState(nodeChatMessages[nodeId] || [
    { role: 'assistant', content: `Let's explore **${node?.label || 'this concept'}** together. What would you like to know?` },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping])

  if (!course || !assignment || !node) {
    return (
      <MockLayout role="student" breadcrumbs={[{ label: 'Dashboard', to: '/mockup/student' }, { label: 'Not Found' }]}>
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <p className="text-forest-light-gray">Not found.</p>
        </div>
      </MockLayout>
    )
  }

  const handleSend = () => {
    if (!input.trim() || isTyping) return
    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setIsTyping(true)

    setTimeout(() => {
      const response = getRandomAIResponse()
      setMessages(prev => [...prev, { role: 'assistant', content: response }])
      setMastery(prev => Math.min(100, prev + Math.floor(Math.random() * 5) + 2))
      setIsTyping(false)
    }, 1200 + Math.random() * 800)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const masteryColor = getNodeMasteryColor(mastery)

  return (
    <MockLayout
      role="student"
      breadcrumbs={[
        { label: 'Dashboard', to: '/mockup/student' },
        { label: course.code, to: `/mockup/student/course/${courseId}` },
        { label: assignment.name, to: `/mockup/student/course/${courseId}/graph/${assignmentId}` },
        { label: node.label },
      ]}
    >
      <div className="max-w-4xl mx-auto px-6 py-6 h-[calc(100vh-73px)] flex flex-col">
        {/* Node Header + Mastery */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: masteryColor }}
            >
              {mastery}%
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{node.label}</h1>
              <p className="text-sm text-forest-gray">Ask questions to deepen understanding</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-forest-gray">Node Strength</p>
              <div className="flex items-center gap-1.5">
                <Zap size={14} style={{ color: masteryColor }} />
                <span className="text-sm font-semibold" style={{ color: masteryColor }}>
                  {mastery >= 80 ? 'Strong' : mastery >= 50 ? 'Growing' : 'Weak'}
                </span>
              </div>
            </div>
            <div className="w-24 h-2 bg-forest-dark rounded-full overflow-hidden">
              <motion.div
                animate={{ width: `${mastery}%` }}
                transition={{ duration: 0.5 }}
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, #374151, ${masteryColor})`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-thin"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-forest-emerald/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot size={16} className="text-forest-emerald" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-forest-emerald/20 border border-forest-emerald/30 text-white'
                      : 'bg-forest-card/80 border border-forest-border/40 text-forest-light-gray'
                  }`}
                >
                  {msg.content.split('\n').map((line, j) => (
                    <p key={j} className={j > 0 ? 'mt-2' : ''}>
                      {line.split(/(\*\*.*?\*\*|`[^`]+`)/g).map((part, k) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                          return <strong key={k} className="text-white font-semibold">{part.slice(2, -2)}</strong>
                        }
                        if (part.startsWith('`') && part.endsWith('`')) {
                          return <code key={k} className="bg-forest-dark/60 px-1.5 py-0.5 rounded text-forest-emerald text-xs font-mono">{part.slice(1, -1)}</code>
                        }
                        return part
                      })}
                    </p>
                  ))}
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-forest-border flex items-center justify-center flex-shrink-0 mt-1">
                    <User size={16} className="text-forest-light-gray" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          {isTyping && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-forest-emerald/20 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-forest-emerald" />
              </div>
              <div className="bg-forest-card/80 border border-forest-border/40 rounded-xl px-4 py-3 text-sm text-forest-gray">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-forest-gray animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-forest-gray animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-forest-gray animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            </motion.div>
          )}
        </div>

        {/* Input */}
        <div className="bg-forest-card/70 border border-forest-border/50 rounded-xl p-3 flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about this concept..."
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-forest-gray text-sm resize-none focus:outline-none max-h-32"
            style={{ minHeight: '2rem' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="p-2 bg-forest-emerald/20 hover:bg-forest-emerald/30 text-forest-emerald rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </MockLayout>
  )
}

export default NodeChat
