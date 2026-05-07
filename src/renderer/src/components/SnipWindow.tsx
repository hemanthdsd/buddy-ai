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
    if (!image) { window.electronAPI.sendSnipResult(null); return }
    if (!pctCrop || !pctCrop.width || !pctCrop.height) {
      window.electronAPI.sendSnipResult(null)
      return
    }
    window.electronAPI.sendSnipResult(pctCrop)
  }, [image, pctCrop])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.electronAPI.sendSnipResult(null)
      if (e.key === 'Enter') handleComplete()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleComplete])

  if (!image) return null

  return (
    <div className={styles.container}>
      {/* Minimal floating hint — top center */}
      <div className={styles.hint}>
        <span>Drag to select area</span>
        <span className={styles.hintSep}>·</span>
        <kbd>Enter</kbd> <span>confirm</span>
        <span className={styles.hintSep}>·</span>
        <kbd>Esc</kbd> <span>cancel</span>
        {pctCrop?.width && pctCrop?.height && (
          <button className={styles.confirmBtn} onClick={handleComplete}>✓ Confirm</button>
        )}
      </div>

      <ReactCrop
        crop={crop}
        onChange={(c, pc) => { setCrop(c); setPctCrop(pc) }}
        onComplete={(_c, pc) => setPctCrop(pc)}
        className={styles.cropWrapper}
      >
        <img src={image} alt="" className={styles.desktopImage} />
      </ReactCrop>
    </div>
  )
}

export default SnipWindow
