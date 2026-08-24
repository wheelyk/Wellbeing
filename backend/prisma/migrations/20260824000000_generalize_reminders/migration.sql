-- DropColumn
-- The single per-user reminder (reminder_enabled/reminder_time/last_reminder_sent_date) is
-- replaced by the generalized "reminders" table below - confirmed directly with the project
-- owner that any existing enabled reminder is not migrated forward; anyone with one configured
-- today will need to reconfigure it after this deploys.
ALTER TABLE "users" DROP COLUMN "reminder_enabled",
DROP COLUMN "reminder_time",
DROP COLUMN "last_reminder_sent_date";

-- CreateEnum
CREATE TYPE "reminder_target" AS ENUM ('GENERAL', 'MOOD', 'SYMPTOM', 'HABIT', 'MEDICATION', 'CATEGORY');

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target" "reminder_target" NOT NULL,
    "medication_id" TEXT,
    "category_id" TEXT,
    "times" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_sends" (
    "id" TEXT NOT NULL,
    "reminder_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_sends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminders_user_id_idx" ON "reminders"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_sends_reminder_id_date_time_key" ON "reminder_sends"("reminder_id", "date", "time");

-- CreateIndex
CREATE INDEX "reminder_sends_reminder_id_date_idx" ON "reminder_sends"("reminder_id", "date");

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_medication_id_fkey" FOREIGN KEY ("medication_id") REFERENCES "medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
