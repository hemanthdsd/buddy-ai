import React, { useState, useEffect, useCallback, useRef } from 'react'
import styles from './AssistantPanel.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────
interface AppSettings {
  model: string
  visionModel: string
  startWithWindows: boolean
}

interface ElectronAPI {
  closePanel: () => void
  captureScreen: () => Promise<string | null>
  onPanelInit: (cb: (p: { text: string }) => void) => () => void
  checkOllama: () => Promise<boolean>
  processText: (text: string, modeId: string, model: string) => void
  analyzeScreen: (imageDataUrl: string, question: string, model: string) => void
  onAiChunk: (cb: (p: { token: string; done: boolean }) => void) => () => void
  onAiError: (cb: (p: { message: string }) => void) => () => void
  replaceText: (resultText: string) => Promise<{ success: boolean; error?: string }>
  getSettings: () => Promise<AppSettings>
  saveSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
}

declare global {
  interface Window { electronAPI: ElectronAPI }
}

// ─── Modes ────────────────────────────────────────────────────────────────────
const MODES = [
  { id: 'improve',      label: '✨ Improve Prompt'    },
  { id: 'grammar',      label: '📝 Fix Grammar'       },
  { id: 'professional', label: '💼 Make Professional' },
  { id: 'short',        label: '⚡ Make Short'        },
  { id: 'friendly',     label: '😊 Friendly Tone'     },
  { id: 'email',        label: '📧 Write Email'       },
  { id: 'continue',     label: '▶ Continue'           },
]

// ─── AssistantPanel ───────────────────────────────────────────────────────────
const AssistantPanel: React.FC = () => {
  // ── Core state ───────────────────────────────────────────────────────────
  const [inputText, setInputText]       = useState('')
  const [outputText, setOutputText]     = useState('')
  const [selectedMode, setSelectedMode] = useState<string | null>(null)
  const [isLoading, setIsLoading]       = useState(false)
  const [screenshot, setScreenshot]     = useState<string | null>(null)
  const [question, setQuestion]         = useState('')
  const [status, setStatus]             = useState<'idle' | 'capturing' | 'error'>('idle')

  // ── Feedback state ───────────────────────────────────────────────────────
  const [copied, setCopied]             = useState(false)
  const [replacing, setReplacing]       = useState(false)
  const [replaceMsg, setReplaceMsg]     = useState<string | null>(null)

  // ── Ollama + settings ────────────────────────────────────────────────────
  const [ollamaOk, setOllamaOk]         = useState<boolean | null>(null)
  const [model, setModel]               = useState('qwen2.5:3b')
  const [visionModel, setVisionModel]   = useState('llava')
  const [startWithWindows, setStartWithWindows] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  const outputRef  = useRef<HTMLDivElement>(null)
  // Track current mode for Retry
  const currentModeRef = useRef<string | null>(null)

  // ── Load persisted settings on mount ─────────────────────────────────────
  useEffect(() => {
    window.electronAPI.getSettings().then(s => {
      setModel(s.model)
      setVisionModel(s.visionModel)
      setStartWithWindows(s.startWithWindows)
    })
  }, [])

  // ── Check Ollama on mount + every 30 s ───────────────────────────────────
  useEffect(() => {
    window.electronAPI.checkOllama().then(setOllamaOk)
    const interval = setInterval(
      () => window.electronAPI.checkOllama().then(setOllamaOk),
      30_000
    )
    return () => clearInterval(interval)
  }, [])

  // ── Listen for panel-init (text captured by shortcut) ────────────────────
  useEffect(() => {
    return window.electronAPI.onPanelInit(({ text }) => {
      setInputText(text)
      setOutputText('')
      setSelectedMode(null)
      setScreenshot(null)
      setQuestion('')
      setStatus('idle')
      setReplaceMsg(null)
    })
  }, [])

  // ── Subscribe to AI streaming (ai-chunk / ai-error) ──────────────────────
  useEffect(() => {
    const cleanChunk = window.electronAPI.onAiChunk(({ token, done }) => {
      if (done) {
        setIsLoading(false)
        return
      }
      setOutputText(prev => prev + token)
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight
      }
    })

    const cleanError = window.electronAPI.onAiError(({ message }) => {
      setOutputText(message)
      setIsLoading(false)
    })

    return () => { cleanChunk(); cleanError() }
  }, [])

  // ── Run AI ────────────────────────────────────────────────────────────────
  const runMode = useCallback((modeId: string) => {
    if (!inputText.trim() && !screenshot) {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2500)
      return
    }
    setSelectedMode(modeId)
    currentModeRef.current = modeId
    setIsLoading(true)
    setOutputText('')
    setReplaceMsg(null)

    if (screenshot) {
      window.electronAPI.analyzeScreen(screenshot, question, visionModel)
    } else {
      window.electronAPI.processText(inputText, modeId, model)
    }
  }, [inputText, screenshot, question, model, visionModel])

  // ── Retry — re-run the same mode ─────────────────────────────────────────
  const handleRetry = useCallback(() => {
    if (currentModeRef.current) runMode(currentModeRef.current)
  }, [runMode])

  // ── Quick refine — Shorter ────────────────────────────────────────────────
  const handleShorter = useCallback(() => {
    if (!outputText) return
    // Feed the current output back as new input with "short" mode
    setInputText(outputText)
    setOutputText('')
    setSelectedMode('short')
    currentModeRef.current = 'short'
    setIsLoading(true)
    window.electronAPI.processText(outputText, 'short', model)
  }, [outputText, model])

  // ── Quick refine — More Human ─────────────────────────────────────────────
  const handleMoreHuman = useCallback(() => {
    if (!outputText) return
    setInputText(outputText)
    setOutputText('')
    setSelectedMode('friendly')
    currentModeRef.current = 'friendly'
    setIsLoading(true)
    window.electronAPI.processText(outputText, 'friendly', model)
  }, [outputText, model])

  // ── Copy output ───────────────────────────────────────────────────────────
  const handleCopy = useCallback(() => {
    if (!outputText) return
    navigator.clipboard.writeText(outputText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [outputText])

  // ── Replace — paste result back into the source app ──────────────────────
  const handleReplace = useCallback(async () => {
    if (!outputText || replacing) return
    setReplacing(true)
    setReplaceMsg(null)
    try {
      const result = await window.electronAPI.replaceText(outputText)
      setReplaceMsg(result.success ? '✓ Replaced!' : `⚠ Failed: ${result.error ?? 'unknown'}`)
    } catch (err) {
      setReplaceMsg(`⚠ Error: ${String(err)}`)
    } finally {
      setReplacing(false)
      setTimeout(() => setReplaceMsg(null), 3000)
    }
  }, [outputText, replacing])

  // ── Screen capture ────────────────────────────────────────────────────────
  const handleCaptureScreen = useCallback(async () => {
    setStatus('capturing')
    try {
      const dataUrl = await window.electronAPI.captureScreen()
      if (dataUrl) {
        setScreenshot(dataUrl)
        setInputText('')
        setOutputText('')
        setQuestion('')
        setStatus('idle')
      } else {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 2500)
      }
    } catch {
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2500)
    }
  }, [])

  // ── Clear screenshot ──────────────────────────────────────────────────────
  const handleClearScreenshot = useCallback(() => {
    setScreenshot(null)
    setOutputText('')
    setQuestion('')
  }, [])

  // ── Save settings ─────────────────────────────────────────────────────────
  const handleSaveSettings = useCallback(async () => {
    await window.electronAPI.saveSettings({ model, visionModel, startWithWindows })
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }, [model, visionModel, startWithWindows])

  // ── Close panel ───────────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    window.electronAPI.closePanel()
  }, [])

  // ── Ollama status label ───────────────────────────────────────────────────
  const ollamaLabel =
    ollamaOk === null ? '⏳ Checking…'   :
    ollamaOk           ? '🟢 Ollama ready' :
                         '🔴 Ollama offline'

  return (
    <div className={styles.panel}>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="white" fillOpacity="0.9"/>
            </svg>
          </div>
          <span className={styles.title}>Buddy AI</span>
        </div>
        <div className={styles.headerRight}>
          <span className={`${styles.ollamaStatus} ${ollamaOk === true ? styles.ollamaOk : ollamaOk === false ? styles.ollamaOff : ''}`}>
            {ollamaLabel}
          </span>
          <button
            className={`${styles.iconBtn} ${showSettings ? styles.iconBtnActive : ''}`}
            onClick={() => setShowSettings(v => !v)}
            title="Settings"
            aria-label="Settings"
          >
            ⚙
          </button>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close panel">✕</button>
        </div>
      </header>

      <div className={styles.body}>

        {/* ── Settings panel (toggled) ──────────────────────────────────── */}
        {showSettings && (
          <section className={`${styles.section} ${styles.settingsSection}`}>
            <label className={styles.label}>⚙ Settings</label>

            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>Text model</span>
              <input
                className={styles.modelInput}
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="e.g. qwen2.5:3b"
                spellCheck={false}
              />
            </div>

            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>Vision model</span>
              <input
                className={styles.modelInput}
                value={visionModel}
                onChange={e => setVisionModel(e.target.value)}
                placeholder="e.g. llava"
                spellCheck={false}
              />
            </div>

            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>Start with Windows</span>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={startWithWindows}
                  onChange={e => setStartWithWindows(e.target.checked)}
                />
                <span className={styles.toggleSlider} />
              </label>
            </div>

            <button
              className={`${styles.saveBtn} ${settingsSaved ? styles.saveBtnSaved : ''}`}
              onClick={handleSaveSettings}
            >
              {settingsSaved ? '✓ Saved!' : 'Save Settings'}
            </button>
          </section>
        )}

        {/* ── Input section ──────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <label className={styles.label}>
              {screenshot ? '📸 Screen captured' : '📋 Selected text'}
            </label>
            {screenshot && (
              <button className={styles.clearBtn} onClick={handleClearScreenshot}>
                ✕ Clear
              </button>
            )}
          </div>

          {screenshot ? (
            <>
              <div className={styles.screenshotWrap}>
                <img src={screenshot} alt="Screen capture" className={styles.screenshot} />
              </div>
              <textarea
                className={styles.textarea}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                placeholder="Ask a question about this screenshot… (optional)"
                rows={2}
                spellCheck={false}
              />
            </>
          ) : (
            <textarea
              className={styles.textarea}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder="Select text anywhere and press Ctrl+Shift+E, or type here…"
              rows={4}
              spellCheck={false}
            />
          )}

          <button
            className={`${styles.captureBtn} ${status === 'capturing' ? styles.loading : ''}`}
            onClick={handleCaptureScreen}
            disabled={status === 'capturing' || isLoading}
          >
            {status === 'capturing' ? '⏳ Capturing…' : '📸 Capture Screen'}
          </button>

          {status === 'error' && (
            <p className={styles.errorMsg}>
              {!inputText.trim() && !screenshot
                ? '⚠ Please add text or capture the screen first'
                : '⚠ Screen capture failed — try again'}
            </p>
          )}
        </section>

        {/* ── Mode buttons ────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <label className={styles.label}>
            {screenshot ? '🔍 Analyze screenshot' : 'Choose a mode'}
          </label>
          <div className={styles.modesGrid}>
            {MODES.map(mode => (
              <button
                key={mode.id}
                className={`${styles.modeBtn} ${selectedMode === mode.id ? styles.modeBtnActive : ''}`}
                onClick={() => runMode(mode.id)}
                disabled={isLoading}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </section>

        {/* ── Output section ──────────────────────────────────────────────── */}
        {(isLoading || outputText) && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <label className={styles.label}>✨ Result</label>
              {outputText && !isLoading && (
                <div className={styles.outputActions}>
                  <button className={styles.actionBtn} onClick={handleCopy}>
                    {copied ? '✓ Copied!' : '📋 Copy'}
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnReplace}`}
                    onClick={handleReplace}
                    disabled={replacing}
                    title="Paste result back into the original app"
                  >
                    {replacing ? '⏳…' : '⇄ Replace'}
                  </button>
                </div>
              )}
            </div>

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

            {/* Quick-refine actions (shown only when we have output and not loading) */}
            {outputText && !isLoading && (
              <div className={styles.refineRow}>
                <button className={styles.refineBtn} onClick={handleRetry}>
                  🔄 Retry
                </button>
                <button className={styles.refineBtn} onClick={handleShorter}>
                  ⚡ Shorter
                </button>
                <button className={styles.refineBtn} onClick={handleMoreHuman}>
                  😊 More Human
                </button>
              </div>
            )}

            {/* Replace result message */}
            {replaceMsg && (
              <p className={`${styles.replaceMsg} ${replaceMsg.startsWith('✓') ? styles.replaceMsgOk : styles.replaceMsgErr}`}>
                {replaceMsg}
              </p>
            )}
          </section>
        )}

      </div>{/* end body */}
    </div>
  )
}

export default AssistantPanel
