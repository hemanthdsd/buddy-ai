import React, { useState, useEffect, useCallback } from 'react'
import ReactCrop, { type Crop, type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import styles from './SnipWindow.module.css'

const SnipWindow: React.FC = () => {
  const [image, setImage] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [pctCrop, setPctCrop] = useState<PercentCrop>()

  useEffect(() => {
    return window.electronAPI.onSnipInit(({ image }: { image: string }) => {
      setImage(image)
    })
  }, [])

  const handleComplete = useCallback(() => {
    if (!image) {
      window.electronAPI.sendSnipResult(null)
      return
    }

    // If no crop drawn, send null to cancel (not the full image)
    if (!pctCrop || !pctCrop.width || !pctCrop.height) {
      window.electronAPI.sendSnipResult(null)
      return
    }

    // Send ONLY percent coords — the main process will use nativeImage.crop()
    // which is DPI-safe and doesn't require canvas operations
    window.electronAPI.sendSnipResult(pctCrop)
  }, [image, pctCrop])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      window.electronAPI.sendSnipResult(null)
    } else if (e.key === 'Enter') {
      handleComplete()
    }
  }, [handleComplete])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!image) return null

  return (
    <div className={styles.container}>
      <div className={styles.overlay}>
        <div className={styles.toolbar}>
          <span className={styles.instruction}>
            Draw a box around the area you want the AI to read (Enter to confirm, Esc to cancel)
          </span>
          <button className={styles.btn} onClick={handleComplete}>✓ Confirm</button>
        </div>
      </div>
      <ReactCrop
        crop={crop}
        onChange={(c, pc) => { setCrop(c); setPctCrop(pc) }}
        onComplete={(_c, pc) => setPctCrop(pc)}
        className={styles.cropWrapper}
      >
        <img
          src={image}
          alt="Desktop"
          className={styles.desktopImage}
        />
      </ReactCrop>
    </div>
  )
}

export default SnipWindow
