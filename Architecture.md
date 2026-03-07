# VeilMap

Real-time Fog of War tool for tabletop RPG game masters.  
The GM controls one browser window; a second URL on the projector shows players only what has been revealed.

## Stack

- **Next.js 15** (App Router) — single process on port 3000
- **PostgreSQL** via postgres.js — no ORM
- **Server-Sent Events** — built into Next.js Route Handlers
- **NextAuth.js v5** — email + password credentials
- **Tailwind CSS** — dark fantasy theme with Cinzel/Crimson Pro fonts
- **Caddy** — reverse proxy with automatic HTTPS
- **PM2** — process manager

## Features

### Canvas & Viewport
- Infinite canvas at 2400×1600 base resolution
- Scroll wheel to zoom, Space + drag to pan
- Middle-click drag to pan
- `+` / `-` keys to zoom in/out
- `⌂ Fit` button to reset view
- Grid overlay toggle (`G` key)

### Fog of War
- Reveal tool (`R`) — paint to clear fog with smooth radial gradient
- Hide tool (`H`) — paint fog back
- Reset fog — covers entire map
- Brush sizes 1–4 (keys `1` `2` `3` `4`)
- Undo (`Ctrl+Z` / `Cmd+Z`) — 20-level stack
- Auto-reveal: painting inside an autoReveal box reveals the entire room
- Fog snapshots saved every 10s + on mouse release

### Map Objects
- Upload multiple images (PNG, JPG, WebP, GIF)
- Layer panel with z-index ordering (like Photoshop)
- Per-object: rename, visibility toggle, lock position, reorder, delete
- Drag objects to reposition on canvas
- GIF support for animated elements (water, fire, etc.)

### Camera Viewport
- GM controls a movable/resizable camera rectangle
- Player display shows exactly what the camera sees at 100% screen
- Allows zooming into small areas (elevator, puzzle) or wide shots
- Area outside camera dimmed in GM view

### Meta Boxes
- Draw box (`B` key), auto-snaps to grid
- Types: autoReveal, trigger (with notes popup), hazard (hatched), note (GM-only), hidden
- Click to select (`S` key), right-click to edit/reveal/delete
- Reveal All / Clear buttons in panel

### Tokens (GM only)
- 10-emoji palette with colored rings
- Click to place, drag to move, right-click to delete
- Visible only in GM view — not projected to players

### Player Display
- Fullscreen, no UI chrome
- Shows exactly what's inside the GM's camera viewport
- Fog at full opacity
- Vignette overlay for atmosphere
- Blackout mode (`X` key) — instant black screen with custom message
- Prep mode with animated runes overlay
- SSE connection with auto-reconnect

### Measurement
- Ruler tool (`M` key)
- Shows distance in feet and grid squares

### Ping & Torch
- Ping (`P` key) — animated expanding rings visible to players
- Torch — flickering light effect on map

### Sessions & Persistence
- Dashboard to create, list, delete sessions
- Unique slug URLs (e.g. `/gm/dark-forest-42`)
- Free users: session in RAM only, export/import as `.veilmap.json`
- Pro users: fog + map persisted to database, server-side uploads
- Copy player URL button in GM header

### Auth
- Register with email + password
- NextAuth.js v5 credentials provider
- Sessions and data are owner-gated

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Reveal fog tool |
| `H` | Hide fog tool |
| `B` | Draw meta box tool |
| `S` | Select tool |
| `T` | Token placement tool |
| `P` | Ping tool |
| `M` | Measure tool |
| `G` | Toggle grid |
| `C` | Camera tool |
| `X` | Toggle blackout |
| `1-4` | Brush sizes (small → large) |
| `Ctrl+Z` | Undo |
| `Cmd+Z` | Undo (Mac) |
| `Space+Drag` | Pan |
| `Scroll` | Zoom |
| `+` / `-` | Zoom in/out |
| `Escape` | Close modal / cancel |

## Data Model

Four tables: `users`, `sessions`, `boxes`, `tokens`.

- **users** — email, password hash, is_pro flag
- **sessions** — slug, name, owner, map URL, fog snapshot, prep mode, display settings
- **boxes** — position, size, type, name, color, notes, revealed state
- **tokens** — emoji, color, position, label
