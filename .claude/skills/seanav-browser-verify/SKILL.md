---
name: seanav-browser-verify
description: Fastest, known-working way to open and visually verify the SeaNav app (a MapLibre GL / WebGL React app) in a browser. Use this whenever you need to check UI/map behavior, take a screenshot, or verify a fix in SeaNav — before trying mcp__Claude_Preview or the computer screenshot action, since both are known to fail on this app and waste turns. Triggers on: "verify this in the browser", "take a screenshot", "check the map", "does the toggle work", "test the UI" for this repo.
---

# SeaNav browser verification

Learned the hard way in a debugging session that burned ~13% of a 5-hour quota
retrying dead-end approaches. Read this before touching a browser tool.

## Routing (don't guess this)

- `/` — landing page only, no map.
- `/#navigasjon` — the actual nav app with the MapLibre map. Hash-based
  routing (`window.location.hash`), no react-router. Navigate straight to
  this URL, or click `button.landing-primary-cta` from the landing page.

## Which browser tool to use

**Use `mcp__Claude_in_Chrome` (the real connected browser). Do not use
`mcp__Claude_Preview` for anything touching the map canvas.**

Why: `mcp__Claude_Preview`'s sandboxed browser has no WebGL
(`canvas.getContext('webgl')` returns null there), so MapLibre never
initializes — `mcp__Claude_Preview__preview_screenshot` will just show a
blank/crashed page. It's fine for non-WebGL, plain-DOM pages (e.g. the
landing page), just not the map.

Steps:
1. `mcp__Claude_in_Chrome__tabs_context_mcp` with `createIfEmpty: true` to get a tab.
2. `mcp__Claude_in_Chrome__navigate` straight to `http://localhost:5173/#navigasjon`.
3. Wait a couple seconds (`mcp__Claude_in_Chrome__computer` action `wait`) for tiles/state to settle before doing anything else.

## Screenshots: skip the `computer` screenshot action

`mcp__Claude_in_Chrome__computer` with action `screenshot` reliably times out
("Script injection timed out after 5000ms") on this page — the WebGL render
loop keeps the main thread too busy for the injected capture script. Don't
retry it more than once; it's not a fluke, it just doesn't work here.

**What actually works:** pull the pixels straight off the map canvas and
trigger a real file download, then read the file from disk.

```js
// via mcp__Claude_in_Chrome__javascript_tool, action javascript_exec
(function () {
  const a = document.createElement('a');
  a.href = document.querySelector('canvas.maplibregl-canvas').toDataURL('image/png');
  a.download = 'seanav-debug.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'downloaded';
})()
```

Do **not** try to return the base64 string through the tool result to inspect
it directly — the harness truncates tool output at ~2000 chars regardless of
how you slice the string. Always go through a file.

Then locate and read the file:

```bash
find / -iname "seanav-debug.png" 2>/dev/null
```

This user's Downloads folder is Norwegian-localized: `~/Nedlastinger`, not
`~/Downloads`. Once you have the path, use the `Read` tool on it directly —
it renders images.

## Known sandbox limitation — don't over-interpret it

In this environment, network access to fetch external map tiles (OpenFreeMap
etc.) may be restricted even from the real connected browser. If a captured
canvas frame comes back blank/white, that's most likely the sandbox failing
to fetch tiles, not proof the app is broken. If you can't get a real visual
repro, say so plainly to the user instead of guessing further from a blank
frame — guessing from bad data burns way more time than admitting the
limitation.

## Quick decision order

1. Map/WebGL involved? → `mcp__Claude_in_Chrome`, skip `mcp__Claude_Preview` entirely.
2. Need a pixel-accurate look? → `javascript_tool` canvas `toDataURL` + download + `find` + `Read`. Not the `computer` screenshot action.
3. Plain DOM/landing-page UI, no canvas? → `mcp__Claude_Preview__preview_screenshot` is fine and faster (dev server config already in `.claude/launch.json`, config name `seanav-dev`).
