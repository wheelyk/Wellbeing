-- CreateEnum
CREATE TYPE "category_value_type" AS ENUM ('BOOLEAN', 'NUMERIC', 'SCALE', 'DURATION');

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "value_type" "category_value_type" NOT NULL,
    "scale_min" INTEGER,
    "scale_max" INTEGER,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "value_boolean" BOOLEAN,
    "value_numeric" DOUBLE PRECISION,
    "value_duration_minutes" INTEGER,
    "notes" TEXT,
    "logged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_user_id_idx" ON "categories"("user_id");

-- CreateIndex
CREATE INDEX "category_logs_user_id_logged_at_idx" ON "category_logs"("user_id", "logged_at");

-- CreateIndex
CREATE INDEX "category_logs_category_id_logged_at_idx" ON "category_logs"("category_id", "logged_at");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_logs" ADD CONSTRAINT "category_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_logs" ADD CONSTRAINT "category_logs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
