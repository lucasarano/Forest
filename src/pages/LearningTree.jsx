import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, PanelLeftClose, PanelLeft, Plus, GitBranch, Loader } from 'lucide-react'
import TreeCanvas from '../components/LearningTree/TreeCanvas'
import StudyPanel from '../components/LearningTree/StudyPanel'
import { buildContextPath, getHeritageString, getActivePath } from '../lib/contextEngine'
import { askAI, DEFAULT_MODEL } from '../lib/openaiService'
import { parseModelResponse } from '../lib/responseParser'
import { loadTree, saveTree } from '../lib/treeService'

const LearningTree = () => {
  const { treeId } = useParams()
  const canvasRef = useRef(null)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [activeNodeId, setActiveNodeId] = useState(null)
  const [activePath, setActivePath] = useState([])
  const [isAILoading, setIsAILoading] = useState(false)
  const [loadingNodeId, setLoadingNodeId] = useState(null)
  const [isTreeLoading, setIsTreeLoading] = useState(true)
  const [treeSaveError, setTreeSaveError] = useState(null)
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  const [panelWidth, setPanelWidth] = useState(420)
  const [branchFromName, setBranchFromName] = useState('')
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('forest-ai-model') || DEFAULT_MODEL)

  // Refs for stable callbacks (avoid stale closures without adding deps)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges

  // Ref for direct DOM manipulation during resize (avoids React re-renders)
  const panelContainerRef = useRef(null)

  const handleModelChange = useCallback((modelId) => {
    setSelectedModel(modelId)
    localStorage.setItem('forest-ai-model', modelId)
  }, [])

  const MIN_PANEL_WIDTH = 320
  const MAX_PANEL_WIDTH = () => Math.max(MIN_PANEL_WIDTH, window.innerWidth * 0.75)

  // ─── Panel Resize: direct DOM manipulation, no React re-renders during drag ──

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    const handle = e.currentTarget
    const pointerId = e.pointerId
    handle.setPointerCapture(pointerId)

    const maxW = MAX_PANEL_WIDTH()
    const el = panelContainerRef.current

    // Disable CSS transition during resize (it fights with JS-driven width)
    if (el) el.style.transition = 'none'

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return
      const x = Math.max(0, Math.min(window.innerWidth, ev.clientX))
      const w = window.innerWidth - x
      const clamped = Math.min(maxW, Math.max(MIN_PANEL_WIDTH, w))
      // Direct DOM update — no React re-render!
      if (el) {
        el.style.width = `${clamped}px`
        el.style.minWidth = `${MIN_PANEL_WIDTH}px`
      }
    }

    const cleanup = () => {
      // Commit final width to React state (single re-render)
      if (el) {
        const finalWidth = el.getBoundingClientRect().width
        setPanelWidth(finalWidth)
        // Clear inline styles so React controls again
        el.style.width = ''
        el.style.minWidth = ''
        el.style.transition = ''
      }
      try { handle.releasePointerCapture(pointerId) } catch (_) {}
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', cleanup)
      handle.removeEventListener('pointercancel', cleanup)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cleanup()
    }

    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', cleanup)
    handle.addEventListener('pointercancel', cleanup)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }, [])

  // Load tree data from Supabase on mount
  useEffect(() => {
    if (!treeId) {
      setIsTreeLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      setIsTreeLoading(true)
      try {
        const { data, error } = await loadTree(treeId)
        if (cancelled) return
        if (error) {
          console.error('Failed to load tree from Supabase:', error)
        } else if (data) {
          // Migrate legacy question/aiResponse → messages
          const loadedNodes = (data.nodes || []).map((n) => {
            if ((!n.messages || n.messages.length === 0) && (n.question || n.aiResponse)) {
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
      } catch (err) {
        if (!cancelled) console.error('Failed to load tree:', err)
      } finally {
        if (!cancelled) setIsTreeLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [treeId])

  // Debounced auto-save to Supabase whenever nodes or edges change
  const saveTimerRef = useRef(null)
  const initialLoadDone = useRef(false)

  useEffect(() => {
    if (isTreeLoading) return
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      return
    }
    if (!treeId) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const { error } = await saveTree(treeId, nodes, edges)
        if (error) {
          console.error('Auto-save failed:', error)
          setTreeSaveError('Failed to save — changes may be lost')
        } else {
          setTreeSaveError(null)
        }
      } catch (err) {
        console.error('Auto-save error:', err)
        setTreeSaveError('Failed to save — changes may be lost')
      }
    }, 2000)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [nodes, edges, treeId, isTreeLoading])

  // Get the active node object
  const activeNode = nodes.find(n => n.id === activeNodeId)

  // Generate unique ID
  const generateId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  // Next default node name: Node 1, Node 2, ...
  const getNextNodeName = () => `Node ${nodes.length + 1}`

  // Create a new root node (no parent) from bottom-left button
  const handleCreateRootNode = () => {
    const roots = nodes.filter(n => !n.parentId)
    const position = { x: roots.length * 200, y: 0 }
    const newNode = {
      id: generateId(),
      label: getNextNodeName(),
      position,
      parentId: null,
      question: '',
      aiResponse: '',
      contextAnchor: '',
      highlights: [],
      messages: [],
    }
    setNodes(prev => [...prev, newNode])
    setActiveNodeId(newNode.id)
    setActivePath([])
    setIsPanelOpen(true)
    setTimeout(() => canvasRef.current?.centerOnNode(newNode.id), 0)
  }

  // Create a child node (branch) from the selected node
  const handleCreateBranchFromNode = (parentNodeId, childLabel) => {
    const parent = nodesRef.current.find(n => n.id === parentNodeId)
    if (!parent?.position) return
    const name = (childLabel || '').trim() || getNextNodeName()
    const childId = generateId()
    const angle = Math.random() * Math.PI * 2
    const distance = 150
    const newNode = {
      id: childId,
      label: name,
      position: {
        x: parent.position.x + Math.cos(angle) * distance,
        y: parent.position.y + Math.sin(angle) * distance,
      },
      parentId: parentNodeId,
      question: '',
      aiResponse: '',
      contextAnchor: '',
      highlights: [],
      messages: [],
    }
    const newEdge = { id: `edge_${parentNodeId}_${childId}`, sourceId: parentNodeId, targetId: childId }
    setNodes(prev => [...prev, newNode])
    setEdges(prev => [...prev, newEdge])
    setActiveNodeId(childId)
    setActivePath(getActivePath(childId, [...nodesRef.current, newNode], [...edgesRef.current, newEdge]))
    setIsPanelOpen(true)
    setBranchFromName('')
    setTimeout(() => canvasRef.current?.centerOnNode(childId), 0)
  }

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
  }, [])

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
  const handleAskQuestion = async (nodeId, question, imageForLastUserMessage = null) => {
    const node = nodesRef.current.find(n => n.id === nodeId)
    if (!node) return

    const userMsg = {
      role: 'user',
      content: question,
      ...(imageForLastUserMessage && { image: imageForLastUserMessage }),
    }
    const newMessages = [...(node.messages || []), userMsg]

    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, messages: newMessages } : n
    ))
    setIsAILoading(true)
    setLoadingNodeId(nodeId)

    try {
      const contextPath = buildContextPath(nodeId, nodesRef.current)
      const heritage = getHeritageString(contextPath)
      const { response } = await askAI(heritage, newMessages, imageForLastUserMessage, selectedModel)
      const { content, concept, suggestNewNode } = parseModelResponse(response)

      setNodes(prev => prev.map(n => {
        if (n.id !== nodeId) return n
        const isDefaultLabel = /^Node\s*\d+$/i.test((n.label || '').trim())
        const next = { ...n, messages: [...(n.messages || []), { role: 'assistant', content }] }

        if (isDefaultLabel) {
          const newLabel = concept || suggestNewNode
          if (newLabel) next.label = newLabel
        } else {
          if (concept && newMessages.length === 1) next.label = concept
          if (suggestNewNode) next.suggestNewNode = { concept: suggestNewNode }
        }

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

    const parent = nodesRef.current.find(n => n.id === parentNodeId)
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

      const newNodes = [...nodesRef.current.filter(n => n.id !== parentNodeId), updatedParent, newNode]
      const newEdges = [...edgesRef.current, newEdge]

      setNodes(newNodes)
      setEdges(newEdges)
      setActiveNodeId(childId)
      setActivePath(getActivePath(childId, newNodes, newEdges))

      const contextPath = buildContextPath(parentNodeId, nodesRef.current)
      const heritage = getHeritageString(contextPath)
      const branchMessages = [{ role: 'user', content: combinedQuestion }]
      const { response, error } = await askAI(heritage, branchMessages, null, selectedModel)

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
  const handleClosePanel = useCallback(() => {
    setActiveNodeId(null)
    setActivePath([])
  }, [])

  // Double-click node: open side panel and select that node (stable via refs)
  const handleDoubleClickNode = useCallback((nodeId) => {
    setActiveNodeId(nodeId)
    const pathEdgeIds = getActivePath(nodeId, nodesRef.current, edgesRef.current)
    setActivePath(pathEdgeIds)
    setIsPanelOpen(true)
  }, [])

  // Navigate to a branch node (stable via refs)
  const handleNavigateToNode = useCallback((nodeId) => {
    setActiveNodeId(nodeId)
    const pathEdgeIds = getActivePath(nodeId, nodesRef.current, edgesRef.current)
    setActivePath(pathEdgeIds)
    setIsPanelOpen(true)
    canvasRef.current?.centerOnNode(nodeId)
  }, [])

  // User accepted "create new node" for topic drift
  const handleAcceptNewNode = async (currentNodeId) => {
    const node = nodesRef.current.find(n => n.id === currentNodeId)
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
      const { response } = await askAI(heritage, [lastUser], null, selectedModel)
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
  const handleDismissNewNodeSuggestion = useCallback((nodeId) => {
    setNodes(prev => prev.map(n => {
      if (n.id !== nodeId) return n
      const { suggestNewNode, ...rest } = n
      return rest
    }))
  }, [])

  // Rename current node
  const handleRenameNode = useCallback((nodeId, newLabel) => {
    const trimmed = (newLabel || '').trim()
    if (!trimmed) return
    setNodes(prev => prev.map(n => (n.id === nodeId ? { ...n, label: trimmed } : n)))
  }, [])

  // Create first node from the initial chat message
  const handleCreateFirstNode = async (question) => {
    const trimmed = (question || '').trim()
    if (!trimmed) return

    const newNodeId = generateId()
    const userMsg = { role: 'user', content: trimmed }
    const newNode = {
      id: newNodeId,
      label: 'New topic',
      position: { x: 0, y: 0 },
      parentId: null,
      question: trimmed,
      aiResponse: '',
      contextAnchor: '',
      highlights: [],
      messages: [userMsg],
    }

    setNodes([newNode])
    setEdges([])
    setActiveNodeId(newNodeId)
    setActivePath([])
    setIsPanelOpen(true)
    setIsAILoading(true)
    setLoadingNodeId(newNodeId)

    try {
      const heritage = getHeritageString([{
        id: newNodeId,
        label: newNode.label,
        question: trimmed,
        messages: [userMsg],
      }])
      const { response } = await askAI(heritage, [userMsg], null, selectedModel)
      const { content, concept } = parseModelResponse(response)
      const label = (concept && concept.trim()) || trimmed.slice(0, 30) + (trimmed.length > 30 ? '…' : '')

      setNodes(prev => prev.map(n =>
        n.id !== newNodeId ? n : {
          ...n,
          label,
          aiResponse: content,
          messages: [userMsg, { role: 'assistant', content }],
        }
      ))
      setTimeout(() => canvasRef.current?.centerOnNode(newNodeId), 0)
    } catch (error) {
      console.error('First node AI request failed:', error)
      setNodes(prev => prev.map(n =>
        n.id !== newNodeId ? n : {
          ...n,
          messages: [userMsg, { role: 'assistant', content: `Error: ${error.message}` }],
        }
      ))
    } finally {
      setIsAILoading(false)
      setLoadingNodeId(null)
    }
  }

  const hasNoNodes = nodes.length === 0

  // Show a full-screen loading spinner while the tree loads from Supabase
  if (isTreeLoading) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-forest-darker flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader size={32} className="animate-spin text-forest-emerald" />
          <p className="text-forest-light-gray text-sm">Loading your tree...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-forest-darker">
      {/* Save error toast */}
      {treeSaveError && (
        <div className="absolute top-4 right-4 z-[100] bg-red-900/80 border border-red-700 text-red-200 text-sm px-4 py-2 rounded-lg shadow-lg">
          {treeSaveError}
        </div>
      )}

      {/* Top: Dashboard button + controls */}
      <div className="absolute top-0 left-0 z-50 h-14 flex items-center gap-3 px-4 pointer-events-none">
        <Link to="/dashboard" className="pointer-events-auto">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-4 py-2 bg-forest-darker/50 border border-forest-border rounded-lg text-forest-emerald hover:border-forest-emerald transition-all duration-100 flex items-center gap-2 text-sm"
          >
            <Home size={16} />
            <span>Dashboard</span>
          </motion.button>
        </Link>

        {!hasNoNodes && (
          <div className="flex items-center gap-2 pointer-events-auto">
            <span className="text-xs text-forest-gray">{nodes.length} nodes</span>
            <button
              onClick={() => setIsPanelOpen(!isPanelOpen)}
              className="p-2 hover:bg-forest-border rounded-lg transition-colors text-forest-light-gray hover:text-white"
              title={isPanelOpen ? 'Hide panel' : 'Show panel'}
            >
              {isPanelOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
            </button>
          </div>
        )}
      </div>

      {/* Bottom-left: Create node + Branch from selected node */}
      <div className="absolute bottom-4 left-4 z-50 flex flex-col gap-2 pointer-events-auto">
        <motion.button
          type="button"
          onClick={handleCreateRootNode}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="px-4 py-2.5 bg-forest-card/90 backdrop-blur-md border border-forest-border rounded-lg text-forest-emerald hover:border-forest-emerald transition-all duration-100 flex items-center gap-2 text-sm font-medium shadow-lg"
        >
          <Plus size={18} />
          <span>New node</span>
        </motion.button>
        {!hasNoNodes && activeNodeId && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-2 p-3 bg-forest-card/90 backdrop-blur-md border border-forest-border rounded-lg shadow-lg"
          >
            <span className="text-xs text-forest-light-gray font-medium">Branch from here</span>
            <div className="flex gap-2">
              <input
                type="text"
                value={branchFromName}
                onChange={(e) => setBranchFromName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateBranchFromNode(activeNodeId, branchFromName)}
                placeholder={getNextNodeName()}
                className="flex-1 min-w-0 px-3 py-2 text-sm bg-forest-darker border border-forest-border rounded-lg text-white placeholder:text-forest-gray focus:outline-none focus:ring-1 focus:ring-forest-emerald focus:border-forest-emerald"
              />
              <motion.button
                type="button"
                onClick={() => handleCreateBranchFromNode(activeNodeId, branchFromName)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-3 py-2 bg-forest-emerald/20 border border-forest-emerald rounded-lg text-forest-emerald hover:bg-forest-emerald/30 transition-colors flex items-center gap-1.5 text-sm font-medium shrink-0"
              >
                <GitBranch size={16} />
                <span>Create</span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Main Content */}
      <div className="h-full flex">
        {/* Canvas Section */}
        {!hasNoNodes && (
          <div
            className="h-full flex-1 min-w-0"
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
        )}

        {/* Resize handle */}
        {!hasNoNodes && isPanelOpen && (
          <div
            role="separator"
            aria-label="Resize chat panel"
            onPointerDown={handleResizeStart}
            className="w-1.5 h-full flex-shrink-0 cursor-col-resize hover:bg-forest-emerald/30 active:bg-forest-emerald/50 transition-colors group touch-none"
          >
            <div className="w-0.5 h-full mx-auto bg-forest-border group-hover:bg-forest-emerald/60" />
          </div>
        )}

        {/* Study Panel */}
        {hasNoNodes ? (
          <div className="h-full flex-1 min-w-0 border-l border-forest-border bg-forest-darker">
            <StudyPanel
              activeNode={activeNode}
              nodes={nodes}
              hasNoNodesYet={hasNoNodes}
              onCreateFirstNode={handleCreateFirstNode}
              onAskQuestion={handleAskQuestion}
              onAskBranchFromSelection={handleAskBranchFromSelection}
              onNavigateToNode={handleNavigateToNode}
              onRenameNode={handleRenameNode}
              onAcceptNewNode={handleAcceptNewNode}
              onDismissNewNodeSuggestion={handleDismissNewNodeSuggestion}
              isAILoading={isAILoading}
              loadingNodeId={loadingNodeId}
              onClose={undefined}
              activePath={activePath}
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
            />
          </div>
        ) : (
          <div
            ref={panelContainerRef}
            className="h-full flex-shrink-0 border-l border-forest-border bg-forest-darker transition-[width] duration-200 ease-out overflow-hidden"
            style={{
              width: isPanelOpen ? panelWidth : 0,
              minWidth: isPanelOpen ? MIN_PANEL_WIDTH : 0,
            }}
            aria-hidden={!isPanelOpen}
          >
            <StudyPanel
              activeNode={activeNode}
              nodes={nodes}
              hasNoNodesYet={hasNoNodes}
              onCreateFirstNode={handleCreateFirstNode}
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
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
            />
          </div>
        )}
      </div>
    </div>
  )
}


export default LearningTree
