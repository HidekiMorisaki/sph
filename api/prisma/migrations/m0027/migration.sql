-- Cover images belong exclusively to bibliographic titles.
-- Existing per-copy images are intentionally discarded: reinstall is expected.
ALTER TABLE "book_copies" DROP COLUMN "cover_image";
ALTER TABLE "book_titles" DROP COLUMN "source_modified";
