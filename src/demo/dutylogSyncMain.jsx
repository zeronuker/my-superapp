import React from 'react'
import ReactDOM from 'react-dom/client'
import DutyLogSyncDemo from './DutyLogSyncDemo.jsx'
import '../index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <div style={{ minHeight: '100vh', background: 'var(--cp-bg)', padding: '32px 16px', boxSizing: 'border-box' }}>
      <div style={{
        maxWidth: 440, margin: '0 auto 20px', fontFamily: 'var(--cb-font-mono)',
        fontSize: 11, letterSpacing: '0.15em', color: 'var(--cp-acc)', textTransform: 'uppercase',
      }}>
        Duty Log cloud sync — interactive mockup
      </div>
      <DutyLogSyncDemo />
    </div>
  </React.StrictMode>,
)
