import { BrowserWindow, ipcMain, screen } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { captureSelectedText } from './clipboard.service'
import { showQuickPanel } from './quick-panel.service'

// ─── Selection Service ────────────────────────────────────────────────────────
// Monitors for mouse drag-release events (= text selection) system-wide.
// When a drag is detected, captures the selected text and shows the small
// Buddy icon near the cursor. Clicking the icon opens the Quick Panel.
//
// How it works:
//   PowerShell polls GetAsyncKeyState(VK_LBUTTON) every 40ms.
//   If the mouse moved > 8px between press and release → it was a drag.
//   We output "DRAG:x,y" to stdout and Node reads it.
//   Then we simulate Ctrl+C to capture the selected text (same as Phase 5).
//
// Important: NO keyboard events are monitored — only left mouse button state.

let monitorProcess: ChildProcess | null = null
let iconWindow: BrowserWindow | null = null

let busy         = false   // prevent concurrent captures
let iconVisible  = false   // true while the selection icon is on screen
let dismissTimer: ReturnType<typeof setTimeout> | null = null
let storedText   = ''      // text captured from last selection

// ─── Mouse monitor script ─────────────────────────────────────────────────────
// Written as an array of lines then joined to avoid template-literal escaping issues.
const PS_LINES = [
  'Add-Type @"',
  '    using System;',
  '    using System.Runtime.InteropServices;',
  '    public class WinAPI {',
  '        [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int k);',
  '        [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);',
  '        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  '        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);',
  '        [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint idThread, ref GUITHREADINFO lpgui);',
  '        [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT lpPoint);',
  '        public struct POINT { public int X; public int Y; }',
  '        public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }',
  '        public struct GUITHREADINFO { public int cbSize; public int flags; public IntPtr hwndActive; public IntPtr hwndFocus; public IntPtr hwndCapture; public IntPtr hwndMenuOwner; public IntPtr hwndMoveSize; public IntPtr hwndCaret; public RECT rcCaret; }',
  '    }',
  '"@',
  '$wasDown = $false',
  '$downX = 0; $downY = 0',
  '$shiftWasDown = $false',
  '$selectionKeysPressed = $false',
  '$ctrlAWasDown = $false',
  'function Get-TriggerPoint {',
  '    $gui = New-Object WinAPI+GUITHREADINFO',
  '    $gui.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf([type][WinAPI+GUITHREADINFO])',
  '    $fg = [WinAPI]::GetForegroundWindow()',
  '    $tid = [WinAPI]::GetWindowThreadProcessId($fg, [IntPtr]::Zero)',
  '    if ([WinAPI]::GetGUIThreadInfo($tid, [ref]$gui) -and $gui.hwndCaret -ne [IntPtr]::Zero) {',
  '        $pt = New-Object WinAPI+POINT',
  '        $pt.X = $gui.rcCaret.Right; $pt.Y = $gui.rcCaret.Bottom',
  '        [void][WinAPI]::ClientToScreen($gui.hwndCaret, [ref]$pt)',
  '        if ($pt.X -ne 0 -or $pt.Y -ne 0) { return $pt }',
  '    }',
  '    $p = New-Object WinAPI+POINT',
  '    [void][WinAPI]::GetCursorPos([ref]$p)',
  '    return $p',
  '}',
  'while ($true) {',
  '    # 1. Mouse Drag Detection',
  '    $s = [WinAPI]::GetAsyncKeyState(0x01)',
  '    $isDown = ($s -band 0x8000) -ne 0',
  '    if (-not $wasDown -and $isDown) {',
  '        $p = New-Object WinAPI+POINT',
  '        [void][WinAPI]::GetCursorPos([ref]$p)',
  '        $downX = $p.X; $downY = $p.Y',
  '    }',
  '    if ($wasDown -and -not $isDown) {',
  '        $p = New-Object WinAPI+POINT',
  '        [void][WinAPI]::GetCursorPos([ref]$p)',
  '        $dx = [Math]::Abs($p.X - $downX)',
  '        $dy = [Math]::Abs($p.Y - $downY)',
  '        if ($dx -gt 8 -or $dy -gt 8) {',
  '            Write-Host "DRAG:$($p.X),$($p.Y)"',
  '            [Console]::Out.Flush()',
  '        }',
  '    }',
  '    $wasDown = $isDown',
  '',
  '    # 2. Keyboard Selection Detection (Shift + Arrows/Home/End)',
  '    $shiftDown = ([WinAPI]::GetAsyncKeyState(0x10) -band 0x8000) -ne 0',
  '    if ($shiftDown) {',
  '        for ($k = 0x21; $k -le 0x28; $k++) {',
  '            if (([WinAPI]::GetAsyncKeyState($k) -band 0x8000) -ne 0) {',
  '                $selectionKeysPressed = $true',
  '                break',
  '            }',
  '        }',
  '    }',
  '    if ($shiftWasDown -and -not $shiftDown) {',
  '        if ($selectionKeysPressed) {',
  '            $pt = Get-TriggerPoint',
  '            Write-Host "DRAG:$($pt.X),$($pt.Y)"',
  '            [Console]::Out.Flush()',
  '        }',
  '        $selectionKeysPressed = $false',
  '    }',
  '    $shiftWasDown = $shiftDown',
  '',
  '    # 3. Ctrl+A Detection',
  '    $ctrlDown = ([WinAPI]::GetAsyncKeyState(0x11) -band 0x8000) -ne 0',
  '    $aDown = ([WinAPI]::GetAsyncKeyState(0x41) -band 0x8000) -ne 0',
  '    $ctrlA = $ctrlDown -and $aDown',
  '    if (-not $ctrlAWasDown -and $ctrlA) {',
  '        $pt = Get-TriggerPoint',
  '        Write-Host "DRAG:$($pt.X),$($pt.Y)"',
  '        [Console]::Out.Flush()',
  '    }',
  '    $ctrlAWasDown = $ctrlA',
  '',
  '    Start-Sleep -Milliseconds 40',
  '}'
]

// ─── Start / Stop ─────────────────────────────────────────────────────────────

export function startMouseMonitor(): void {
  if (monitorProcess) return

  // Base64-encode the script so we can pass it to PowerShell without escaping
  const script  = PS_LINES.join('\r\n')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')

  monitorProcess = spawn('powershell', [
    '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
    '-EncodedCommand', encoded
  ])

  monitorProcess.stdout?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('DRAG:')) continue
      const [xStr, yStr] = trimmed.slice(5).split(',')
      const x = parseInt(xStr, 10)
      const y = parseInt(yStr, 10)
      if (!isNaN(x) && !isNaN(y)) {
        handleDrag(x, y).catch(err =>
          console.error('[Buddy/Selection] handleDrag error:', err)
        )
      }
    }
  })

  monitorProcess.on('error', err => console.error('[Buddy/Selection] Monitor error:', err))
  monitorProcess.on('exit',  code => {
    console.log('[Buddy/Selection] Monitor exited:', code)
    monitorProcess = null
  })

  console.log('[Buddy/Selection] Mouse monitor started.')
}

export function stopMouseMonitor(): void {
  if (monitorProcess) {
    monitorProcess.kill()
    monitorProcess = null
  }
  iconWindow?.destroy()
  iconWindow = null
}

// ─── Drag handler ─────────────────────────────────────────────────────────────

async function handleDrag(cursorX: number, cursorY: number): Promise<void> {
  // Skip if we're already processing or if the icon is showing
  // (user may be clicking the icon itself — not a text selection drag)
  if (busy || iconVisible) return

  // Skip if any of our own windows are focused (user is inside Buddy)
  const focused = BrowserWindow.getFocusedWindow()
  if (focused) return

  busy = true
  try {
    const result = await captureSelectedText()
    if (!result.hadSelection || !result.text.trim()) return

    storedText = result.text
    showIcon(cursorX, cursorY)
  } finally {
    busy = false
  }
}

// ─── Selection Icon Window ────────────────────────────────────────────────────

function createIconWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 44,
    height: 44,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?window=selectionicon')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { window: 'selectionicon' }
    })
  }

  return win
}

function showIcon(cursorX: number, cursorY: number): void {
  if (!iconWindow || iconWindow.isDestroyed()) {
    iconWindow = createIconWindow()
  }

  // Position icon 10px right, 52px above cursor (so it's above the selected text)
  const { workAreaSize, bounds } = screen.getDisplayNearestPoint({ x: cursorX, y: cursorY })
  const iconSize = 44
  let x = cursorX + 10
  let y = cursorY - iconSize - 8

  // Clamp to screen bounds
  x = Math.max(bounds.x, Math.min(x, bounds.x + workAreaSize.width  - iconSize))
  y = Math.max(bounds.y, Math.min(y, bounds.y + workAreaSize.height - iconSize))

  iconWindow.setPosition(x, y)
  iconWindow.showInactive()   // show WITHOUT stealing focus from the original app
  iconVisible = true

  // Auto-dismiss after 5 seconds if not clicked
  if (dismissTimer) clearTimeout(dismissTimer)
  dismissTimer = setTimeout(() => hideIcon(), 5000)

  console.log(`[Buddy/Selection] Icon shown at (${x}, ${y}) — "${storedText.slice(0, 40)}…"`)
}

export function hideIcon(): void {
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null }
  iconWindow?.hide()
  iconVisible = false
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

export function registerSelectionIPC(): void {
  // Icon was clicked — open the quick panel with the captured text
  ipcMain.on('selection-icon-clicked', () => {
    const text = storedText
    const pos  = iconWindow?.getPosition() ?? [100, 100]
    hideIcon()
    // Show quick panel near where the icon was
    showQuickPanel(text, pos[0], pos[1])
  })

  // Icon was dismissed (e.g. user pressed Escape inside icon window)
  ipcMain.on('selection-icon-dismiss', () => hideIcon())
}
