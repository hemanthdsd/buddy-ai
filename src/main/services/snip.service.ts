import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'

let snipWindow: BrowserWindow | null = null

export function openSnipWindow(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (snipWindow) {
      snipWindow.close()
    }

    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.bounds

    snipWindow = new BrowserWindow({
      width,
      height,
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    snipWindow.setAlwaysOnTop(true, 'screen-saver')

    if (process.env['ELECTRON_RENDERER_URL']) {
      snipWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?window=snip')
    } else {
      snipWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { window: 'snip' } })
    }

    snipWindow.once('ready-to-show', () => {
      snipWindow?.show()
      snipWindow?.focus()
      // Send the image to the snip window to render
      snipWindow?.webContents.send('snip-init', { image: dataUrl })
    })

    // Listen for the snipped result
    const onResult = (_e: any, croppedUrl: string | null) => {
      resolve(croppedUrl)
      ipcMain.removeListener('snip-result', onResult)
      if (snipWindow && !snipWindow.isDestroyed()) {
        snipWindow.close()
      }
    }
    
    ipcMain.on('snip-result', onResult)

    snipWindow.on('closed', () => {
      ipcMain.removeListener('snip-result', onResult)
      resolve(null)
      snipWindow = null
    })
  })
}
