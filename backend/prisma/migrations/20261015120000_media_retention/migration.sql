-- AlterTable
ALTER TABLE "media_insights" ADD COLUMN     "avg_watch_time_ms" INTEGER,
ADD COLUMN     "total_watch_time_ms" BIGINT,
ADD COLUMN     "retention_fetched_at" TIMESTAMPTZ(6);
