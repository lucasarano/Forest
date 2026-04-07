import React, { useMemo, useState } from 'react'

const MCQPrompt = ({ mcq, onSelect }) => {
  const [selected, setSelected] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  const options = useMemo(() => {
    const raw = [
      { text: mcq.correctAnswer, isCorrect: true },
      ...mcq.distractors.map((d) => ({
        text: d.text,
        isCorrect: false,
        misconceptionLabel: d.misconceptionLabel,
      })),
    ]
    for (let i = raw.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [raw[i], raw[j]] = [raw[j], raw[i]]
    }
    return raw.map((opt, i) => ({ ...opt, label: String.fromCharCode(65 + i) }))
  }, [mcq])

  const handleSubmit = () => {
    if (selected === null) return
    setSubmitted(true)
    const choice = options[selected]
    onSelect?.({
      selectedText: choice.text,
      isCorrect: choice.isCorrect,
      misconceptionLabel: choice.misconceptionLabel || '',
    })
  }

  return (
    <div className="rounded-xl border border-forest-border bg-forest-card/60 p-4 space-y-3">
      <p className="text-sm text-white font-medium">{mcq.question}</p>

      <div className="space-y-2">
        {options.map((opt, i) => (
          <button
            key={i}
            type="button"
            disabled={submitted}
            onClick={() => setSelected(i)}
            className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors ${
              selected === i
                ? submitted
                  ? opt.isCorrect
                    ? 'border-green-500/60 bg-green-500/15 text-green-200'
                    : 'border-red-500/60 bg-red-500/15 text-red-200'
                  : 'border-forest-emerald/60 bg-forest-emerald/15 text-white'
                : submitted && opt.isCorrect
                  ? 'border-green-500/40 bg-green-500/10 text-green-300'
                  : 'border-forest-border bg-forest-darker/50 text-forest-light-gray hover:border-forest-emerald/30'
            }`}
          >
            <span className="font-medium mr-2">{opt.label}.</span>
            {opt.text}
          </button>
        ))}
      </div>

      {!submitted && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={selected === null}
          className="px-4 py-2 bg-forest-emerald text-forest-darker rounded-xl text-sm font-medium hover:brightness-110 transition-all disabled:opacity-50"
        >
          Submit answer
        </button>
      )}

      {submitted && (
        <p className="text-xs text-forest-light-gray mt-2">{mcq.explanation}</p>
      )}
    </div>
  )
}

export default MCQPrompt
