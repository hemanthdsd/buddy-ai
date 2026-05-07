import React, { useRef, useCallback, useState, useEffect } from 'react'
import styles from './Bubble.module.css'

// ─── Type augmentation ────────────────────────────────────────────────────────
declare global {
  interface Window {
    electronAPI: {
      moveWindow: (deltaX: number, deltaY: number) => void
      hideWindow: () => void
      showContextMenu: () => void
      openPanel: () => void
      onSelectedText: (
        callback: (payload: { text: string; truncated: boolean }) => void
      ) => () => void
      versions: () => { node: string; chrome: string; electron: string }
    }
  }
}

const DRAG_THRESHOLD = 5

const Bubble: React.FC = () => {
  const bubbleRef = useRef<HTMLButtonElement>(null)
  const drag = useRef({ active: false, startX: 0, startY: 0, totalMoved: 0 })

  // ── Phase 5 state ─────────────────────────────────────────────────────────
  // capturedText: the text received from the clipboard service
  // hasBadge: shows the green dot while text is waiting to be processed
  const [capturedText, setCapturedText] = useState<string>('')
  const [hasBadge, setHasBadge] = useState(false)
  const [truncated, setTruncated] = useState(false)

  // ── Subscribe to selected-text events from main process ───────────────────
  useEffect(() => {
    const cleanup = window.electronAPI.onSelectedText(({ text, truncated: wasTruncated }) => {
      console.log(`[Bubble] Received text (${text.length} chars)`)
      setCapturedText(text)
      setTruncated(wasTruncated)
      setHasBadge(text.length > 0)   // show badge only if there's actual text
    })
    // Cleanup removes the IPC listener when the component unmounts
    return cleanup
  }, [])

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    if (!bubbleRef.current) return
    bubbleRef.current.setPointerCapture(e.pointerId)
    drag.current = { active: true, startX: e.screenX, startY: e.screenY, totalMoved: 0 }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return
    const deltaX = e.screenX - drag.current.startX
    const deltaY = e.screenY - drag.current.startY
    drag.current.startX = e.screenX
    drag.current.startY = e.screenY
    drag.current.totalMoved += Math.abs(deltaX) + Math.abs(deltaY)
    window.electronAPI.moveWindow(deltaX, deltaY)
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    if (!drag.current.active) return
    drag.current.active = false
    if (drag.current.totalMoved < DRAG_THRESHOLD) {
      handleLeftClick()
    }
  }, [])   // eslint-disable-line

  // ── Click handler ─────────────────────────────────────────────────────────
  // Left-click opens the assistant panel.
  // If text was already captured (green badge), it will pre-fill the panel.
  const handleLeftClick = useCallback(() => {
    window.electronAPI.openPanel()
    setHasBadge(false)  // clear badge once user opens the panel
  }, [])

  // ── Right-click ───────────────────────────────────────────────────────────
  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    window.electronAPI.showContextMenu()
  }, [])

  // ── Badge tooltip text ────────────────────────────────────────────────────
  const badgeTitle = truncated
    ? `Text captured (truncated to 4000 chars) — click to process`
    : capturedText
    ? `"${capturedText.slice(0, 80)}${capturedText.length > 80 ? '…' : ''}" — click to process`
    : 'Buddy — right-click for options · drag to move'

  return (
    <div className={styles.canvas}>
      <button
        ref={bubbleRef}
        className={styles.bubble}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleRightClick}
        aria-label="Open Buddy AI Assistant"
        title={badgeTitle}
      >
        {/* Sparkle icon */}
        <svg className={styles.icon} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="white" fillOpacity="0.95" />
          <path d="M19 16L19.8 18.2L22 19L19.8 19.8L19 22L18.2 19.8L16 19L18.2 18.2L19 16Z" fill="white" fillOpacity="0.7" />
        </svg>

        {/* Pulse ring */}
        <span className={styles.ring} aria-hidden="true" />

        {/* Phase 5: green badge — appears when text has been captured */}
        {hasBadge && (
          <span
            className={styles.badge}
            aria-label="Text captured — click to process"
            title={badgeTitle}
          />
        )}
      </button>
    </div>
  )
}

export default Bubble
