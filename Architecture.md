# VeilMap

Real-time Fog of War tool for tabletop RPG game masters.  
The GM controls one browser window; a second URL on the projector shows players only what has been revealed.

## Stack

- **Next.js 15** (App Router) — single process on port 3000
- **PostgreSQL** via Prisma ORM
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
- Clickable zoom percentage opens zoom slider modal
- `⌂ Fit` button to reset view
- Grid overlay toggle (`G` key)
- Right-click grid button for submenu: toggle grid, snap objects to grid, draw grid size

### Fog of War
- Reveal tool (`R`) — paint to clear fog with smooth radial gradient
- Hide tool (`H`) — paint fog back
- Reset fog — covers entire map
- Brush sizes 1–4 (keys `1` `2` `3` `4`)
- Undo (`Ctrl+Z` / `Cmd+Z`) — 20-level stack
- Interpolated strokes — smooth fog paint even when zoomed out
- Auto-reveal: painting inside an autoReveal box reveals the entire room
- Fog snapshots saved every 10s + on mouse release

### Map Objects
- Upload multiple images (PNG, JPG, WebP, GIF) as layered objects
- Photoshop-style layer panel with z-index ordering
- Per-object: rename (double-click), visibility toggle, lock position, reorder, delete
- Select objects on canvas with transform handles — move, scale from corners
- Grid snapping: center-snap objects to grid (right-click grid → Snap Objects to Grid)
- Draw Grid Size: draw a rectangle matching a known grid cell to calibrate grid
- GIF support for animated elements (water, fire, etc.)
- Objects synced to player display in real-time via SSE

### Camera Viewport
- GM controls a draggable/resizable camera rectangle (`C` key)
- Click inside to drag, click corners to resize, click outside to draw new
- Solid cyan border with corner handles — distinct from room boxes
- Player display shows exactly what's inside the camera at 100% screen
- Black letterboxing when camera aspect ratio doesn't match screen
- Area outside camera dimmed in GM view

### Polygon Rooms (Meta Boxes)
- Draw polygon rooms (`B` key) — click to place vertices, grid-snapped
- Click near first vertex to close the polygon (green snap indicator)
- Escape to cancel polygon drawing
- Rectangle rooms still supported (legacy)
- Types: autoReveal, trigger (with notes popup), hazard (hatched), note (GM-only), hidden
- Click to select (`S` key), right-click to edit/reveal/delete
- Reveal All / Clear buttons in panel

### Tokens (GM only)
- 10-emoji palette with colored rings — quick placement
- Upload custom token images (added as small map objects)
- Click to place, drag to move, right-click to delete
- Visible only in GM view — not projected to players

### Player Display
- Fullscreen, no UI chrome
- Shows exactly what's inside the GM's camera viewport
- Black letterboxing for non-matching aspect ratios
- Map objects rendered with z-index ordering
- Fog at full opacity
- Vignette overlay for atmosphere
- Blackout mode (`X` key) — instant black screen with custom message
- Prep mode with animated runes overlay
- SSE connection with auto-reconnect on visibility change (tab focus)

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
- 📺 Player button copies player URL to clipboard

### Auth
- Register with email + password
- NextAuth.js v5 credentials provider
- Sessions and data are owner-gated

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Reveal fog tool |
| `H` | Hide fog tool |
| `B` | Draw polygon room (meta box) |
| `S` | Select tool (objects + boxes) |
| `T` | Token placement tool |
| `P` | Ping tool |
| `M` | Measure tool |
| `G` | Toggle grid (right-click for submenu) |
| `C` | Camera tool (drag/resize/draw) |
| `X` | Toggle blackout |
| `1-4` | Brush sizes (small → large) |
| `Ctrl+Z` | Undo |
| `Cmd+Z` | Undo (Mac) |
| `Space+Drag` | Pan |
| `Scroll` | Zoom |
| `+` / `-` | Zoom in/out |
| `Escape` | Close modal / cancel drawing |

## Data Model

Four tables: `users`, `sessions`, `boxes`, `tokens`.

- **users** — email, password hash, is_pro flag
- **sessions** — slug, name, owner, map URL, fog snapshot, prep mode, display settings
- **boxes** — position, size, polygon points (JSON), type, name, color, notes, revealed state
- **tokens** — emoji, color, position, label
