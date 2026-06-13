import { useCalculatorStore } from '../store/calculatorStore'

export function haptic(intensity = 'light') {
  if (!navigator.vibrate) return
  const { settings } = useCalculatorStore.getState()
  if (!settings?.haptic) return
  const durations = { light: 8, medium: 18, heavy: 30 }
  // Global strength multiplier scales every per-action haptic.
  const mult = { light: 0.55, medium: 1, heavy: 1.7 }
  const base = durations[intensity] ?? 8
  const scaled = Math.round(base * (mult[settings.hapticIntensity] ?? 1))
  navigator.vibrate(Math.max(1, scaled))
}
