-- Add camera fields and show_grid to sessions
ALTER TABLE "sessions" ADD COLUMN "show_grid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sessions" ADD COLUMN "camera_x" REAL;
ALTER TABLE "sessions" ADD COLUMN "camera_y" REAL;
ALTER TABLE "sessions" ADD COLUMN "camera_w" REAL;
ALTER TABLE "sessions" ADD COLUMN "camera_h" REAL;

-- Create map_objects table for persistent objects
CREATE TABLE "map_objects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Object',
    "src" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "w" REAL NOT NULL,
    "h" REAL NOT NULL,
    "rotation" REAL NOT NULL DEFAULT 0,
    "z_index" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "player_visible" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_objects_pkey" PRIMARY KEY ("id")
);

-- Add index on session_id
CREATE INDEX "idx_map_objects_session" ON "map_objects"("session_id");

-- Add foreign key constraint
ALTER TABLE "map_objects" ADD CONSTRAINT "map_objects_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
