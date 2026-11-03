// Version labels follow Eledger's scheme: first entry is v1.0, each
// subsequent entry is +0.1, up to a max of x.10 — the entry after any x.10
// rolls to (x+1).0. One entry per release (not per commit — a release here
// can bundle several commits; historic pre-2026 releases are summarized in
// batches rather than reconstructed release-by-release). Oldest first
// below (rendered newest-first in the UI).
export const CHANGELOG = [
  {
    v: "v1.0", date: "2024–2025",
    title: "Early flight, prayer, and NOTAM features",
    notes: [
      "NEW: METAR/TAF with flight category and wind severity colouring, plus a plain-English decode toggle.",
      "NEW: NOTAM module through an autorouter.aero proxy.",
      "NEW: Prayer times refresh after midnight; Imsak and Sunrise shown as reference times.",
      "NEW: Launcher, tabs and grouped navigation styles; Settings as a tabbed sheet on mobile and a modal on desktop.",
      "FIX: Qibla compass now rotates with the device and tracks true North.",
    ],
  },
  {
    v: "v1.1", date: "2025",
    title: "Scientific calculator and NOTAM revamp",
    notes: [
      "NEW: Scientific calculator with an expression engine and unit converter.",
      "NEW: Flight tab clock-time mode (dep/arr) with a UTC/local toggle.",
      "NEW: NOTAM revamped: grouped by location, role-coloured and filterable.",
      "NEW: Full OurAirports dataset for worldwide ICAO coverage; Dhuha prayer time added.",
      "FIX: Prayer times could be a day off because of the UTC cache key.",
    ],
  },
  {
    v: "v1.2", date: "Jun 2026",
    title: "NOTAM persistence and prayer fixes",
    notes: [
      "FIX: NOTAM inputs and results are saved on the device, so they can be viewed offline.",
      "FIX: Dhuha shows as a full prayer row and greys out with a tick once its time passes.",
    ],
  },
  {
    v: "v1.3", date: "Jun 2026",
    title: "Flight Duty Log module",
    notes: [
      "NEW: Flight Duty Log: log sectors, fuel, times, ENG OUT data, crew and per-sector remarks, saved offline.",
      "NEW: Settings reorganised into Appearance, Navigation, Tools, Prayer and About.",
      "NEW: Theme AUTO follows the system light/dark mode in real time.",
      "NEW: Five accent colours (teal, amber, cyan, violet, green) and flat / raised / glass card styles.",
      "NEW: One global 12/24h clock setting, and unit preferences for temperature, wind, visibility, altitude and pressure.",
      "NEW: Haptic strength, dashboard widget toggles and confirm-before-reset options.",
      "FIX: App updates are now detected automatically, without a manual check.",
    ],
  },
  {
    v: "v1.4", date: "Jun 2026",
    title: "Offline currency & reliability fixes",
    notes: [
      "NEW: Currency: all pairs work offline, with rates cached on first use and refreshed on open; offline shows the last rates with their age.",
      "FIX: NOTAM viewing offline after a restart now works.",
      "FIX: METAR/TAF weather tokens no longer appear garbled in the plain-English decode.",
      "FIX: FTL: flight-time UTC conversion handled daylight-saving ambiguity wrongly; now corrected.",
      "FIX: Scientific calculator evaluates scientific notation (1e-3, 2.5e6) correctly.",
      "FIX: The dashboard's next-prayer widget reads live times, with no stale display after midnight.",
    ],
  },
  {
    v: "v1.5", date: "Jun 2026",
    title: "5-day prayer times and timezone-aware clock mode",
    notes: [
      "NEW: Prayer: 5-day times (today plus 4 days), computed offline instantly.",
      "FIX: The next-prayer widget counts down to the next day's Fajr after Isha, instead of disappearing.",
      "NEW: Flight: clock-mode local times use each airport's own timezone, and a live banner shows total duration and UTC offsets as you type.",
      "NEW: Flight: swap button (⇄) swaps departure and destination for quick return-leg entry.",
      "IMP: Airport database now has 4,906 airports, 4,345 with timezone data.",
    ],
  },
  {
    v: "v1.6", date: "Jun 2026",
    title: "Flight prayer timeline",
    notes: [
      "NEW: Flight: in-flight prayer timeline plots every Imsak, Fajr, Sunrise, Dhuhr, Asr, Maghrib and Isha along the route, including repeats on long-haul flights.",
      "NEW: DEP TIME / ARR TIME toggle shows the same in-flight prayer moment on either watch.",
      "NEW: Current-position card with a refresh button; it also refreshes when you return to the tab.",
      "FIX: Clock-mode elapsed time was anchored to the wrong calendar date and could show 100% complete soon after a UTC+8 morning departure.",
    ],
  },
  {
    v: "v1.7", date: "Jun 2026",
    title: "Per-module reset buttons and Duty Log grouping",
    notes: [
      "NEW: Per-module RESET buttons replace the global \"Reset All\", each asking before clearing.",
      "NEW: Duty Log: past entries group into collapsible year › month banners.",
      "NEW: Calculator: Volume, Area, Pressure, Time and Angle conversions, a fuel mass/volume converter, and a separate CONVERT mode.",
      "NEW: Swap (⇄) button for departure/arrival on METAR/TAF and NOTAM.",
      "FIX: Swipe gesture navigation removed because it triggered unintended tab changes.",
    ],
  },
  {
    v: "v1.8", date: "Jun 2026",
    title: "Duty Log backup and sync",
    notes: [
      "NEW: Duty Log Backup & Sync: back up logs to the cloud and restore on another device with a short anonymous code, no account needed.",
      "NEW: Sync lives in Settings with a status card (last synced) and BACKUP / RESTORE tabs; make or scan a QR code for the code.",
      "DEP: Settings JSON export/import and reset-to-defaults removed, replaced by Backup & Sync.",
    ],
  },
  {
    v: "v1.9", date: "Jun 2026",
    title: "Duty Log backup and sync redesign",
    notes: [
      "NEW: Each device owns a sync code: only the owner can push, and restoring transfers ownership to the new device.",
      "NEW: Each log card shows SYNCED or a one-tap SYNC, and you're prompted to sync after creating a log.",
      "NEW: \"Have a code? Enter here to view it\": view another device's logs read-only, with an optional confirmed import.",
    ],
  },
  {
    v: "v1.10", date: "Jun 2026",
    title: "Animated launch splash",
    notes: [
      "NEW: Animated splash on launch: the C mark fades in, the frame draws on, then the CLAUDEBORNE wordmark appears.",
    ],
  },
  {
    v: "v2.0", date: "Jun 2026",
    title: "FTL Calculator: CAD 1901 compliance audit",
    notes: [
      "FIX: FTL: standby Max FDP now compares the standby-start band with the report-time band and uses the more limiting one (Ch. 2.9.1).",
      "NEW: FTL: Delayed Reporting (Ch. 2.7) models planned vs actual report time with the <4h and ≥4h rules.",
      "NEW: FTL: Positioning (Ch. 2.8): FDP starts at the positioning report time.",
      "NEW: FTL: standby location (Home / Airport) and the home ≤2h-notice exception (Ch. 2.9.1/2.9.2).",
      "NEW: FTL: \"Reduced Preceding Rest\" toggle gates the Split Duty prohibition, PIC discretion limit and CAAM reporting rules.",
      "NEW: FTL: cabin crew can report at a different time from flight crew (Ch. 2.21.2a).",
      "NEW: FTL: result panel separates pending inputs (amber) from CAAM reporting and violations (red).",
      "FIX: FTL: PIC discretion before/after the last sector now caps at 2h/3h using the real sector count.",
      "FIX: FTL: long range boundary now triggers only above 7h (was exactly 7h).",
      "FIX: FTL: single-pilot operations no longer allow \"Not Acclimatised\".",
    ],
  },
  {
    v: "v2.1", date: "Jul 2026",
    title: "Traffic, Flight Schedules and SIGMET tabs",
    notes: [
      "NEW: Traffic tab: live ADS-B aircraft tracking with radar map, centre picker, range and callsign/registration search.",
      "NEW: Flight Schedules tab: arrivals/departures board per airport with date/time filtering, terminal, gate and status.",
      "NEW: SIGMET tab (aviationweather.gov international feed), reusing NOTAM's FIR and route detection.",
      "NEW: METAR/TAF and NOTAM alternate between SkyLink and the existing sources by UTC day, with silent fallback and a source chip.",
      "NEW: METAR/TAF: each role card gets a RUNWAYS section with headwind, crosswind and tailwind for every runway.",
      "NEW: Calculator: Basic, Scientific and Time scale to fit the screen without scrolling; the unit converter has bidirectional FROM/TO inputs and unit chips.",
      "NEW: Flight prayer timeline gets a UTC TIME option.",
      "FIX: Time calculator history cleared on equals instead of showing the completed line; Scientific now has the same history.",
      "FIX: The Runways panel could stay on a stale airport or in an error state after an aborted fetch.",
    ],
  },
  {
    v: "v2.2", date: "Jul 2026",
    title: "Traffic tab rebuilt as flight-status lookup",
    notes: [
      "NEW: Traffic rebuilt as a flight-status lookup: status, route, scheduled vs actual/estimated times, delay, terminal and gate. The ADS-B radar and aircraft-spec lookup are gone.",
      "NEW: Search by flight number or aircraft registration; a registration with several sectors that day shows a picker with the most relevant leg marked LIVE.",
      "NEW: Every displayed time shows its UTC offset, so departure- and arrival-local times are never mistaken for the same clock.",
      "FIX: Status now cross-checks the provider's label against the flight's own times, fixing a still-airborne flight shown as landed.",
      "DEP: Flight Schedules tab removed; Traffic's search is now the only flight check.",
    ],
  },
  {
    v: "v2.3", date: "Aug 2026",
    title: "Calculator rebuild & SIGMET alternates",
    notes: [
      "NEW: Calculator (Basic, Scientific, Time, Convert) rebuilt to fill the screen with CSS flexbox/grid, with no empty margins or scrollbar overflow.",
      "NEW: Numpad rearranged like a physical numpad, with equals spanning the bottom two rows; Scientific function keys sit in their own column.",
      "NEW: Converter: FROM and TO cards sit side by side with the swap button between them.",
      "NEW: SIGMET: Destination and Enroute Alternates fields plus a Copy from METAR/TAF button; FIR auto-detect scans all of them.",
      "DEP: Header search tool removed (unused).",
    ],
  },
  {
    v: "v2.4", date: "Aug 2026",
    title: "Duty Log CORS fix",
    notes: [
      "FIX: Duty Log sync now sends CORS headers for claudeborne.my, so eLogbook's Duty Log Link can read your synced entries.",
    ],
  },
  {
    v: "v2.5", date: "Aug 2026",
    title: "B737 Performance tab",
    notes: [
      "NEW: B737 PERFORMANCE tab combines EDTO and two new calculators; EDTO is no longer a separate top-level tab.",
      "NEW: Go-Around Climb Gradient (ENG INOP) for NG and MAX, with weight, speed, packs-off, anti-ice and icing corrections from the FCOM.",
      "NEW: Quick Turnaround Limit Weight (Flaps 40) for NG and MAX, adjusted for slope and wind, with a WITHIN LIMIT / EXCEEDS LIMIT verdict.",
    ],
  },
  {
    v: "v2.6", date: "Aug 2026",
    title: "Duty Log view-code history",
    notes: [
      "NEW: Duty Log remembers your last 5 view codes as tappable chips instead of retyping.",
    ],
  },
  {
    v: "v2.7", date: "Sep 2026",
    title: "Malaysia Airports gate finder",
    notes: [
      "NEW: Malaysia Airports gate finder: departure/arrival board lookup by airport, day, flight, city or airline, with a big gate number, status pill, airline logo and codeshare list.",
      "FIX: Status and gate colours now match the API's real vocabulary (check-in to gate for departures, baggage for arrivals).",
    ],
  },
  {
    v: "v2.8", date: "Sep 2026",
    title: "Flight Briefing",
    notes: [
      "NEW: Flight Briefing: a BRIEFING button in METAR/TAF, NOTAM and SIGMET opens a combined overlay built from that module's route input, so you never retype it.",
      "NEW: Route map with real coastlines and a great-circle curve plotting departure, arrival, alternates and enroute alternates.",
      "NEW: NOTAMs are also fetched per route FIR (airspace and oceanic notices), not just per airport.",
      "NEW: Opening a Briefing also fills METAR/TAF, NOTAM and SIGMET with the same route and data, with no extra API calls.",
      "NEW: A Briefing persists across reloads and offline; closing pauses it and a \"Resume Briefing\" pill brings it back.",
      "FIX: A render crash on real data now shows a retryable error card instead of a white screen.",
      "FIX: NOTAM and SIGMET now work offline like METAR/TAF already did.",
    ],
  },
  {
    v: "v2.9", date: "Sep 2026",
    title: "World Time map",
    notes: [
      "NEW: World Time map plots Local and every saved clock by city, with a live day/night shading band; tap a pin to jump to that clock.",
      "FIX: METAR/TAF, NOTAM and SIGMET now show a Briefing's results as soon as the overlay closes.",
    ],
  },
  {
    v: "v2.10", date: "Sep 2026",
    title: "Live weather overlay and Briefing tabs",
    notes: [
      "NEW: Briefing route map has a Live Weather toggle with Windy's wind, temperature and pressure overlay, with the route and airport markers on top.",
      "NEW: Briefing METAR/TAF, NOTAMs and SIGMETs are separate tabs with count badges; per-airport NOTAMs moved to the NOTAMs tab.",
      "NEW: Altitude tape (Surface to FL450) so the overlay can show cruise-level conditions.",
      "FIX: aviationweather.gov / autorouter.aero are now always the primary source, with SkyLink only as fallback, to save SkyLink's small free quota.",
    ],
  },
  {
    v: "v3.0", date: "Sep 2026",
    title: "Rain and Clouds live weather overlay",
    notes: [
      "NEW: Live Weather's Rain and Clouds overlays are live (Rainbow Weather API), with a Now to +4h rain forecast slider.",
      "NEW: Rain and Clouds refresh manually, showing a \"Data as of\" time and a stale indicator after 10 minutes.",
    ],
  },
  {
    v: "v3.1", date: "Sep 2026",
    title: "Recommended Brake Cooling Schedule",
    notes: [
      "NEW: B737 Performance: Recommended Brake Cooling Schedule for 737-8 (MAX) and 737-800 (NG, steel or carbon brakes), with single-event and chained quick-turnaround modes.",
      "NEW: Converter: Time, Data storage, Energy and Power categories, plus cooking volumes; values show their unit inline.",
      "FIX: Briefing's Dark route map tiles now cache fully, so the map works offline after being viewed once.",
      "NEW: Route map freezes pan and zoom while offline, and offers a no-network coastline view if the basemap can't load.",
      "DEP: Vector basemap removed; the static route map is Dark only.",
    ],
  },
  {
    v: "v3.2", date: "Sep 2026",
    title: "Saved Briefings",
    notes: [
      "NEW: Save any briefing with an editable name (up to 30), browsed from a read-only list in the Briefing window.",
      "NEW: Resume Briefing opens your most recently saved briefing; closing an unsaved briefing asks whether to save it.",
      "DEP: METAR/TAF and NOTAM auto-refresh and its Settings toggle removed; METAR/TAF, NOTAM and SIGMET are fetch-on-demand only.",
      "FIX: A module's 12-hour stale-data cleanup could silently delete an unrelated saved Briefing; it now only clears its own data.",
      "FIX: Malaysia Airports search inputs and results now persist when you leave and return to the tab.",
      "NEW: FTL Timezone Conversion: enter the reporting-station and current UTC offsets and FDP EXPIRES shows both station-local and converted time.",
      "FIX: PIC discretion's ACTUAL FDP END TIME now accepts station-local or your own local time, fixing a bug that corrupted the extension calculation.",
      "NEW: When PIC discretion is used, the result shows allowable vs actual FDP and expiry vs actual finish as colour-coded before/after tiles.",
    ],
  },
  {
    v: "v3.3", date: "Sep 2026",
    title: "FTL CAD 1901 compliance fixes",
    notes: [
      "FIX: FTL: a Delayed Reporting actual time earlier than planned, or a delay over 12h, is now blocked (Ch. 2.7).",
      "NEW: FTL: for delays of 10-12h, UNDISTURBED UNTIL NEW REPORT treats the delay as rest and starts the FDP from the new report time (Ch. 2.7.2).",
      "FIX: FTL: PIC discretion with an actual end before the original expiry no longer adds a 3:00 extension; over-limit discretion shows the real extension, flags CAAM above 2h and warns beyond 3h (Ch. 2.15).",
      "FIX: FTL: Split duty is blocked unless it has two or more sectors and a 3-10h rest, and after a reduced rest.",
      "NEW: FTL: with Split duty and Positioning, POSITIONING COUNTED AS SECTOR (default YES) controls the sector count (Ch. 2.8.2, 2.13.1).",
      "FIX: FTL: In-Flight Relief and Long Range interactions corrected: ignored for single pilot, long range never applies to cabin crew, and both together no longer double-penalise.",
      "FIX: FTL: Table B at exactly 30:00 preceding rest now uses the \"between 18 and 30\" row.",
      "FIX: FTL: airport standby now shows an FDP expiry once called out to position and applies the more limiting time band.",
      "FIX: FTL: a delay after a standby call-out now uses the standby rules (Ch. 2.9.3), not Delayed Reporting.",
      "FIX: FTL: two non-acclimatised pilots with a sector over 11h are blocked (additional pilot required); REDUCED PRECEDING REST covers any reduced rest.",
    ],
  },
  {
    v: "v3.4", date: "Sep 2026",
    title: "Light-mode contrast and layout fixes",
    notes: [
      "FIX: Darker accent colours and the NOTAM FIR chip now meet contrast minimums in light mode.",
      "FIX: Settings overflow, XL-font button position, and the Resume Briefing pill blocking page content.",
      "IMP: The Live Weather base map library is bundled with the app instead of loading from a CDN.",
    ],
  },
  {
    v: "v3.5", date: "Oct 2026",
    title: "Saved briefings stored reliably",
    notes: [
      "FIX: Newly saved briefings could vanish after closing the app because browser storage (~5 MB) filled and saves failed silently. They now use IndexedDB, existing ones are copied over, and a \"Storage Full\" prompt offers to delete the oldest.",
      "FIX: A saved briefing is now a true snapshot: it shows exactly what was saved, online or offline, with its saved map picture and a \"Saved snapshot · data as of\" line.",
      "FIX: Opening the SIGMETs tab on older saved briefings crashed the Briefing window; they now open normally.",
      "NEW: Settings → About → App Update has a \"Disable auto-update\" switch; \"Check for updates\" still works manually.",
      "NEW: Transition animations for tools, tabs, launcher cards, dialogs and the Flight Briefing; Settings → Appearance → Animation sets on/off, style and speed, and respects Reduce Motion.",
      "FIX: iPadOS 27 drew a blur over the top of the installed app; the header now blends with the status bar. Re-add the Home Screen icon once to apply.",
    ],
  },
  {
    v: "v3.6", date: "Oct 2026",
    title: "Fits narrow phones",
    notes: [
      "FIX: Interpolation, FTL, METAR/TAF, NOTAM, SIGMET, World Time, Qiblat & Solat and the home clock were cut off on narrow phones; tools now fit screens down to 360 px.",
      "FIX: The Flight Briefing's METAR/TAF cards and three tabs now fit the window on narrow phones.",
      "FIX: The scientific calculator's right-hand key column and inverse trig labels are no longer cut off.",
      "IMP: Settings rows wrap their control under the label, and Calculator and B737 sub tabs sit in two even rows on phones.",
    ],
  },
  {
    v: "v3.7", date: "Oct 2026",
    title: "Paste a route, see it on the Briefing map",
    notes: [
      "NEW: Optional ROUTE box on METAR/TAF, NOTAM and SIGMET: paste a route from FDPro or eWAS and Departure and Arrival fill in; the Briefing's Dark map draws it through its fixes, with a FIX OFF | ON name toggle. Unknown fixes are listed and skipped.",
      "NEW: A saved briefing keeps its drawn route, so it opens the same offline.",
      "IMP: Enroute Alternates use \"+ ADD\" (up to 5) and a red × instead of a dropdown.",
      "IMP: Briefing fetches NOTAMs for all airports in one request with one autorouter login, avoiding the 20-login limit that could stop NOTAMs loading.",
      "IMP: Settings, the Briefing and every dialog share one look: a double-line border with cut corners that follows your accent colour.",
      "NEW: A saved briefing can be exported as a printable A4 PDF (route map, details, linked Duty log, METAR/TAF, SIGMETs, full NOTAMs), with chosen sections, orientation and light or dark page; works offline.",
    ],
  },
  {
    v: "v3.8", date: "Oct 2026",
    title: "Month browser & wide-screen layouts",
    notes: [
      "NEW: Duty Log and Briefing lists are browsed one month at a time, with month chips and a slide animation.",
      "NEW: Wide-screen layouts for tablet and desktop (768 px and up), including a wider Duty Log and two sector cards per row.",
      "IMP: Tabs regrouped: Convert is its own tab and a Miscellaneous group is added.",
      "IMP: Linking is manual only, and editing an entry that would break a link asks first.",
      "NEW: A card's SYNC also sends its linked briefing or duty log, and the Cloud Sync card shows how many duty logs are backed up.",
      "IMP: Deleting a saved briefing or duty log asks first; Duty Log search covers dates; Malaysia Airports tab renamed Aerodromes.",
      "IMP: The briefing PDF starts METAR/TAF, SIGMETs and NOTAMs on new pages.",
    ],
  },
  {
    v: "v3.9", date: "Nov 2026", current: true,
    title: "Satellite module",
    notes: [
      "NEW: Satellite tab in Flight Data: cloud, winds-aloft and storm pictures for a route or region, fetched on demand with a button.",
      "NEW: STORMS view: tap a storm for strength, movement, countries, forecast centres, closest approach and which briefing airports it reaches.",
      "NEW: Briefing NOTAMs have collapsible cards, METAR/TAF-style sections, full text and paging; SIGMETs are numbered, grouped by FIR and tappable on the saved map.",
      "NEW: Export PDF button on each Saved Briefings row.",
      "FIX: Cloud backup of briefings with Satellite pictures could pass the size limit; pictures now upload in separate pieces, and a rate limit (429) waits up to 60s before retrying.",
      "FIX: Retaken pictures offer SYNC again; pickers show 5 per page sized to the screen and centre correctly on iPad landscape.",
      "FIX: iOS no longer zooms in when you tap an input.",
      "IMP: Smooth animations for Satellite views, NOTAM/SIGMET results, errors and B737 result cards.",
    ],
  },
]
