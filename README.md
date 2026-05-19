# Pilot Calculator

A web-based multi-function calculator designed for pilots, featuring engine inoperative (EDTO) calculations, scientific, time, currency exchange, and interpolation tools.

## Features

### 1. **EDTO Calculator** (Engine Inoperative)
- Calculate cruise altitude capability with one engine inoperative
- Supports Boeing 737-8 (LEAP-1B25, LEAP-1B27) and 737-800 (CFM56-7B24, CFM56-7B26)
- Dual outputs: Long Range Cruise Altitude & 310 KIAS Altitude
- Anti-ice penalty adjustments (engine only / engine + wing)
- Real-time interpolation based on weight and ISA temperature deviation

### 2. **Normal Calculator**
- Basic arithmetic operations (+, −, ×, ÷)
- Clear and decimal support

### 3. **Scientific Calculator**
- Trigonometric functions (sin, cos, tan in degrees)
- Logarithmic functions (log₁₀, ln)
- Power operations (√, x²)
- Reciprocal (1/x)
- Constants (π, e)
- 10 significant figures precision

### 4. **Time Calculator**
- HH:MM format time operations
- Quick add/subtract functions (+15 min, +30 min, +1 hour)
- Decimal hour conversion
- Total minutes display

### 5. **Currency Exchange**
- Real-time exchange rates (with offline fallback)
- 15 major currencies supported
- Automatic calculation as you type
- 2 decimal place precision

### 6. **Interpolation Calculator**
- General linear interpolation tool
- Formula: y = y₁ + (x - x₁) × (y₂ - y₁) / (x₂ - x₁)
- Useful for performance table lookups beyond standard data points

## Technology Stack

- **Frontend**: React 18 with TypeScript support
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **PWA**: Service Worker for offline capability
- **Deployment**: Ready for Vercel/Netlify

## Installation

```bash
cd pilot-calculator
npm install
```

## Development

```bash
npm run dev
```

Runs the app in development mode at `http://localhost:3000`

## Building

```bash
npm run build
```

Builds the app for production in the `dist` folder.

## Deployment

### Vercel (Recommended)

1. Push code to GitHub/GitLab/Bitbucket
2. Import project in Vercel dashboard
3. Configure build command: `npm run build`
4. Deploy

### Manual Deployment

1. Run `npm run build`
2. Deploy `dist` folder to your web server
3. Ensure service worker (`public/sw.js`) is served at the root

## PWA Features

- **Offline Support**: All calculator functions work offline
- **Installable**: Add to home screen on mobile
- **Fast Loading**: Optimized assets with service worker caching
- **Dark Mode**: Toggle between light and dark themes

## EDTO Lookup Tables

Embedded lookup tables for:
- B737-8 LEAP-1B25 (PI.13.9, PI.23.9)
- B737-8 LEAP-1B27 (PI.33.9)
- B737-800 CFM56-7B24 (PI.13.8, Section 3.3.2)
- B737-800 CFM56-7B26 (PI.23.8, PI.33.8, Section 3.3.2)

Tables include 310 KIAS and Long Range Cruise calculations with anti-ice penalties.

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 15+
- Edge 90+

## File Structure

```
pilot-calculator/
├── public/
│   └── sw.js                    # Service worker
├── src/
│   ├── components/
│   │   ├── EDTOCalculator.jsx
│   │   ├── NormalCalculator.jsx
│   │   ├── ScientificCalculator.jsx
│   │   ├── TimeCalculator.jsx
│   │   ├── CurrencyCalculator.jsx
│   │   └── InterpolationCalculator.jsx
│   ├── data/
│   │   └── lookupTables.json    # Boeing performance tables
│   ├── store/
│   │   └── calculatorStore.js   # Zustand state management
│   ├── utils/
│   │   └── interpolation.js     # Interpolation logic
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── manifest.json                # PWA manifest
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## Performance Optimization

- Lookup tables embedded as JSON (no server calls)
- Real-time calculation with React hooks
- Service worker caching strategy (network first, fallback to cache)
- Minimal bundle size (~150KB gzipped)

## License

Internal use only

## Support

For EDTO calculation questions, refer to Boeing 737 Flight Crew Operations Manual sections:
- PI.13.8 / PI.13.9 (Long Range Cruise)
- PI.23.8 / PI.23.9 (AOA-DIAL)
- PI.33.8 / PI.33.9 (Alternate Long Range Cruise)
- OI.10.1 / Section 3.3.2 (310 KIAS)
