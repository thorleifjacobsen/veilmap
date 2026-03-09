-- CreateTable
CREATE TABLE "soundboard_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "slot_index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ambient',
    "file_url" TEXT NOT NULL,
    "volume" REAL NOT NULL DEFAULT 0.8,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "soundboard_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_soundboard_slots_session" ON "soundboard_slots"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "soundboard_slots_session_id_slot_index_key" ON "soundboard_slots"("session_id", "slot_index");

-- AddForeignKey
ALTER TABLE "soundboard_slots" ADD CONSTRAINT "soundboard_slots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
