import { clipboard } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

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

    // ── 4. Wait for paste to settle ──────────────────────────────────────────
    await delay(300)

    console.log('[Buddy] Replace: done.')
  } finally {
    // ── 5. Always restore the original clipboard ─────────────────────────────
    await delay(400)   // extra wait before restore — some apps are slow to receive paste
    clipboard.writeText(savedText)
    console.log('[Buddy] Replace: clipboard restored.')
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function simulateCtrlV(): Promise<void> {
  const vbsPath = join(tmpdir(), 'buddy_paste.vbs')
  const vbsCode = `set WshShell = WScript.CreateObject("WScript.Shell")\nWScript.Sleep 50\nWshShell.SendKeys "^v"`
  writeFileSync(vbsPath, vbsCode, 'utf8')
  
  await execAsync(`wscript.exe "${vbsPath}"`, { timeout: 3000 })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
