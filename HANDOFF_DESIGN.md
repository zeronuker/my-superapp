# ClaudeBorne SuperApp — Design Handoff Brief
> For use with Claude Design when redesigning or extending the app's visual language.

---

## What This App Is

**ClaudeBorne SuperApp** is a professional aviation calculator PWA used by pilots on iPad and iPhone (primary), Android tablets, and desktop browsers. It needs to feel like cockpit instrumentation — precise, high-contrast, nothing decorative that isn't functional.

**User persona:** Commercial airline pilot. Uses this on the flight deck or in pre-flight planning. Expects information-dense layouts, zero ambiguity, and instant readability at a glance.

---

## Brand Identity

### Name & Logo
- Brand name: **CLAUDEBORNE**
- App name: **CLAUDEBORNE SUPERAPP**
- Logo mark: SVG "C" letterform in Tourney Bold, dark navy background (#0a1020), surrounded by a partial square frame (polyline, not a full border) inset to a safe zone
- Logo files:
  - `/public/brand/logo-mark.svg` — dark mode version (mint/blue gradient "C")
  - `/public/brand/logo-mark-light.svg` — light mode version (deeper gradient)
  - `/public/brand/logo.svg` — full wordmark
  - `/public/brand/logo-light.svg` — full wordmark light mode

### Brand Voice
Cockpit-grade. Terse. Uppercase labels. Monospaced data. No decorative flourishes — every visual element serves legibility or hierarchy.

---

## Design Token System

All tokens live in `/public/brand/brand.css`. They use CSS custom properties and auto-switch between dark and light mode via `[data-theme="light"]` on `<html>`.

### Color Palette

#### Dark Mode (default)
| Token | Hex | Role |
|-------|-----|------|
| `--cb-surface-0` | `#0a1020` | Page background |
| `--cb-surface-1` | `#141a2e` | Card / panel background |
| `--cb-surface-2` | `#1b2340` | Elevated surface |
| `--cb-surface-3` | `#232c4d` | Hover state |
| `--cb-mint` | `#3FE0C5` | Primary accent (buttons, active tabs, results) |
| `--cb-blue` | `#3B8DFF` | Secondary accent (310 KIAS results, links) |
| `--cb-violet` | `#5B6BFF` | Tertiary accent (π button, gradient end) |
| `--cb-ink` | `#e8ecf5` | Primary text |
| `--cb-ink-2` | `#b8c0d4` | Secondary text / muted values |
| `--cb-ink-dim` | `#7c87a3` | Labels, placeholders, timestamps |
| `--cb-line` | `rgba(255,255,255,0.07)` | Subtle borders |
| `--cb-line-2` | `rgba(255,255,255,0.12)` | Standard borders |

#### Light Mode
| Token | Hex | Role |
|-------|-----|------|
| `--cb-surface-0` | `#f4f6fb` | Page background |
| `--cb-surface-1` | `#ffffff` | Card background |
| `--cb-surface-2` | `#ebeef7` | Elevated |
| `--cb-surface-3` | `#dfe3f0` | Hover |
| `--cb-mint` | `#1CC2A3` | Primary accent (deepened for contrast on white) |
| `--cb-blue` | `#1F76E8` | Secondary accent |
| `--cb-violet` | `#4554DA` | Tertiary accent |
| `--cb-ink` | `#0a1020` | Primary text |
| `--cb-ink-2` | `#3a4258` | Secondary text |
| `--cb-ink-dim` | `#6b7488` | Labels |

#### Status colors (not in brand.css — defined in index.css)
| Token | Dark hex | Light hex | Role |
|-------|----------|-----------|------|
| `--cp-green` | `#4ade80` | `#14522a` | Success, live rates, confirmed |
| `--cp-yellow` | `#fcd34d` | `#6b3d00` | Warning, offline fallback, clamped values |
| `--cp-orange` | `#fdba74` | `#7c2a00` | Anti-ice penalty |
| `--cp-red` | `#f87171` | `#8b1212` | Error, danger buttons |
| `--cp-purple` | `--cb-violet` | same | π constant button |

### Brand Gradient
```css
--cb-grad: linear-gradient(135deg, #3FE0C5 0%, #3B8DFF 55%, #5B6BFF 100%)
```
Used on: wordmark text (gradient clip), header logo text, active accent fills.

---

## Typography

| Role | Font | Weights | Usage |
|------|------|---------|-------|
| Display | **Tourney** | 500, 700, 900 | Logo mark, wordmark only |
| Body | **Inter** | 400, 500, 600, 700 | Body copy, general text |
| Monospace | **JetBrains Mono** | 400, 500, 700 | ALL data values, labels, buttons, inputs, results |

> **Rule:** Almost everything interactive is JetBrains Mono. Inter is only for paragraph text (currently not used much). Tourney is only for the brand name.

### Type scale in use
| Element | Size | Weight | Tracking |
|---------|------|--------|---------|
| Section labels (`.cp-label`) | 11px | 400 | 0.18em |
| Section titles (`.cp-section-title`) | 11px | 400 | 0.20em |
| Tab buttons | 11px | 700 | 0.15em |
| Calculator buttons (large) | 22px | 700 | 0.05em |
| Calculator results (large) | 32–36px | 700 | 0.05em |
| Wordmark | 13px | 700 | 0.22em |
| Small metadata | 9–11px | 400 | 0.08–0.20em |

All labels and buttons are **uppercase**.

---

## Layout

### Shell structure
```
Header (64px approx)
  └─ Logo mark + wordmark / Settings button + Reset All button

Tab bar (horizontal scroll, no scrollbar)
  └─ 7 tabs: Normal · Scientific · Time · Interpolation · EDTO · Currency · METAR/TAF

Main content area (max-width: 960px, centered)
  └─ White-bordered card (4px border-radius)
      └─ Active calculator content

Footer (1 line, centered, dimmed)
```

### Calculator content widths
| Calculator | Max-width |
|------------|-----------|
| Normal, Time | 380px (centered) |
| Scientific | 440px (centered) |
| Currency | 400px (centered) |
| EDTO, Interpolation | Full (up to 960px) |
| METAR/TAF | 860px (centered) |

### Grid system
No formal grid — calculators use CSS Grid inline (`gridTemplateColumns`). Common patterns:
- `repeat(4, 1fr)` — calculator button grids
- `1fr 1fr` — two-column inputs
- `1fr auto 1fr` — from/swap/to currency layout
- `repeat(auto-fill, minmax(150px, 1fr))` — enroute alternate inputs

---

## Component Inventory

### Buttons

**Tab buttons** (`.cp-tab`)
- Inactive: transparent bg, dim text, `border-bottom: none`
- Active: `bg: --cb-surface-1`, mint text, `inset 0 3px 0 0 var(--cp-acc)` top-shadow accent

**Calculator number buttons** (inline style: `BTN.num`)
- `--cb-surface-2` bg, primary text, `border: 1px solid --cb-line-2`
- Press: scale(0.91), opacity 0.65
- Hover: scale(0.97), opacity 0.85

**Operator buttons** (inline style: `BTN.op` / `BTN.opActive`)
- Inactive: `--cb-accdim` bg (very dark mint tint), mint text
- Active (operation pending): mint border + box-shadow glow

**Action buttons** (Clear, Equals)
- Clear: red-tinted bg, red text/border
- Equals: green-tinted bg, green text/border

**Ghost buttons** (`.cp-btn`)
- Transparent bg, dim border, dim text
- Hover: blue border, muted text

**Choice buttons** (EDTO aircraft/variant/anti-ice selection)
- Same as ghost but: active state gets mint/yellow/red accent border + `--cb-accdim` bg

### Inputs (`.cp-input`)
- `--cb-surface-1` bg, `border: 1px solid --cb-line-2`
- Focus: border turns mint
- Placeholder: dim text
- Monospace font, 13px

### Cards / Result displays
- Outer: `--cb-surface-2` bg, `--cb-line-2` border, 4px radius
- Accent variant: 3px left border in the result's accent colour
- Result value: 28–36px bold monospace in accent colour
- Unit line: 11px dimmed, uppercase, tracked

### Section headers (`.cp-section-header`)
- Flex row: `[TITLE TEXT] ─────────────────────` (divider stretches)
- Title: 11px, mint, uppercase, monospace, nowrap
- Divider: 1px hairline, `--cb-line`

### Settings panel
- Slide-in from right, 300px wide, full height
- Same bg as cards (`--cb-surface-1`)
- Left border + heavy box-shadow
- Segmented toggles for binary/ternary settings
- Native `<select>` for dropdowns (styled to match)

### METAR/TAF result cards
- Each airport: section header (ICAO + station name) + divider
- Latest METAR: `--cb-accdim` bg (mint tint), mint border, "LATEST" label
- Older METARs: `--cb-surface-2` bg, muted text
- TAF: `--cb-surface-2` bg, `white-space: pre-wrap`, dimmer text

---

## Motion & Interaction

- **Tab switch:** `cpFadeIn` — 0.18s ease, `opacity: 0 → 1` + `translateY(6px → 0)`
- **Dark/light toggle:** 140ms fade-out → toggle → 80ms fade-in (whole app)
- **Button press:** scale(0.91) + opacity 0.65 on `pointerdown`
- **Button hover:** scale(0.97) + opacity 0.85
- **All transitions:** 0.1s–0.15s, disabled when `settings.reduceMotion = true`
- **Haptic:** `navigator.vibrate()` on button presses (8ms light / 18ms medium / 30ms heavy)

---

## What's Working Well (Don't Break)

- The **dark navy palette** feels genuinely cockpit-grade — keep it
- **Monospace everything** for data creates visual discipline — keep it
- **Mint (`#3FE0C5`) as the primary accent** — very readable on dark surfaces, distinctive
- **3px left border on result cards** — elegant way to colour-code without loud backgrounds
- **Tab bar** — compact, scrollable, no overflow clipping issues
- **Section header + divider** pattern — creates clear hierarchy without heavy headings
- The **button grid layout** (4-col for standard calc, 6-col for scientific) — solid proportions

---

## Areas Open for Redesign

### 1. Header
Currently: logo mark + wordmark left, two buttons right. Feels plain.
Could explore: gradient top border, subtle grid background, more breathing room, or a collapsed logo on mobile.

### 2. Tab bar
Currently: basic bordered tabs. The active state top-shadow is effective but subtle.
Could explore: pill-style tabs, icon-only on small screens, tab overflow indicator.

### 3. METAR/TAF layout
The most information-dense calculator. Hardest to scan quickly.
Could explore: collapsible airport cards, colour-coded ceiling/visibility parsing, flight category indicators (VFR/MVFR/IFR/LIFR).

### 4. EDTO results area
Currently: two result cards side-by-side. The breakdown detail (interpolation rows) is functional but visually plain.
Could explore: styled altitude readout, graphical weight/ISA axis indicator, better mobile stacking.

### 5. Settings panel
Currently: simple rows with segmented toggles and selects. Gets the job done.
Could explore: grouped sections with better visual separation, icons per setting, panel animations.

### 6. Empty / placeholder states
Currently: plain dim text ("ENTER ICAO CODES AND FETCH", "enter values above").
Could explore: subtle icon + copy, dashed border placeholder containers.

### 7. Light mode polish
Light mode works but is less refined than dark. The blueprint-paper concept (`#f4f6fb` bg) has potential but isn't fully exploited.
Could explore: subtle grid-line background on light mode (`.cb-grid-bg` utility already exists), better contrast on the section headers.

---

## Design Constraints

- **Must stay PWA-first** — no heavy dependencies, must work fully offline
- **Dark mode is primary** — light mode is a bonus, not the hero
- **Mobile (iPad/iPhone) is the primary device** — all layouts must work at 768px and up; touch targets should be ≥ 44px
- **No images** — all UI is CSS + SVG + monospace characters
- **Accessibility** — keyboard nav works, focus states must be visible, settings panel has focus trap
- **Performance** — single JS bundle ~213KB gzip 64KB — don't add heavy UI libraries

---

## Files to Know

| File | What it controls |
|------|-----------------|
| `/public/brand/brand.css` | All `--cb-*` design tokens, fonts, utility classes |
| `/src/index.css` | Token bridge (`--cp-*`), all component CSS classes, animations |
| `/src/App.jsx` | Shell layout: header, tabs, main wrapper, settings panel |
| `/public/brand/logo-mark.svg` | Dark-mode logo (edit to change the "C" mark) |
| `/public/brand/manifest.webmanifest` | PWA name, theme colour, icon references |

---

## Handoff Assets Location

```
C:\Users\Amir Rashid\my-superapp\ClaudeSuperApp\design_handoff_brand_integration\
└── brand\
    └── icons\    ← Master icon PNGs (source of truth for all app icons)

C:\Users\Amir Rashid\Downloads\AppIcons (2)\
├── android\mipmap-xxxhdpi\ic_launcher.png   ← Android 192×192
└── playstore.png                            ← Android 512×512

C:\Users\Amir Rashid\Downloads\AppIcons (2)\Assets.xcassets\AppIcon.appiconset\
└── 180.png                                  ← iOS Apple Touch Icon
```
