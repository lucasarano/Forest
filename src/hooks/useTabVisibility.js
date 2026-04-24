import { useCallback, useEffect, useRef, useState } from 'react'

export const useTabVisibility = () => {
  const blurredAtRef = useRef(null)
  const eventsRef = useRef([])
  const [totalAwayMs, setTotalAwayMs] = useState(0)

  useEffect(() => {
    const handleVisibilityChange = () => {
      const now = Date.now()
      if (document.hidden) {
        blurredAtRef.current = now
        eventsRef.current.push({
          type: 'tab_blur',
          payload: { timestamp: now },
          createdAt: new Date(now).toISOString(),
        })
      } else if (blurredAtRef.current) {
        const awayDurationMs = now - blurredAtRef.current
        blurredAtRef.current = null
        setTotalAwayMs((prev) => prev + awayDurationMs)
        eventsRef.current.push({
          type: 'tab_focus',
          payload: { timestamp: now, awayDurationMs },
          createdAt: new Date(now).toISOString(),
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const flushEvents = useCallback(() => {
    const flushed = [...eventsRef.current]
    eventsRef.current = []
    return flushed
  }, [])

  const requeueEvents = useCallback((events) => {
    if (!Array.isArray(events) || events.length === 0) return
    eventsRef.current = [...events, ...eventsRef.current]
  }, [])

  return { totalAwayMs, flushEvents, requeueEvents, events: eventsRef }
}
