import React, { useMemo } from 'react'
import { MessageSquare, ArrowRight } from 'lucide-react'
import { buildTurns, summarizeTurn } from '../../lib/chatContext'

const QuickNodeDrawer = ({ node, onOpenChat }) => {
  const lastTurn = useMemo(() => {
    const turns = buildTurns(node?.messages || [])
    return turns.length ? turns[turns.length - 1] : null
  }, [node?.messages])

  const summary = useMemo(() => summarizeTurn(lastTurn), [lastTurn])

  if (!node) return null

  return (
    <div className="absolute right-4 bottom-4 z-40 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-forest-border bg-forest-card/95 backdrop-blur-md shadow-2xl">
      <div className="px-4 py-3 border-b border-forest-border/70">
        <p className="text-xs uppercase tracking-wide text-forest-gray">Selected Node</p>
        <h3 className="text-sm font-semibold text-white truncate mt-1">{node.label}</h3>
      </div>

      <div className="px-4 py-3 space-y-2">
        {lastTurn ? (
          <>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-forest-gray mb-1">Latest Question</p>
              <p className="text-sm text-forest-light-gray">{summary.question}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-forest-gray mb-1">Latest Answer</p>
              <p className="text-sm text-forest-light-gray">{summary.answer}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-forest-gray">No chat yet for this node.</p>
        )}
      </div>

      <div className="px-4 py-3 border-t border-forest-border/70">
        <button
          type="button"
          onClick={onOpenChat}
          className="w-full px-3 py-2.5 rounded-lg bg-forest-emerald text-forest-darker hover:brightness-110 transition-all font-medium text-sm flex items-center justify-center gap-2"
        >
          <MessageSquare size={16} />
          <span>Open Chat</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

export default QuickNodeDrawer
