import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './oxygen.css' // after index.css so it loads after it
import { installKeyboardArea } from './keyboardArea'
import { installLiveEffects } from './liveEffects'

installKeyboardArea()
installLiveEffects()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
