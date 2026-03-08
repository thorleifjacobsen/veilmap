-- Add missing grid style fields referenced by Prisma Session model
ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "grid_color" TEXT NOT NULL DEFAULT '#c8963e',
  ADD COLUMN IF NOT EXISTS "grid_opacity" REAL NOT NULL DEFAULT 0.25;
