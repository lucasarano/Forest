import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, Plus, GitBranch, Loader, LayoutGrid, MessageSquare } from 'lucide-react'
import TreeCanvas from '../components/LearningTree/TreeCanvas'
import StudyPanel from '../components/LearningTree/StudyPanel'
import QuickNodeDrawer from '../components/LearningTree/QuickNodeDrawer'
import {
  buildContextPath,
  buildNodePath,
  getHeritageString,
  getActivePath,
  composeHeritageWithMemories,
} from '../lib/contextEngine'
import { askAI, DEFAULT_MODEL } from '../lib/openaiService'
import { parseModelResponse } from '../lib/responseParser'
import {
  loadTree,
  saveTree,
  verifyTreeNodeContextSchema,
} from '../lib/treeService'
import {
  normalizeMessages,
  filterMessagesForModel,
  collectEffectiveMemories,
  memoryOverrideKey,
  INCLUDE_PARENT_CONTEXT_KEY,
} from '../lib/chatContext'

const makeId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

const normalizeMemory = (raw) => ({
  id: typeof raw?.id === 'string' && raw.id ? raw.id : makeId('mem'),
  title: typeof raw?.title === 'string' ? raw.title : '',
  reason: typeof raw?.reason === 'string' ? raw.reason : '',
  content: typeof raw?.content === 'string' ? raw.content : '',
  enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : true,
  createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
  updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
})

const normalizeMemoryOverrides = (raw) => {
  if (!raw || typeof raw !== 'object') return {}
  const next = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'boolean') next[key] = value
  }
  return next
}

const normalizeNode = (node) => {
  const legacyMessages = []
  if ((!node.messages || node.messages.length === 0) && (node.question || node.aiResponse)) {
    if (node.question) legacyMessages.push({ role: 'user', content: node.question })
    if (node.aiResponse) legacyMessages.push({ role: 'assistant', content: node.aiResponse })
  }

  const memoryOverrides = normalizeMemoryOverrides(node.memoryOverrides)
  const includeParentContext = typeof node.includeParentContext === 'boolean'
    ? node.includeParentContext
    : (typeof memoryOverrides[INCLUDE_PARENT_CONTEXT_KEY] === 'boolean'
      ? memoryOverrides[INCLUDE_PARENT_CONTEXT_KEY]
      : true)

  return {
    ...node,
    contextAnchor: node.contextAnchor || '',
    highlights: Array.isArray(node.highlights) ? node.highlights : [],
    messages: normalizeMessages(node.messages?.length ? node.messages : legacyMessages),
    memories: Array.isArray(node.memories) ? node.memories.map(normalizeMemory) : [],
    memoryOverrides,
    includeParentContext,
  }
}

const createMessage = (role, content, options = {}) => ({
  id: makeId('msg'),
  turnId: options.turnId || makeId('turn'),
  role,
  content,
  includeInContext: options.includeInContext ?? true,
  createdAt: options.createdAt || new Date().toISOString(),
  ...(options.image ? { image: options.image } : {}),
})

const LearningTree = () => {
  const { treeId } = useParams()
  const canvasRef = useRef(null)

  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [activeNodeId, setActiveNodeId] = useState(null)
  const [activePath, setActivePath] = useState([])
  const [viewMode, setViewMode] = useState('chat')

  const [isAILoading, setIsAILoading] = useState(false)
  const [loadingNodeId, setLoadingNodeId] = useState(null)
  const [isTreeLoading, setIsTreeLoading] = useState(true)

  const [treeSaveError, setTreeSaveError] = useState(null)
  const [branchFromName, setBranchFromName] = useState('')

  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('forest-ai-model') || DEFAULT_MODEL)

  const [isSchemaChecking, setIsSchemaChecking] = useState(true)
  const [contextSchemaError, setContextSchemaError] = useState(null)

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges

  const isSchemaBlocked = !!contextSchemaError
  const isMutatingDisabled = isSchemaChecking || isSchemaBlocked

  const activeNode = nodes.find((n) => n.id === activeNodeId)
  const hasNoNodes = nodes.length === 0

  const handleModelChange = useCallback((modelId) => {
    setSelectedModel(modelId)
    localStorage.setItem('forest-ai-model', modelId)
  }, [])

  const generateId = () => makeId('node')

  const getNextNodeName = useCallback(() => `Node ${nodesRef.current.length + 1}`, [])

  const canMutate = useCallback(() => !isMutatingDisabled, [isMutatingDisabled])

  const buildModelRequest = useCallback((nodeId, pendingMessages, pendingTurnId = null) => {
    const messagesForModel = filterMessagesForModel(pendingMessages, pendingTurnId)
    const active = nodesRef.current.find((n) => n.id === nodeId)
    const includeParentContext = active?.includeParentContext !== false
    const fullNodePath = buildNodePath(nodeId, nodesRef.current)
    const scopedNodePath = includeParentContext ? fullNodePath : fullNodePath.slice(-1)
    const effectiveMemories = collectEffectiveMemories(scopedNodePath)
    const hasEnabledMemories = effectiveMemories.some((entry) => entry?.effectiveEnabled)
    const hasHistoricalMessageContext = pendingTurnId
      ? messagesForModel.some((msg) => msg.turnId !== pendingTurnId)
      : messagesForModel.length > 0

    let heritageWithMemories = 'Contextual Heritage:\nNone'
    if (hasHistoricalMessageContext || hasEnabledMemories) {
      const scopedContextPath = includeParentContext
        ? buildContextPath(nodeId, nodesRef.current)
        : (active ? buildContextPath(nodeId, [active]) : [])
      const heritage = getHeritageString(scopedContextPath)
      heritageWithMemories = composeHeritageWithMemories(heritage, effectiveMemories)
    }

    return { heritageWithMemories, messagesForModel }
  }, [])

  useEffect(() => {
    let cancelled = false
    const verify = async () => {
      setIsSchemaChecking(true)
      const { error } = await verifyTreeNodeContextSchema()
      if (cancelled) return
      setContextSchemaError(error?.message || null)
      setIsSchemaChecking(false)
    }
    verify()
    return () => { cancelled = true }
  }, [])

  // Load tree data from Supabase
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
          setNodes((data.nodes || []).map(normalizeNode))
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

    if (!treeId || isMutatingDisabled) return

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
  }, [nodes, edges, treeId, isTreeLoading, isMutatingDisabled])

  const handleCreateRootNode = () => {
    if (!canMutate()) return

    const roots = nodesRef.current.filter((n) => !n.parentId)
    const position = { x: roots.length * 200, y: 0 }

    const newNode = normalizeNode({
      id: generateId(),
      label: getNextNodeName(),
      position,
      parentId: null,
      question: '',
      aiResponse: '',
      contextAnchor: '',
      highlights: [],
      messages: [],
      memories: [],
      memoryOverrides: {},
    })

    setNodes((prev) => [...prev, newNode])
    setActiveNodeId(newNode.id)
    setActivePath([])
    setTimeout(() => canvasRef.current?.centerOnNode(newNode.id), 0)
  }

  const handleCreateBranchFromNode = (parentNodeId, childLabel) => {
    if (!canMutate()) return

    const parent = nodesRef.current.find((n) => n.id === parentNodeId)
    if (!parent?.position) return

    const name = (childLabel || '').trim() || getNextNodeName()
    const childId = generateId()
    const angle = Math.random() * Math.PI * 2
    const distance = 150

    const newNode = normalizeNode({
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
      memories: [],
      memoryOverrides: {},
    })

    const newEdge = { id: `edge_${parentNodeId}_${childId}`, sourceId: parentNodeId, targetId: childId }

    setNodes((prev) => [...prev, newNode])
    setEdges((prev) => [...prev, newEdge])
    setActiveNodeId(childId)
    setActivePath(getActivePath(childId, [...nodesRef.current, newNode], [...edgesRef.current, newEdge]))
    setBranchFromName('')
    setTimeout(() => canvasRef.current?.centerOnNode(childId), 0)
  }

  const deleteNodeById = useCallback((nodeId) => {
    if (!canMutate()) return

    setNodes((prev) => prev
      .filter((n) => n.id !== nodeId)
      .map((n) => {
        const next = { ...n }
        if (next.parentId === nodeId) next.parentId = null
        if (next.highlights?.length) {
          next.highlights = next.highlights.filter((h) => h.childId !== nodeId)
        }
        return next
      }))

    setEdges((prev) => prev.filter((e) => e.sourceId !== nodeId && e.targetId !== nodeId))
    setActiveNodeId(null)
    setActivePath([])
  }, [canMutate])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!activeNodeId) return

      const target = e.target
      if (target instanceof HTMLElement) {
        const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
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

  const handleAskQuestion = async (nodeId, question, imageForLastUserMessage = null) => {
    if (!canMutate()) return

    const node = nodesRef.current.find((n) => n.id === nodeId)
    if (!node) return

    const turnId = makeId('turn')
    const userMsg = createMessage('user', question, { turnId, image: imageForLastUserMessage })
    const pendingMessages = [...normalizeMessages(node.messages || []), userMsg]

    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, messages: pendingMessages } : n)))
    setIsAILoading(true)
    setLoadingNodeId(nodeId)

    try {
      const { heritageWithMemories, messagesForModel } = buildModelRequest(nodeId, pendingMessages, turnId)
      const { response } = await askAI(heritageWithMemories, messagesForModel, imageForLastUserMessage, selectedModel)
      const { content, concept, suggestNewNode } = parseModelResponse(response)

      setNodes((prev) => prev.map((n) => {
        if (n.id !== nodeId) return n

        const isDefaultLabel = /^Node\s*\d+$/i.test((n.label || '').trim())
        const assistantMsg = createMessage('assistant', content, { turnId })
        const next = { ...n, messages: [...normalizeMessages(n.messages || []), assistantMsg] }

        if (isDefaultLabel) {
          const newLabel = concept || suggestNewNode
          if (newLabel) next.label = newLabel
        } else {
          if (concept && pendingMessages.length === 1) next.label = concept
          if (suggestNewNode) next.suggestNewNode = { concept: suggestNewNode }
        }

        return next
      }))
    } catch (error) {
      console.error('AI request failed:', error)
      setNodes((prev) => prev.map((n) =>
        n.id === nodeId
          ? {
            ...n,
            messages: [
              ...normalizeMessages(n.messages || []),
              createMessage('assistant', `Error: ${error.message}`, { turnId }),
            ],
          }
          : n
      ))
    } finally {
      setIsAILoading(false)
      setLoadingNodeId(null)
    }
  }

  // Ask Forest: branch from selected text + user's follow-up question
  const handleAskBranchFromSelection = async (parentNodeId, selectedTextRaw, userQuestionRaw) => {
    if (!canMutate()) return

    const selectedText = (selectedTextRaw || '').trim().replace(/\s+/g, ' ')
    const userQuestion = (userQuestionRaw || '').trim()
    if (!selectedText || !userQuestion) return

    const parent = nodesRef.current.find((n) => n.id === parentNodeId)
    if (!parent?.position) return

    const hasContent = parent.messages?.some((m) => m.role === 'assistant') || !!parent.aiResponse
    if (!hasContent) return

    setIsAILoading(true)
    const childId = generateId()
    setLoadingNodeId(childId)

    const combinedQuestion = `The student selected this from the previous answer: "${selectedText}". Their follow-up question: ${userQuestion}`
    const turnId = makeId('turn')

    try {
      const updatedParent = {
        ...parent,
        highlights: [...(parent.highlights || []), { text: selectedText, childId: 'pending' }],
      }

      const angle = Math.random() * Math.PI * 2
      const distance = 150
      const initialLabel = selectedText.length > 30 ? `${selectedText.slice(0, 30)}…` : selectedText

      const userMsg = createMessage('user', combinedQuestion, { turnId })

      const newNode = normalizeNode({
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
        messages: [userMsg],
        memories: [],
        memoryOverrides: {},
      })

      const newEdge = {
        id: `edge_${parentNodeId}_${childId}`,
        sourceId: parentNodeId,
        targetId: childId,
      }

      updatedParent.highlights[updatedParent.highlights.length - 1].childId = childId

      const newNodes = [...nodesRef.current.filter((n) => n.id !== parentNodeId), updatedParent, newNode]
      const newEdges = [...edgesRef.current, newEdge]

      setNodes(newNodes)
      setEdges(newEdges)
      setActiveNodeId(childId)
      setActivePath(getActivePath(childId, newNodes, newEdges))

      const { heritageWithMemories, messagesForModel } = buildModelRequest(parentNodeId, [userMsg], turnId)
      const { response, error } = await askAI(heritageWithMemories, messagesForModel, null, selectedModel)

      if (error) {
        setNodes((prev) => prev.map((n) =>
          n.id === childId
            ? {
              ...n,
              aiResponse: `Error: ${error}. Please try again.`,
              messages: [
                userMsg,
                createMessage('assistant', `Error: ${error}. Please try again.`, { turnId }),
              ],
            }
            : n
        ))
      } else {
        const { content, concept } = parseModelResponse(response)
        const label = (concept && concept.trim()) || initialLabel
        setNodes((prev) => prev.map((n) =>
          n.id === childId
            ? {
              ...n,
              label,
              aiResponse: content,
              messages: [userMsg, createMessage('assistant', content, { turnId })],
            }
            : n
        ))
      }

      canvasRef.current?.centerOnNode(childId)
    } catch (error) {
      console.error('Branch creation failed:', error)
      const errMsg = `Error: ${error.message}. Please try again.`
      setNodes((prev) => prev.map((n) =>
        n.id === childId
          ? {
            ...n,
            aiResponse: errMsg,
            messages: [
              createMessage('user', combinedQuestion, { turnId }),
              createMessage('assistant', errMsg, { turnId }),
            ],
          }
          : n
      ))
    } finally {
      setIsAILoading(false)
      setLoadingNodeId(null)
    }
  }

  const handleDoubleClickNode = useCallback((nodeId) => {
    setActiveNodeId(nodeId)
    setActivePath(getActivePath(nodeId, nodesRef.current, edgesRef.current))
    setViewMode('chat')
  }, [])

  const handleNavigateToNode = useCallback((nodeId) => {
    setActiveNodeId(nodeId)
    setActivePath(getActivePath(nodeId, nodesRef.current, edgesRef.current))
    canvasRef.current?.centerOnNode(nodeId)
  }, [])

  const handleOpenChatFromCanvas = useCallback((nodeId) => {
    setActiveNodeId(nodeId)
    setActivePath(getActivePath(nodeId, nodesRef.current, edgesRef.current))
    setViewMode('chat')
  }, [])

  // User accepted "create new node" for topic drift
  const handleAcceptNewNode = async (currentNodeId) => {
    if (!canMutate()) return

    const node = nodesRef.current.find((n) => n.id === currentNodeId)
    if (!node?.suggestNewNode?.concept || !node.messages?.length) return

    const msgs = normalizeMessages(node.messages)
    const lastUser = msgs[msgs.length - 2]
    const lastAssistant = msgs[msgs.length - 1]
    if (msgs.length < 2 || lastUser?.role !== 'user' || lastAssistant?.role !== 'assistant') return

    const newNodeId = generateId()
    const angle = Math.random() * Math.PI * 2
    const distance = 280
    const questionContent = lastUser.content
    const turnId = lastUser.turnId || makeId('turn')

    const newNode = normalizeNode({
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
      messages: [{ ...lastUser, turnId }],
      memories: [],
      memoryOverrides: {},
    })

    const messagesWithoutLast = msgs.slice(0, -2)

    setNodes((prev) => {
      const updated = prev.map((n) => {
        if (n.id !== currentNodeId) return n
        const { suggestNewNode: _removed, ...rest } = n
        return { ...rest, messages: messagesWithoutLast }
      })
      return [...updated, newNode]
    })

    setActiveNodeId(newNodeId)
    setActivePath([])
    setViewMode('chat')
    setIsAILoading(true)
    setLoadingNodeId(newNodeId)

    setTimeout(() => canvasRef.current?.centerOnNode(newNodeId), 0)

    try {
      const contextPath = buildContextPath(newNodeId, [...nodesRef.current, newNode])
      const heritage = getHeritageString(contextPath)
      const pathNodes = buildNodePath(newNodeId, [...nodesRef.current, newNode])
      const effectiveMemories = collectEffectiveMemories(pathNodes)
      const heritageWithMemories = composeHeritageWithMemories(heritage, effectiveMemories)

      const pending = filterMessagesForModel([{ ...lastUser, turnId }], turnId)
      const { response } = await askAI(heritageWithMemories, pending, null, selectedModel)

      const { content, concept } = parseModelResponse(response)
      const label = concept || node.suggestNewNode.concept

      setNodes((prev) => prev.map((n) =>
        n.id === newNodeId
          ? {
            ...n,
            label,
            question: questionContent,
            aiResponse: content,
            messages: [{ ...lastUser, turnId }, createMessage('assistant', content, { turnId })],
          }
          : n
      ))
    } catch (error) {
      console.error('New node AI request failed:', error)
      setNodes((prev) => prev.map((n) =>
        n.id === newNodeId
          ? {
            ...n,
            messages: [{ ...lastUser, turnId }, createMessage('assistant', `Error: ${error.message}`, { turnId })],
          }
          : n
      ))
    } finally {
      setIsAILoading(false)
      setLoadingNodeId(null)
    }
  }

  const handleDismissNewNodeSuggestion = useCallback((nodeId) => {
    if (!canMutate()) return

    setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId) return n
      const { suggestNewNode, ...rest } = n
      return rest
    }))
  }, [canMutate])

  const handleRenameNode = useCallback((nodeId, newLabel) => {
    if (!canMutate()) return

    const trimmed = (newLabel || '').trim()
    if (!trimmed) return
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, label: trimmed } : n)))
  }, [canMutate])

  const handleCreateFirstNode = async (question) => {
    if (!canMutate()) return

    const trimmed = (question || '').trim()
    if (!trimmed) return

    const newNodeId = generateId()
    const turnId = makeId('turn')
    const userMsg = createMessage('user', trimmed, { turnId })

    const newNode = normalizeNode({
      id: newNodeId,
      label: 'New topic',
      position: { x: 0, y: 0 },
      parentId: null,
      question: trimmed,
      aiResponse: '',
      contextAnchor: '',
      highlights: [],
      messages: [userMsg],
      memories: [],
      memoryOverrides: {},
    })

    setNodes([newNode])
    setEdges([])
    setActiveNodeId(newNodeId)
    setActivePath([])
    setViewMode('chat')
    setIsAILoading(true)
    setLoadingNodeId(newNodeId)

    try {
      const contextPath = buildContextPath(newNodeId, [newNode])
      const heritage = getHeritageString(contextPath)
      const pathNodes = buildNodePath(newNodeId, [newNode])
      const effectiveMemories = collectEffectiveMemories(pathNodes)
      const heritageWithMemories = composeHeritageWithMemories(heritage, effectiveMemories)

      const pending = filterMessagesForModel([userMsg], turnId)
      const { response } = await askAI(heritageWithMemories, pending, null, selectedModel)
      const { content, concept } = parseModelResponse(response)

      const label = (concept && concept.trim()) || `${trimmed.slice(0, 30)}${trimmed.length > 30 ? '…' : ''}`

      setNodes((prev) => prev.map((n) =>
        n.id !== newNodeId
          ? n
          : {
            ...n,
            label,
            aiResponse: content,
            messages: [userMsg, createMessage('assistant', content, { turnId })],
          }
      ))

      setTimeout(() => canvasRef.current?.centerOnNode(newNodeId), 0)
    } catch (error) {
      console.error('First node AI request failed:', error)
      setNodes((prev) => prev.map((n) =>
        n.id !== newNodeId
          ? n
          : {
            ...n,
            messages: [userMsg, createMessage('assistant', `Error: ${error.message}`, { turnId })],
          }
      ))
    } finally {
      setIsAILoading(false)
      setLoadingNodeId(null)
    }
  }

  const handleToggleTurnInclusion = useCallback((nodeId, turnId) => {
    if (!canMutate()) return

    setNodes((prev) => prev.map((node) => {
      if (node.id !== nodeId) return node
      const messages = normalizeMessages(node.messages || [])
      const isOn = messages.some((msg) => msg.turnId === turnId && msg.includeInContext !== false)
      const nextInclude = !isOn
      return {
        ...node,
        messages: messages.map((msg) => (
          msg.turnId === turnId ? { ...msg, includeInContext: nextInclude } : msg
        )),
      }
    }))
  }, [canMutate])

  const handleAddMemory = useCallback((nodeId, draft) => {
    if (!canMutate()) return

    const title = (draft?.title || '').trim()
    const reason = (draft?.reason || '').trim()
    const content = (draft?.content || '').trim()
    if (!title || !content) return

    const now = new Date().toISOString()
    const memory = {
      id: makeId('mem'),
      title,
      reason,
      content,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    }

    setNodes((prev) => prev.map((node) => (
      node.id === nodeId
        ? { ...node, memories: [...(node.memories || []), memory] }
        : node
    )))
  }, [canMutate])

  const handleUpdateMemory = useCallback((nodeId, memoryId, patch) => {
    if (!canMutate()) return

    setNodes((prev) => prev.map((node) => {
      if (node.id !== nodeId) return node
      const memories = (node.memories || []).map((memory) => {
        if (memory.id !== memoryId) return memory
        return {
          ...memory,
          ...patch,
          updatedAt: new Date().toISOString(),
        }
      })
      return { ...node, memories }
    }))
  }, [canMutate])

  const handleDeleteMemory = useCallback((nodeId, memoryId) => {
    if (!canMutate()) return

    const keyPrefix = `${nodeId}:${memoryId}`

    setNodes((prev) => prev.map((node) => {
      const next = { ...node }
      if (next.id === nodeId) {
        next.memories = (next.memories || []).filter((memory) => memory.id !== memoryId)
      }

      if (next.memoryOverrides && typeof next.memoryOverrides === 'object') {
        const cleaned = { ...next.memoryOverrides }
        delete cleaned[keyPrefix]
        next.memoryOverrides = cleaned
      }

      return next
    }))
  }, [canMutate])

  const handleToggleMemoryEffective = useCallback((nodeId, memoryId, sourceNodeId) => {
    if (!canMutate()) return

    const targetNode = nodesRef.current.find((n) => n.id === nodeId)
    const pathNodes = targetNode?.includeParentContext === false
      ? (targetNode ? [targetNode] : [])
      : buildNodePath(nodeId, nodesRef.current)
    const effectiveMemories = collectEffectiveMemories(pathNodes)
    const current = effectiveMemories.find((entry) => entry.sourceNodeId === sourceNodeId && entry.memoryId === memoryId)
    if (!current) return

    const nextEnabled = !current.effectiveEnabled

    setNodes((prev) => prev.map((node) => {
      if (sourceNodeId === nodeId && node.id === nodeId) {
        return {
          ...node,
          memories: (node.memories || []).map((memory) => (
            memory.id === memoryId
              ? { ...memory, enabled: nextEnabled, updatedAt: new Date().toISOString() }
              : memory
          )),
        }
      }

      if (node.id !== nodeId) return node

      const key = memoryOverrideKey(sourceNodeId, memoryId)
      return {
        ...node,
        memoryOverrides: {
          ...(node.memoryOverrides || {}),
          [key]: nextEnabled,
        },
      }
    }))
  }, [canMutate])

  const handleToggleParentContext = useCallback((nodeId) => {
    if (!canMutate()) return

    setNodes((prev) => prev.map((node) => {
      if (node.id !== nodeId) return node
      const nextIncludeParent = node.includeParentContext === false
      return {
        ...node,
        includeParentContext: nextIncludeParent,
        memoryOverrides: {
          ...(node.memoryOverrides || {}),
          [INCLUDE_PARENT_CONTEXT_KEY]: nextIncludeParent,
        },
      }
    }))
  }, [canMutate])

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
      {treeSaveError && (
        <div className="absolute top-4 right-4 z-[110] bg-red-900/80 border border-red-700 text-red-200 text-sm px-4 py-2 rounded-lg shadow-lg">
          {treeSaveError}
        </div>
      )}

      {isSchemaBlocked && (
        <div className="absolute top-16 left-4 right-4 z-[100] rounded-lg border border-amber-500/70 bg-amber-900/60 px-4 py-2.5 text-amber-100 text-sm">
          {contextSchemaError} Run the updated `supabase_migration.sql` before editing this tree.
        </div>
      )}

      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-4 pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <Link to="/dashboard">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-4 py-2 bg-forest-darker/60 border border-forest-border rounded-lg text-forest-emerald hover:border-forest-emerald transition-all duration-100 flex items-center gap-2 text-sm"
            >
              <Home size={16} />
              <span>Dashboard</span>
            </motion.button>
          </Link>

          {!hasNoNodes && <span className="text-xs text-forest-gray">{nodes.length} nodes</span>}
        </div>

        <div className="pointer-events-auto rounded-lg border border-forest-border bg-forest-card/80 p-1 flex items-center gap-1 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setViewMode('canvas')}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 ${
              viewMode === 'canvas'
                ? 'bg-forest-emerald text-forest-darker'
                : 'text-forest-light-gray hover:text-white hover:bg-forest-border/60'
            }`}
          >
            <LayoutGrid size={14} />
            <span>Canvas</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('chat')}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors flex items-center gap-1.5 ${
              viewMode === 'chat'
                ? 'bg-forest-emerald text-forest-darker'
                : 'text-forest-light-gray hover:text-white hover:bg-forest-border/60'
            }`}
          >
            <MessageSquare size={14} />
            <span>Chat</span>
          </button>
        </div>
      </div>

      {viewMode === 'canvas' ? (
        <>
          <div className="h-full">
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
              isReadOnly={isMutatingDisabled}
            />
          </div>

          {/* Bottom-left controls for canvas mode */}
          <div className="absolute bottom-4 left-4 z-50 flex flex-col gap-2 pointer-events-auto">
            <motion.button
              type="button"
              onClick={handleCreateRootNode}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={isMutatingDisabled}
              className="px-4 py-2.5 bg-forest-card/90 backdrop-blur-md border border-forest-border rounded-lg text-forest-emerald hover:border-forest-emerald transition-all duration-100 flex items-center gap-2 text-sm font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
                    disabled={isMutatingDisabled}
                    className="flex-1 min-w-0 px-3 py-2 text-sm bg-forest-darker border border-forest-border rounded-lg text-white placeholder:text-forest-gray focus:outline-none focus:ring-1 focus:ring-forest-emerald focus:border-forest-emerald disabled:opacity-60"
                  />
                  <motion.button
                    type="button"
                    onClick={() => handleCreateBranchFromNode(activeNodeId, branchFromName)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={isMutatingDisabled}
                    className="px-3 py-2 bg-forest-emerald/20 border border-forest-emerald rounded-lg text-forest-emerald hover:bg-forest-emerald/30 transition-colors flex items-center gap-1.5 text-sm font-medium shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <GitBranch size={16} />
                    <span>Create</span>
                  </motion.button>
                </div>
              </motion.div>
            )}
          </div>

          {activeNode && (
            <QuickNodeDrawer
              node={activeNode}
              onOpenChat={() => handleOpenChatFromCanvas(activeNode.id)}
            />
          )}
        </>
      ) : (
        <div className="h-full pt-14">
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
            onToggleTurnInclusion={handleToggleTurnInclusion}
            onToggleMemoryEffective={handleToggleMemoryEffective}
            onToggleParentContext={handleToggleParentContext}
            onAddMemory={handleAddMemory}
            onUpdateMemory={handleUpdateMemory}
            onDeleteMemory={handleDeleteMemory}
            isAILoading={isAILoading}
            loadingNodeId={loadingNodeId}
            onClose={undefined}
            activePath={activePath}
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            schemaBlocked={isMutatingDisabled}
            schemaErrorMessage={isSchemaChecking ? 'Verifying database schema…' : contextSchemaError}
          />
        </div>
      )}
    </div>
  )
}

export default LearningTree
