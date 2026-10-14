-- CreateTable
CREATE TABLE "media_insights" (
    "alias" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "posted_at" TIMESTAMPTZ(6) NOT NULL,
    "media_type" TEXT NOT NULL,
    "media_product_type" TEXT,
    "reach" INTEGER,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saved" INTEGER,
    "total_interactions" INTEGER,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_insights_pkey" PRIMARY KEY ("alias","media_id")
);

-- CreateIndex
CREATE INDEX "media_insights_alias_posted_at_idx" ON "media_insights"("alias", "posted_at");
