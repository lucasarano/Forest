import React from 'react'
import { ChevronRight, CornerUpLeft } from 'lucide-react'

const ConceptStackBar = ({ stack = [], nodes = {}, onReturn, canReturn }) => {
  if (!stack.length) return null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {stack.map((id, idx) => {
        const node = nodes[id]
        if (!node) return null
        const isActive = idx === stack.length - 1
        return (
          <React.Fragment key={id}>
            {idx > 0 ? <ChevronRight size={14} className="text-forest-gray" /> : null}
            <div className={`px-3 py-1.5 rounded-full text-xs border ${isActive ? 'bg-forest-emerald/15 border-forest-emerald/50 text-forest-emerald font-medium' : 'border-forest-border text-forest-light-gray'}`}>
              {node.title}
            </div>
          </React.Fragment>
        )
      })}
      {canReturn ? (
        <button
          type="button"
          onClick={onReturn}
          className="ml-2 px-3 py-1.5 rounded-full text-xs border border-forest-border text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors flex items-center gap-1"
        >
          <CornerUpLeft size={12} /> Return to parent
        </button>
      ) : null}
    </div>
  )
}

export default ConceptStackBar
