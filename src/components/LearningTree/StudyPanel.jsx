import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Loader, ChevronRight, X, TreePine } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTextSelection } from '../../hooks/useTextSelection'

const StudyPanel = ({
  activeNode,
  nodes,
  onAskQuestion,
  onAskBranchFromSelection,
  isAILoading,
  onClose,
  activePath,
}) => {
  const [question, setQuestion] = useState('')
  const [branchQuestion, setBranchQuestion] = useState('')
  const [showBranchInput, setShowBranchInput] = useState(false)
  const [branchSelectionSnapshot, setBranchSelectionSnapshot] = useState(null)
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
      {/* Header with Breadcrumb */}
      <div className="flex-shrink-0 border-b border-forest-border bg-forest-card/50">
        {/* Breadcrumb Path */}
        <div className="px-4 py-2 flex items-center gap-1 overflow-x-auto text-sm border-b border-forest-border/50">
          {breadcrumbPath.map((node, index) => (
            <React.Fragment key={node.id}>
              {index > 0 && <ChevronRight size={14} className="text-forest-gray flex-shrink-0" />}
              <span
                className={`truncate max-w-32 ${node.id === activeNode.id
                  ? 'text-forest-emerald font-medium'
                  : 'text-forest-light-gray'
                  }`}
              >
                {node.label}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* Node Title */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{activeNode.label}</h2>
            {activeNode.contextAnchor && (
              <p className="text-xs text-forest-gray mt-1">
                Branched from: "{activeNode.contextAnchor.substring(0, 50)}..."
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-forest-border rounded-lg transition-colors"
          >
            <X size={18} className="text-forest-light-gray" />
          </button>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeNode.aiResponse ? (
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto p-6 select-text"
            onMouseUp={(e) => e.stopPropagation()}
          >
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {activeNode.aiResponse}
              </ReactMarkdown>
            </div>

            {/* Selection hint */}
            <p className="text-xs text-forest-gray italic text-center mt-6 pt-4 border-t border-forest-border/30">
              Select text above, then click Ask Forest to ask a follow-up question
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-forest-card border border-forest-border flex items-center justify-center">
              <Send size={24} className="text-forest-emerald/50" />
            </div>
            <p className="text-forest-light-gray mb-2">No content yet</p>
            <p className="text-sm text-forest-gray">
              Ask a question below to start learning about this topic
            </p>
          </div>
        )}

        {/* Ask Forest popup - appears when text is selected; stays visible via snapshot when form is open */}
        <AnimatePresence>
          {effectiveSelection && (
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
