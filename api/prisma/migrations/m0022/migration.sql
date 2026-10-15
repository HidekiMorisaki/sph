-- CreateTable
CREATE TABLE "book_titles" (
    "id" SERIAL NOT NULL,
    "catalog_code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "author" VARCHAR(500),
    "publisher" VARCHAR(255),
    "edition" VARCHAR(100),
    "isbn" VARCHAR(13),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "book_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_copies" (
    "id" SERIAL NOT NULL,
    "copy_code" VARCHAR(40) NOT NULL,
    "title_id" INTEGER NOT NULL,
    "storage_id" INTEGER NOT NULL,
    "batch_id" INTEGER,
    "purchased_on" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'available',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "branchId" INTEGER,

    CONSTRAINT "book_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_copy_batches" (
    "id" SERIAL NOT NULL,
    "request_key" VARCHAR(100) NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "body_hash" VARCHAR(64) NOT NULL,
    "result" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "book_copy_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_reservations" (
    "id" SERIAL NOT NULL,
    "reservation_code" VARCHAR(40) NOT NULL,
    "title_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'waiting',
    "reserved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "book_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_loans" (
    "id" SERIAL NOT NULL,
    "loan_code" VARCHAR(40) NOT NULL,
    "copy_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "manager_id" INTEGER NOT NULL,
    "loaned_on" DATE NOT NULL,
    "due_on" DATE NOT NULL,
    "returned_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "book_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_change_history" (
    "id" SERIAL NOT NULL,
    "event_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "resource" VARCHAR(30) NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "book_change_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_widgets" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "employee_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "book_titles_catalog_code_key" ON "book_titles"("catalog_code");

-- CreateIndex
CREATE INDEX "book_titles_isbn_idx" ON "book_titles"("isbn");

-- CreateIndex
CREATE UNIQUE INDEX "book_copies_copy_code_key" ON "book_copies"("copy_code");

-- CreateIndex
CREATE INDEX "book_copies_title_id_idx" ON "book_copies"("title_id");

-- CreateIndex
CREATE INDEX "book_copies_storage_id_idx" ON "book_copies"("storage_id");

-- CreateIndex
CREATE UNIQUE INDEX "book_copy_batches_request_key_key" ON "book_copy_batches"("request_key");

-- CreateIndex
CREATE UNIQUE INDEX "book_reservations_reservation_code_key" ON "book_reservations"("reservation_code");

-- CreateIndex
CREATE INDEX "book_reservations_title_id_branch_id_reserved_at_idx" ON "book_reservations"("title_id", "branch_id", "reserved_at");

-- CreateIndex
CREATE UNIQUE INDEX "book_loans_loan_code_key" ON "book_loans"("loan_code");

-- CreateIndex
CREATE INDEX "book_loans_employee_id_due_on_idx" ON "book_loans"("employee_id", "due_on");

-- CreateIndex
CREATE UNIQUE INDEX "book_change_history_event_key_key" ON "book_change_history"("event_key");

-- CreateIndex
CREATE INDEX "book_change_history_resource_resource_id_created_at_idx" ON "book_change_history"("resource", "resource_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "employee_widgets_employee_id_code_key" ON "employee_widgets"("employee_id", "code");

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "book_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_storage_id_fkey" FOREIGN KEY ("storage_id") REFERENCES "storage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "book_copy_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copy_batches" ADD CONSTRAINT "book_copy_batches_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_reservations" ADD CONSTRAINT "book_reservations_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "book_titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_reservations" ADD CONSTRAINT "book_reservations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_reservations" ADD CONSTRAINT "book_reservations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_copy_id_fkey" FOREIGN KEY ("copy_id") REFERENCES "book_copies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_loans" ADD CONSTRAINT "book_loans_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_change_history" ADD CONSTRAINT "book_change_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_widgets" ADD CONSTRAINT "employee_widgets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE SEQUENCE book_catalog_code_seq;
CREATE SEQUENCE book_copy_code_seq;
CREATE SEQUENCE book_reservation_code_seq;
CREATE SEQUENCE book_loan_code_seq;

ALTER TABLE book_copies ADD CONSTRAINT book_copies_status_check CHECK (status IN ('available', 'unavailable'));
ALTER TABLE book_reservations ADD CONSTRAINT book_reservations_status_check CHECK (status IN ('waiting', 'held', 'fulfilled', 'cancelled', 'expired'));
ALTER TABLE book_loans ADD CONSTRAINT book_loans_dates_check CHECK (due_on >= loaned_on AND (returned_on IS NULL OR returned_on >= loaned_on));
CREATE UNIQUE INDEX book_reservations_active_employee_title ON book_reservations (title_id, employee_id) WHERE status IN ('waiting', 'held') AND deleted_at IS NULL;
CREATE UNIQUE INDEX book_loans_active_copy ON book_loans (copy_id) WHERE returned_on IS NULL AND deleted_at IS NULL;

CREATE TRIGGER book_titles_set_updated_at BEFORE UPDATE ON book_titles FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER book_copies_set_updated_at BEFORE UPDATE ON book_copies FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER book_copy_batches_set_updated_at BEFORE UPDATE ON book_copy_batches FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER book_reservations_set_updated_at BEFORE UPDATE ON book_reservations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER book_loans_set_updated_at BEFORE UPDATE ON book_loans FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER book_change_history_set_updated_at BEFORE UPDATE ON book_change_history FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER employee_widgets_set_updated_at BEFORE UPDATE ON employee_widgets FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

INSERT INTO permissions (name)
SELECT 'Operation: ' || code FROM unnest(ARRAY[
  'books.read', 'books.titles.manage', 'books.manage',
  'books.titles.create', 'books.titles.update', 'books.titles.delete',
  'books.copies.create', 'books.copies.update', 'books.copies.delete',
  'books.reservations.create', 'books.reservations.cancel', 'books.reservations.manage',
  'books.loans.create', 'books.loans.return', 'books.covers.update'
]) AS code
WHERE EXISTS (SELECT 1 FROM roles)
ON CONFLICT (name) DO NOTHING;

INSERT INTO permission_operations (operation, permission_id)
SELECT substring(p.name FROM 12), p.id FROM permissions p
WHERE p.name LIKE 'Operation: books.%' AND p.deleted_at IS NULL
ON CONFLICT (operation) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, scope_type)
SELECT r.id, po.permission_id,
  CASE WHEN r.default_key = 'branch_administrator' AND po.operation IN (
    'books.manage', 'books.copies.create', 'books.copies.update', 'books.copies.delete',
    'books.reservations.manage', 'books.loans.create', 'books.loans.return', 'books.covers.update'
  ) THEN 'own_branch' ELSE 'global' END
FROM roles r CROSS JOIN permission_operations po
WHERE r.deleted_at IS NULL AND po.deleted_at IS NULL AND po.operation LIKE 'books.%'
  AND (
    (po.operation IN ('books.read', 'books.reservations.create', 'books.reservations.cancel')
      AND r.default_key IN ('system_administrator', 'business_administrator', 'general_user', 'server_administrator', 'branch_administrator'))
    OR (po.operation IN ('books.titles.manage', 'books.titles.create', 'books.titles.update', 'books.titles.delete')
      AND r.default_key IN ('system_administrator', 'business_administrator'))
    OR (po.operation IN ('books.manage', 'books.copies.create', 'books.copies.update', 'books.copies.delete',
      'books.reservations.manage', 'books.loans.create', 'books.loans.return', 'books.covers.update')
      AND r.default_key IN ('system_administrator', 'business_administrator', 'branch_administrator'))
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;
