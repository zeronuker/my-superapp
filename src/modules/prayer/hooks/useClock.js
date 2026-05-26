import { useState, useEffect } from 'react'

/**
 * Returns the current Date, updating once per second.
 * A single interval — import this wherever you need live time
 * instead of creating a new setInterval in each component.
 */
export function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}
