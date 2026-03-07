# VeilMap — Product & Architecture Document

> This document describes what VeilMap is, how it is structured, and the decisions
> behind the stack. It is written for developers and AI coding agents.
> Implementation details are left to the agent — focus here is on intent and constraints.

---

## What is VeilMap?

VeilMap is a real-time Fog of War tool built for tabletop RPG game masters who run
sessions with a physical projector or second screen.

The GM uses one browser window to control the map — painting fog, placing tokens,
and managing rooms. A second URL, opened on the projector, shows players only what
has been revealed. Everything syncs in real time.

---

## The Two Views

**GM View** — `/gm/[slug]`
The control interface. Only accessible by the session owner. Used on the GM's laptop.
Contains all tools: fog brush, meta boxes, token placement, settings, prep mode.

**Player Display** — `/play/[slug]`
Fullscreen, no UI chrome. Opened on the projector or TV.
Receives live updates from the GM. Shows only what the GM has revealed.
Anyone with the URL can open this — no login required.

---

## Free vs Pro

The distinction is simple: **free users work in RAM, pro users get persistence.**

Free users have access to every feature during a session. When they close the browser,
the session is gone. They can export their session setup (boxes, tokens, settings) as
a JSON file and re-import it next time. The map image lives in their browser only.

Pro users get their fog state saved to the database automatically, their map image
stored on the server, and their session survives page reloads and server restarts.

There is no payment integration in the MVP. The `is_pro` flag on the user account
is set manually for now.

---

## Tech Stack & Reasoning

**Next.js 14 (App Router)**
Standard choice. Handles routing, API, and server-side rendering in one place.
No custom server setup — just `npm run dev` and `npm start`.

**PostgreSQL via postgres.js**
Straightforward SQL, no ORM, no abstraction layer. The schema is simple enough
that direct queries are cleaner than Prisma or similar tools.

**Server-Sent Events (SSE)**
Used for pushing updates from the server to the player display in real time.
SSE is one-directional (server → browser) which is exactly what we need —
the player display never needs to send anything back.
SSE works over standard HTTP, requires no special server setup, and is natively
supported in Next.js Route Handlers.
The GM sends fog paint operations to the server via regular POST requests
(throttled to avoid flooding), and the server fans them out to all SSE listeners
on that session slug.

**In-memory session state**
Active fog state is held in server RAM during a session. This means it is fast
and requires no DB round-trip on every brush stroke. A full fog snapshot is
persisted to the database periodically (every ~10 seconds) and on page unload —
but only for pro users. Free users lose fog state on reload by design.

**NextAuth.js v5 — credentials provider**
Email and password authentication. Simple, self-contained, no third-party OAuth
needed for MVP.

**Caddy**
Reverse proxy. Handles HTTPS automatically when a domain is pointed at the server.
No configuration needed for SSE — it is just HTTP. When running on IP only,
Caddy listens on port 80 and forwards to Next.js on port 3000.

**PM2**
Keeps the Next.js process alive and restarts it after server reboots.
One process, one port (3000), no complexity.

**Map uploads → `/public/uploads/`**
Next.js serves the `public/` folder statically out of the box.
Storing uploads there means no extra static file server is needed.
The folder is added to `.gitignore` so uploaded files are not committed to Git.
This is a Pro-only feature — free users load their map locally in the browser
without uploading it to the server.

---

## Data Model

Four tables: `users`, `sessions`, `boxes`, `tokens`.

**users** — email, hashed password, is_pro flag.

**sessions** — belongs to a user. Has a unique slug (used in both URLs),
a name, optional map URL (pro only), fog snapshot (pro only), prep mode state,
and display settings like fog opacity and grid size.

**boxes** — the meta box system. Each box belongs to a session and has a position,
size, type, name, color, notes, and a revealed flag. Types are:
- `autoReveal` — brushing anywhere inside instantly reveals the whole box
- `trigger` — same as autoReveal but also shows a GM note popup on reveal
- `hazard` — visual danger zone marker, no reveal behavior
- `note` — GM-only annotation, never shown on player display
- `hidden` — invisible, used for scripting zones

**tokens** — emoji-based character/object markers. Belong to a session,
have a position and a color ring.

---

## Realtime Sync Strategy

The player display connects to an SSE endpoint for the session slug.
On connection it immediately receives the full current state —
fog snapshot, all boxes, all tokens, prep mode status.

After that it receives incremental events as the GM acts:
fog paint strokes, box reveals, token moves, ping locations, prep mode toggles.

The GM client sends paint operations via POST, throttled to one request per 50ms.
All other actions (box reveal, token move, etc.) are sent immediately as they happen.

Every 10 seconds, and when the GM navigates away, the client sends a full fog snapshot.
This snapshot is kept in server memory so reconnecting players get the latest state.
For pro users it is also saved to the database.

---

## Session Export / Import (Free Tier)

Export and import happen entirely in the browser — no server request involved.

Export serializes the session's boxes, tokens, and settings to a `.veilmap.json` file
that the user downloads. Fog state is not exported — free users start with a blank
fog each session.

Import reads a `.veilmap.json` file and restores boxes, tokens, and settings.
The GM still needs to re-upload or re-select their map image.

---

## Fog Rendering

Fog lives on an offscreen HTML canvas at the map's native resolution.
This canvas is composited onto the screen using the current viewport transform.

The GM sees the fog at a reduced, adjustable opacity so they can see the map
underneath while painting. Players always see the fog at full opacity.

The fog canvas uses compositing operations to reveal areas (erasing the dark overlay)
and hide them again (painting the dark overlay back). The box snap-reveal fills
the entire box area at once instead of relying on brush strokes.

Undo is client-side only — a stack of fog canvas snapshots, maximum 20 deep.

---

## Viewport

The map can be larger than the screen. Pan and zoom are handled client-side.
Pan is triggered by holding Space and dragging, or with the middle mouse button.
Zoom is triggered by scroll wheel, pinch gesture, or keyboard shortcuts.

All coordinates stored in the database and sent over the network are in
map space (not screen space), so they are viewport-independent.

---

## UI Reference

The file `fogofwar-v4.html` is a fully working single-file prototype of the GM view.
It demonstrates all interactions, visual style, and canvas behavior.
Use it as the visual and interaction reference when building the React components.
Do not copy it verbatim — port the concepts into proper Next.js component structure.

---

## What Is Explicitly Out of Scope (MVP)

- Payment or subscription management
- Initiative tracker
- Multiple map layers
- Custom token images
- Session sharing between users
- Mobile-optimized GM view
- Offline support