import React, { useCallback, useRef, useState } from 'react'
import { Loader, Mic, Square } from 'lucide-react'
import { transcribeAudio } from '../../lib/mvpV2Service'

const MicButton = ({ onTranscript, disabled = false, highlight = false }) => {
  const [state, setState] = useState('idle')
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (blob.size < 100) { setState('idle'); return }
        setState('transcribing')
        try {
          const text = await transcribeAudio(blob)
          onTranscript?.(text)
        } catch (err) {
          console.error('Transcription error:', err)
        }
        setState('idle')
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setState('recording')
    } catch (err) {
      console.error('Mic access denied:', err)
      setState('idle')
    }
  }, [onTranscript])

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const handleClick = () => {
    if (disabled) return
    if (state === 'recording') stop()
    else if (state === 'idle') start()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || state === 'transcribing'}
      className={`relative px-3 py-2 rounded-xl text-xs border transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
        state === 'recording'
          ? 'border-red-500/60 bg-red-500/15 text-red-300'
          : highlight
            ? 'border-forest-emerald/60 bg-forest-emerald/10 text-forest-emerald animate-pulse'
            : 'border-forest-border bg-forest-card text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50'
      }`}
      title={state === 'recording' ? 'Stop recording' : 'Record audio'}
    >
      {state === 'transcribing' && <Loader size={13} className="animate-spin" />}
      {state === 'recording' && <Square size={13} className="fill-current" />}
      {state === 'idle' && <Mic size={13} />}
      {state === 'recording' && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
      )}
    </button>
  )
}

export default MicButton
