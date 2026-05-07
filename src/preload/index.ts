import { contextBridge, ipcRenderer } from 'electron'

// ─── Preload ──────────────────────────────────────────────────────────────────
// Safe IPC bridge between Electron main process and React renderer.
// Every capability the renderer needs must be explicitly listed here.
//
// Phase 1: versions
// Phase 2: moveWindow
// Phase 3: hideWindow, showContextMenu
// Phase 5: onSelectedText
// Phase 5+: openPanel, closePanel, captureScreen, onPanelInit, onScreenCaptured

contextBridge.exposeInMainWorld('electronAPI', {

  // ── Versions ──────────────────────────────────────────────────────────────
  versions: () => ({
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }),

  // ── Bubble: window dragging ───────────────────────────────────────────────
  moveWindow: (deltaX: number, deltaY: number) => {
    ipcRenderer.send('move-window', deltaX, deltaY)
  },

  // ── Bubble: hide to tray ──────────────────────────────────────────────────
  hideWindow: () => ipcRenderer.send('hide-window'),

  // ── Bubble: right-click context menu ─────────────────────────────────────
  showContextMenu: () => ipcRenderer.send('show-context-menu'),

  // ── Bubble: open the assistant panel ─────────────────────────────────────
  openPanel: () => ipcRenderer.send('open-panel'),

  // ── Panel: close itself ───────────────────────────────────────────────────
  closePanel: () => ipcRenderer.send('close-panel'),

  // ── Panel: screen capture ─────────────────────────────────────────────────
  // Returns a base64 PNG data URL of the primary screen, or null on failure.
  captureScreen: (): Promise<string | null> =>
    ipcRenderer.invoke('capture-screen'),

  // ── Snip Window IPC ───────────────────────────────────────────────────────
  onSnipInit: (
    callback: (payload: { image: string }) => void
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { image: string }) => callback(payload)
    ipcRenderer.on('snip-init', handler)
    return () => ipcRenderer.removeListener('snip-init', handler)
  },

  sendSnipResult: (payload: { x: number; y: number; width: number; height: number; unit: '%' } | null) => {
    ipcRenderer.send('snip-result', payload)
  },

  // ── Receive selected text (main → renderer) ───────────────────────────────
  // Used by Bubble to show the green badge.
  onSelectedText: (
    callback: (payload: { text: string; truncated: boolean }) => void
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { text: string; truncated: boolean }) =>
      callback(payload)
    ipcRenderer.on('selected-text-captured', handler)
    return () => ipcRenderer.removeListener('selected-text-captured', handler)
  },

  // ── Receive panel init data (main → panel renderer) ───────────────────────
  // Panel listens for this to receive the captured text when it opens.
  onPanelInit: (
    callback: (payload: { text: string }) => void
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { text: string }) =>
      callback(payload)
    ipcRenderer.on('panel-init', handler)
    return () => ipcRenderer.removeListener('panel-init', handler)
  },

  // ── Phase 6: Ollama AI ────────────────────────────────────────────────────

  // Check if Ollama server is reachable
  checkOllama: (): Promise<boolean> => ipcRenderer.invoke('check-ollama'),

  // Get list of installed Ollama models
  getInstalledModels: (): Promise<string[]> => ipcRenderer.invoke('get-installed-models'),

  // Start a streaming text-processing job (fire-and-forget; results come via onAiChunk)
  processText: (text: string, modeId: string, model: string): void => {
    ipcRenderer.send('process-text', { text, modeId, model })
  },

  // Start a streaming screen-analysis job (fire-and-forget; results come via onAiChunk)
  analyzeScreen: (imageDataUrl: string, question: string, model: string): void => {
    ipcRenderer.send('analyze-screen', { imageDataUrl, question, model })
  },

  // Stream listener — fires for every token + once with done:true at the end
  onAiChunk: (
    callback: (payload: { token: string; done: boolean }) => void
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { token: string; done: boolean }) =>
      callback(payload)
    ipcRenderer.on('ai-chunk', handler)
    return () => ipcRenderer.removeListener('ai-chunk', handler)
  },

  // Error listener — fires if Ollama is unreachable or returns an error
  onAiError: (
    callback: (payload: { message: string }) => void
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { message: string }) =>
      callback(payload)
    ipcRenderer.on('ai-error', handler)
    return () => ipcRenderer.removeListener('ai-error', handler)
  },

  // ── Phase 7: Replace + Settings ──────────────────────────────────────────

  // Paste AI result back into the originating app via Ctrl+V
  replaceText: (resultText: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('replace-text', resultText),

  // Load all persisted settings from electron-store
  getSettings: (): Promise<{ model: string; visionModel: string; startWithWindows: boolean }> =>
    ipcRenderer.invoke('get-settings'),

  // Save (partial) settings — only the provided keys are updated
  saveSettings: (
    partial: Partial<{ model: string; visionModel: string; startWithWindows: boolean }>
  ): Promise<{ model: string; visionModel: string; startWithWindows: boolean }> =>
    ipcRenderer.invoke('save-settings', partial),

  // ── Selection icon (shown near selected text) ─────────────────────────────

  // User clicked the floating selection icon — open the quick panel
  selectionIconClicked: () => ipcRenderer.send('selection-icon-clicked'),

  // User dismissed the icon without clicking (e.g. ESC)
  selectionIconDismiss: () => ipcRenderer.send('selection-icon-dismiss'),

  // ── Quick Panel IPC channels (prefixed qp- to avoid conflicts) ────────────

  // Run AI on the captured text — streams tokens via onQpAiChunk
  qpProcessText: (text: string, modeId: string, model: string): void =>
    ipcRenderer.send('qp-process-text', { text, modeId, model }),

  // Paste AI result back into originating app
  qpReplaceText: (resultText: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('qp-replace-text', resultText),

  // Close the quick panel
  qpClose: () => ipcRenderer.send('qp-close'),

  // Receive captured text when quick panel opens (main → renderer)
  onQpInit: (
    callback: (payload: { text: string }) => void
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { text: string }) =>
      callback(payload)
    ipcRenderer.on('qp-init', handler)
    return () => ipcRenderer.removeListener('qp-init', handler)
  },

  // Receive streamed AI tokens (main → quick panel renderer)
  onQpAiChunk: (
    callback: (payload: { token: string; done: boolean }) => void
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { token: string; done: boolean }) =>
      callback(payload)
    ipcRenderer.on('qp-ai-chunk', handler)
    return () => ipcRenderer.removeListener('qp-ai-chunk', handler)
  },

  // Receive AI error from quick panel (main → quick panel renderer)
  onQpAiError: (
    callback: (payload: { message: string }) => void
  ): (() => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { message: string }) =>
      callback(payload)
    ipcRenderer.on('qp-ai-error', handler)
    return () => ipcRenderer.removeListener('qp-ai-error', handler)
  }

})
