-- CreateTable
CREATE TABLE "ig_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "alias" TEXT NOT NULL,
    "ig_user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "token_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "token_refreshed_at" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ig_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ig_accounts_alias_key" ON "ig_accounts"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "ig_accounts_ig_user_id_key" ON "ig_accounts"("ig_user_id");
