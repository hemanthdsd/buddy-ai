import { clipboard } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'

// ─── Clipboard Service ────────────────────────────────────────────────────────
// Captures text that the user has selected in ANY application.
//
// Flow (from Buddy.txt spec):
//   1. Save current clipboard content (so we can restore it later)
//   2. Clear clipboard   (so we can detect if Ctrl+C actually copied anything)
//   3. Simulate Ctrl+C   (copies selected text in the currently focused app)
//   4. Wait 200 ms       (clipboard write is async in many apps)
//   5. Read clipboard    (this is the selected text)
//   6. Restore clipboard (put back what was there before)
//
// Important: This must be called BEFORE the bubble window takes focus.
//            If the bubble gets focus first, Ctrl+C won't copy anything useful.

const execAsync = promisify(exec)

// How long to wait after Ctrl+C for the clipboard to update.
// 200 ms works for most apps; slow/web apps may need up to 400 ms.
const CLIPBOARD_DELAY_MS = 200

// Maximum text length we'll accept (prevent sending huge documents to AI)
const MAX_TEXT_LENGTH = 4000

export interface CaptureResult {
  text: string          // the captured (and trimmed) selected text
  hadSelection: boolean // true if any text was actually selected
  truncated: boolean    // true if text was cut at MAX_TEXT_LENGTH
}

export async function captureSelectedText(): Promise<CaptureResult> {
  // ── 1. Save current clipboard ──────────────────────────────────────────────
  const savedText = clipboard.readText()

  try {
    // ── 2. Clear clipboard ───────────────────────────────────────────────────
    // Set to empty string so we can tell if Ctrl+C captured anything
    clipboard.writeText('')

    // ── 3. Simulate Ctrl+C ───────────────────────────────────────────────────
    // PowerShell's SendKeys sends keystrokes to whatever window has focus.
    // -NoProfile and -NonInteractive make startup much faster (~200–400 ms).
    await simulateCtrlC()

    // ── 4. Wait for clipboard to update ─────────────────────────────────────
    await delay(CLIPBOARD_DELAY_MS)

    // ── 5. Read the captured text ────────────────────────────────────────────
    const raw = clipboard.readText()

    // ── 6. Restore original clipboard ───────────────────────────────────────
    clipboard.writeText(savedText)

    // ── 7. Process and return ────────────────────────────────────────────────
    const trimmed = raw.trim()
    const hadSelection = trimmed.length > 0

    if (!hadSelection) {
      console.log('[Buddy] No text was selected — clipboard unchanged after Ctrl+C')
      return { text: '', hadSelection: false, truncated: false }
    }

    const truncated = trimmed.length > MAX_TEXT_LENGTH
    const text = truncated ? trimmed.slice(0, MAX_TEXT_LENGTH) : trimmed

    console.log(
      `[Buddy] Captured ${text.length} chars${truncated ? ' (truncated)' : ''}: ` +
      `"${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`
    )

    return { text, hadSelection: true, truncated }

  } catch (err) {
    // If anything goes wrong, always restore the clipboard
    console.error('[Buddy] Clipboard capture failed:', err)
    clipboard.writeText(savedText)
    return { text: '', hadSelection: false, truncated: false }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function simulateCtrlC(): Promise<void> {
  // We use PowerShell's SendKeys to press Ctrl+C in the active window.
  // Flags used:
  //   -NoProfile        skip loading the user's profile (much faster startup)
  //   -NonInteractive   don't wait for user input
  //   -WindowStyle Hidden  run without flashing a console window
  const cmd =
    'powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command ' +
    '"Add-Type -AssemblyName System.Windows.Forms; ' +
    '[System.Windows.Forms.SendKeys]::SendWait(\'^\'+\'c\')"'

  await execAsync(cmd, { timeout: 3000 })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
