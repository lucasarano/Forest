import { useState, useEffect, useCallback, useRef } from 'react'

/** Walk up the DOM to see if node is inside container (handles text nodes, etc.) */
function isNodeInsideContainer(node, container) {
  if (!node || !container) return false
  let n = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
  while (n) {
    if (n === container) return true
    n = n.parentElement
  }
  return false
}

/**
 * Hook to track text selection within a container.
 * Popup appears only on mouseup (when you finish selecting and release the mouse), not while dragging.
 * selectionchange is used only to clear when the user deselects (clicks elsewhere).
 */
export const useTextSelection = (containerRef) => {
  const [selection, setSelection] = useState(null)
  const lastTextRef = useRef(null)

  const readSelection = useCallback(() => {
    const container = containerRef.current
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      if (lastTextRef.current !== null) {
        lastTextRef.current = null
        setSelection(null)
      }
      return
    }
    const selectedText = sel.toString().trim()
    if (!selectedText) {
      if (lastTextRef.current !== null) {
        lastTextRef.current = null
        setSelection(null)
      }
      return
    }
    const range = sel.getRangeAt(0)
    if (!container) {
      if (lastTextRef.current !== null) {
        lastTextRef.current = null
        setSelection(null)
      }
      return
    }
    const anchorInside = isNodeInsideContainer(sel.anchorNode, container)
    const focusInside = isNodeInsideContainer(sel.focusNode, container)
    const commonInside = isNodeInsideContainer(range.commonAncestorContainer, container)
    if (!anchorInside && !focusInside && !commonInside) {
      if (lastTextRef.current !== null) {
        lastTextRef.current = null
        setSelection(null)
      }
      return
    }
    if (lastTextRef.current === selectedText) return
    lastTextRef.current = selectedText

    const rect = range.getBoundingClientRect()
    setSelection({
      text: selectedText,
      rect: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    })
  }, [containerRef])

  const handleMouseUp = useCallback(() => {
    readSelection()
  }, [readSelection])

  const handleSelectionChangeClearOnly = useCallback(() => {
    const container = containerRef.current
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      if (lastTextRef.current !== null) {
        lastTextRef.current = null
        setSelection(null)
      }
      return
    }
    const selectedText = sel.toString().trim()
    if (!selectedText) {
      if (lastTextRef.current !== null) {
        lastTextRef.current = null
        setSelection(null)
      }
      return
    }
    const range = sel.getRangeAt(0)
    if (!container) {
      if (lastTextRef.current !== null) {
        lastTextRef.current = null
        setSelection(null)
      }
      return
    }
    const anchorInside = isNodeInsideContainer(sel.anchorNode, container)
    const focusInside = isNodeInsideContainer(sel.focusNode, container)
    const commonInside = isNodeInsideContainer(range.commonAncestorContainer, container)
    if (!anchorInside && !focusInside && !commonInside) {
      if (lastTextRef.current !== null) {
        lastTextRef.current = null
        setSelection(null)
      }
    }
  }, [containerRef])

  const clearSelection = useCallback(() => {
    lastTextRef.current = null
    setSelection(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp, true)
    return () => document.removeEventListener('mouseup', handleMouseUp, true)
  }, [handleMouseUp])

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChangeClearOnly)
    return () => document.removeEventListener('selectionchange', handleSelectionChangeClearOnly)
  }, [handleSelectionChangeClearOnly])

  return { selection, clearSelection }
}
