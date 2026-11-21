// fetch with a time limit, for the cloud sync calls: without one, a stalled connection leaves the
// screen on "SYNCING" for ever. 60 s is generous on purpose: one request can carry a 700 kB map piece.
export async function fetchTimeout(url, init = {}, ms = 60_000) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new Error('The sync service took too long to answer. Check your connection and try again.')
    throw e
  }
}
