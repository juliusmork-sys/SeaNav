# PRD: SeaNav — Maritime Navigation Web App (Prototype)

## 1. Overview
Browser-based maritime navigation aid. Fullscreen map, live GPS position, speed/heading/lat-long readout, estimated water depth. Works on PC and mobile (phone/tablet) via standard web browser, no native install. Primary coverage area: **Oslo Fjord**, Norway.

## 2. Goals
- Prove out core navigation UX: map + live position + nav data overlay, in a browser, on any device.
- Validate free/open data sources are sufficient for real nautical use in Oslo Fjord (charts + depth).
- Ship a clickable prototype, not production-hardened software.

## 3. Non-Goals (out of scope for prototype)
- Route planning / autorouting, AIS traffic overlay, weather/tide overlay, offline/tile caching, multi-user accounts, native app packaging, chart calibration/certification for official navigation use (this is a situational-awareness aid, not a certified ECDIS replacement).

## 4. Target Users
Recreational boaters on the Oslo Fjord who want a free, quick, browser-based position/depth reference on phone or laptop while underway.

## 5. Functional Requirements

| # | Requirement | Detail |
|---|---|---|
| F1 | Fullscreen map | Map fills viewport on load, no chrome. Pan/zoom/rotate. |
| F2 | Live GPS tracking | Request geolocation permission, continuously track position via `watchPosition`. User marker updates in real time, map optionally recenters/follows. |
| F3 | Position readout | Live Lat/Long (decimal degrees, e.g. `59.9139° N, 10.7522° E`). |
| F4 | Speed readout | Speed over ground in knots. Derive from `coords.speed` when available; fallback to distance/time delta between fixes when null (common on desktop). |
| F5 | Heading readout | Course/heading in degrees + compass point. Derive from `coords.heading` when moving; fallback to `DeviceOrientationEvent` (mobile compass) when stationary. |
| F6 | Estimated depth | Query bathymetric data at current position, display in meters. Clearly labeled "estimated" — interpolated survey data, not a live echosounder reading. |
| F7 | Nautical chart overlay | Toggle official Norwegian nautical chart layer (depth contours, buoys, hazards) over the base map for Oslo Fjord. |
| F8 | Accuracy indicator | Show GPS accuracy radius (meters) so user knows fix quality. |
| F9 | Responsive layout | Same app, adapts to PC (mouse/keyboard) and mobile (touch) without separate builds. |

## 6. Non-Functional Requirements
- **HTTPS required** — Geolocation API is blocked on plain HTTP in all modern browsers.
- Works on latest Chrome, Safari (iOS), Firefox, Edge.
- Graceful degradation: if depth/chart service is unreachable, map + GPS still function.
- iOS requires explicit user-gesture permission prompt for both Geolocation and `DeviceOrientationEvent` — must be triggered by a button tap, not on page load.
- Target first-paint-to-interactive under 3s on 4G mobile.

## 7. Recommended Data & API Stack (all free)

### Base map rendering
**MapLibre GL JS** — open-source (BSD), no API key, GPU-accelerated vector tiles, supports map rotation (needed for heading-up view). This is the best free choice over Leaflet because it handles smooth rotation/tilt natively, which a heading-based nav UI benefits from.
Tile source: **OpenFreeMap** (`https://tiles.openfreemap.org/styles/liberty`) — unlimited free vector tiles, no key, no rate limit, no attribution-gated signup.

### Nautical chart overlay (Oslo Fjord / Norway)
**Kartverket (Norwegian Mapping Authority) Sjøkart WMS** — official Norwegian nautical raster chart series (1:50,000, includes port charts), free OGC WMS for developers, updated ~biweekly. Best fit here specifically because it's the authoritative national hydrographic source for the Oslo Fjord, not a generic/global layer.
- Docs: [kartverket.no/en/api-and-data](https://www.kartverket.no/en/api-and-data)

### Depth data
**EMODnet Bathymetry** (`ows.emodnet-bathymetry.eu`) — free WMS/WFS/WCS plus a REST point-extraction service that returns water depth at a given lat/long from their Digital Terrain Model. Use this as the numeric "estimated depth" source since it exposes a queryable point API (Kartverket's own depth layer is view-only/uncalibrated). Coverage includes Norwegian waters.
- Docs: [emodnet.ec.europa.eu/en/bathymetry](https://emodnet.ec.europa.eu/en/bathymetry)

### GPS / motion
**Browser Geolocation API** (`navigator.geolocation.watchPosition`) for lat/long/speed/heading/accuracy. **DeviceOrientationEvent** (mobile only, requires permission on iOS 13+) as compass fallback when speed-derived heading is unavailable (stationary boat).

### Why not Google Maps / Mapbox
Both require an API key and have paid tiers past a free quota, and neither includes marine depth soundings — you'd still need EMODnet/Kartverket for bathymetry on top. Since a key-free, quota-free stack (MapLibre + OpenFreeMap) covers the base map needs just as well for a prototype, it's a straight net win to skip them.

## 8. Architecture Sketch
- Single-page app, no backend required for prototype (all APIs above are called client-side; if CORS blocks a WMS call from the browser, add a thin serverless proxy).
- Frontend: React + MapLibre GL JS.
- State: current position, derived speed/heading, last-fetched depth (poll on position change, debounced).
- Layers: base (OpenFreeMap) → nautical chart (Kartverket WMS, toggleable) → user position marker + accuracy circle.

## 9. Risks / Open Questions
- Desktop browsers often lack a real GPS chip — position derives from Wi-Fi/IP geolocation, accuracy can be hundreds of meters to kilometers, and `speed`/`heading` will frequently be `null`. PRD treats this as expected/acceptable for a prototype; UI should show accuracy radius so it's not mistaken for GPS-grade fix.
- EMODnet Bathymetry DTM resolution (~ hundreds of meters) means depth is an estimate, not survey-grade — needs clear "estimated" labeling to avoid safety-critical misuse.
- Kartverket WMS licensing/attribution terms should be double-checked for the exact reuse terms before any public deployment (fine for a prototype).

## 10. Success Criteria (prototype)
- Load app on both a laptop and a phone in/near the Oslo Fjord, see fullscreen map centered on live position within a few seconds.
- Speed, heading, lat/long, and estimated depth all populate and update while moving.
- Nautical chart layer toggles on/off over the base map.

## 11. Suggested Next Step
Scaffold the React + MapLibre app skeleton with OpenFreeMap base layer, Geolocation tracking, and a mock/static depth readout first — wire in EMODnet + Kartverket WMS once the core position loop is verified working on a real phone.
