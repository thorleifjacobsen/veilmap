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
- Grid overlay toggle (`G` key) — visible on both GM and player views
- Right-click grid button for submenu: toggle grid, snap objects to grid, draw grid size
- Clean dark slate on start — no default map, user uploads their base map as an object

### Fog of War
- Reveal tool (`R`) — paint to clear fog with smooth radial gradient
- Hide tool (`H`) — paint fog back with soft-edge gradient
- Reset fog — covers entire map
- Brush sizes 1–4 (keys `1` `2` `3` `4`)
- Undo (`Ctrl+Z` / `Cmd+Z`) — 20-level stack
- Interpolated strokes — smooth fog paint even when zoomed out
- Auto-reveal: painting inside an autoReveal box reveals the entire room
- Fog snapshots saved every 10s + on mouse release
- Fog color: #1a1a2e — visible contrast with map, atmospheric
- Animated reveal — ease-out cubic expanding circles (350ms)

### Map Objects
- Upload multiple images (PNG, JPG, WebP, GIF) as layered objects — stored as UUID files on disk
- Asset library (📚) — browse all uploaded assets + global tokens, click to add
- Photoshop-style layer panel with z-index ordering
- Per-object: rename (double-click), GM visibility toggle (👁), player visibility toggle (📺), right-click context menu for lock/reorder/delete
- Select objects on canvas with transform handles — move, scale from corners (9px handles), rotation support
- Grid snapping: center-snap objects to grid cell centers (right-click grid → Snap Objects to Grid)
- Draw Grid Size: draw a rectangle matching a known grid cell to calibrate grid (shows green preview with px size)
- GIF support for animated elements (water, fire, etc.)
- Objects persisted in database (`map_objects` table) — survive page reload
- Objects synced to player display in real-time via SSE `objects:update` event
- Dual visibility: objects can be visible to GM only, player only, both, or neither
- New objects default to hidden from player (visible to GM only)

### Camera Viewport
- GM controls a draggable/resizable camera rectangle (`C` key)
- Click inside to drag, click corners to resize, click outside to draw new
- Solid cyan border with corner handles — distinct from room boxes
- Player display shows exactly what's inside the camera at 100% screen
- Strict clipping: only camera area content is shown, black bars everywhere else
- Area outside camera dimmed in GM view
- Camera persisted in database (`camera_x/y/w/h` on session) — survives page reload

### Polygon Rooms (Meta Boxes)
- Draw polygon rooms (`B` key) — click to place vertices freely, hold Shift to snap to grid
- Click near first vertex to close the polygon (green snap indicator)
- Escape removes last vertex; cancels entirely when ≤1 point remains
- Rectangle rooms still supported (legacy)
- Types: autoReveal, trigger (with notes popup), hazard (hatched), note (GM-only), hidden
- Click to select (`S` key), right-click to edit/reveal/delete
- Reveal All / Clear buttons in panel

### Player Display
- Fullscreen, no UI chrome
- Shows exactly what's inside the GM's camera viewport
- Strict camera clipping with black bars for non-matching areas
- Map objects rendered with z-index ordering (player-visible only)
- Fog at full opacity
- Vignette overlay for atmosphere
- Grid overlay when enabled by GM
- Ping animations visible on player display
- Blackout mode (`X` key) — HTML overlay (no canvas state loss), custom message
- Prep mode with animated runes overlay
- SSE connection with auto-reconnect on visibility change (tab focus)
- Right-click disabled
- Objects reloaded properly on tab visibility change

### Measurement
- Ruler tool (`M` key)
- Shows distance in feet and grid squares

### Ping
- Ping (`P` key) — animated expanding rings visible on both GM and player views

### Sessions & Persistence
- Dashboard to create, list, delete sessions
- Unique slug URLs (e.g. `/gm/dark-forest-42`)
- All sessions: objects and camera persisted in database
- Free users: fog in RAM only, export/import as `.veilmap.json`
- Pro users: fog + map persisted to database, server-side uploads
- 📺 Player button copies player URL to clipboard
- Grid visibility setting persisted in database

### Asset Library
- Global token SVGs available to all users (pins, skull, star, shield, sword)
- User-uploaded assets saved to library for reuse across sessions
- Browse and add from library via 📚 button

### Auth
- Register with email + password
- NextAuth.js v5 credentials provider
- Sessions and data are owner-gated

## Keyboard Shortcuts

Shortcuts shown as tooltips on hover in the toolbar.

| Key | Action |
|-----|--------|
| `R` | Reveal fog tool |
| `H` | Hide fog tool |
| `B` | Draw polygon room (meta box) |
| `S` | Select tool (objects + boxes) |
| `P` | Ping tool |
| `M` | Measure tool |
| `G` | Toggle grid (right-click for submenu) |
| `C` | Camera tool (drag/resize/draw) |
| `X` | Toggle blackout |
| `1-4` | Brush sizes (small → large) |
| `Ctrl+Z` | Undo |
| `Cmd+Z` | Undo (Mac) |
| `Space+Drag` | Pan (shows hand cursor) |
| `Scroll` | Zoom |
| `+` / `-` | Zoom in/out |
| `Shift` | Hold to snap polygon vertices to grid |
| `Escape` | Remove last polygon vertex / close modal |

## Data Model

Five tables: `users`, `sessions`, `boxes`, `map_objects`, `asset_library`.

- **users** — email, password hash, is_pro flag
- **sessions** — slug, name, owner, map URL, fog snapshot, prep mode, display settings, camera viewport (x/y/w/h), show_grid, grid_size
- **boxes** — position, size, polygon points (JSON), type, name, color, notes, revealed state
- **map_objects** — name, src (file URL), position, size, rotation, z_index, visible (GM), player_visible (default false), locked
- **asset_library** — owner (nullable for globals), name, url, category (object/token), is_global flag
