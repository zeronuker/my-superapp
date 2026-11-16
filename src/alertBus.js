// Tiny event bus for the top-of-screen alert pill (LiveAlert.jsx), so any module can
// say "Weather fetched" without prop plumbing: showAlert('Briefing saved').
const EVENT = 'oxy-alert'

export function showAlert(text) {
  if (typeof window === 'undefined') return // tests run in node
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: Date.now() + Math.random(), text } }))
}

export function onAlert(handler) {
  const listener = (e) => handler(e.detail)
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
