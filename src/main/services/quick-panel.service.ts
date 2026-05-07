import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { streamTextWithPrefix, isOllamaRunning } from './ollama.service'
import { replaceWithResult } from './replace.service'

// ─── Quick Panel Service ──────────────────────────────────────────────────────
// Manages a compact floating panel that appears when the user clicks the
// selection icon after selecting text in any application.
//
// It's separate from the main AssistantPanel — smaller (380×480), positioned
// near the selection, and focused on rapid Copy/Replace actions.

let quickPanelWindow: BrowserWindow | null = null

// ─── Create window ────────────────────────────────────────────────────────────

function createQuickPanel(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 480,
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
      nodeIntegration: false,
    }
  })

  win.setAlwaysOnTop(true, 'floating')

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?window=quickpanel')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'quickpanel' }
    })
  }

  win.on('close', e => {
    e.preventDefault()
    win.hide()
  })

  return win
}

// ─── Show quick panel ─────────────────────────────────────────────────────────

export function showQuickPanel(text: string, nearX: number, nearY: number): void {
  if (!quickPanelWindow || quickPanelWindow.isDestroyed()) {
    quickPanelWindow = createQuickPanel()
  }

  // Position near the icon, keeping within screen bounds
  const display  = screen.getDisplayNearestPoint({ x: nearX, y: nearY })
  const { bounds } = display
  const W = 380, H = 480

  let x = nearX + 10
  let y = nearY - H - 10

  // Clamp
  x = Math.max(bounds.x + 8, Math.min(x, bounds.x + bounds.width  - W - 8))
  y = Math.max(bounds.y + 8, Math.min(y, bounds.y + bounds.height - H - 8))

  quickPanelWindow.setPosition(x, y)

  const sendInit = () => quickPanelWindow?.webContents.send('qp-init', { text })

  if (quickPanelWindow.isVisible()) {
    sendInit()
    quickPanelWindow.focus()
  } else {
    quickPanelWindow.once('ready-to-show', () => {
      quickPanelWindow?.show()
      sendInit()
    })
    if (!quickPanelWindow.webContents.isLoading()) {
      quickPanelWindow.show()
      sendInit()
    }
  }
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

export function registerQuickPanelIPC(): void {

  // Close quick panel
  ipcMain.on('qp-close', () => quickPanelWindow?.hide())

  // Check Ollama (reuse existing check-ollama handler — already registered in panel.service)
  // We don't re-register it here to avoid duplicate handler errors.

  // Process text through Ollama — streams to quick panel window via qp-ai-chunk
  ipcMain.on('qp-process-text', (_e, payload: { text: string; modeId: string; model: string }) => {
    const win = quickPanelWindow
    if (!win) return
    console.log(`[Buddy/QP] Processing — mode: ${payload.modeId}`)

    // We need events to arrive on qp-ai-chunk / qp-ai-error, not ai-chunk / ai-error.
    // So we create a thin proxy that forwards to the right channels.
    streamTextWithPrefix(win, payload.text, payload.modeId, payload.model, 'qp-')
  })

  // Replace text in the originating app
  ipcMain.handle('qp-replace-text', async (_e, resultText: string) => {
    try {
      quickPanelWindow?.hide()
      await delay(250)
      await replaceWithResult(resultText)
      await delay(100)
      quickPanelWindow?.show()
      return { success: true }
    } catch (err) {
      quickPanelWindow?.show()
      return { success: false, error: String(err) }
    }
  })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
