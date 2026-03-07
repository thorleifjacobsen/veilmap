-- Drop tokens table (tokens replaced by map objects)
DROP TABLE IF EXISTS "tokens";

-- Change default for player_visible to false (new objects hidden from player by default)
ALTER TABLE "map_objects" ALTER COLUMN "player_visible" SET DEFAULT false;

-- Create asset_library table for reusable objects/tokens
CREATE TABLE "asset_library" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'object',
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_library_pkey" PRIMARY KEY ("id")
);

-- Add index on owner_id
CREATE INDEX "idx_asset_library_owner" ON "asset_library"("owner_id");

-- Add foreign key constraint (nullable)
ALTER TABLE "asset_library" ADD CONSTRAINT "asset_library_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed global token assets (no owner needed — is_global = true)
INSERT INTO "asset_library" ("id", "owner_id", "name", "url", "category", "is_global") VALUES
  (gen_random_uuid(), NULL, 'Red Pin', '/assets/tokens/red-pin.svg', 'token', true),
  (gen_random_uuid(), NULL, 'Blue Pin', '/assets/tokens/blue-pin.svg', 'token', true),
  (gen_random_uuid(), NULL, 'Green Pin', '/assets/tokens/green-pin.svg', 'token', true),
  (gen_random_uuid(), NULL, 'Gold Pin', '/assets/tokens/gold-pin.svg', 'token', true),
  (gen_random_uuid(), NULL, 'Skull', '/assets/tokens/skull.svg', 'token', true),
  (gen_random_uuid(), NULL, 'Star', '/assets/tokens/star.svg', 'token', true),
  (gen_random_uuid(), NULL, 'Shield', '/assets/tokens/shield.svg', 'token', true),
  (gen_random_uuid(), NULL, 'Sword', '/assets/tokens/sword.svg', 'token', true);
