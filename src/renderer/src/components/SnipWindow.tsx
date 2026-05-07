import React, { useState, useEffect, useCallback, useRef } from 'react'
import ReactCrop, { type Crop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import styles from './SnipWindow.module.css'

const SnipWindow: React.FC = () => {
  const [image, setImage] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [pixelCrop, setPixelCrop] = useState<Crop>()
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    return window.electronAPI.onSnipInit(({ image }: { image: string }) => {
      setImage(image)
    })
  }, [])

  const handleComplete = useCallback(() => {
    if (!image || !imgRef.current) {
      window.electronAPI.sendSnipResult(null)
      return
    }
    const finalCrop = pixelCrop || crop
    if (!finalCrop || !finalCrop.width || !finalCrop.height) {
      window.electronAPI.sendSnipResult(image)
      return
    }

    const rect = imgRef.current.getBoundingClientRect()
    const scaleX = imgRef.current.naturalWidth / rect.width
    const scaleY = imgRef.current.naturalHeight / rect.height

    const canvasWidth = finalCrop.width * scaleX
    const canvasHeight = finalCrop.height * scaleY

    if (!canvasWidth || !canvasHeight || !isFinite(canvasWidth) || !isFinite(canvasHeight)) {
      window.electronAPI.sendSnipResult(image)
      return
    }

    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      window.electronAPI.sendSnipResult(image)
      return
    }

    ctx.drawImage(
      imgRef.current,
      finalCrop.x * scaleX,
      finalCrop.y * scaleY,
      finalCrop.width * scaleX,
      finalCrop.height * scaleY,
      0,
      0,
      canvasWidth,
      canvasHeight
    )

    const croppedUrl = canvas.toDataURL('image/png')
    
    // Fallback if canvas export failed and returned empty data url
    if (croppedUrl === 'data:,') {
      window.electronAPI.sendSnipResult(image)
      return
    }

    window.electronAPI.sendSnipResult(croppedUrl)
  }, [image, crop, pixelCrop])

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
          <span className={styles.instruction}>Draw a box to crop (Enter to confirm, Esc to cancel)</span>
          <button className={styles.btn} onClick={handleComplete}>Confirm</button>
        </div>
      </div>
      <ReactCrop 
        crop={crop} 
        onChange={c => setCrop(c)}
        onComplete={c => setPixelCrop(c)}
        className={styles.cropWrapper}
      >
        <img 
          ref={imgRef} 
          src={image} 
          alt="Desktop" 
          className={styles.desktopImage} 
        />
      </ReactCrop>
    </div>
  )
}

export default SnipWindow
