import { BrowserWindow, screen, ipcMain, nativeImage } from 'electron'
import { join } from 'path'

interface PercentCrop {
  x: number
  y: number
  width: number
  height: number
  unit: '%'
}

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
      snipWindow?.webContents.send('snip-init', { image: dataUrl })
    })

    // ── Listen for the snip result ─────────────────────────────────────────
    // The renderer sends back a PercentCrop (x/y/width/height in % of image).
    // We use nativeImage.crop() to slice the original full-res screenshot.
    // This avoids all canvas/DPI issues in the renderer process.
    const onResult = (_e: any, payload: PercentCrop | null) => {
      ipcMain.removeListener('snip-result', onResult)
      if (snipWindow && !snipWindow.isDestroyed()) {
        snipWindow.close()
      }

      if (!payload) {
        console.log('[Buddy/Snip] Cancelled — no crop sent')
        resolve(null)
        return
      }

      try {
        const img = nativeImage.createFromDataURL(dataUrl)
        const { width: imgW, height: imgH } = img.getSize()

        const cropBounds = {
          x:      Math.max(0, Math.round((payload.x      / 100) * imgW)),
          y:      Math.max(0, Math.round((payload.y      / 100) * imgH)),
          width:  Math.min(imgW, Math.round((payload.width  / 100) * imgW)),
          height: Math.min(imgH, Math.round((payload.height / 100) * imgH))
        }

        console.log('[Buddy/Snip] Cropping', { imgW, imgH, cropBounds })

        if (cropBounds.width < 2 || cropBounds.height < 2) {
          console.warn('[Buddy/Snip] Crop too small — sending full image')
          resolve(dataUrl)
          return
        }

        const cropped = img.crop(cropBounds)
        const croppedDataUrl = cropped.toDataURL()
        console.log('[Buddy/Snip] Crop success — size:', croppedDataUrl.length, 'bytes')
        resolve(croppedDataUrl)
      } catch (err) {
        console.error('[Buddy/Snip] nativeImage.crop() failed:', err)
        resolve(dataUrl) // fallback to full image
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
