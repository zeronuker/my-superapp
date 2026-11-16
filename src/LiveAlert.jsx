import { useEffect, useRef, useState } from 'react'
import { onAlert } from './alertBus'

const HOLD_MS = 3000
const SETTLE_MS = 700 // the shrink-back transition, see .live-alert in oxygen.css

// One pill: a dot grows into the message, holds, then shrinks away. Mount with a new
// `key` to play it again; `onDone` fires once it is gone.
function Pill({ text, onDone }) {
  const [open, setOpen] = useState(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  useEffect(() => {
    const timers = [
      setTimeout(() => setOpen(true), 30),
      setTimeout(() => setOpen(false), 30 + HOLD_MS),
      setTimeout(() => doneRef.current(), 30 + HOLD_MS + SETTLE_MS),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])
  return (
    <div className={`live-alert${open ? ' open' : ''}`} role="status" aria-live="polite">
      <span className="live-alert-dot" />
      <span className="live-alert-text">{text}</span>
    </div>
  )
}

// Mounted once in App.jsx; shows whatever showAlert() (alertBus.js) sends.
export default function LiveAlertHost() {
  const [alert, setAlert] = useState(null)
  useEffect(() => onAlert(setAlert), [])
  return alert ? <Pill key={alert.id} text={alert.text} onDone={() => setAlert(null)} /> : null
}
