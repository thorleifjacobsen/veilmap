-- db/schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email        TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_pro       BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug         TEXT UNIQUE NOT NULL,
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'New Session',
  map_url      TEXT,
  fog_snapshot BYTEA,
  prep_mode    BOOLEAN DEFAULT FALSE,
  prep_message TEXT DEFAULT 'Preparing next scene…',
  gm_fog_opacity REAL DEFAULT 0.5,
  grid_size    INTEGER DEFAULT 32,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE boxes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL DEFAULT 'Room',
  type         TEXT NOT NULL DEFAULT 'autoReveal'
               CHECK (type IN ('autoReveal','trigger','hazard','note','hidden')),
  x            REAL NOT NULL,
  y            REAL NOT NULL,
  w            REAL NOT NULL,
  h            REAL NOT NULL,
  color        TEXT DEFAULT '#c8963e',
  notes        TEXT DEFAULT '',
  revealed     BOOLEAN DEFAULT FALSE,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tokens (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  emoji        TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#e05c2a',
  x            REAL NOT NULL,
  y            REAL NOT NULL,
  label        TEXT DEFAULT '',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_boxes_session    ON boxes(session_id);
CREATE INDEX idx_tokens_session   ON tokens(session_id);
CREATE INDEX idx_sessions_slug    ON sessions(slug);
CREATE INDEX idx_sessions_owner   ON sessions(owner_id);
