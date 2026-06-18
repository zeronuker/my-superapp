# Changelog

## v3.8 — 2026-06-18

### Prayer Module

#### 5-Day Prayer Times
- Day selector strip added at the top of the Solat tab (Today · +1 · +2 · +3 · +4)
- Today is always the active default
- Future days computed instantly using local adhan calculation — no network, no delay
- "Next prayer" countdown and done/next row highlights are shown only for Today

#### Next Prayer Widget (Perpetual Countdown)
- After Isha passes, the launcher dashboard widget now counts down to the next day's Fajr instead of disappearing
- Widget is permanently visible as long as prayer times are loaded

#### Launcher Default Behaviour
- Selecting launcher nav style in Settings now always opens the dashboard home
- Previously, "remember last tab" could bypass the dashboard on first load
- Switching to launcher mid-session also immediately returns to the dashboard

---

### Flight Module (Prayer Tab)

#### Timezone-Aware Clock Mode
- In clock mode with LOCAL selected, departure time is interpreted in the departure airport's timezone and arrival time in the destination airport's timezone
- Eliminates the need to manually convert times — input your STD/STA in local time directly
- Covers 4,345 airports with IANA timezone data (OpenFlights cross-reference)
- Gracefully falls back to device local time when airport timezone data is unavailable

#### Flight Time Info Banner
- A live info banner appears beneath the dep/arr time fields in clock mode as you type (no CALCULATE press needed)
- Shows total flight duration (e.g. 8h 50m), detected timezone offsets per airport (e.g. UTC+8 → UTC+10), and flags when timezone data is missing

#### Airport Database
- Regenerated: 4,906 airports total, 4,345 with IANA timezone strings
- Source: OurAirports (names/coords) cross-referenced with OpenFlights (timezones)

#### UX Improvements
- Departure time label changed to **DEP TIME (ETD)**
- Swap button (⇄) added between the dep/dest ICAO fields — tap to reverse route for return leg
- Disclaimer updated to **ESTIMATED TIME AND POSITION ONLY**
- Cabin direction dial now shows a narrow-body airliner silhouette with swept wings

---

## v3.7 — 2026-06-13

- 20-issue reliability, offline, and ToS compliance audit pass
- Next prayer widget live countdown with seconds
- Flight inputs persist across tab switches
