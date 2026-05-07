import { BrowserWindow, screen, ipcMain, desktopCapturer } from 'electron'
import { join } from 'path'
import {
  streamTextProcess,
  streamScreenAnalysis,
  isOllamaRunning,
  getInstalledModels
} from './ollama.service'
import { replaceWithResult } from './replace.service'
import { getSettings, saveSettings } from './settings.service'
import { openSnipWindow } from './snip.service'

// ─── Panel Service ────────────────────────────────────────────────────────────
// Manages the floating AssistantPanel window.
// The panel is created lazily (only when first needed) and reused thereafter.
// Closing the panel hides it (not destroys it) so it reopens instantly.

let panelWindow: BrowserWindow | null = null

// ─── Create ───────────────────────────────────────────────────────────────────
function createPanelWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  panelWindow = new BrowserWindow({
    width: 520,
    height: 760,
    // Center of screen
    x: Math.round(width / 2 - 260),
    y: Math.round(height / 2 - 380),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Load the renderer with ?window=panel
  if (process.env['ELECTRON_RENDERER_URL']) {
    panelWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?window=panel')
  } else {
    panelWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'panel' }
    })
  }

  // Hide instead of destroy when closed
  panelWindow.on('close', (e) => {
    e.preventDefault()
    panelWindow?.hide()
  })

  panelWindow.on('closed', () => {
    panelWindow = null
  })

  return panelWindow
}

// ─── Show panel (and optionally pre-fill text) ────────────────────────────────
export function showPanel(text: string = ''): void {
  const win = panelWindow ?? createPanelWindow()

  const sendInit = () => {
    win.webContents.send('panel-init', { text })
  }

  if (win.isVisible()) {
    // Already open — just update the text
    sendInit()
    win.focus()
  } else {
    // First open or re-showing
    win.once('ready-to-show', () => {
      win.show()
      sendInit()
    })
    if (win.webContents.isLoading()) {
      // Still loading — ready-to-show will fire
    } else {
      win.show()
      sendInit()
    }
  }
}

// ─── Hide panel ───────────────────────────────────────────────────────────────
export function hidePanel(): void {
  panelWindow?.hide()
}

// ─── Getter ───────────────────────────────────────────────────────────────────
export function getPanelWindow(): BrowserWindow | null {
  return panelWindow
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
// Register once — called from main/index.ts on app ready

export function registerPanelIPC(): void {
  // ── Close / hide panel from renderer ──────────────────────────────────────
  ipcMain.on('close-panel', () => hidePanel())

  // ── Screen capture ─────────────────────────────────────────────────────────
  // Hide the panel, grab a screenshot, restore the panel, return the data URL.
  ipcMain.handle('capture-screen', async () => {
    panelWindow?.hide()
    await delay(150)

    try {
      const primaryDisplay = screen.getPrimaryDisplay()
      const width = primaryDisplay.size.width * primaryDisplay.scaleFactor
      const height = primaryDisplay.size.height * primaryDisplay.scaleFactor

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height }
      })
      const dataUrl = sources[0]?.thumbnail.toDataURL() ?? null
      
      if (!dataUrl) {
        console.log('[Buddy] Screen captured: no source')
        return null
      }

      console.log('[Buddy] Screen captured. Opening snip window...')
      const croppedUrl = await openSnipWindow(dataUrl)
      return croppedUrl
    } catch (err) {
      console.error('[Buddy] Screen capture failed:', err)
      return null
    } finally {
      panelWindow?.show()
    }
  })

  // ── Ollama: check status ────────────────────────────────────────────────────
  ipcMain.handle('check-ollama', async () => {
    const running = await isOllamaRunning()
    console.log('[Buddy] Ollama running:', running)
    return running
  })

  // ── Ollama: get installed models ────────────────────────────────────────────
  ipcMain.handle('get-installed-models', async () => {
    return await getInstalledModels()
  })

  // ── Ollama: process text ────────────────────────────────────────────────────
  // Payload: { text, modeId, model }
  // Streams tokens back as 'ai-chunk' events: { token, done }
  // Errors sent as 'ai-error' events: { message }
  ipcMain.on('process-text', (_event, payload: { text: string; modeId: string; model: string }) => {
    const win = panelWindow
    if (!win) return
    console.log(`[Buddy] Processing text — mode: ${payload.modeId}, model: ${payload.model}`)
    streamTextProcess(win, payload.text, payload.modeId, payload.model).catch(err => {
      console.error('[Buddy] streamTextProcess threw:', err)
      win.webContents.send('ai-error', { message: String(err) })
    })
  })

  // ── Ollama: analyze screen ─────────────────────────────────────────────────────
  ipcMain.on('analyze-screen', (_event, payload: { imageDataUrl: string; question: string; model: string }) => {
    const win = panelWindow
    if (!win) return
    console.log(`[Buddy] Analyzing screen — model: ${payload.model}, image length: ${payload.imageDataUrl?.length}`)
    streamScreenAnalysis(win, payload.imageDataUrl, payload.question, payload.model).catch(err => {
      console.error('[Buddy] streamScreenAnalysis threw:', err)
      win.webContents.send('ai-error', { message: String(err) })
    })
  })

  // ── Replace text: paste AI result back into the originating app ────────────
  // Flow: hide panel (so it loses focus) → Ctrl+V in original app → show panel
  ipcMain.handle('replace-text', async (_event, resultText: string) => {
    try {
      // Hide the panel so the original app regains focus before Ctrl+V fires
      panelWindow?.hide()
      await delay(250)   // enough time for focus to move back
      await replaceWithResult(resultText)
      // Show panel again after paste — user may want to do another action
      await delay(100)
      panelWindow?.show()
      return { success: true }
    } catch (err) {
      console.error('[Buddy] replace-text failed:', err)
      panelWindow?.show()
      return { success: false, error: String(err) }
    }
  })

  // ── Settings: load ─────────────────────────────────────────────────────────
  ipcMain.handle('get-settings', () => {
    return getSettings()
  })

  // ── Settings: save ─────────────────────────────────────────────────────────
  ipcMain.handle('save-settings', (_event, partial: Record<string, unknown>) => {
    return saveSettings(partial)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
