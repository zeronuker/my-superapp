// A small GRIB2 decoder for the one kind of message NOAA's GFS 1° wind files use:
// a lat/lon grid (grid template 3.0) packed with "complex packing and spatial differencing"
// (data template 5.3). It reads ONE message (the byte range the .idx index points at), so there is
// no inventory walking. Anything else throws. Written against the WMO GRIB2 spec and checked on a
// real GFS message (see grib2.test.js).

const sign16 = v => (v & 0x8000 ? -(v & 0x7fff) : v)

// A signed integer where the top bit is the sign and the rest the magnitude (GRIB2's usual form), k bytes.
function signMagnitude(bytes, at, k) {
  let v = 0
  for (let i = 0; i < k; i++) v = v * 256 + bytes[at + i]
  const top = 2 ** (8 * k - 1)
  return v >= top ? -(v - top) : v
}

/**
 * @param {Uint8Array} bytes  one whole GRIB2 message
 * @returns {{ ni:number, nj:number, la1:number, lo1:number, di:number, dj:number, values:Float32Array }}
 *   `values` is row by row from the first grid point (la1, lo1): ni columns east, nj rows south.
 */
export function decodeGrib2Message(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 40 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'GRIB' || bytes[7] !== 2) throw new Error('not a GRIB2 message')

  const at = {}                                   // section number → offset
  for (let p = 16; p < bytes.length - 4;) {
    const len = dv.getUint32(p), n = bytes[p + 4]
    if (n > 8 || len < 5) break
    at[n] = p
    p += len
  }
  const s3 = at[3], s5 = at[5], s7 = at[7]
  if (s3 === undefined || s5 === undefined || s7 === undefined) throw new Error('GRIB2 message is missing a section')
  if (dv.getUint16(s3 + 12) !== 0) throw new Error('unsupported grid (need lat/lon)')
  if (dv.getUint16(s5 + 9) !== 3) throw new Error('unsupported packing (need template 5.3)')

  const ni = dv.getUint32(s3 + 30), nj = dv.getUint32(s3 + 34)
  const signed32 = o => { const v = dv.getUint32(o); return v & 0x80000000 ? -(v & 0x7fffffff) : v }
  const la1 = signed32(s3 + 46) / 1e6, lo1 = dv.getUint32(s3 + 50) / 1e6
  const di = dv.getUint32(s3 + 63) / 1e6, dj = dv.getUint32(s3 + 67) / 1e6

  const N = dv.getUint32(s5 + 5)
  if (N !== ni * nj) throw new Error('GRIB2 point count does not match the grid')
  const R = dv.getFloat32(s5 + 11)
  const E = sign16(dv.getUint16(s5 + 15)), D = sign16(dv.getUint16(s5 + 17))
  const bitsRef = bytes[s5 + 19]
  const groups = dv.getUint32(s5 + 31)
  const widthRef = bytes[s5 + 35], bitsWidth = bytes[s5 + 36]
  const lengthRef = dv.getUint32(s5 + 37), lengthInc = bytes[s5 + 41], lastLength = dv.getUint32(s5 + 42), bitsLength = bytes[s5 + 46]
  const order = bytes[s5 + 47], octets = bytes[s5 + 48]
  if (order !== 1 && order !== 2) throw new Error('unsupported spatial differencing order')
  if (bytes[s5 + 22] !== 0) throw new Error('missing values are not supported')   // GFS wind fields have none

  let q = s7 + 5
  const first = []
  for (let i = 0; i < order; i++) { first.push(signMagnitude(bytes, q, octets)); q += octets }
  const minimum = signMagnitude(bytes, q, octets); q += octets

  let bit = q * 8
  const read = k => {
    let v = 0
    while (k > 0) {
      const off = bit & 7, take = Math.min(8 - off, k)
      v = v * 2 ** take + ((bytes[bit >> 3] >> (8 - off - take)) & ((1 << take) - 1))
      bit += take; k -= take
    }
    return v
  }
  const align = () => { bit = (bit + 7) & ~7 }
  const refs = Array.from({ length: groups }, () => read(bitsRef)); align()
  const widths = Array.from({ length: groups }, () => widthRef + read(bitsWidth)); align()
  const lengths = Array.from({ length: groups }, () => lengthRef + lengthInc * read(bitsLength)); align()
  lengths[groups - 1] = lastLength

  const v = new Float64Array(N)
  let k = 0
  for (let g = 0; g < groups; g++) {
    for (let j = 0; j < lengths[g]; j++) v[k++] = refs[g] + (widths[g] ? read(widths[g]) : 0)
  }
  if (k !== N) throw new Error('GRIB2 group lengths do not add up')
  for (let i = order; i < N; i++) v[i] += minimum
  if (order === 2) {
    v[0] = first[0]; v[1] = first[1]
    for (let i = 2; i < N; i++) v[i] = v[i] + 2 * v[i - 1] - v[i - 2]
  } else {
    v[0] = first[0]
    for (let i = 1; i < N; i++) v[i] += v[i - 1]
  }

  const scale = 2 ** E, decimal = 10 ** D
  const values = new Float32Array(N)
  for (let i = 0; i < N; i++) values[i] = (R + v[i] * scale) / decimal
  return { ni, nj, la1, lo1, di, dj, values }
}
