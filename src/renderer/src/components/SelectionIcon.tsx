import React, { useEffect } from 'react'
import styles from './SelectionIcon.module.css'

// ─── SelectionIcon ────────────────────────────────────────────────────────────
// Tiny 44×44 window that floats near selected text.
// Click → open quick panel. ESC or 5s timeout → dismiss.

declare global {
  interface Window {
    electronAPI: {
      selectionIconClicked: () => void
      selectionIconDismiss: () => void
    }
  }
}

const SelectionIcon: React.FC = () => {

  // ESC key → dismiss
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.electronAPI.selectionIconDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={styles.canvas}>
      <button
        className={styles.icon}
        onClick={() => window.electronAPI.selectionIconClicked()}
        title="Enhance with Buddy AI"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
            fill="white"
            fillOpacity="0.95"
          />
        </svg>
      </button>
    </div>
  )
}

export default SelectionIcon
