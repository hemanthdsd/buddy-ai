import { globalShortcut, BrowserWindow, Notification } from 'electron'
import { captureSelectedText } from './clipboard.service'

// ─── Shortcut Service ─────────────────────────────────────────────────────────
// Ctrl+Shift+E — global hotkey that works in ANY app.
//
// Behaviour (fixed from Phase 4):
//   Every press captures selected text and opens the assistant panel.
//   The old "hide if visible" toggle is removed — that caused the "press twice" bug.

const SHORTCUT = 'CommandOrControl+Shift+E'

type GetBubble = () => BrowserWindow | null
type OpenPanel = (text: string) => void

export function registerShortcuts(
  getBubble: GetBubble,
  openPanel: OpenPanel
): void {
  const ok = globalShortcut.register(SHORTCUT, () => {
    handleShortcutFired(getBubble, openPanel).catch(err => {
      console.error('[Buddy] Shortcut handler error:', err)
    })
  })

  if (ok) {
    console.log(`[Buddy] ✓ Global shortcut registered: ${SHORTCUT}`)
  } else {
    console.warn(`[Buddy] ✗ Could not register ${SHORTCUT}`)
    if (Notification.isSupported()) {
      new Notification({
        title: 'Buddy — Shortcut conflict',
        body: `Could not register ${SHORTCUT}. Another app is using it.`
      }).show()
    }
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
// ORDER IS CRITICAL:
//   1. Capture text FIRST (other app still has focus — Ctrl+C works)
//   2. Show bubble
//   3. Open panel with captured text

async function handleShortcutFired(
  getBubble: GetBubble,
  openPanel: OpenPanel
): Promise<void> {
  console.log('[Buddy] Ctrl+Shift+E fired — capturing text…')

  // Step 1: capture while the other app still has focus
  const result = await captureSelectedText()

  // Step 2: make sure the bubble is visible
  const win = getBubble()
  if (win && !win.isVisible()) {
    win.show()
    win.setAlwaysOnTop(true, 'floating')
  }

  // Step 3: open the panel and send captured text (even if empty — user can type)
  openPanel(result.text)

  if (result.hadSelection) {
    console.log(`[Buddy] Opened panel with ${result.text.length} chars`)
  } else {
    console.log('[Buddy] No text selected — panel opened for manual input')
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────
export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
  console.log('[Buddy] All global shortcuts unregistered')
}
