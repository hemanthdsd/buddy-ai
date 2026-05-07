import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron'

// ─── Programmatic tray icon ───────────────────────────────────────────────────
// 32×32 PNG of a purple-to-blue gradient circle with a white sparkle star.
// Generated with PowerShell System.Drawing — embedded here so no external
// image file is needed and there is zero risk of file-format mismatch.
function createTrayIcon(): Electron.NativeImage {
  const PNG_BASE64 =
    'data:image/png;base64,' +
    'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACx' +
    'jwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAOTSURBVFhH1ZZNTxNRFIZZsmTJ0p/A0mV/Akt' +
    '2GLG0iFCgnX6A0PKhgAJDi0qEBAwmsnCBCQhqUFBR/Ii6042JC02IEUUy985AKxzPmbkjnTrTzg' +
    'gsfJM3k7TpPO8959x7W/bfKhrlJ8Mdii/f4qvjUSTCKqU4D0YTfElKcJDa0R0cIuTzHMLkTg5t' +
    'nWy9pZPFQ0nthPjp4RQKbVVIMZ6SYkxDOBSFdxluTaJT6B42HkmySvEq74rFFF80xreicQ5e4S3' +
    'dhkM9TGvuUWrEK90rFmGnpCiu+lBwdC+H5j4OTb08JV5dWgTHlcNRwfUAFzicu6DKAuEsKvtRr' +
    'tyEN13EAP0cGi/yoED9LZp0rz2/Or0DEkLcwPUAA0w7e4lVCaRVUkyVvcBvz+8CaX456xKOHuSA' +
    'AeYE8kD6Pi+x1a5N7UAUIWbZ761m9QD0zIdnbu5AG4Ls4aYLqhCJsXgx+OTMjg77srEH7f2q3nM' +
    'zwNJjDIDwMELef/ylf7b4NOsIb7jMITjExgXakJRg68XKnrykwvetff3lFCIxqFoC5MNVbR96JzR' +
    'HeMMQh8Aw3xBoPO2SeNoVgZs975WtIZafGQHur2Ut8IGp4vDgsOEzsmgDXSyl4OZW60kfhNhWjOe' +
    '3H8bTCzwwwsE/LE5IXH11MfituV293KZXX+Z0WL6yOYC1tzm993exIuSZxV0IIcgOHpA51MtKix' +
    'GgnQeLwQ+jO0+ytvDAKFZAFsdzOKHUOJW9fcAYNjING5l6bpbd1DbbhwcvxOpxNsgL6PMTqi28X' +
    'jeLGwHoD4UN3O54zZ92KjvJbMfnr3sQxhlx6rkFnsYhzLBTegC6s73CCUo9Jz16nYPNnwch2jJq' +
    'SXh9BgOk+Uk9AAn/yXzyAqdpp4EjUdk7r6uWEK1XjNI7wf1pptVOQ7nAY4AuVXaC0/E6PmuchPl' +
    'bjcAk6jeVnfq9uW2EWHiedYbT6scK7oNQklU5wckdoyqsvMpZ9nl+ALPnHZMqPHyTg+QNzRHuH+' +
    'NwOsOrBfpALd1szg7udKvdwR1Boml303MTXpfh7wTSKqqCWziVnCa+5FYrgJ9xWr2p5m4WdwN3u' +
    '9UK4XVXCm5BOzX18dljgq9bJt9JtUkoR/jskcPlrQqBcKfGfp46qrK7WrmdGvsVH4JX/gVeN8Y/' +
    'FB04L2oY5NUInw0OM80FfOnPOX8cCsiKr36ExTFAiq5Uf9pw3Zji81bqsrLfcNfF89wjzJUAAAAA' +
    'SUVORK5CYII='

  const img = nativeImage.createFromDataURL(PNG_BASE64)
  if (!img.isEmpty()) return img.resize({ width: 16, height: 16 })

  // Fallback: 1×1 purple pixel — at least the tray entry will appear
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ' +
    'AABjkB6QAAAABJRU5ErkJggg=='
  )
}


// ─── Tray Service ─────────────────────────────────────────────────────────────
// Encapsulates all system-tray logic.
// The tray icon lives in the Windows notification area (bottom-right clock).
//
// Menu items:
//   • [title]     — "✨ Buddy AI" (disabled, cosmetic label)
//   • Show / Hide — toggles bubble window visibility
//   • Quit        — cleanly exits the application
//
// Usage (from main/index.ts):
//   import { createTray } from './services/tray.service'
//   createTray(() => bubbleWindow)

let tray: Tray | null = null

// getBubble is a function so we always get the latest window reference,
// even if the window was recreated after the tray was created.
type GetBubble = () => BrowserWindow | null

export function createTray(getBubble: GetBubble): void {
  // ── Load icon ────────────────────────────────────────────────────────────
  const trayIcon = createTrayIcon()

  // ── Create tray ──────────────────────────────────────────────────────────
  tray = new Tray(trayIcon)
  tray.setToolTip('Buddy — AI Writing Assistant')

  // Build the menu immediately, then rebuild it whenever "show/hide" is toggled
  rebuildMenu(getBubble)

  // Double-click the tray icon to show the bubble (Windows convention)
  tray.on('double-click', () => {
    showBubble(getBubble())
    rebuildMenu(getBubble)
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function showBubble(win: BrowserWindow | null): void {
  if (!win) return
  win.show()
  win.setAlwaysOnTop(true, 'floating')   // restore on-top after hiding
}

function hideBubble(win: BrowserWindow | null): void {
  if (!win) return
  win.hide()
}

function rebuildMenu(getBubble: GetBubble): void {
  const win = getBubble()
  const isVisible = win?.isVisible() ?? false

  const menu = Menu.buildFromTemplate([
    // ── Branding row (non-interactive) ────────────────────────────────────
    {
      label: '✨  Buddy AI',
      enabled: false     // greyed-out title — purely cosmetic
    },
    { type: 'separator' },

    // ── Show / Hide toggle ────────────────────────────────────────────────
    {
      label: isVisible ? '🫧  Hide Bubble' : '🫧  Show Bubble',
      click: () => {
        const w = getBubble()
        if (!w) return
        if (w.isVisible()) {
          hideBubble(w)
        } else {
          showBubble(w)
        }
        // Rebuild so the label flips ("Show" ↔ "Hide")
        rebuildMenu(getBubble)
      }
    },

    { type: 'separator' },

    // ── Quit ──────────────────────────────────────────────────────────────
    {
      label: '✕  Quit Buddy',
      click: () => {
        // Force quit — bypass the 'close' event handler that hides to tray
        app.exit(0)
      }
    }
  ])

  tray?.setContextMenu(menu)
}
