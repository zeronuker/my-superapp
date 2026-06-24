import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

const mono = 'var(--cb-font-mono)'

// Full-screen camera overlay — scans QR frames until one decodes, then calls
// onResult and stops. Closeable any time via onClose.
export default function QrScanner({ onResult, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(document.createElement('canvas'))
  const streamRef = useRef(null)
  const rafRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          rafRef.current = requestAnimationFrame(tick)
        }
      })
      .catch(() => setError('Camera unavailable — type the code instead.'))

    function tick() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const result = jsQR(frame.data, frame.width, frame.height)
      if (result?.data) {
        onResult(result.data)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [onResult])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      {error ? (
        <div style={{ fontFamily: mono, fontSize: 12, color: '#fff', textAlign: 'center', maxWidth: 280 }}>
          {error}
        </div>
      ) : (
        <video ref={videoRef} muted playsInline style={{
          width: '100%', maxWidth: 360, borderRadius: 8, background: '#000',
        }} />
      )}
      <div style={{ fontFamily: mono, fontSize: 10, color: '#aaa', letterSpacing: '0.08em', marginTop: 16 }}>
        {error ? '' : 'POINT YOUR CAMERA AT THE QR CODE'}
      </div>
      <button onClick={onClose} className="cp-btn" style={{ marginTop: 20, padding: '8px 24px' }}>
        CANCEL
      </button>
    </div>
  )
}
