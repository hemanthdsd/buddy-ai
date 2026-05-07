import { clipboard } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'

// ─── Replace Service ──────────────────────────────────────────────────────────
// Pastes AI-generated text back into whatever app the user was in before.
//
// Flow:
//   1. Save the current clipboard content
//   2. Write the result text to the clipboard
//   3. Simulate Ctrl+V in the previously focused window
//   4. Wait briefly for the paste to register
//   5. Restore the original clipboard
//
// Important: The panel must NOT have focus when we simulate Ctrl+V, otherwise
//            the result will be pasted into the panel's own textarea.
//            We use a short delay to let the OS switch focus back.

const execAsync = promisify(exec)

export async function replaceWithResult(resultText: string): Promise<void> {
  // ── 1. Save current clipboard ──────────────────────────────────────────────
  const savedText = clipboard.readText()

  try {
    // ── 2. Write result to clipboard ─────────────────────────────────────────
    clipboard.writeText(resultText)
    console.log('[Buddy] Replace: text written to clipboard, simulating Ctrl+V…')

    // ── 3. Simulate Ctrl+V ───────────────────────────────────────────────────
    // The panel window should have been hidden by the caller BEFORE this runs,
    // so focus is back in the original application.
    await simulateCtrlV()

    // ── 4. Brief wait for paste to settle ────────────────────────────────────
    await delay(150)

    console.log('[Buddy] Replace: done.')
  } finally {
    // ── 5. Always restore the original clipboard ─────────────────────────────
    await delay(200)   // extra wait before restore — some apps are slow to receive paste
    clipboard.writeText(savedText)
    console.log('[Buddy] Replace: clipboard restored.')
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function simulateCtrlV(): Promise<void> {
  const cmd =
    'powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command ' +
    '"Add-Type -AssemblyName System.Windows.Forms; ' +
    "[System.Windows.Forms.SendKeys]::SendWait('^'+'v')\"" 

  await execAsync(cmd, { timeout: 3000 })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
