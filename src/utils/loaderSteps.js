// The chips shown while a satellite or winds picture is being built. They run on a timer and are not tied to the
// real work, like the METAR/TAF and NOTAM loaders: the picture is held back until they have all had their turn.

export const STEP_MS = 700

export const CLOUD_STEPS = [
  { chip: 'FETCH IMAGE', text: 'Fetching image' },
  { chip: 'OVERLAYING ROUTE', text: 'Overlaying route' },
  { chip: 'STITCH', text: 'Stitching' },
  { chip: 'DRAWING MAP', text: 'Drawing map' },
]

export const WIND_STEPS = [
  { chip: 'DOWNLOADING WIND DATA', text: 'Downloading wind data' },
  { chip: 'DECODING', text: 'Decoding' },
  { chip: 'OVERLAYING ROUTE', text: 'Overlaying route' },
  { chip: 'DRAWING MAP', text: 'Drawing map' },
]

export const STORM_STEPS = [
  { chip: 'FETCH STORMS', text: 'Fetching storms' },
  { chip: 'OVERLAYING ROUTE', text: 'Overlaying route' },
  { chip: 'DRAWING MAP', text: 'Drawing map' },
]

export const loaderMs = steps => steps.length * STEP_MS

// How long a picture that is already built must still wait so every step shows (0 once the time is up).
export const loaderWaitMs = (startedAt, steps, now = Date.now()) => Math.max(0, loaderMs(steps) - (now - startedAt))

// Resolves when the steps are done, or at once when `signal` aborts.
export function holdForLoader(startedAt, steps, signal) {
  const ms = loaderWaitMs(startedAt, steps)
  if (!ms || signal?.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); resolve() }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', done); resolve() }, ms)
    signal?.addEventListener('abort', done, { once: true })
  })
}
