import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, PanelLeftClose, PanelLeft } from 'lucide-react'
import TreeCanvas from '../components/LearningTree/TreeCanvas'
import StudyPanel from '../components/LearningTree/StudyPanel'
import { buildContextPath, prepareAIPayload, getActivePath } from '../lib/contextEngine'
import { askAI } from '../lib/openaiService'

const STORAGE_KEY = 'forest-learning-tree'

const LearningTree = () => {
  const canvasRef = useRef(null)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [activeNodeId, setActiveNodeId] = useState(null)
  const [activePath, setActivePath] = useState([])
  const [isAILoading, setIsAILoading] = useState(false)
  const [isPanelOpen, setIsPanelOpen] = useState(true)

  // Load data from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        setNodes(data.nodes || [])
        setEdges(data.edges || [])
      }
    } catch (error) {
      console.error('Failed to load tree from localStorage:', error)
    }
  }, [])

  // Save data to localStorage whenever nodes or edges change
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      const data = saved ? JSON.parse(saved) : {}
      data.version = '1.0'
      data.nodes = nodes
      data.edges = edges
      data.lastSaved = Date.now()
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save tree to localStorage:', error)
    }
  }, [nodes, edges])

  // Get the active node object
  const activeNode = nodes.find(n => n.id === activeNodeId)

  // Generate unique ID
  const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  const deleteNodeById = useCallback((nodeId) => {
    setNodes(prev => prev
      .filter(n => n.id !== nodeId)
      .map(n => {
        const next = { ...n }
        if (next.parentId === nodeId) {
          next.parentId = null
        }
        if (next.highlights?.length) {
          next.highlights = next.highlights.filter(h => h.childId !== nodeId)
        }
        return next
      })
    )
    setEdges(prev => prev.filter(e => e.sourceId !== nodeId && e.targetId !== nodeId))
    setActiveNodeId(null)
    setActivePath([])
  }, [setNodes, setEdges])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!activeNodeId) return

      const target = e.target
      if (target instanceof HTMLElement) {
        const isTyping =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        if (isTyping) return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteNodeById(activeNodeId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeNodeId, deleteNodeById])

  // Ask AI a question for a specific node
  const handleAskQuestion = async (nodeId, question) => {
    setIsAILoading(true)

    try {
      const contextPath = buildContextPath(nodeId, nodes)
      const payload = prepareAIPayload(contextPath, question)

      const { response } = await askAI(payload.fullPrompt, question)

      // Update node with AI response
      setNodes(prev => prev.map(n =>
        n.id === nodeId
          ? {
            ...n,
            question,
            aiResponse: response,
          }
          : n
      ))
    } catch (error) {
      console.error('AI request failed:', error)
    } finally {
      setIsAILoading(false)
    }
  }

  // Ask Forest: branch from selected text + user's follow-up question
  const handleAskBranchFromSelection = async (parentNodeId, selectedText, userQuestion) => {
    const parent = nodes.find(n => n.id === parentNodeId)
    if (!parent) return

    setIsAILoading(true)

    try {
      const updatedParent = {
        ...parent,
        highlights: [
          ...(parent.highlights || []),
          { text: selectedText, childId: 'pending' }
        ]
      }

      const angle = Math.random() * Math.PI * 2
      const distance = 150
      const childId = generateId()

      const newNode = {
        id: childId,
        label: selectedText.substring(0, 30) + (selectedText.length > 30 ? '...' : ''),
        position: {
          x: parent.position.x + Math.cos(angle) * distance,
          y: parent.position.y + Math.sin(angle) * distance,
        },
        parentId: parentNodeId,
        question: userQuestion,
        aiResponse: '',
        contextAnchor: selectedText,
        highlights: [],
      }

      const newEdge = {
        id: `edge_${parentNodeId}_${childId}`,
        sourceId: parentNodeId,
        targetId: childId,
      }

      updatedParent.highlights[updatedParent.highlights.length - 1].childId = childId

      const newNodes = [...nodes.filter(n => n.id !== parentNodeId), updatedParent, newNode]
      const newEdges = [...edges, newEdge]

      setNodes(newNodes)
      setEdges(newEdges)

      setActiveNodeId(childId)
      const newPathEdges = getActivePath(childId, newNodes, newEdges)
      setActivePath(newPathEdges)

      // AI prompt: include parent context + selected text + user's question
      const contextPath = buildContextPath(parentNodeId, nodes)
      const combinedQuestion = `The student selected this from the previous answer: "${selectedText}". Their follow-up question: ${userQuestion}`
      const payload = prepareAIPayload(contextPath, combinedQuestion)

      const { response } = await askAI(payload.fullPrompt, combinedQuestion)

      setNodes(prev => prev.map(n =>
        n.id === childId
          ? { ...n, aiResponse: response }
          : n
      ))

      if (canvasRef.current) {
        canvasRef.current.centerOnNode(childId)
      }
    } catch (error) {
      console.error('Branch creation failed:', error)
    } finally {
      setIsAILoading(false)
    }
  }

  // Close the study panel
  const handleClosePanel = () => {
    setActiveNodeId(null)
    setActivePath([])
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-forest-darker">
      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 z-50 h-14 bg-forest-card/90 backdrop-blur-md border-b border-forest-border flex items-center justify-between px-4">
        <Link to="/dashboard">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-4 py-2 bg-forest-darker/50 border border-forest-border rounded-lg text-forest-emerald hover:border-forest-emerald transition-all duration-100 flex items-center gap-2 text-sm"
          >
            <Home size={16} />
            <span>Dashboard</span>
          </motion.button>
        </Link>

        <div className="text-center">
          <h1 className="text-lg font-semibold text-white">Learning Tree</h1>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-forest-gray">{nodes.length} nodes</span>
          <button
            onClick={() => setIsPanelOpen(!isPanelOpen)}
            className="p-2 hover:bg-forest-border rounded-lg transition-colors text-forest-light-gray hover:text-white"
            title={isPanelOpen ? 'Hide panel' : 'Show panel'}
          >
            {isPanelOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        </div>
      </div>

      {/* Main Content - Split View */}
      <div className="pt-14 h-full flex">
        {/* Canvas Section */}
        <div className={`h-full transition-all duration-300 ${isPanelOpen ? 'w-1/2 lg:w-3/5' : 'w-full'}`}>
          <TreeCanvas
            ref={canvasRef}
            nodes={nodes}
            edges={edges}
            setNodes={setNodes}
            setEdges={setEdges}
            activeNodeId={activeNodeId}
            setActiveNodeId={setActiveNodeId}
            activePath={activePath}
            setActivePath={setActivePath}
          />
        </div>

        {/* Study Panel Section */}
        {isPanelOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: '50%', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full border-l border-forest-border bg-forest-darker lg:w-2/5"
            style={{ minWidth: isPanelOpen ? '400px' : 0 }}
          >
            <StudyPanel
              activeNode={activeNode}
              nodes={nodes}
              onAskQuestion={handleAskQuestion}
              onAskBranchFromSelection={handleAskBranchFromSelection}
              isAILoading={isAILoading}
              onClose={handleClosePanel}
              activePath={activePath}
            />
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default LearningTree
