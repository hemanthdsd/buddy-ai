import { app, BrowserWindow, screen, ipcMain, Menu, session } from 'electron'
import { join } from 'path'
import { createTray } from './services/tray.service'
import { registerShortcuts, unregisterShortcuts } from './services/shortcut.service'
import { showPanel, registerPanelIPC } from './services/panel.service'
import { initSettings } from './services/settings.service'
import { startMouseMonitor, stopMouseMonitor, registerSelectionIPC } from './services/selection.service'
import { registerQuickPanelIPC } from './services/quick-panel.service'

// ─── Single-instance lock ─────────────────────────────────────────────────────
// Guarantees only ONE Buddy process runs at a time.
// If the user launches a second instance (or npm run dev is called again while
// one is still running), the second process quits immediately and we bring the
// existing bubble back into view instead.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // This is the second instance — bail out immediately
  app.quit()
}

app.on('second-instance', () => {
  // Someone tried to run a second instance — show the bubble instead
  if (bubbleWindow) {
    bubbleWindow.show()
    bubbleWindow.setAlwaysOnTop(true, 'floating')
  }
})

// ─── Window references ────────────────────────────────────────────────────────
let bubbleWindow: BrowserWindow | null = null

// ─── Bubble Window ────────────────────────────────────────────────────────────
function createBubbleWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  bubbleWindow = new BrowserWindow({
    width: 80,
    height: 80,
    x: width - 100,
    y: height - 160,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,      // Don't show in taskbar — lives in tray instead
    resizable: false,
    movable: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  bubbleWindow.setAlwaysOnTop(true, 'floating')

  // ── Phase 3 key change: hide to tray instead of closing ──────────────────
  // When the user clicks the X on the window (if it ever appears), we hide
  // the bubble rather than quitting. The real quit is in the tray menu.
  bubbleWindow.on('close', (event) => {
    // preventDefault stops Electron from actually destroying the window
    event.preventDefault()
    bubbleWindow?.hide()
  })

  bubbleWindow.on('closed', () => {
    // This fires only when the window is truly destroyed (e.g. app.exit())
    bubbleWindow = null
  })

  // Load renderer with ?window=bubble so App.tsx renders the Bubble component
  if (process.env['ELECTRON_RENDERER_URL']) {
    bubbleWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?window=bubble')
  } else {
    bubbleWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'bubble' }
    })
  }
}

// ─── IPC: Window dragging ─────────────────────────────────────────────────────
ipcMain.on('move-window', (_event, deltaX: number, deltaY: number) => {
  if (!bubbleWindow) return
  const [x, y] = bubbleWindow.getPosition()
  bubbleWindow.setPosition(x + Math.round(deltaX), y + Math.round(deltaY))
})

// ─── IPC: Hide to tray ────────────────────────────────────────────────────────
ipcMain.on('hide-window', () => {
  bubbleWindow?.hide()
})

// ─── IPC: Bubble right-click context menu ────────────────────────────────────
// Builds a native OS popup menu and shows it near the bubble window.
// This gives the user quick access to Hide / Quit without hunting for the tray.
ipcMain.on('show-context-menu', (event) => {
  const menu = Menu.buildFromTemplate([
    {
      label: '✨  Buddy AI',
      enabled: false       // cosmetic title row
    },
    { type: 'separator' },
    {
      label: '🫧  Hide Bubble',
      click: () => bubbleWindow?.hide()
    },
    { type: 'separator' },
    {
      label: '✕  Quit Buddy',
      click: () => app.exit(0)
    }
  ])

  // popup() shows the menu at the current cursor position
  menu.popup({
    window: BrowserWindow.fromWebContents(event.sender) ?? undefined
  })
})

// ─── IPC: Bubble left-click → open panel ─────────────────────────────────────
ipcMain.on('open-panel', () => {
  showPanel('')
})

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  // Apply persisted settings (startup preference, etc.) first
  initSettings()

  // ── Allow data: and blob: images in all windows ───────────────────────────
  // The <meta> CSP tag is ignored by Electron for http:// (dev) pages.
  // Setting it here via session ensures it works in both dev and production.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src https://fonts.gstatic.com data:; " +
          "img-src 'self' data: blob:; " +
          "connect-src 'self' http://localhost:11434 ws://localhost:*"
        ]
      }
    })
  })

  createBubbleWindow()

  // ── Phase 3: System tray ──────────────────────────────────────────────────
  createTray(() => bubbleWindow, () => showPanel(''))

  // ── Phase 4 + 5: Global shortcut + panel ─────────────────────────────────
  registerPanelIPC()                                       // panel IPC handlers
  registerShortcuts(() => bubbleWindow, showPanel)         // Ctrl+Shift+E

  // ── Selection icon + Quick Panel ─────────────────────────────────────────
  registerSelectionIPC()     // icon-clicked / icon-dismiss
  registerQuickPanelIPC()    // qp-process-text, qp-replace-text, qp-close
  startMouseMonitor()        // begin watching for text selection drags

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createBubbleWindow()
  })
})

// ── Keep the app alive when all windows are hidden (tray mode) ───────────────
app.on('window-all-closed', () => {
  // Intentionally empty — app lives in the tray
})

// ── Clean up shortcuts and monitor before the process exits ─────────────────
app.on('will-quit', () => {
  unregisterShortcuts()
  stopMouseMonitor()   // kill the PowerShell mouse monitor process
})

