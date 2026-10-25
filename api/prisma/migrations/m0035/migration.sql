-- Consolidated v0.7.0 changes (formerly m0035-m0038).
-- Existing tables are extended once; new tables declare their final constraints inline.
BEGIN;

-- Employee departure workflow.
ALTER TABLE employees
  ADD COLUMN deletion_scheduled_on DATE,
  ADD COLUMN deletion_requested_by_id INTEGER REFERENCES employees(id) ON DELETE RESTRICT,
  ADD COLUMN asset_return_completed_at TIMESTAMPTZ(3),
  ADD CONSTRAINT employees_deletion_request_check CHECK
    ((deletion_scheduled_on IS NULL) = (deletion_requested_by_id IS NULL));
CREATE INDEX employees_deletion_scheduled_on_deleted_at_idx ON employees(deletion_scheduled_on, deleted_at);

-- Tax-inclusive purchase amounts.
-- Legacy unknown prices remain NULL. New/edited records require prices in the API.
ALTER TABLE it_assets
  ADD COLUMN purchase_amount NUMERIC(16,2),
  ADD COLUMN purchase_currency VARCHAR(3),
  ADD CONSTRAINT it_assets_purchase_money_check CHECK (
    (purchase_amount IS NULL AND purchase_currency IS NULL) OR
    (purchase_amount IS NOT NULL AND purchase_currency IS NOT NULL
      AND purchase_amount >= 0 AND purchase_currency ~ '^[A-Z]{3}$')
  );
ALTER TABLE book_copies
  ADD COLUMN purchase_amount NUMERIC(16,2),
  ADD COLUMN purchase_currency VARCHAR(3),
  ADD CONSTRAINT book_copies_purchase_money_check CHECK (
    (purchase_amount IS NULL AND purchase_currency IS NULL) OR
    (purchase_amount IS NOT NULL AND purchase_currency IS NOT NULL
      AND purchase_amount >= 0 AND purchase_currency ~ '^[A-Z]{3}$')
  );
-- Software contract amount/currency values are retained without conversion;
-- their meaning is now explicitly the tax-inclusive total for the contract.

-- Scheduling, reservations and notifications.
-- CreateTable
CREATE TABLE "schedule_events" (
    "id" SERIAL NOT NULL,
    "event_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizer_id" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "schedule_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "schedule_events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "schedule_occurrences" (
    "id" SERIAL NOT NULL,
    "occurrence_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "original_start" TIMESTAMPTZ(3) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "start_date" DATE,
    "end_date" DATE,
    "title" VARCHAR(255) NOT NULL,
    "description" VARCHAR(10000) NOT NULL DEFAULT '',
    "location" VARCHAR(500) NOT NULL DEFAULT '',
    "visibility" VARCHAR(16) NOT NULL DEFAULT 'public',
    "is_exception" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "schedule_occurrences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "schedule_occurrences_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "schedule_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT occurrence_interval_check CHECK (starts_at < ends_at AND visibility IN ('public','private') AND ((NOT all_day AND start_date IS NULL AND end_date IS NULL) OR (all_day AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date < end_date)))
);

-- CreateTable
CREATE TABLE "schedule_participants" (
    "id" SERIAL NOT NULL,
    "occurrence_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "response" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "schedule_participants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "schedule_participants_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "schedule_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "schedule_participants_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT schedule_response_check CHECK (response IN ('pending','accepted','tentative','declined'))
);

-- CreateTable
CREATE TABLE "schedule_preferences" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "settings" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "schedule_preferences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "schedule_preferences_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reservable_resources" (
    "id" SERIAL NOT NULL,
    "resource_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" VARCHAR(16) NOT NULL,
    "room_id" INTEGER,
    "asset_id" INTEGER,
    "is_bookable" BOOLEAN NOT NULL DEFAULT false,
    "time_zone" VARCHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "reservable_resources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reservable_resources_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "reservable_resources_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "it_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT resource_kind_check CHECK ((kind='room' AND room_id IS NOT NULL AND asset_id IS NULL) OR (kind='asset' AND asset_id IS NOT NULL AND room_id IS NULL))
);

-- CreateTable
CREATE TABLE "resource_reservations" (
    "id" SERIAL NOT NULL,
    "occurrence_id" INTEGER NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "resource_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "resource_reservations_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "schedule_occurrences"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "resource_reservations_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "reservable_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT reservation_interval_check CHECK (starts_at < ends_at)
);

-- CreateTable
CREATE TABLE "notification_events" (
    "id" SERIAL NOT NULL,
    "notification_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" VARCHAR(40) NOT NULL,
    "target_type" VARCHAR(80) NOT NULL,
    "target_key" VARCHAR(128) NOT NULL,
    "deduplication_key" VARCHAR(180) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" SERIAL NOT NULL,
    "notification_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_recipients_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notification_recipients_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_events_event_key_key" ON "schedule_events"("event_key");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_events_organizer_id_idempotency_key_key" ON "schedule_events"("organizer_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_occurrences_occurrence_key_key" ON "schedule_occurrences"("occurrence_key");

-- CreateIndex
CREATE INDEX "schedule_occurrences_starts_at_ends_at_idx" ON "schedule_occurrences"("starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_occurrences_event_id_sequence_key" ON "schedule_occurrences"("event_id", "sequence");

-- CreateIndex
CREATE INDEX "schedule_participants_employee_id_deleted_at_idx" ON "schedule_participants"("employee_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_participants_occurrence_id_employee_id_key" ON "schedule_participants"("occurrence_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_preferences_employee_id_key" ON "schedule_preferences"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservable_resources_resource_key_key" ON "reservable_resources"("resource_key");

-- CreateIndex
CREATE UNIQUE INDEX "reservable_resources_room_id_key" ON "reservable_resources"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservable_resources_asset_id_key" ON "reservable_resources"("asset_id");

-- CreateIndex
CREATE INDEX "resource_reservations_resource_id_starts_at_ends_at_idx" ON "resource_reservations"("resource_id", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "resource_reservations_occurrence_id_resource_id_key" ON "resource_reservations"("occurrence_id", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_events_notification_key_key" ON "notification_events"("notification_key");

-- CreateIndex
CREATE UNIQUE INDEX "notification_events_deduplication_key_key" ON "notification_events"("deduplication_key");

-- CreateIndex
CREATE INDEX "notification_recipients_employee_id_read_at_deleted_at_idx" ON "notification_recipients"("employee_id", "read_at", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipients_notification_id_employee_id_key" ON "notification_recipients"("notification_id", "employee_id");

CREATE TRIGGER schedule_events_set_updated_at BEFORE UPDATE ON schedule_events FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER schedule_occurrences_set_updated_at BEFORE UPDATE ON schedule_occurrences FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER schedule_participants_set_updated_at BEFORE UPDATE ON schedule_participants FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER schedule_preferences_set_updated_at BEFORE UPDATE ON schedule_preferences FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER reservable_resources_set_updated_at BEFORE UPDATE ON reservable_resources FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER resource_reservations_set_updated_at BEFORE UPDATE ON resource_reservations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER notification_events_set_updated_at BEFORE UPDATE ON notification_events FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER notification_recipients_set_updated_at BEFORE UPDATE ON notification_recipients FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

INSERT INTO permissions(name) SELECT 'Operation: ' || code FROM unnest(ARRAY['schedule.read','schedule.create','schedule.update','schedule.cancel','schedule.respond','schedule.preferences.update','notifications.read','notifications.update','schedule.reserve']) code WHERE EXISTS(SELECT 1 FROM roles) ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT substring(name FROM 12),id FROM permissions WHERE name IN (SELECT 'Operation: ' || code FROM unnest(ARRAY['schedule.read','schedule.create','schedule.update','schedule.cancel','schedule.respond','schedule.preferences.update','notifications.read','notifications.update','schedule.reserve']) code) AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND r.deleted_at IS NULL AND po.operation IN ('schedule.read','schedule.create','schedule.update','schedule.cancel','schedule.respond','schedule.preferences.update','notifications.read','notifications.update','schedule.reserve') AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: schedule.reservations.release' WHERE EXISTS(SELECT 1 FROM roles) ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'schedule.reservations.release',id FROM permissions WHERE name='Operation: schedule.reservations.release' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='system_administrator' AND r.deleted_at IS NULL AND po.operation='schedule.reservations.release' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

-- Notification dismissal belongs to each recipient, never the shared event.
INSERT INTO permissions(name)
SELECT 'Operation: notifications.delete' WHERE EXISTS(SELECT 1 FROM roles)
ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id)
SELECT 'notifications.delete',id FROM permissions
WHERE name='Operation: notifications.delete' AND deleted_at IS NULL
ON CONFLICT(operation) DO NOTHING;

-- Do not expand custom roles or built-in roles whose notification access was revoked.
INSERT INTO role_permissions(role_id,permission_id,scope_type)
SELECT r.id,operation.permission_id,'global'
FROM roles r CROSS JOIN permission_operations operation
WHERE r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator')
AND r.deleted_at IS NULL AND operation.operation='notifications.delete' AND operation.deleted_at IS NULL
AND NOT EXISTS (
 SELECT 1 FROM unnest(ARRAY['notifications.read','notifications.update']) required(code)
 WHERE NOT EXISTS (
  SELECT 1 FROM role_permissions rp
  JOIN permission_operations po ON po.permission_id=rp.permission_id AND po.deleted_at IS NULL
  JOIN permissions p ON p.id=po.permission_id AND p.deleted_at IS NULL
  WHERE rp.role_id=r.id AND rp.deleted_at IS NULL AND rp.scope_type='global' AND po.operation=required.code
 )
)
ON CONFLICT(role_id,permission_id) DO NOTHING;

COMMIT;
