-- CreateTable
CREATE TABLE "ad_change_log" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ad_account_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "object_name" TEXT,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "daily_before" DECIMAL(12,2),
    "daily_after" DECIMAL(12,2),
    "result" TEXT NOT NULL,
    "message" TEXT,

    CONSTRAINT "ad_change_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_change_log_ad_account_id_created_at_idx" ON "ad_change_log"("ad_account_id", "created_at");
