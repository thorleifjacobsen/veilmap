-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "measurement_unit" TEXT NOT NULL DEFAULT 'feet';
ALTER TABLE "sessions" ADD COLUMN "fog_style" TEXT NOT NULL DEFAULT 'solid';
