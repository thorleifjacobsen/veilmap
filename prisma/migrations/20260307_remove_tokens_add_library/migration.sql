-- Drop tokens table (tokens replaced by map objects)
DROP TABLE IF EXISTS "tokens";

-- Change default for player_visible to false (new objects hidden from player by default)
ALTER TABLE "map_objects" ALTER COLUMN "player_visible" SET DEFAULT false;

-- Create asset_library table for reusable objects/tokens
CREATE TABLE "asset_library" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'object',
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_library_pkey" PRIMARY KEY ("id")
);

-- Add index on owner_id
CREATE INDEX "idx_asset_library_owner" ON "asset_library"("owner_id");

-- Add foreign key constraint
ALTER TABLE "asset_library" ADD CONSTRAINT "asset_library_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed some global token assets (only if users table has at least one user)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users LIMIT 1) THEN
    INSERT INTO "asset_library" ("id", "owner_id", "name", "url", "category", "is_global") VALUES
      (gen_random_uuid(), (SELECT id FROM users LIMIT 1), 'Red Pin', '/assets/tokens/red-pin.svg', 'token', true),
      (gen_random_uuid(), (SELECT id FROM users LIMIT 1), 'Blue Pin', '/assets/tokens/blue-pin.svg', 'token', true),
      (gen_random_uuid(), (SELECT id FROM users LIMIT 1), 'Green Pin', '/assets/tokens/green-pin.svg', 'token', true),
      (gen_random_uuid(), (SELECT id FROM users LIMIT 1), 'Gold Pin', '/assets/tokens/gold-pin.svg', 'token', true),
      (gen_random_uuid(), (SELECT id FROM users LIMIT 1), 'Skull', '/assets/tokens/skull.svg', 'token', true),
      (gen_random_uuid(), (SELECT id FROM users LIMIT 1), 'Star', '/assets/tokens/star.svg', 'token', true),
      (gen_random_uuid(), (SELECT id FROM users LIMIT 1), 'Shield', '/assets/tokens/shield.svg', 'token', true),
      (gen_random_uuid(), (SELECT id FROM users LIMIT 1), 'Sword', '/assets/tokens/sword.svg', 'token', true);
  END IF;
END $$;
