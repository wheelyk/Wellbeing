-- AlterTable
ALTER TABLE "users" ADD COLUMN     "habit_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "medication_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mood_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "symptom_enabled" BOOLEAN NOT NULL DEFAULT true;
