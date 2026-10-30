-- CreateTable
CREATE TABLE "ad_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" TEXT NOT NULL,
    "token_enc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_error" TEXT,
    "checked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ad_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_accounts" (
    "ad_account_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "token_id" UUID NOT NULL,
    "name" TEXT,
    "currency" TEXT,
    "timezone" TEXT,
    "monthly_cap" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ad_accounts_pkey" PRIMARY KEY ("ad_account_id")
);

-- CreateTable
CREATE TABLE "ad_insight_cache" (
    "cache_key" TEXT NOT NULL,
    "ad_account_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ad_insight_cache_pkey" PRIMARY KEY ("cache_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ad_tokens_label_key" ON "ad_tokens"("label");

-- CreateIndex
CREATE INDEX "ad_accounts_alias_idx" ON "ad_accounts"("alias");

-- CreateIndex
CREATE INDEX "ad_insight_cache_ad_account_id_idx" ON "ad_insight_cache"("ad_account_id");

-- CreateIndex
CREATE INDEX "ad_insight_cache_expires_at_idx" ON "ad_insight_cache"("expires_at");

-- AddForeignKey
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "ad_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
