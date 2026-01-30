import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, PanelLeftClose, PanelLeft } from 'lucide-react'
import TreeCanvas from '../components/LearningTree/TreeCanvas'
import StudyPanel from '../components/LearningTree/StudyPanel'
import { buildContextPath, getHeritageString, getActivePath } from '../lib/contextEngine'
import { askAI } from '../lib/openaiService'
import { parseModelResponse } from '../lib/responseParser'

const STORAGE_KEY = 'forest-learning-tree'

const LearningTree = () => {
  const canvasRef = useRef(null)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [activeNodeId, setActiveNodeId] = useState(null)
  const [activePath, setActivePath] = useState([])
  const [isAILoading, setIsAILoading] = useState(false)
  const [loadingNodeId, setLoadingNodeId] = useState(null)
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  const [panelWidth, setPanelWidth] = useState(420)
  const isResizingRef = useRef(false)

  const MIN_PANEL_WIDTH = 320
  const MAX_PANEL_WIDTH = () => Math.max(MIN_PANEL_WIDTH, window.innerWidth * 0.75)

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    const onMove = (ev) => {
      const w = window.innerWidth - ev.clientX
      setPanelWidth(Math.min(MAX_PANEL_WIDTH(), Math.max(MIN_PANEL_WIDTH, w)))
    }
    const onUp = () => {
      isResizingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    isResizingRef.current = true
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Load data from localStorage on mount; migrate legacy question/aiResponse to messages
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const data = JSON.parse(saved)
        let loadedNodes = data.nodes || []
        loadedNodes = loadedNodes.map((n) => {
          if ((n.messages == null || n.messages.length === 0) && (n.question || n.aiResponse)) {
            const messages = []
            if (n.question) messages.push({ role: 'user', content: n.question })
            if (n.aiResponse) messages.push({ role: 'assistant', content: n.aiResponse })
            return { ...n, messages }
          }
          return { ...n, messages: n.messages || [] }
        })
        setNodes(loadedNodes)
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

  // Ask AI a question for a specific node (chat: append user msg, then assistant)
  const handleAskQuestion = async (nodeId, question) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return

    const userMsg = { role: 'user', content: question }
    const newMessages = [...(node.messages || []), userMsg]

    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, messages: newMessages } : n
    ))
    setIsAILoading(true)
    setLoadingNodeId(nodeId)

    try {
      const contextPath = buildContextPath(nodeId, nodes)
      const heritage = getHeritageString(contextPath)
      const { response } = await askAI(heritage, newMessages)
      const { content, concept, suggestNewNode } = parseModelResponse(response)

      setNodes(prev => prev.map(n => {
        if (n.id !== nodeId) return n
        const next = { ...n, messages: [...(n.messages || []), { role: 'assistant', content }] }
        if (concept && newMessages.length === 1) next.label = concept
        if (suggestNewNode) next.suggestNewNode = { concept: suggestNewNode }
        return next
      }))
    } catch (error) {
      console.error('AI request failed:', error)
      setNodes(prev => prev.map(n =>
        n.id === nodeId
          ? { ...n, messages: [...(n.messages || []), { role: 'assistant', content: `Error: ${error.message}` }] }
          : n
      ))
    } finally {
      setIsAILoading(false)
      setLoadingNodeId(null)
    }
  }

  // Ask Forest: branch from selected text + user's follow-up question
  const handleAskBranchFromSelection = async (parentNodeId, selectedTextRaw, userQuestionRaw) => {
    const selectedText = (selectedTextRaw || '').trim().replace(/\s+/g, ' ')
    const userQuestion = (userQuestionRaw || '').trim()
    if (!selectedText || !userQuestion) return

    const parent = nodes.find(n => n.id === parentNodeId)
    if (!parent?.position) return

    const hasContent = (parent.messages?.some(m => m.role === 'assistant')) || !!parent.aiResponse
    if (!hasContent) return

    setIsAILoading(true)
    const childId = generateId()
    setLoadingNodeId(childId)
    const combinedQuestion = `The student selected this from the previous answer: "${selectedText}". Their follow-up question: ${userQuestion}`

    try {
      const updatedParent = {
        ...parent,
        highlights: [
          ...(parent.highlights || []),
          { text: selectedText, childId: 'pending' },
        ],
      }

      const angle = Math.random() * Math.PI * 2
      const distance = 150
      const initialLabel = selectedText.length > 30 ? selectedText.slice(0, 30) + '…' : selectedText

      const newNode = {
        id: childId,
        label: initialLabel,
        position: {
          x: parent.position.x + Math.cos(angle) * distance,
          y: parent.position.y + Math.sin(angle) * distance,
        },
        parentId: parentNodeId,
        question: userQuestion,
        aiResponse: '',
        contextAnchor: selectedText,
        highlights: [],
        messages: [],
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
      setActivePath(getActivePath(childId, newNodes, newEdges))

      const contextPath = buildContextPath(parentNodeId, nodes)
      const heritage = getHeritageString(contextPath)
      const branchMessages = [{ role: 'user', content: combinedQuestion }]
      const { response, error } = await askAI(heritage, branchMessages)

      if (error) {
        setNodes(prev => prev.map(n =>
          n.id === childId
            ? {
              ...n,
              aiResponse: `Error: ${error}. Please try again.`,
              messages: [
                { role: 'user', content: combinedQuestion },
                { role: 'assistant', content: `Error: ${error}. Please try again.` },
              ],
            }
            : n
        ))
      } else {
        const { content, concept } = parseModelResponse(response)
        const label = (concept && concept.trim()) || initialLabel
        setNodes(prev => prev.map(n =>
          n.id === childId
            ? {
              ...n,
              label,
              aiResponse: content,
              messages: [
                { role: 'user', content: combinedQuestion },
                { role: 'assistant', content },
              ],
            }
            : n
        ))
      }

      if (canvasRef.current) {
        canvasRef.current.centerOnNode(childId)
      }
    } catch (error) {
      console.error('Branch creation failed:', error)
      const errMsg = `Error: ${error.message}. Please try again.`
      setNodes(prev => prev.map(n =>
        n.id === childId
          ? {
            ...n,
            aiResponse: errMsg,
            messages: [
              { role: 'user', content: combinedQuestion },
              { role: 'assistant', content: errMsg },
            ],
          }
          : n
      ))
    } finally {
      setIsAILoading(false)
      setLoadingNodeId(null)
    }
  }

  // Close the study panel
  const handleClosePanel = () => {
    setActiveNodeId(null)
    setActivePath([])
  }

  // Double-click node: open side panel and select that node
  const handleDoubleClickNode = (nodeId) => {
    setActiveNodeId(nodeId)
    const pathEdgeIds = getActivePath(nodeId, nodes, edges)
    setActivePath(pathEdgeIds)
    setIsPanelOpen(true)
  }

  // Navigate to a branch node (e.g. from clicking highlighted text in parent)
  const handleNavigateToNode = (nodeId) => {
    setActiveNodeId(nodeId)
    const pathEdgeIds = getActivePath(nodeId, nodes, edges)
    setActivePath(pathEdgeIds)
    setIsPanelOpen(true)
    canvasRef.current?.centerOnNode(nodeId)
  }

  // User accepted "create new node" for topic drift: create separate node with question only, then send question and receive response on the new node
  const handleAcceptNewNode = async (currentNodeId) => {
    const node = nodes.find(n => n.id === currentNodeId)
    if (!node?.suggestNewNode?.concept || !node.messages?.length) return

    const msgs = [...node.messages]
    const lastUser = msgs[msgs.length - 2]
    const lastAssistant = msgs[msgs.length - 1]
    if (msgs.length < 2 || lastUser?.role !== 'user' || lastAssistant?.role !== 'assistant') return

    const newNodeId = generateId()
    const angle = Math.random() * Math.PI * 2
    const distance = 280
    const questionContent = lastUser.content

    const newNode = {
      id: newNodeId,
      label: node.suggestNewNode.concept,
      position: {
        x: node.position.x + Math.cos(angle) * distance,
        y: node.position.y + Math.sin(angle) * distance,
      },
      parentId: null,
      question: questionContent,
      aiResponse: '',
      contextAnchor: '',
      highlights: [],
      messages: [lastUser],
    }

    const messagesWithoutLast = msgs.slice(0, -2)
    setNodes(prev => {
      const updated = prev.map(n => {
        if (n.id !== currentNodeId) return n
        const { suggestNewNode: _, ...rest } = n
        return { ...rest, messages: messagesWithoutLast }
      })
      return [...updated, newNode]
    })
    setActiveNodeId(newNodeId)
    setActivePath([])
    setIsPanelOpen(true)
    setIsAILoading(true)
    setLoadingNodeId(newNodeId)
    setTimeout(() => canvasRef.current?.centerOnNode(newNodeId), 0)

    try {
      const heritage = getHeritageString([{
        id: newNodeId,
        label: node.suggestNewNode.concept,
        question: questionContent,
        messages: [lastUser],
      }])
      const { response } = await askAI(heritage, [lastUser])
      const { content, concept } = parseModelResponse(response)
      const label = concept || node.suggestNewNode.concept

      setNodes(prev => prev.map(n =>
        n.id === newNodeId
          ? {
            ...n,
            label,
            question: questionContent,
            aiResponse: content,
            messages: [lastUser, { role: 'assistant', content }],
          }
          : n
      ))
    } catch (error) {
      console.error('New node AI request failed:', error)
      setNodes(prev => prev.map(n =>
        n.id === newNodeId
          ? {
            ...n,
            messages: [lastUser, { role: 'assistant', content: `Error: ${error.message}` }],
          }
          : n
      ))
    } finally {
      setIsAILoading(false)
      setLoadingNodeId(null)
    }
  }

  // Dismiss "create new node" suggestion
  const handleDismissNewNodeSuggestion = (nodeId) => {
    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n
      const { suggestNewNode, ...rest } = n
      return rest
    }))
  }

  // Rename current node
  const handleRenameNode = (nodeId, newLabel) => {
    const trimmed = (newLabel || '').trim()
    if (!trimmed) return
    setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, label: trimmed } : n)))
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
          <h1 className="text-lg font-semibold text-white">Forest</h1>
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
        <div
          className="h-full flex-1 min-w-0 transition-[flex] duration-200"
          style={isPanelOpen ? {} : { flex: 1 }}
        >
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
            onDoubleClickNode={handleDoubleClickNode}
          />
        </div>

        {/* Resize handle */}
        {isPanelOpen && (
          <div
            role="separator"
            aria-label="Resize chat panel"
            onMouseDown={handleResizeStart}
            className="w-1.5 h-full flex-shrink-0 cursor-col-resize hover:bg-forest-emerald/30 active:bg-forest-emerald/50 transition-colors group"
          >
            <div className="w-0.5 h-full mx-auto bg-forest-border group-hover:bg-forest-emerald/60" />
          </div>
        )}

        {/* Study Panel Section */}
        {isPanelOpen && (
          <div
            className="h-full flex-shrink-0 border-l border-forest-border bg-forest-darker"
            style={{ width: panelWidth, minWidth: MIN_PANEL_WIDTH }}
          >
            <StudyPanel
              activeNode={activeNode}
              nodes={nodes}
              onAskQuestion={handleAskQuestion}
              onAskBranchFromSelection={handleAskBranchFromSelection}
              onNavigateToNode={handleNavigateToNode}
              onRenameNode={handleRenameNode}
              onAcceptNewNode={handleAcceptNewNode}
              onDismissNewNodeSuggestion={handleDismissNewNodeSuggestion}
              isAILoading={isAILoading}
              loadingNodeId={loadingNodeId}
              onClose={handleClosePanel}
              activePath={activePath}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default LearningTree
