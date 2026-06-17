import React, { useEffect, useState, useRef } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'

const REGIONS = [
  { label: 'Americas',              codes: ['USD','CAD','MXN'] },
  { label: 'Europe',                codes: ['EUR','GBP','CHF','SEK','NOK'] },
  { label: 'Middle East',           codes: ['AED','SAR','QAR','KWD','BHD','OMR'] },
  { label: 'South Asia',            codes: ['INR','PKR','BDT'] },
  { label: 'East & Southeast Asia', codes: ['CNY','JPY','KRW','TWD','HKD','SGD','THB','MYR','IDR','PHP','VND'] },
  { label: 'Oceania',               codes: ['AUD','NZD'] },
]

// Last-resort hardcoded rates (USD base, circa 2024) — used only when no
// cached live rates exist AND the device is offline.
const USD_RATES = {
  USD:1.000, CAD:1.360, MXN:17.05,
  EUR:0.920, GBP:0.730, CHF:0.880, SEK:10.48, NOK:10.48,
  AED:3.673, SAR:3.750, QAR:3.640, KWD:0.307, BHD:0.376, OMR:0.385,
  INR:83.12, PKR:278.0, BDT:110.0,
  CNY:7.240, JPY:149.5, KRW:1350.0, TWD:32.00, HKD:7.810,
  SGD:1.340, THB:36.00, MYR:4.700, IDR:16000, PHP:56.00, VND:25000,
  AUD:1.520, NZD:1.650,
}

function hardcodedRate(from, to) {
  const fromUSD = USD_RATES[from] || 1
  const toUSD   = USD_RATES[to]   || 1
  return toUSD / fromUSD
}

// ── Rate cache (per base currency) ───────────────────────────────────────────
function loadRatesCache(base) {
  try { const r = localStorage.getItem(`cb-rates-${base}`); return r ? JSON.parse(r) : null }
  catch { return null }
}
function saveRatesCache(base, rates, date) {
  try { localStorage.setItem(`cb-rates-${base}`, JSON.stringify({ rates, date, fetchedAt: Date.now() })) }
  catch {}
}
function getCachedRate(from, to) {
  const c = loadRatesCache(from)
  const rate = c?.rates?.[to]
  if (!rate) return null
  return { rate, date: c.date, fetchedAt: c.fetchedAt }
}
function formatCacheAge(fetchedAt) {
  if (!fetchedAt) return ''
  const mins = Math.floor((Date.now() - fetchedAt) / 60_000)
  if (mins < 60)  return `${mins}m ago`
  const h = Math.floor(mins / 60)
  if (h < 24)     return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function formatResult(value, format) {
  const num = parseFloat(value)
  if (isNaN(num)) return ''
  const locale = format === 'eu' ? 'de-DE' : 'en-US'
  return num.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatRate(rate, format) {
  const locale = format === 'eu' ? 'de-DE' : 'en-US'
  return parseFloat(rate).toLocaleString(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

export default function CurrencyCalculator() {
  const { currency, setCurrencyValues, setCurrencyResult, settings } = useCalculatorStore()
  const [loading, setLoading] = useState(false)
  const [rateSource, setRateSource] = useState(null)
  const [rateDate, setRateDate] = useState(null)
  const [rateFetchedAt, setRateFetchedAt] = useState(null)

  // Local rate mirrors Zustand — avoids extra round-trip through the store
  // when recalculating on amount/format changes.
  const [fetchedRate, setFetchedRate] = useState(() => currency.rate || 1)
  const [fetchTrigger, setFetchTrigger] = useState(0)
  const calcRef = useRef(null)

  // ── Re-fetch live rate when connectivity is restored ───────────────────
  useEffect(() => {
    const handleOnline = () => setFetchTrigger(t => t + 1)
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  // ── Effect A: fetch rate when currencies change (not debounced — triggered by clicks, not keystrokes) ──
  useEffect(() => {
    let cancelled = false

    const doFetch = async () => {
      // Show cached rates immediately for instant display
      const cached = getCachedRate(currency.fromCurrency, currency.toCurrency)
      if (cached) {
        setRateSource('cached')
        setRateDate(cached.date)
        setRateFetchedAt(cached.fetchedAt)
        setFetchedRate(cached.rate)
      }

      // Guard: if offline, use cache or fall back to hardcoded rates
      if (!navigator.onLine) {
        if (!cached) {
          setRateSource('offline')
          setRateDate(null)
          setRateFetchedAt(null)
          setFetchedRate(hardcodedRate(currency.fromCurrency, currency.toCurrency))
        }
        setLoading(false)
        return
      }

      // Only show spinner when there's nothing cached to display yet
      if (!cached) setLoading(true)
      try {
        const response = await fetch(
          `https://api.exchangerate-api.com/v4/latest/${currency.fromCurrency}`,
          { signal: AbortSignal.timeout(5000) }
        )
        if (!response.ok) throw new Error('non-200')
        const data = await response.json()
        if (cancelled) return
        const rate = data.rates[currency.toCurrency] || hardcodedRate(currency.fromCurrency, currency.toCurrency)
        saveRatesCache(currency.fromCurrency, data.rates, data.date)
        setRateSource('live')
        setRateDate(data.date || new Date().toISOString().split('T')[0])
        setRateFetchedAt(null)
        setFetchedRate(rate)
      } catch {
        if (cancelled) return
        if (!cached) {
          setRateSource('offline')
          setRateDate(null)
          setRateFetchedAt(null)
          setFetchedRate(hardcodedRate(currency.fromCurrency, currency.toCurrency))
        }
        // else keep cached rates already shown
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    doFetch()
    return () => { cancelled = true }
  }, [currency.fromCurrency, currency.toCurrency, fetchTrigger])

  // ── Effect B: recalculate result when amount, rate, or format changes ──
  // Debounced (300 ms) so rapid amount typing doesn't fire on every keystroke.
  // Rate and format changes are infrequent, so the 300 ms delay is imperceptible.
  useEffect(() => {
    clearTimeout(calcRef.current)
    calcRef.current = setTimeout(() => {
      if (!currency.amount) {
        setCurrencyResult(fetchedRate, '')
        return
      }
      const num = parseFloat(currency.amount)
      if (isNaN(num)) {
        setCurrencyResult(fetchedRate, '')
        return
      }
      setCurrencyResult(fetchedRate, formatResult(num * fetchedRate, settings.numberFormat))
    }, 300)
    return () => clearTimeout(calcRef.current)
  }, [currency.amount, fetchedRate, settings.numberFormat])

  const selectStyle = {
    background: 'var(--cp-bginput)', border: '1px solid var(--cp-border)',
    borderRadius: 4, color: 'var(--cp-txt)', fontFamily: "var(--cb-font-mono)",
    fontSize: 13, padding: '8px 10px', width: '100%', outline: 'none',
  }

  const CurrencySelect = ({ value, onChange }) => (
    <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>
      {REGIONS.map(region => (
        <optgroup key={region.label} label={region.label}>
          {region.codes.map(code => (
            <option key={code} value={code}>{code}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )

  // Validate amount — number inputs return '' for non-numeric values
  const amountInvalid = currency.amount !== '' && isNaN(parseFloat(currency.amount))

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div className="cp-label" style={{ marginBottom: 6 }}>Amount</div>
        <input
          type="number"
          value={currency.amount}
          onChange={e => setCurrencyValues(e.target.value, currency.fromCurrency, currency.toCurrency)}
          placeholder="Enter amount"
          className="cp-input"
          style={{ fontSize: 18, borderColor: amountInvalid ? 'var(--cp-red)' : undefined }}
        />
        {amountInvalid && (
          <div style={{ fontSize: 11, color: 'var(--cp-red)', marginTop: 4,
            letterSpacing: '0.06em', fontFamily: 'var(--cb-font-mono)' }}>
            Enter a valid number
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'end' }}>
        <div>
          <div className="cp-label" style={{ marginBottom: 6 }}>From</div>
          <CurrencySelect value={currency.fromCurrency} onChange={v => setCurrencyValues(currency.amount, v, currency.toCurrency)} />
        </div>
        <button
          onClick={() => setCurrencyValues(currency.amount, currency.toCurrency, currency.fromCurrency)}
          className="cp-btn"
          style={{ padding: '8px 10px', fontSize: 16, lineHeight: 1 }}
          title="Swap currencies"
        >
          ⇄
        </button>
        <div>
          <div className="cp-label" style={{ marginBottom: 6 }}>To</div>
          <CurrencySelect value={currency.toCurrency} onChange={v => setCurrencyValues(currency.amount, currency.fromCurrency, v)} />
        </div>
      </div>

      {/* Result */}
      <div style={{
        background: 'var(--cp-bg3)',
        border: '1px solid var(--cp-border2)',
        borderLeft: `3px solid ${rateSource === 'offline' ? 'var(--cp-yellow)' : rateSource === 'live' ? 'var(--cp-green)' : rateSource === 'cached' ? 'var(--cp-acc)' : 'var(--cp-border2)'}`,
        borderRadius: 4, padding: 20, textAlign: 'center',
      }}>
        {loading ? (
          <div style={{ color: 'var(--cp-dim)', fontSize: 12, letterSpacing: '0.15em' }}>FETCHING RATES...</div>
        ) : (
          <>
            <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--cp-green)', fontFamily: "var(--cb-font-mono)", lineHeight: 1, marginBottom: 8 }}>
              {currency.result || '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--cp-dim)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              {currency.fromCurrency} → {currency.toCurrency}
            </div>
            {rateSource && fetchedRate && (
              <div style={{ fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.1em', marginTop: 6 }}>
                1 {currency.fromCurrency} = {formatRate(fetchedRate, settings.numberFormat)} {currency.toCurrency}
              </div>
            )}
          </>
        )}
      </div>

      {/* Rate source notice */}
      {rateSource && !loading && (
        <div style={{
          background: 'var(--cp-bg3)',
          border: `1px solid ${rateSource === 'offline' ? 'rgba(245,197,66,0.3)' : rateSource === 'cached' ? 'rgba(63,224,197,0.2)' : 'var(--cp-border2)'}`,
          borderRadius: 4, padding: '10px 14px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ fontSize: 10, color: rateSource === 'offline' ? 'var(--cp-yellow)' : rateSource === 'cached' ? 'var(--cp-acc)' : 'var(--cp-green)', letterSpacing: '0.15em', fontWeight: 700 }}>
            {rateSource === 'live' ? '● LIVE RATE' : rateSource === 'cached' ? '● CACHED RATE' : '⚠ OFFLINE RATE'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.08em', lineHeight: 1.6 }}>
            {rateSource === 'live' ? (
              <>Source: ExchangeRate-API (exchangerate-api.com)<br />Effective date: {rateDate} (UTC) · Rates updated daily</>
            ) : rateSource === 'cached' ? (
              <>Source: ExchangeRate-API (last downloaded {formatCacheAge(rateFetchedAt)})<br />Effective date: {rateDate} (UTC) · Connect to refresh</>
            ) : (
              <>Source: Built-in fallback rates (no internet connection)<br />These rates are approximate and may not reflect current market values</>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
