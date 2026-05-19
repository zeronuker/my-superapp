import React, { useEffect, useState } from 'react'
import { useCalculatorStore } from '../store/calculatorStore'

const REGIONS = [
  { label: 'Americas',              codes: ['USD','CAD','MXN'] },
  { label: 'Europe',                codes: ['EUR','GBP','CHF','SEK','NOK'] },
  { label: 'Middle East',           codes: ['AED','SAR','QAR','KWD','BHD','OMR'] },
  { label: 'South Asia',            codes: ['INR','PKR','BDT'] },
  { label: 'East & Southeast Asia', codes: ['CNY','JPY','KRW','TWD','HKD','SGD','THB','MYR','IDR','PHP','VND'] },
  { label: 'Oceania',               codes: ['AUD','NZD'] },
]

// Approximate USD base rates for offline fallback
const USD_RATES = {
  USD:1.000, CAD:1.360, MXN:17.05,
  EUR:0.920, GBP:0.730, CHF:0.880, SEK:10.48, NOK:10.48,
  AED:3.673, SAR:3.750, QAR:3.640, KWD:0.307, BHD:0.376, OMR:0.385,
  INR:83.12, PKR:278.0, BDT:110.0,
  CNY:7.240, JPY:149.5, KRW:1350.0, TWD:32.00, HKD:7.810,
  SGD:1.340, THB:36.00, MYR:4.700, IDR:16000, PHP:56.00, VND:25000,
  AUD:1.520, NZD:1.650,
}

function offlineRate(from, to) {
  const fromUSD = USD_RATES[from] || 1
  const toUSD = USD_RATES[to] || 1
  return toUSD / fromUSD
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

  const fetchRate = async (from, to) => {
    setLoading(true)
    try {
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${from}`, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error()
      const data = await response.json()
      setRateSource('live')
      setRateDate(data.date || new Date().toISOString().split('T')[0])
      return data.rates[to] || offlineRate(from, to)
    } catch {
      setRateSource('offline')
      setRateDate(null)
      return offlineRate(from, to)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const convert = async () => {
      if (!currency.amount) { setCurrencyResult(1, ''); return }
      const rate = await fetchRate(currency.fromCurrency, currency.toCurrency)
      setCurrencyResult(rate, formatResult(parseFloat(currency.amount) * rate, settings.numberFormat))
    }
    convert()
  }, [currency.amount, currency.fromCurrency, currency.toCurrency])

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
          style={{ fontSize: 18 }}
        />
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
        borderLeft: `3px solid ${rateSource === 'offline' ? 'var(--cp-yellow)' : rateSource === 'live' ? 'var(--cp-green)' : 'var(--cp-border2)'}`,
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
            {rateSource && currency.rate && (
              <div style={{ fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.1em', marginTop: 6 }}>
                1 {currency.fromCurrency} = {formatRate(currency.rate, settings.numberFormat)} {currency.toCurrency}
              </div>
            )}
          </>
        )}
      </div>

      {/* Rate source notice */}
      {rateSource && !loading && (
        <div style={{
          background: 'var(--cp-bg3)',
          border: `1px solid ${rateSource === 'offline' ? 'rgba(245,197,66,0.3)' : 'var(--cp-border2)'}`,
          borderRadius: 4, padding: '10px 14px',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ fontSize: 10, color: rateSource === 'offline' ? 'var(--cp-yellow)' : 'var(--cp-green)', letterSpacing: '0.15em', fontWeight: 700 }}>
            {rateSource === 'live' ? '● LIVE RATE' : '⚠ OFFLINE RATE'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--cp-dim)', letterSpacing: '0.08em', lineHeight: 1.6 }}>
            {rateSource === 'live' ? (
              <>Source: ExchangeRate-API (exchangerate-api.com)<br />Effective date: {rateDate} (UTC) · Rates updated daily</>
            ) : (
              <>Source: Built-in fallback rates (no internet connection)<br />These rates are approximate and may not reflect current market values</>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
