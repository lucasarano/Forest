import React, { useState } from 'react'
import { X } from 'lucide-react'

const SkipNodeModal = ({ nodeTitle, onConfirm, onCancel }) => {
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-xl border border-forest-border bg-forest-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Skip concept</h3>
          <button type="button" onClick={onCancel} className="text-forest-gray hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-forest-light-gray mb-4">
          You're about to skip <span className="font-medium text-white">{nodeTitle}</span>.
          This will mark it as complete and unlock dependent concepts.
        </p>

        <label className="block text-sm text-forest-light-gray mb-2">
          Why are you choosing to skip this concept?
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-forest-border bg-forest-darker px-4 py-3 text-sm text-white outline-none transition focus:border-forest-emerald"
          placeholder="Optional — helps us improve the experience"
        />

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm border border-forest-border text-forest-light-gray hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reason.trim())}
            className="px-4 py-2 rounded-xl text-sm bg-forest-emerald text-forest-darker font-medium hover:brightness-110 transition-all"
          >
            Skip concept
          </button>
        </div>
      </div>
    </div>
  )
}

export default SkipNodeModal
