import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Loader, ChevronRight, X, TreePine, GitBranch, Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTextSelection } from '../../hooks/useTextSelection'

// Derive messages for display (supports legacy question/aiResponse)
const getDisplayMessages = (node) => {
  if (!node) return []
  if (node.messages?.length) return node.messages
  if (node.question || node.aiResponse) {
    return [
      ...(node.question ? [{ role: 'user', content: node.question }] : []),
      ...(node.aiResponse ? [{ role: 'assistant', content: node.aiResponse }] : []),
    ]
  }
  return []
}

// Parse branch user message: "The student selected... \"...\". Their follow-up question: ..."
const parseBranchUserMessage = (content) => {
  if (!content || typeof content !== 'string') return null
  const match = content.match(/The student selected this from the previous answer:\s*"([^"]+)"\.\s*Their follow-up question:\s*(.+)/s)
  if (!match) return null
  return { selectedText: match[1].trim(), followUpQuestion: match[2].trim() }
}

// Inject markdown links for highlight text (literal first-occurrence replace for robustness)
const injectHighlightLinks = (content, highlights) => {
  if (!content || !highlights?.length) return content
  let out = content
  for (const h of highlights) {
    const text = (h.text || '').trim()
    const childId = h.childId?.trim()
    if (!text || !childId) continue
    const idx = out.indexOf(text)
    if (idx === -1) continue
    const linkText = text.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
    const link = `[${linkText}](forest://node/${childId})`
    out = out.slice(0, idx) + link + out.slice(idx + text.length)
  }
  return out
}

const StudyPanel = ({
  activeNode,
  nodes,
  onAskQuestion,
  onAskBranchFromSelection,
  onNavigateToNode,
  onRenameNode,
  onAcceptNewNode,
  onDismissNewNodeSuggestion,
  isAILoading,
  loadingNodeId,
  onClose,
  activePath,
}) => {
  const [question, setQuestion] = useState('')
  const [branchQuestion, setBranchQuestion] = useState('')
  const [showBranchInput, setShowBranchInput] = useState(false)
  const [branchSelectionSnapshot, setBranchSelectionSnapshot] = useState(null)
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const [editLabelValue, setEditLabelValue] = useState('')
  const editLabelInputRef = useRef(null)
  const panelRef = useRef(null)
  const contentRef = useRef(null)
  const { selection, clearSelection } = useTextSelection(contentRef)

  // Use snapshot when form is expanded so popup stays visible after selection is cleared (e.g. input focus)
  const effectiveSelection = showBranchInput ? branchSelectionSnapshot : selection

  // Build breadcrumb path from root to active node
  const getBreadcrumbPath = () => {
    if (!activeNode) return []

    const path = []
    let current = activeNode

    while (current) {
      path.unshift(current)
      current = nodes.find(n => n.id === current.parentId)
    }

    return path
  }

  const breadcrumbPath = getBreadcrumbPath()
  const messages = getDisplayMessages(activeNode)
  const chatScrollRef = useRef(null)

  const hasAssistantContent = messages.some((m) => m.role === 'assistant')
  const isDefaultNodeLabel = /^Node\s*\d+$/.test((activeNode?.label || '').trim())
  const canBranch = activeNode && hasAssistantContent && !isDefaultNodeLabel

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, isAILoading])

  const handleSubmitQuestion = (e) => {
    e.preventDefault()
    if (question.trim() && !isAILoading && activeNode) {
      onAskQuestion(activeNode.id, question)
      setQuestion('')
    }
  }

  const handleAskForestClick = () => {
    if (selection?.text && activeNode) {
      setBranchSelectionSnapshot({ text: selection.text, rect: { ...selection.rect } })
      setShowBranchInput(true)
    }
  }

  const handleBranchSubmit = (e) => {
    e.preventDefault()
    const textToUse = (branchSelectionSnapshot || selection)?.text
    if (textToUse && activeNode && branchQuestion.trim() && !isAILoading) {
      onAskBranchFromSelection(activeNode.id, textToUse, branchQuestion.trim())
      setBranchQuestion('')
      setShowBranchInput(false)
      setBranchSelectionSnapshot(null)
      clearSelection()
    }
  }

  const handleBranchCancel = () => {
    setShowBranchInput(false)
    setBranchSelectionSnapshot(null)
    setBranchQuestion('')
  }

  const startEditingLabel = () => {
    setEditLabelValue(activeNode?.label ?? '')
    setIsEditingLabel(true)
    setTimeout(() => editLabelInputRef.current?.focus(), 0)
  }

  const saveLabel = () => {
    const trimmed = editLabelValue?.trim()
    if (trimmed && activeNode && onRenameNode) {
      onRenameNode(activeNode.id, trimmed)
    }
    setIsEditingLabel(false)
  }

  const cancelEditingLabel = () => {
    setIsEditingLabel(false)
    setEditLabelValue('')
  }

  useEffect(() => {
    if (activeNode?.id) {
      if (isEditingLabel) setIsEditingLabel(false)
      setEditLabelValue(activeNode.label ?? '')
    }
  }, [activeNode?.id])

  // Empty state when no node is selected
  if (!activeNode) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-forest-card border-2 border-forest-border flex items-center justify-center">
            <TreePine size={40} className="text-forest-emerald/50" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Select a Node</h2>
          <p className="text-forest-light-gray mb-4">
            Click on any node in the canvas to explore its content and ask questions.
          </p>
          <div className="text-sm text-forest-gray space-y-2">
            <p>• Double-click on canvas to create a node</p>
            <p>• Click a node to select and study it</p>
            <p>• Drag nodes to organize your tree</p>
          </div>
        </motion.div>
      </div>
    )
  }

  const panelRect = panelRef.current?.getBoundingClientRect()
  const selectionLeft = panelRect && effectiveSelection
    ? effectiveSelection.rect.left - panelRect.left
    : 0
  const selectionTop = panelRect && effectiveSelection
    ? effectiveSelection.rect.top - panelRect.top
    : 0
  const selectionWidth = effectiveSelection?.rect?.width ?? 0
  const popupWidth = 320
  const gap = 12
  // Place popup beside the selection (right first, else left) so it doesn't cover the selection or cursor
  const rightSpace = panelRect ? panelRect.width - (selectionLeft + selectionWidth + gap) : 0
  const popupLeft = panelRect
    ? rightSpace >= popupWidth
      ? selectionLeft + selectionWidth + gap
      : Math.max(12, selectionLeft - popupWidth - gap)
    : selectionLeft
  const popupTop = Math.max(12, selectionTop)

  return (
    <div ref={panelRef} className="h-full flex flex-col bg-forest-darker relative">
      {/* Header with Breadcrumb (node title is the last segment) + Jump options to the right */}
      <div className="flex-shrink-0 border-b border-forest-border bg-forest-card/50">
        <div className="px-4 py-3 flex items-center gap-3">
          {/* Hierarchy (breadcrumb): scrolls when long */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div className="flex items-center gap-1 ml-0.5 text-sm min-w-max">
              {breadcrumbPath.map((node, index) => (
                <React.Fragment key={node.id}>
                  {index > 0 && <ChevronRight size={14} className="text-forest-gray flex-shrink-0" />}
                  {node.id === activeNode.id ? (
                    isEditingLabel ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <input
                          ref={editLabelInputRef}
                          type="text"
                          value={editLabelValue}
                          onChange={(e) => setEditLabelValue(e.target.value)}
                          onBlur={saveLabel}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveLabel()
                            }
                            if (e.key === 'Escape') cancelEditingLabel()
                          }}
                          className="px-2 py-1 text-sm font-semibold text-forest-emerald bg-forest-darker border border-forest-emerald/50 rounded-md min-w-[120px] focus:outline-none focus:ring-1 focus:ring-forest-emerald"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-shrink-0 group">
                        <span className="text-forest-emerald font-semibold whitespace-nowrap">
                          {node.label}
                        </span>
                        <button
                          type="button"
                          onClick={startEditingLabel}
                          className="p-1 rounded text-forest-gray hover:text-forest-emerald hover:bg-forest-border/50 opacity-70 group-hover:opacity-100 transition-opacity"
                          title="Rename node"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigateToNode?.(node.id)}
                      className="text-forest-light-gray rounded-md px-2 py-1 mx-0.5 text-left cursor-pointer bg-forest-card/40 border border-yellow-400/70 whitespace-nowrap hover:border-yellow-400"
                    >
                      {node.label}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
          {/* Right side: yellow next-node paths + close, always visible */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {activeNode.highlights?.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {activeNode.highlights
                  .filter((h) => h.childId && h.childId !== 'pending')
                  .map((h) => {
                    const child = nodes.find((n) => n.id === h.childId)
                    const label = child?.label || h.text || 'Branch'
                    return (
                      <button
                        key={h.childId}
                        type="button"
                        onClick={() => onNavigateToNode?.(h.childId)}
                        className="px-3.5 py-2 rounded-lg text-sm font-medium bg-yellow-400 text-yellow-950 border border-yellow-300 hover:bg-yellow-300 hover:border-yellow-200 transition-colors shadow-sm whitespace-nowrap min-w-0"
                        title={`Jump to: ${label}`}
                      >
                        {label}
                      </button>
                    )
                  })}
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-forest-border rounded-lg transition-colors flex-shrink-0"
            >
              <X size={18} className="text-forest-light-gray" />
            </button>
          </div>
        </div>
        {activeNode.contextAnchor && (
          <p className="px-4 pb-2 text-xs text-forest-gray">
            Branched from: &quot;{activeNode.contextAnchor.length > 50 ? activeNode.contextAnchor.substring(0, 50) + '…' : activeNode.contextAnchor}&quot;
          </p>
        )}
      </div>

      {/* Content area: prose + faded user-question bubbles + thinking */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        <div
          ref={chatScrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden"
        >
          <div
            ref={contentRef}
            className="p-6 pb-2 min-h-full select-text"
            onMouseUp={(e) => e.stopPropagation()}
          >
            {messages.length === 0 && !isAILoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 mb-4 rounded-full bg-forest-card border border-forest-border flex items-center justify-center">
                  <Send size={24} className="text-forest-emerald/50" />
                </div>
                <p className="text-forest-light-gray mb-2">No content yet</p>
                <p className="text-sm text-forest-gray">
                  Ask a question below to start learning about this topic
                </p>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`${msg.role === 'user' ? 'mt-6 flex justify-end' : 'mb-6 pb-4 border-b border-forest-border/30'}`}
                  >
                    {msg.role === 'user' && (() => {
                      const branch = parseBranchUserMessage(msg.content)
                      return (
                        <div className="rounded-xl px-4 py-2.5 bg-forest-card/50 border border-forest-border/50 text-forest-light-gray/90 text-sm max-w-xl">
                          {branch ? (
                            <>
                              <p className="italic">&quot;{branch.selectedText}&quot;</p>
                              <p className="mt-2">{branch.followUpQuestion}</p>
                            </>
                          ) : (
                            msg.content
                          )}
                        </div>
                      )
                    })()}
                    {msg.role === 'assistant' && (
                      <div className="prose prose-invert prose-sm max-w-none text-white pt-1">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ href, children, ...props }) => {
                              if (href?.startsWith('forest://node/')) {
                                const nodeId = href.replace('forest://node/', '')
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      onNavigateToNode?.(nodeId)
                                    }}
                                    className="highlight-link-box"
                                    title="Click to jump to this branch"
                                  >
                                    {children}
                                  </button>
                                )
                              }
                              return <a href={href} {...props}>{children}</a>
                            },
                          }}
                        >
                          {injectHighlightLinks(msg.content, activeNode.highlights)}
                        </ReactMarkdown>
                      </div>
                    )}
                  </motion.div>
                ))}

                {/* Thinking: only in the node that is loading, no outline */}
                <AnimatePresence>
                  {isAILoading && loadingNodeId === activeNode?.id && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      className="pt-2"
                    >
                      <div className="rounded-xl px-4 py-3 bg-forest-card/80 flex items-center gap-1.5 w-fit">
                        <span className="flex gap-1">
                          <span className="w-2 h-2 rounded-full bg-forest-emerald/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 rounded-full bg-forest-emerald/80 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 rounded-full bg-forest-emerald/80 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                        <span className="text-xs text-forest-gray">Thinking...</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>

          {/* Topic drift: offer to create new node for this concept */}
          {activeNode?.suggestNewNode?.concept && messages.length > 0 && (
            <div className="px-4 py-3 border-t border-forest-border/50 bg-forest-card/30 flex flex-col gap-2">
              <p className="text-sm text-forest-light-gray">
                This seems like a different topic. Create a new node for &quot;{activeNode.suggestNewNode.concept}&quot;?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onAcceptNewNode?.(activeNode.id)}
                  className="flex-1 px-3 py-2 bg-forest-emerald/20 border border-forest-emerald/50 text-forest-emerald rounded-lg text-sm font-medium hover:bg-forest-emerald/30 transition-colors flex items-center justify-center gap-2"
                >
                  <GitBranch size={14} />
                  Create new node
                </button>
                <button
                  type="button"
                  onClick={() => onDismissNewNodeSuggestion?.(activeNode.id)}
                  className="px-3 py-2 text-forest-gray hover:text-white text-sm"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {messages.length > 0 && !activeNode?.suggestNewNode && canBranch && (
            <p className="text-xs text-forest-gray italic text-center px-4 py-2 border-t border-forest-border/30">
              Select text, then Ask Forest to branch · Click highlighted text to jump to that branch
            </p>
          )}
        </div>

        {/* Ask Forest popup - only when branching is allowed (not first node / default "Node 1" title) */}
        <AnimatePresence>
          {effectiveSelection && canBranch && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="absolute z-50 pointer-events-auto bg-forest-card border border-forest-border rounded-xl shadow-2xl overflow-hidden select-none"
              style={{
                left: popupLeft,
                top: popupTop,
                minWidth: 280,
                maxWidth: 420,
              }}
            >
              {!showBranchInput ? (
                <div className="p-2">
                  <p className="text-xs text-forest-gray mb-2 px-1 truncate" title={effectiveSelection.text}>
                    &quot;{effectiveSelection.text.length > 50 ? effectiveSelection.text.slice(0, 50) + '…' : effectiveSelection.text}&quot;
                  </p>
                  <button
                    type="button"
                    onClick={handleAskForestClick}
                    onMouseDown={(e) => e.preventDefault()}
                    className="w-full px-4 py-2.5 bg-forest-emerald text-forest-darker rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 text-sm font-semibold"
                  >
                    <TreePine size={16} />
                    Ask Forest
                  </button>
                </div>
              ) : (
                <form onSubmit={handleBranchSubmit} className="p-3 space-y-3">
                  <p className="text-xs text-forest-light-gray">
                    Ask about: &quot;{effectiveSelection.text.length > 40 ? effectiveSelection.text.slice(0, 40) + '…' : effectiveSelection.text}&quot;
                  </p>
                  <input
                    type="text"
                    value={branchQuestion}
                    onChange={(e) => setBranchQuestion(e.target.value)}
                    placeholder="Type your question..."
                    disabled={isAILoading}
                    autoFocus
                    className="w-full px-3 py-2.5 bg-forest-darker border border-forest-border rounded-lg text-white placeholder-forest-gray text-sm focus:outline-none focus:border-forest-emerald"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleBranchCancel}
                      className="px-3 py-2 text-forest-gray hover:text-white text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isAILoading || !branchQuestion.trim()}
                      className="flex-1 px-3 py-2 bg-forest-emerald text-forest-darker rounded-lg text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isAILoading ? (
                        <>
                          <Loader size={14} className="animate-spin" />
                          Ask
                        </>
                      ) : (
                        <>
                          <Send size={14} />
                          Ask Forest
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Question Input - Fixed at bottom */}
      <div className="flex-shrink-0 border-t border-forest-border bg-forest-card/50 p-4">
        <form onSubmit={handleSubmitQuestion} className="flex gap-3">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about this topic..."
            disabled={isAILoading}
            className="flex-1 px-4 py-3 bg-forest-darker border border-forest-border rounded-xl text-white placeholder-forest-gray focus:outline-none focus:border-forest-emerald transition-colors"
          />
          <button
            type="submit"
            disabled={isAILoading || !question.trim()}
            className="px-5 py-3 bg-forest-emerald text-forest-darker rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
          >
            {isAILoading ? (
              <>
                <Loader size={18} className="animate-spin" />
                <span>Thinking...</span>
              </>
            ) : (
              <>
                <Send size={18} />
                <span>Ask</span>
              </>
            )}
          </button>
        </form>

        {/* Context hint */}
        {breadcrumbPath.length > 1 && (
          <p className="text-xs text-forest-gray mt-2 text-center">
            AI will use context from your entire learning path
          </p>
        )}
      </div>
    </div>
  )
}

export default StudyPanel
