-- One stored PNG cover per title, with manual/openBD provenance.
ALTER TABLE "book_titles"
  ADD COLUMN "cover_source" VARCHAR(20),
  ADD COLUMN "cover_source_url" VARCHAR(500);
UPDATE "book_titles" SET "cover_source" = 'manual'
WHERE "cover_image" IS NOT NULL;
ALTER TABLE "book_titles" ADD CONSTRAINT "book_titles_cover_metadata_check" CHECK (
  ("cover_image" IS NULL AND "cover_source" IS NULL AND "cover_source_url" IS NULL)
  OR ("cover_image" IS NOT NULL AND "cover_source" IS NOT NULL
    AND (("cover_source" = 'manual' AND "cover_source_url" IS NULL)
      OR ("cover_source" = 'openbd' AND "cover_source_url" IS NOT NULL)))
);
