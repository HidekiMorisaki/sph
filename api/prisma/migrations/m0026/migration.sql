-- Keep the provenance of bibliographic details imported from NDL Search.
ALTER TABLE "book_titles"
  ADD COLUMN "source_provider" VARCHAR(40),
  ADD COLUMN "source_url" VARCHAR(500),
  ADD COLUMN "source_retrieved_at" TIMESTAMPTZ(3),
  ADD COLUMN "source_modified" BOOLEAN NOT NULL DEFAULT false;
