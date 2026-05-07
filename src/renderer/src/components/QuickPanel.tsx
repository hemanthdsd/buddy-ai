import React, { useState, useEffect, useCallback, useRef } from 'react'
import styles from './QuickPanel.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ElectronAPI {
  qpClose: () => void
  qpProcessText: (text: string, modeId: string, model: string) => void
  qpReplaceText: (text: string) => Promise<{ success: boolean; error?: string }>
  onQpInit: (cb: (p: { text: string }) => void) => () => void
  onQpAiChunk: (cb: (p: { token: string; done: boolean }) => void) => () => void
  onQpAiError: (cb: (p: { message: string }) => void) => () => void
  getSettings: () => Promise<{ model: string }>
}

declare global {
  interface Window { electronAPI: ElectronAPI }
}

// ─── Quick action modes ───────────────────────────────────────────────────────
const QUICK_MODES = [
  { id: 'enhance',      emoji: '🚀', label: 'Enhance'      },
  { id: 'improve',      emoji: '✨', label: 'Improve'      },
  { id: 'grammar',      emoji: '📝', label: 'Fix Grammar'  },
  { id: 'professional', emoji: '💼', label: 'Professional' },
  { id: 'answer',       emoji: '💡', label: 'Answer / Solve' },
  { id: 'short',        emoji: '⚡', label: 'Shorter'      },
  { id: 'friendly',     emoji: '😊', label: 'Friendly'     },
  { id: 'email',        emoji: '📧', label: 'Email'        },
]

// ─── QuickPanel ───────────────────────────────────────────────────────────────
const QuickPanel: React.FC = () => {
  const [inputText, setInputText]       = useState('')
  const [outputText, setOutputText]     = useState('')
  const [activeMode, setActiveMode]     = useState<string | null>(null)
  const [isLoading, setIsLoading]       = useState(false)
  const [copied, setCopied]             = useState(false)
  const [replacing, setReplacing]       = useState(false)
  const [replaceMsg, setReplaceMsg]     = useState<string | null>(null)
  const [model, setModel]               = useState('qwen2.5:3b')
  const outputRef                       = useRef<HTMLDivElement>(null)

  // ── Load saved model preference ───────────────────────────────────────────
  useEffect(() => {
    window.electronAPI.getSettings().then(s => setModel(s.model))
  }, [])

  // ── Receive captured text when panel opens ────────────────────────────────
  useEffect(() => {
    return window.electronAPI.onQpInit(({ text }) => {
      setInputText(text)
      setOutputText('')
      setActiveMode(null)
      setReplaceMsg(null)
    })
  }, [])

  // ── Subscribe to AI token stream ──────────────────────────────────────────
  useEffect(() => {
    const cleanChunk = window.electronAPI.onQpAiChunk(({ token, done }) => {
      if (done) { setIsLoading(false); return }
      setOutputText(prev => prev + token)
      if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
    })
    const cleanError = window.electronAPI.onQpAiError(({ message }) => {
      setOutputText(message)
      setIsLoading(false)
    })
    return () => { cleanChunk(); cleanError() }
  }, [])

  // ── Run a mode ────────────────────────────────────────────────────────────
  const runMode = useCallback((modeId: string) => {
    if (!inputText.trim() || isLoading) return
    setActiveMode(modeId)
    setIsLoading(true)
    setOutputText('')
    setReplaceMsg(null)
    window.electronAPI.qpProcessText(inputText, modeId, model)
  }, [inputText, model, isLoading])

  // ── Copy ──────────────────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    if (!outputText) return
    navigator.clipboard.writeText(outputText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [outputText])

  // ── Replace ───────────────────────────────────────────────────────────────
  const handleReplace = useCallback(async () => {
    if (!outputText || replacing) return
    setReplacing(true)
    try {
      const res = await window.electronAPI.qpReplaceText(outputText)
      setReplaceMsg(res.success ? '✓ Replaced!' : `⚠ ${res.error ?? 'Failed'}`)
    } catch (e) {
      setReplaceMsg(`⚠ ${String(e)}`)
    } finally {
      setReplacing(false)
      setTimeout(() => setReplaceMsg(null), 3000)
    }
  }, [outputText, replacing])

  // ── Retry ─────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    if (activeMode) runMode(activeMode)
  }, [activeMode, runMode])

  return (
    <div className={styles.panel}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
                fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <span className={styles.title}>Buddy Quick Actions</span>
        </div>
        <button className={styles.closeBtn}
          onClick={() => window.electronAPI.qpClose()}
          aria-label="Close">✕</button>
      </header>

      <div className={styles.body}>

        {/* ── Selected text preview ──────────────────────────────── */}
        <div className={styles.preview}>
          <span className={styles.previewLabel}>Selected text</span>
          <p className={styles.previewText}>
            {inputText.length > 180 ? inputText.slice(0, 180) + '…' : inputText}
          </p>
        </div>

        {/* ── Quick mode buttons ─────────────────────────────────── */}
        <div className={styles.modesGrid}>
          {QUICK_MODES.map(m => (
            <button
              key={m.id}
              className={`${styles.modeBtn} ${activeMode === m.id ? styles.modeBtnActive : ''}`}
              onClick={() => runMode(m.id)}
              disabled={isLoading}
            >
              <span className={styles.modeEmoji}>{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {/* ── Output area ────────────────────────────────────────── */}
        {(isLoading || outputText) && (
          <div className={styles.outputSection}>
            <div ref={outputRef} className={styles.output}>
              {isLoading && !outputText ? (
                <div className={styles.loadingRow}>
                  <span className={styles.spinner} />
                  <span>Thinking…</span>
                </div>
              ) : (
                <pre className={styles.outputText}>{outputText}</pre>
              )}
            </div>

            {/* Action buttons */}
            {outputText && !isLoading && (
              <div className={styles.actions}>
                <button className={styles.actionBtn} onClick={handleCopy}>
                  {copied ? '✓ Copied!' : '📋 Copy'}
                </button>
                <button
                  className={`${styles.actionBtn} ${styles.actionBtnReplace}`}
                  onClick={handleReplace}
                  disabled={replacing}
                  title="Paste this result back into the original app"
                >
                  {replacing ? '⏳…' : '⇄ Replace'}
                </button>
                <button className={`${styles.actionBtn} ${styles.actionBtnRetry}`}
                  onClick={handleRetry}>
                  🔄 Retry
                </button>
              </div>
            )}

            {replaceMsg && (
              <p className={`${styles.replaceMsg} ${replaceMsg.startsWith('✓') ? styles.ok : styles.err}`}>
                {replaceMsg}
              </p>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default QuickPanel
