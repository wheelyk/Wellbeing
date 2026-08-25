-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "description" TEXT;

-- CreateTable
CREATE TABLE "hidden_categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hidden_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hidden_categories_user_id_category_id_key" ON "hidden_categories"("user_id", "category_id");

-- AddForeignKey
ALTER TABLE "hidden_categories" ADD CONSTRAINT "hidden_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hidden_categories" ADD CONSTRAINT "hidden_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
