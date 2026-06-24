import { useEffect, useRef, useState } from 'react'
import * as Flags from 'country-flag-icons/react/3x2'
import { CURRENCIES, CURRENCY_BY_CODE } from '../data/currencies.js'
import { useCalculatorStore } from '../store/calculatorStore'
import ResetButton from './ResetButton'

// Last-resort hardcoded rates (USD base, circa 2024) — used only when a base
// currency has never been fetched AND the device is offline. Once a base has
// been fetched once, its full rate set is cached (see cb-rates-${base}) and
// used instead, regardless of which currencies are in the visible list.
const USD_RATES = {
  USD:1.000, CAD:1.360, MXN:17.05,
  EUR:0.920, GBP:0.730, CHF:0.880, SEK:10.48, NOK:10.48,
  AED:3.673, SAR:3.750, QAR:3.640, KWD:0.307, BHD:0.376, OMR:0.385,
  INR:83.12, PKR:278.0, BDT:110.0,
  CNY:7.240, JPY:149.5, KRW:1350.0, TWD:32.00, HKD:7.810,
  SGD:1.340, THB:36.00, MYR:4.700, IDR:16000, PHP:56.00, VND:25000,
  AUD:1.520, NZD:1.650,
}
function hardcodedRates(base) {
  const baseUSD = USD_RATES[base] || 1
  const out = {}
  for (const [code, usd] of Object.entries(USD_RATES)) out[code] = usd / baseUSD
  return out
}

// ── Rate cache ────────────────────────────────────────────────────────────
// A single cached rate table, anchored to whichever base was last fetched
// live. Currency rates are transitive — rate(B→X) = rate(A→X) / rate(A→B) —
// so this one table lets us derive accurate offline conversions for ANY
// base the user switches to, not just the one that happened to be cached.
const ANCHOR_KEY = 'cb-rates-anchor'
function loadAnchorCache() {
  try { const r = localStorage.getItem(ANCHOR_KEY); return r ? JSON.parse(r) : null }
  catch { return null }
}
function saveAnchorCache(anchor, rates, date) {
  try { localStorage.setItem(ANCHOR_KEY, JSON.stringify({ anchor, rates, date, fetchedAt: Date.now() })) }
  catch {}
}
function deriveRates(anchorCache, base) {
  if (!anchorCache) return null
  const { anchor, rates } = anchorCache
  if (base === anchor) return rates
  const baseRate = rates[base]
  if (!baseRate) return null
  const derived = {}
  for (const [code, rate] of Object.entries(rates)) derived[code] = rate / baseRate
  return derived
}
function formatCacheAge(fetchedAt) {
  if (!fetchedAt) return ''
  const mins = Math.floor((Date.now() - fetchedAt) / 60_000)
  if (mins < 60)  return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24)     return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatAmount(value, format, symbol) {
  const num = parseFloat(value)
  if (isNaN(num)) return '—'
  const locale = format === 'eu' ? 'de-DE' : 'en-US'
  const formatted = num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return symbol ? `${symbol} ${formatted}` : formatted
}

// Browser ICU data (Intl) has no distinct Latin-script symbol for these —
// only the bare code, or a non-Latin abbreviation (Arabic/Cyrillic/Amharic...)
// that would look inconsistent next to the rest of the list. Common informal
// Latin abbreviations, filling the gap Intl leaves for these currencies.
const SYMBOL_FALLBACKS = {
  AED: 'Dhs', ALL: 'L', ANG: 'ƒ', AWG: 'Afl.', BGN: 'lv', BHD: 'BD', BIF: 'FBu',
  BTN: 'Nu.', BYN: 'Br', CDF: 'FC', CHF: 'Fr.', CVE: 'Esc.', DJF: 'Fdj', DZD: 'DA',
  ERN: 'Nfk', ETB: 'Br', GMD: 'D', HTG: 'G', IQD: 'ID', IRR: 'Rls', JOD: 'JD',
  KES: 'KSh', KWD: 'KD', LSL: 'L', LYD: 'LD', MAD: 'DH', MDL: 'L', MKD: 'den.',
  MOP: 'P', MRU: 'UM', MVR: 'Rf', MWK: 'MK', MZN: 'MT', OMR: 'RO', PAB: 'B/.',
  PEN: 'S/', PGK: 'K', QAR: 'QR', RSD: 'din.', SAR: 'SR', SCR: 'SR', SDG: 'LS',
  SLE: 'Le', SOS: 'Sh', SZL: 'E', TJS: 'SM', TMT: 'm.', TND: 'DT', TZS: 'TSh',
  UGX: 'USh', UZS: "so'm", VES: 'Bs.', VUV: 'VT', WST: 'WS$', YER: 'YR',
}
const symbolCache = {}
function currencySymbol(code) {
  if (code in symbolCache) return symbolCache[code]
  let symbol = null
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(1)
    symbol = parts.find(p => p.type === 'currency')?.value || null
  } catch { symbol = null }
  if (symbol && symbol.toUpperCase() === code) symbol = SYMBOL_FALLBACKS[code] || null
  symbolCache[code] = symbol
  return symbol
}
function formatRate(rate, format) {
  const locale = format === 'eu' ? 'de-DE' : 'en-US'
  return parseFloat(rate).toLocaleString(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

function FlagIcon({ code, size = 22 }) {
  const meta = CURRENCY_BY_CODE[code]
  const Flag = meta && Flags[meta.country]
  if (!Flag) {
    return <span style={{ width: size, height: size * 0.667, borderRadius: 3, display: 'inline-block', background: 'var(--cp-bg3)', flexShrink: 0 }} />
  }
  return (
    <Flag
      title={meta.name}
      style={{ width: size, height: size * 0.667, borderRadius: 3, display: 'block', flexShrink: 0, boxShadow: '0 0 0 1px var(--cp-border2)' }}
    />
  )
}

// Backdrop + panel wrapper shared by the base-currency picker and the edit-list picker
function Overlay({ onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div className="cp-card-bg2" onClick={e => e.stopPropagation()} style={{
        border: '1px solid var(--cp-border2)', borderRadius: 8,
        width: '100%', maxWidth: 380, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <input
      autoFocus
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="cp-input"
      style={{ margin: 12, marginBottom: 8 }}
    />
  )
}

function matches(c, q) {
  if (!q) return true
  const s = q.trim().toLowerCase()
  return c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s)
}

export default function CurrencyCalculator() {
  const { currency, setCurrencyAmount, setCurrencyBase, setCurrencyList, resetCurrency, settings } = useCalculatorStore()
  const { amount, base, list } = currency

  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(false)
  const [rateSource, setRateSource] = useState(null)
  const [rateDate, setRateDate] = useState(null)
  const [rateFetchedAt, setRateFetchedAt] = useState(null)
  const [fetchTrigger, setFetchTrigger] = useState(0)

  const [baseOpen, setBaseOpen] = useState(false)
  const [baseSearch, setBaseSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  const dragIndex = useRef(null)

  const handleReset = () => {
    resetCurrency()
    setRateSource(null); setRateDate(null); setRateFetchedAt(null); setRates({})
  }

  // ── Re-fetch live rate when connectivity is restored ───────────────────
  useEffect(() => {
    const handleOnline = () => setFetchTrigger(t => t + 1)
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  // Fetch live rates for the current base, falling back to the anchor cache
  // (derived cross-rates) when offline, and to the static table only if no
  // anchor has ever been cached at all.
  useEffect(() => {
    let cancelled = false
    const doFetch = async () => {
      const anchorCache = loadAnchorCache()
      const derived = deriveRates(anchorCache, base)
      if (derived) {
        setRateSource('cached'); setRateDate(anchorCache.date); setRateFetchedAt(anchorCache.fetchedAt); setRates(derived)
      }

      if (!navigator.onLine) {
        if (!derived) { setRateSource(anchorCache ? 'offline' : 'never-cached'); setRateDate(null); setRateFetchedAt(null); setRates(hardcodedRates(base)) }
        setLoading(false)
        return
      }

      if (!derived) setLoading(true)
      try {
        const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${base}`, { signal: AbortSignal.timeout(5000) })
        if (!response.ok) throw new Error('non-200')
        const data = await response.json()
        if (cancelled) return
        saveAnchorCache(base, data.rates, data.date)
        setRateSource('live'); setRateDate(data.date || new Date().toISOString().split('T')[0]); setRateFetchedAt(null); setRates(data.rates)
      } catch {
        if (cancelled) return
        if (!derived) { setRateSource(anchorCache ? 'offline' : 'never-cached'); setRateDate(null); setRateFetchedAt(null); setRates(hardcodedRates(base)) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    doFetch()
    return () => { cancelled = true }
  }, [base, fetchTrigger])

  const moveItem = (from, to) => {
    if (to < 0 || to >= list.length) return
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setCurrencyList(next)
  }

  const removeFromList = (code) => setCurrencyList(list.filter(c => c !== code))
  const toggleInList = (code) => setCurrencyList(list.includes(code) ? list.filter(c => c !== code) : [...list, code])

  const selectBase = (code) => {
    setCurrencyBase(code)
    setBaseOpen(false); setBaseSearch('')
  }

  const baseMeta = CURRENCY_BY_CODE[base]
  const amountNum = parseFloat(amount)
  const amountInvalid = amount !== '' && isNaN(amountNum)

  const baseResults = CURRENCIES.filter(c => c.code !== base && matches(c, baseSearch))
  const pickerResults = CURRENCIES.filter(c => c.code !== base && matches(c, pickerSearch))

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ResetButton onReset={handleReset} />

      <div>
        <div className="cp-label" style={{ marginBottom: 6 }}>Amount</div>
        <input
          type="number"
          value={amount}
          onChange={e => setCurrencyAmount(e.target.value)}
          placeholder="Enter amount"
          className="cp-input"
          style={{ fontSize: 18, borderColor: amountInvalid ? 'var(--cp-red)' : undefined }}
        />
        {amountInvalid && (
          <div style={{ fontSize: 11, color: 'var(--cp-red)', marginTop: 4, letterSpacing: '0.06em', fontFamily: 'var(--cb-font-mono)' }}>
            Enter a valid number
          </div>
        )}
      </div>

      <div>
        <div className="cp-label" style={{ marginBottom: 6 }}>Default currency</div>
        <button
          onClick={() => setBaseOpen(true)}
          className="cp-input"
          style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--cb-font-mono)' }}
        >
          <FlagIcon code={base} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{base}</span>
          {currencySymbol(base) && <span style={{ fontSize: 12, color: 'var(--cp-dim)' }}>{currencySymbol(base)}</span>}
          <span style={{ fontSize: 12, color: 'var(--cp-dim)', flex: 1 }}>{baseMeta?.name}</span>
          <span style={{ color: 'var(--cp-dim)' }}>▾</span>
        </button>
      </div>

      <div className="cp-divider" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="cp-section-header" style={{ margin: 0 }}>Converted to</div>
        <button onClick={() => setPickerOpen(true)} className="cp-btn" style={{ fontSize: 11, padding: '6px 12px' }}>
          + Edit list
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--cp-dim)', textAlign: 'center', padding: '20px 0' }}>
            No currencies in your list — tap "+ Edit list" to add some.
          </div>
        )}
        {list.map((code, i) => {
          const rate = rates[code]
          const symbol = currencySymbol(code)
          const converted = (!isNaN(amountNum) && rate) ? formatAmount(amountNum * rate, settings.numberFormat, symbol) : '—'
          const meta = CURRENCY_BY_CODE[code]
          return (
            <div
              key={code}
              draggable
              onDragStart={() => { dragIndex.current = i }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragIndex.current !== null) { moveItem(dragIndex.current, i); dragIndex.current = null } }}
              style={{
                background: 'var(--cp-bg3)', border: '1px solid var(--cp-border2)', borderRadius: 6,
                padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{ cursor: 'grab', color: 'var(--cp-dim)', fontSize: 14, lineHeight: 1 }} title="Drag to reorder">⠿</span>
              <FlagIcon code={code} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--cb-font-mono)' }}>{code}</span>
                  {symbol && <span style={{ fontSize: 11, color: 'var(--cp-dim)', fontFamily: 'var(--cb-font-mono)' }}>{symbol}</span>}
                  <span style={{ fontSize: 10, color: 'var(--cp-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta?.name}</span>
                </div>
                {rate && (
                  <div style={{ fontSize: 9, color: 'var(--cp-dim)', letterSpacing: '0.05em', marginTop: 2 }}>
                    1 {base} = {formatRate(rate, settings.numberFormat)} {code}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--cp-green)', fontFamily: 'var(--cb-font-mono)', whiteSpace: 'nowrap' }}>
                {loading && !rate ? '···' : converted}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => moveItem(i, i - 1)} disabled={i === 0} className="cp-btn" style={{ padding: '0 6px', fontSize: 9, lineHeight: '14px', border: 'none', opacity: i === 0 ? 0.3 : 1 }}>▲</button>
                <button onClick={() => moveItem(i, i + 1)} disabled={i === list.length - 1} className="cp-btn" style={{ padding: '0 6px', fontSize: 9, lineHeight: '14px', border: 'none', opacity: i === list.length - 1 ? 0.3 : 1 }}>▼</button>
              </div>
              <button onClick={() => removeFromList(code)} className="cp-btn-danger" style={{ padding: '4px 8px', fontSize: 12, border: 'none' }} title="Remove">×</button>
            </div>
          )
        })}
      </div>

      {rateSource && !loading && (
        <div className="cp-card-bg3" style={{
          border: `1px solid ${rateSource === 'cached' ? 'rgba(63,224,197,0.2)' : rateSource === 'live' ? 'var(--cp-border2)' : 'rgba(245,197,66,0.3)'}`,
          borderRadius: 4, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ fontSize: 10, color: rateSource === 'cached' ? 'var(--cp-acc)' : rateSource === 'live' ? 'var(--cp-green)' : 'var(--cp-yellow)', letterSpacing: '0.15em', fontWeight: 700 }}>
            {rateSource === 'live' ? '● LIVE RATE' : rateSource === 'cached' ? '● CACHED RATE' : rateSource === 'never-cached' ? '⚠ NO RATES CACHED YET' : '⚠ OFFLINE RATE'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.08em', lineHeight: 1.6 }}>
            {rateSource === 'live' ? (
              <>Source: ExchangeRate-API (exchangerate-api.com)<br />Effective date: {rateDate} (UTC) · Rates updated daily</>
            ) : rateSource === 'cached' ? (
              <>Source: ExchangeRate-API (last downloaded {formatCacheAge(rateFetchedAt)})<br />Effective date: {rateDate} (UTC) · Connect to refresh</>
            ) : rateSource === 'never-cached' ? (
              <>Connect to the internet once to download accurate exchange rates.<br />Showing rough built-in estimates for major currencies only</>
            ) : (
              <>Source: Built-in fallback rates (no internet connection)<br />These rates are approximate and may not reflect current market values</>
            )}
          </div>
        </div>
      )}

      {baseOpen && (
        <Overlay onClose={() => { setBaseOpen(false); setBaseSearch('') }}>
          <div className="cp-label" style={{ padding: '12px 12px 0' }}>Select default currency</div>
          <SearchInput value={baseSearch} onChange={setBaseSearch} placeholder="Search code or name…" />
          <div style={{ overflowY: 'auto', flex: 1, padding: '0 6px 6px' }}>
            {baseResults.map(c => (
              <button
                key={c.code}
                onClick={() => selectBase(c.code)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '8px 8px', background: 'transparent', border: 'none', borderRadius: 4,
                  cursor: 'pointer', color: 'var(--cp-txt)', fontFamily: 'var(--cb-font-mono)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--cp-bg3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <FlagIcon code={c.code} />
                <span style={{ fontSize: 13, fontWeight: 700, width: 44 }}>{c.code}</span>
                <span style={{ fontSize: 12, color: 'var(--cp-dim)', width: 20 }}>{currencySymbol(c.code)}</span>
                <span style={{ fontSize: 12, color: 'var(--cp-dim)' }}>{c.name}</span>
              </button>
            ))}
            {baseResults.length === 0 && <div style={{ padding: 16, fontSize: 12, color: 'var(--cp-dim)', textAlign: 'center' }}>No matches</div>}
          </div>
        </Overlay>
      )}

      {pickerOpen && (
        <Overlay onClose={() => { setPickerOpen(false); setPickerSearch('') }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 0' }}>
            <div className="cp-label" style={{ margin: 0 }}>Currencies to show ({list.length})</div>
            <button onClick={() => { setPickerOpen(false); setPickerSearch('') }} className="cp-btn" style={{ padding: '4px 10px', fontSize: 11 }}>Done</button>
          </div>
          <SearchInput value={pickerSearch} onChange={setPickerSearch} placeholder="Search code or name…" />
          <div style={{ overflowY: 'auto', flex: 1, padding: '0 6px 6px' }}>
            {pickerResults.map(c => {
              const checked = list.includes(c.code)
              return (
                <label
                  key={c.code}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '8px 8px', borderRadius: 4, cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--cp-bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleInList(c.code)} style={{ accentColor: 'var(--cp-acc)' }} />
                  <FlagIcon code={c.code} />
                  <span style={{ fontSize: 13, fontWeight: 700, width: 44, fontFamily: 'var(--cb-font-mono)' }}>{c.code}</span>
                  <span style={{ fontSize: 12, color: 'var(--cp-dim)', width: 20 }}>{currencySymbol(c.code)}</span>
                  <span style={{ fontSize: 12, color: 'var(--cp-dim)' }}>{c.name}</span>
                </label>
              )
            })}
            {pickerResults.length === 0 && <div style={{ padding: 16, fontSize: 12, color: 'var(--cp-dim)', textAlign: 'center' }}>No matches</div>}
          </div>
        </Overlay>
      )}
    </div>
  )
}
