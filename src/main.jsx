import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './oxygen.css' // after index.css so it loads after it
import { installKeyboardArea } from './keyboardArea'
import { installLiveEffects } from './liveEffects'

installKeyboardArea()
installLiveEffects()

// Ask the browser not to clear the saved duty logs and briefings when the device runs low on space.
// Chrome and Safari answer silently; Firefox may ask once. A refusal changes nothing.
navigator.storage?.persist?.().catch(() => {})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
