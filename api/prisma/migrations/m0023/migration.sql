-- Remove the accidental direct branch relation. A copy's branch is defined by its storage.
ALTER TABLE book_copies DROP CONSTRAINT "book_copies_branchId_fkey";
ALTER TABLE book_copies DROP COLUMN "branchId";
