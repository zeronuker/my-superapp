import { useCalculatorStore } from '../store/calculatorStore'

export function haptic(intensity = 'light') {
  if (!navigator.vibrate) return
  const { settings } = useCalculatorStore.getState()
  if (!settings?.haptic) return
  const durations = { light: 8, medium: 18, heavy: 30 }
  navigator.vibrate(durations[intensity] ?? 8)
}
