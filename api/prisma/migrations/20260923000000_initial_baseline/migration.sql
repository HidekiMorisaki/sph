-- Initial database schema and master data.
-- Existing data is intentionally not migrated by this baseline.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('unprovisioned', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "DisposalDatePolicy" AS ENUM ('prohibited', 'optional', 'required');

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "employee_code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "name_kana" TEXT,
    "birth_date" DATE NOT NULL,
    "gender" TEXT NOT NULL,
    "blood_type" TEXT,
    "postal_code" VARCHAR(8),
    "prefecture" VARCHAR(64),
    "city" VARCHAR(128),
    "street_address" VARCHAR(255),
    "building_name" VARCHAR(255),
    "mobile_phone" TEXT,
    "email" TEXT NOT NULL,
    "hired_at" DATE NOT NULL,
    "department_id" INTEGER,
    "group_id" INTEGER,
    "position_id" INTEGER,
    "employment_type_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "work_calendar_id" INTEGER,
    "retired_at" DATE,
    "notes" TEXT,
    "username" TEXT,
    "password_hash" TEXT,
    "account_status" "AccountStatus" NOT NULL DEFAULT 'unprovisioned',
    "must_change_credentials" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_calendars" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "calendar_year" INTEGER NOT NULL,
    "description" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "work_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_calendar_days" (
    "id" SERIAL NOT NULL,
    "calendar_id" INTEGER NOT NULL,
    "work_date" DATE NOT NULL,
    "entry_type" VARCHAR(32) NOT NULL DEFAULT 'working_day',
    "title" VARCHAR(128) NOT NULL,
    "note" VARCHAR(5000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "work_calendar_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_date_attributes" (
    "id" SERIAL NOT NULL,
    "calendar_date" DATE NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "source_url" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "calendar_date_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_holiday_imports" (
    "id" SERIAL NOT NULL,
    "import_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_url" VARCHAR(500) NOT NULL,
    "range_start" DATE,
    "range_end" DATE,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL,
    "error_message" VARCHAR(500),
    "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "calendar_holiday_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_roles" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "scope_type" TEXT NOT NULL DEFAULT 'global',
    "scope_key" TEXT NOT NULL DEFAULT 'global',
    "department_id" INTEGER,
    "scope_employee_id" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "employee_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_groups" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "employee_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "employment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "branch_id" INTEGER NOT NULL,
    "room_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "storage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "opened_on" DATE,
    "closed_on" DATE,
    "postal_code" VARCHAR(8),
    "prefecture" VARCHAR(64),
    "city" VARCHAR(128),
    "street_address" VARCHAR(255),
    "building_name" VARCHAR(255),
    "phone_number_1" VARCHAR(32),
    "phone_number_1_label" VARCHAR(128),
    "phone_number_2" VARCHAR(32),
    "phone_number_2_label" VARCHAR(128),
    "fax_number_1" VARCHAR(32),
    "fax_number_1_label" VARCHAR(128),
    "fax_number_2" VARCHAR(32),
    "fax_number_2_label" VARCHAR(128),
    "manager_employee_id" INTEGER,
    "deputy_manager_employee_id" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "branch_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "it_assets" (
    "id" SERIAL NOT NULL,
    "asset_tag" TEXT NOT NULL,
    "type_id" INTEGER NOT NULL,
    "manufacturer_id" INTEGER,
    "model_number" TEXT,
    "serial_number" TEXT,
    "cpu_type_id" INTEGER,
    "ram_gb" INTEGER,
    "operating_system_id" INTEGER,
    "login_username" TEXT,
    "storage_id" INTEGER NOT NULL,
    "status_id" INTEGER NOT NULL,
    "purchased_on" DATE NOT NULL,
    "disposal_on" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "it_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "it_asset_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "management_code_prefix" VARCHAR(5) NOT NULL,
    "next_management_number" INTEGER NOT NULL DEFAULT 1,
    "supports_cpu" BOOLEAN NOT NULL DEFAULT false,
    "supports_ram" BOOLEAN NOT NULL DEFAULT false,
    "supports_os" BOOLEAN NOT NULL DEFAULT false,
    "supports_login_username" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "it_asset_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "official_url" TEXT,
    "source_checked_on" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "manufacturers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cpu_types" (
    "id" SERIAL NOT NULL,
    "manufacturer_id" INTEGER NOT NULL,
    "series" TEXT NOT NULL,
    "model_number" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "official_url" TEXT,
    "source_checked_on" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "cpu_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operating_systems" (
    "id" SERIAL NOT NULL,
    "vendor" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "edition" TEXT,
    "architecture" TEXT,
    "display_name" TEXT NOT NULL,
    "official_url" TEXT,
    "source_checked_on" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "operating_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "it_asset_statuses" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "disposal_date_policy" "DisposalDatePolicy" NOT NULL DEFAULT 'prohibited',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "it_asset_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "it_asset_assignments" (
    "id" SERIAL NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returned_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "it_asset_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "it_asset_change_history" (
    "id" SERIAL NOT NULL,
    "event_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" INTEGER NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "changes" JSONB NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "it_asset_change_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_change_history" (
    "id" SERIAL NOT NULL,
    "event_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" INTEGER NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "changes" JSONB NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "employee_change_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "event_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" INTEGER NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "token_hash" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "token_hash" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_invitations" (
    "id" SERIAL NOT NULL,
    "token_hash" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "issued_by_id" INTEGER NOT NULL,
    "email_at_issue" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "account_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_username_key" ON "employees"("username");

-- CreateIndex
CREATE INDEX "employees_work_calendar_id_idx" ON "employees"("work_calendar_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_calendars_name_key" ON "work_calendars"("name");

-- CreateIndex
CREATE INDEX "work_calendars_calendar_year_idx" ON "work_calendars"("calendar_year");

-- CreateIndex
CREATE UNIQUE INDEX "work_calendar_days_calendar_id_work_date_key" ON "work_calendar_days"("calendar_id", "work_date");

-- CreateIndex
CREATE INDEX "work_calendar_days_calendar_id_idx" ON "work_calendar_days"("calendar_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_date_attributes_calendar_date_kind_key" ON "calendar_date_attributes"("calendar_date", "kind");

-- CreateIndex
CREATE INDEX "calendar_date_attributes_calendar_date_idx" ON "calendar_date_attributes"("calendar_date");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_holiday_imports_import_key_key" ON "calendar_holiday_imports"("import_key");

-- CreateIndex
CREATE INDEX "calendar_holiday_imports_completed_at_idx" ON "calendar_holiday_imports"("completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "employee_roles_role_id_idx" ON "employee_roles"("role_id");

-- CreateIndex
CREATE INDEX "employee_roles_department_id_idx" ON "employee_roles"("department_id");

-- CreateIndex
CREATE INDEX "employee_roles_scope_employee_id_idx" ON "employee_roles"("scope_employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_roles_employee_id_role_id_scope_type_scope_key_key" ON "employee_roles"("employee_id", "role_id", "scope_type", "scope_key");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_groups_name_key" ON "employee_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "positions_name_key" ON "positions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employment_types_name_key" ON "employment_types"("name");

-- CreateIndex
CREATE INDEX "storage_room_id_idx" ON "storage"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "storage_branch_id_room_id_name_key" ON "storage"("branch_id", "room_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "branches_name_key" ON "branches"("name");

-- CreateIndex
CREATE INDEX "branches_manager_employee_id_idx" ON "branches"("manager_employee_id");

-- CreateIndex
CREATE INDEX "branches_deputy_manager_employee_id_idx" ON "branches"("deputy_manager_employee_id");

-- CreateIndex
CREATE INDEX "rooms_branch_id_idx" ON "rooms"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_branch_id_name_key" ON "rooms"("branch_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_branch_id_id_key" ON "rooms"("branch_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "it_assets_asset_tag_key" ON "it_assets"("asset_tag");

-- CreateIndex
CREATE INDEX "it_assets_type_id_idx" ON "it_assets"("type_id");

-- CreateIndex
CREATE INDEX "it_assets_manufacturer_id_idx" ON "it_assets"("manufacturer_id");

-- CreateIndex
CREATE INDEX "it_assets_cpu_type_id_idx" ON "it_assets"("cpu_type_id");

-- CreateIndex
CREATE INDEX "it_assets_operating_system_id_idx" ON "it_assets"("operating_system_id");

-- CreateIndex
CREATE INDEX "it_assets_storage_id_idx" ON "it_assets"("storage_id");

-- CreateIndex
CREATE INDEX "it_assets_status_id_idx" ON "it_assets"("status_id");

-- CreateIndex
CREATE UNIQUE INDEX "it_assets_manufacturer_id_serial_number_key" ON "it_assets"("manufacturer_id", "serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "it_asset_types_name_key" ON "it_asset_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "it_asset_types_management_code_prefix_key" ON "it_asset_types"("management_code_prefix");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_name_key" ON "manufacturers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cpu_types_display_name_key" ON "cpu_types"("display_name");

-- CreateIndex
CREATE INDEX "cpu_types_manufacturer_id_idx" ON "cpu_types"("manufacturer_id");

-- CreateIndex
CREATE UNIQUE INDEX "cpu_types_manufacturer_id_model_number_key" ON "cpu_types"("manufacturer_id", "model_number");

-- CreateIndex
CREATE UNIQUE INDEX "operating_systems_display_name_key" ON "operating_systems"("display_name");

-- CreateIndex
CREATE UNIQUE INDEX "it_asset_statuses_name_key" ON "it_asset_statuses"("name");

-- CreateIndex
CREATE INDEX "it_asset_assignments_asset_id_idx" ON "it_asset_assignments"("asset_id");

-- CreateIndex
CREATE INDEX "it_asset_assignments_employee_id_idx" ON "it_asset_assignments"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "it_asset_assignments_asset_id_assigned_at_key" ON "it_asset_assignments"("asset_id", "assigned_at");

-- CreateIndex
CREATE UNIQUE INDEX "it_asset_change_history_event_key_key" ON "it_asset_change_history"("event_key");

-- CreateIndex
CREATE INDEX "it_asset_change_history_asset_id_changed_at_idx" ON "it_asset_change_history"("asset_id", "changed_at");

-- CreateIndex
CREATE INDEX "it_asset_change_history_actor_id_idx" ON "it_asset_change_history"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_change_history_event_key_key" ON "employee_change_history"("event_key");

-- CreateIndex
CREATE INDEX "employee_change_history_employee_id_changed_at_idx" ON "employee_change_history"("employee_id", "changed_at");

-- CreateIndex
CREATE INDEX "employee_change_history_actor_id_idx" ON "employee_change_history"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_event_key_key" ON "audit_logs"("event_key");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_employee_id_idx" ON "sessions"("employee_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_employee_id_idx" ON "password_reset_tokens"("employee_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "account_invitations_token_hash_key" ON "account_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "account_invitations_employee_id_created_at_idx" ON "account_invitations"("employee_id", "created_at");

-- CreateIndex
CREATE INDEX "account_invitations_issued_by_id_idx" ON "account_invitations"("issued_by_id");

-- CreateIndex
CREATE INDEX "account_invitations_expires_at_idx" ON "account_invitations"("expires_at");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "employee_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_employment_type_id_fkey" FOREIGN KEY ("employment_type_id") REFERENCES "employment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_work_calendar_id_fkey" FOREIGN KEY ("work_calendar_id") REFERENCES "work_calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_calendar_days" ADD CONSTRAINT "work_calendar_days_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "work_calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_manager_employee_id_fkey" FOREIGN KEY ("manager_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_deputy_manager_employee_id_fkey" FOREIGN KEY ("deputy_manager_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_scope_employee_id_fkey" FOREIGN KEY ("scope_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage" ADD CONSTRAINT "storage_branch_id_room_id_fkey" FOREIGN KEY ("branch_id", "room_id") REFERENCES "rooms"("branch_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_assets" ADD CONSTRAINT "it_assets_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "it_asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_assets" ADD CONSTRAINT "it_assets_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_assets" ADD CONSTRAINT "it_assets_cpu_type_id_fkey" FOREIGN KEY ("cpu_type_id") REFERENCES "cpu_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_assets" ADD CONSTRAINT "it_assets_operating_system_id_fkey" FOREIGN KEY ("operating_system_id") REFERENCES "operating_systems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_assets" ADD CONSTRAINT "it_assets_storage_id_fkey" FOREIGN KEY ("storage_id") REFERENCES "storage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_assets" ADD CONSTRAINT "it_assets_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "it_asset_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cpu_types" ADD CONSTRAINT "cpu_types_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_asset_assignments" ADD CONSTRAINT "it_asset_assignments_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "it_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_asset_assignments" ADD CONSTRAINT "it_asset_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_asset_change_history" ADD CONSTRAINT "it_asset_change_history_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "it_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "it_asset_change_history" ADD CONSTRAINT "it_asset_change_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_change_history" ADD CONSTRAINT "employee_change_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_change_history" ADD CONSTRAINT "employee_change_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Application-owned constraints not expressible in Prisma schema.
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_scope_check" CHECK (
  (scope_type = 'global' AND scope_key = 'global' AND department_id IS NULL AND scope_employee_id IS NULL)
  OR (scope_type = 'department' AND department_id IS NOT NULL AND scope_employee_id IS NULL AND scope_key = 'department:' || department_id::text)
  OR (scope_type = 'employee' AND department_id IS NULL AND scope_employee_id IS NOT NULL AND scope_key = 'employee:' || scope_employee_id::text)
);
ALTER TABLE "employees" ADD CONSTRAINT "employees_active_account_credentials_check" CHECK (account_status <> 'active' OR (email IS NOT NULL AND password_hash IS NOT NULL));
ALTER TABLE "it_asset_types" ADD CONSTRAINT "it_asset_types_management_code_prefix_format" CHECK (management_code_prefix ~ '^[A-Z]{3,5}$');
ALTER TABLE "it_asset_types" ADD CONSTRAINT "it_asset_types_next_management_number_range" CHECK (next_management_number BETWEEN 1 AND 10000);
ALTER TABLE "it_assets" ADD CONSTRAINT "it_assets_date_order" CHECK (purchased_on IS NULL OR disposal_on IS NULL OR disposal_on >= purchased_on);
ALTER TABLE "it_assets" ADD CONSTRAINT "it_assets_ram_gb_positive" CHECK (ram_gb IS NULL OR ram_gb > 0);
ALTER TABLE "branches" ADD CONSTRAINT "branches_date_order" CHECK (opened_on IS NULL OR closed_on IS NULL OR closed_on >= opened_on);
ALTER TABLE "work_calendars" ADD CONSTRAINT "work_calendars_calendar_year_check" CHECK (calendar_year BETWEEN 2011 AND 9999);
CREATE UNIQUE INDEX "it_asset_assignments_one_active_per_asset" ON "it_asset_assignments"("asset_id") WHERE returned_at IS NULL AND deleted_at IS NULL;

CREATE FUNCTION "set_record_updated_at"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."updated_at" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'employees','work_calendars','work_calendar_days','calendar_date_attributes','calendar_holiday_imports',
    'roles','employee_roles','departments','employee_groups','positions','employment_types',
    'storage','branches','rooms','it_assets','it_asset_types','manufacturers','cpu_types','operating_systems',
    'it_asset_statuses','it_asset_assignments','it_asset_change_history','employee_change_history','audit_logs','sessions',
    'password_reset_tokens','account_invitations'
  ]
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_record_updated_at()', table_name || '_set_updated_at', table_name);
  END LOOP;
END;
$$;
-- Initial master data. Audit timestamps use their column defaults.

-- departments (3 rows)
INSERT INTO "departments" ("id", "name") VALUES ('1', 'General Affairs');
INSERT INTO "departments" ("id", "name") VALUES ('2', 'Engineering');
INSERT INTO "departments" ("id", "name") VALUES ('3', 'Sales');
SELECT setval(pg_get_serial_sequence('"departments"', 'id'), (SELECT MAX(id) FROM "departments"), true);

-- employee_groups (3 rows)
INSERT INTO "employee_groups" ("id", "name") VALUES ('1', 'General');
INSERT INTO "employee_groups" ("id", "name") VALUES ('2', 'Platform');
INSERT INTO "employee_groups" ("id", "name") VALUES ('3', 'Field Sales');
SELECT setval(pg_get_serial_sequence('"employee_groups"', 'id'), (SELECT MAX(id) FROM "employee_groups"), true);

-- positions (3 rows)
INSERT INTO "positions" ("id", "name") VALUES ('1', 'Member');
INSERT INTO "positions" ("id", "name") VALUES ('2', 'Manager');
INSERT INTO "positions" ("id", "name") VALUES ('3', 'Director');
SELECT setval(pg_get_serial_sequence('"positions"', 'id'), (SELECT MAX(id) FROM "positions"), true);

-- employment_types (4 rows)
INSERT INTO "employment_types" ("id", "name") VALUES ('1', 'Regular');
INSERT INTO "employment_types" ("id", "name") VALUES ('2', 'Contract');
INSERT INTO "employment_types" ("id", "name") VALUES ('3', 'Part Time');
INSERT INTO "employment_types" ("id", "name") VALUES ('4', 'Temporary');
SELECT setval(pg_get_serial_sequence('"employment_types"', 'id'), (SELECT MAX(id) FROM "employment_types"), true);

-- branches (3 rows)
INSERT INTO "branches" ("id", "name") VALUES ('1', 'Head Office');
INSERT INTO "branches" ("id", "name") VALUES ('2', 'Nagasaki Branch');
INSERT INTO "branches" ("id", "name") VALUES ('3', 'Tokyo Branch');
SELECT setval(pg_get_serial_sequence('"branches"', 'id'), (SELECT MAX(id) FROM "branches"), true);

-- rooms (3 rows)
INSERT INTO "rooms" ("id", "name", "notes", "branch_id") VALUES ('1', '1F Meeting Room', NULL, '1');
INSERT INTO "rooms" ("id", "name", "notes", "branch_id") VALUES ('2', 'Secure Area', NULL, '2');
INSERT INTO "rooms" ("id", "name", "notes", "branch_id") VALUES ('3', 'Meeting Room B', NULL, '3');
SELECT setval(pg_get_serial_sequence('"rooms"', 'id'), (SELECT MAX(id) FROM "rooms"), true);

-- storage (3 rows)
INSERT INTO "storage" ("id", "name", "notes", "branch_id", "room_id") VALUES ('1', 'General placement', NULL, '1', '1');
INSERT INTO "storage" ("id", "name", "notes", "branch_id", "room_id") VALUES ('2', 'General placement', NULL, '2', '2');
INSERT INTO "storage" ("id", "name", "notes", "branch_id", "room_id") VALUES ('3', 'General placement', NULL, '3', '3');
SELECT setval(pg_get_serial_sequence('"storage"', 'id'), (SELECT MAX(id) FROM "storage"), true);

-- it_asset_types (8 rows)
INSERT INTO "it_asset_types" ("id", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('1', 'Laptop', 'true', 'true', 'true', 'true', '10', 'NPC', '1');
INSERT INTO "it_asset_types" ("id", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('2', 'Desktop', 'true', 'true', 'true', 'true', '20', 'DPC', '1');
INSERT INTO "it_asset_types" ("id", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('3', 'Server', 'true', 'true', 'true', 'true', '30', 'SRV', '1');
INSERT INTO "it_asset_types" ("id", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('4', 'NAS', 'true', 'true', 'true', 'true', '40', 'NAS', '1');
INSERT INTO "it_asset_types" ("id", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('5', 'UTM', 'false', 'false', 'false', 'false', '50', 'UTM', '1');
INSERT INTO "it_asset_types" ("id", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('6', 'UPS', 'false', 'false', 'false', 'false', '60', 'UPS', '1');
INSERT INTO "it_asset_types" ("id", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('7', 'PC peripheral', 'false', 'false', 'false', 'false', '70', 'OTH', '1');
INSERT INTO "it_asset_types" ("id", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('8', 'Display', 'false', 'false', 'false', 'false', '65', 'DSP', '1');
SELECT setval(pg_get_serial_sequence('"it_asset_types"', 'id'), (SELECT MAX(id) FROM "it_asset_types"), true);

-- it_asset_statuses (4 rows)
INSERT INTO "it_asset_statuses" ("id", "name", "disposal_date_policy", "sort_order") VALUES ('1', 'Normal', 'prohibited', '10');
INSERT INTO "it_asset_statuses" ("id", "name", "disposal_date_policy", "sort_order") VALUES ('2', 'Broken', 'prohibited', '20');
INSERT INTO "it_asset_statuses" ("id", "name", "disposal_date_policy", "sort_order") VALUES ('3', 'Pending disposal', 'optional', '30');
INSERT INTO "it_asset_statuses" ("id", "name", "disposal_date_policy", "sort_order") VALUES ('4', 'Disposed', 'required', '40');
SELECT setval(pg_get_serial_sequence('"it_asset_statuses"', 'id'), (SELECT MAX(id) FROM "it_asset_statuses"), true);

-- manufacturers (28 rows)
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('1', 'Intel', 'https://www.intel.com/', '2026-09-21', '10');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('9', 'Lenovo', 'https://www.lenovo.com/', '2026-09-21', '90');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('10', 'ASUS', 'https://www.asus.com/', '2026-09-21', '100');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('11', 'Acer', 'https://www.acer.com/', '2026-09-21', '110');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('12', 'Panasonic', 'https://www.panasonic.com/', '2026-09-21', '120');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('13', 'Dynabook', 'https://dynabook.com/', '2026-09-21', '130');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('14', 'IBM', 'https://www.ibm.com/', '2026-09-21', '140');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('15', 'Supermicro', 'https://www.supermicro.com/', '2026-09-21', '150');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('16', 'Synology', 'https://www.synology.com/', '2026-09-21', '160');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('17', 'QNAP', 'https://www.qnap.com/', '2026-09-21', '170');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('18', 'Buffalo', 'https://www.buffalo.jp/', '2026-09-21', '180');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('2', 'AMD', 'https://www.amd.com/', '2026-09-21', '20');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('19', 'I-O DATA', 'https://www.iodata.jp/', '2026-09-21', '190');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('20', 'Cisco', 'https://www.cisco.com/', '2026-09-21', '200');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('21', 'Fortinet', 'https://www.fortinet.com/', '2026-09-21', '210');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('22', 'Palo Alto Networks', 'https://www.paloaltonetworks.com/', '2026-09-21', '220');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('23', 'Yamaha', 'https://network.yamaha.com/', '2026-09-21', '230');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('24', 'SonicWall', 'https://www.sonicwall.com/', '2026-09-21', '240');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('25', 'APC by Schneider Electric', 'https://www.apc.com/', '2026-09-21', '250');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('26', 'Eaton', 'https://www.eaton.com/', '2026-09-21', '260');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('27', 'OMRON', 'https://www.omron.com/', '2026-09-21', '270');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('28', 'CyberPower', 'https://www.cyberpower.com/', '2026-09-21', '280');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('3', 'Apple', 'https://www.apple.com/', '2026-09-21', '30');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('4', 'NEC', 'https://www.nec.com/', '2026-09-21', '40');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('5', 'Mouse Computer', 'https://www.mouse-jp.co.jp/', '2026-09-21', '50');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('6', 'Fujitsu', 'https://www.fujitsu.com/', '2026-09-21', '60');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('7', 'Dell Technologies', 'https://www.dell.com/', '2026-09-21', '70');
INSERT INTO "manufacturers" ("id", "name", "official_url", "source_checked_on", "sort_order") VALUES ('8', 'Hewlett Packard Enterprise', 'https://www.hpe.com/', '2026-09-21', '80');
SELECT setval(pg_get_serial_sequence('"manufacturers"', 'id'), (SELECT MAX(id) FROM "manufacturers"), true);

-- cpu_types (47 rows)
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('1', '1', 'Core i5', 'i5-2450M', 'Intel Core i5-2450M', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '10');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('10', '1', 'Core i7', 'i7-14700K', 'Intel Core i7-14700K', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '100');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('11', '2', 'Ryzen 7', '7840U', 'AMD Ryzen 7 7840U', 'https://www.amd.com/en/products/specifications.html', '2026-09-21', '110');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('12', '2', 'Ryzen 9', '7950X', 'AMD Ryzen 9 7950X', 'https://www.amd.com/en/products/specifications.html', '2026-09-21', '120');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('13', '2', 'EPYC', '9654', 'AMD EPYC 9654', 'https://www.amd.com/en/products/processors/server/epyc.html', '2026-09-21', '130');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('14', '3', 'Apple M', 'M1', 'Apple M1', 'https://support.apple.com/', '2026-09-21', '140');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('15', '3', 'Apple M', 'M2', 'Apple M2', 'https://support.apple.com/', '2026-09-21', '150');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('16', '3', 'Apple M', 'M3', 'Apple M3', 'https://support.apple.com/', '2026-09-21', '160');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('17', '3', 'Apple M', 'M4', 'Apple M4', 'https://support.apple.com/', '2026-09-21', '170');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('2', '1', 'Core i5', 'i5-3230M', 'Intel Core i5-3230M', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '20');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('3', '1', 'Core i5', 'i5-3340M', 'Intel Core i5-3340M', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '30');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('4', '1', 'Core i7', 'i7-4710MQ', 'Intel Core i7-4710MQ', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '40');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('5', '1', 'Core i5', 'i5-6200U', 'Intel Core i5-6200U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '50');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('6', '1', 'Core i7', 'i7-8565U', 'Intel Core i7-8565U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '60');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('7', '2', 'Ryzen 5', '7530U', 'AMD Ryzen 5 7530U', 'https://www.amd.com/en/products/specifications.html', '2026-09-21', '70');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('8', '1', 'Core i9', 'i9-13900', 'Intel Core i9-13900', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '80');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('9', '1', 'Core i5', 'i5-13600K', 'Intel Core i5-13600K', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '90');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('18', '1', 'Celeron', '2955U', 'Intel Celeron 2955U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '180');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('19', '2', 'A-Series', 'A6-9225', 'AMD A-Series A6-9225', 'https://www.amd.com/en/products/specifications.html', '2026-09-25', '190');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('20', '2', 'Ryzen 7', '5800U', 'AMD Ryzen 7 5800U', 'https://www.amd.com/en/products/specifications.html', '2026-09-25', '200');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('21', '1', 'Core i5', '1235U', 'Intel Core i5-1235U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '210');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('22', '1', 'Core i5', '7Y57', 'Intel Core i5-7Y57', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '220');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('23', '1', 'Core i3', '5005U', 'Intel Core i3-5005U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '230');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('24', '1', 'Core i3', '8145U', 'Intel Core i3-8145U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '240');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('25', '1', 'Core i5', '10210U', 'Intel Core i5-10210U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '250');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('26', '1', 'Core i5', '10500', 'Intel Core i5-10500', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '260');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('27', '1', 'Core i5', '1135G7', 'Intel Core i5-1135G7', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '270');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('28', '1', 'Core i5', '1145G7', 'Intel Core i5-1145G7', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '280');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('29', '1', 'Core i5', '11500', 'Intel Core i5-11500', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '290');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('30', '1', 'Core i5', '12500', 'Intel Core i5-12500', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '300');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('31', '1', 'Core i5', '1334U', 'Intel Core i5-1334U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '310');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('32', '1', 'Core i5', '4200M', 'Intel Core i5-4200M', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '320');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('33', '1', 'Core i5', '4200U', 'Intel Core i5-4200U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '330');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('34', '1', 'Core i5', '4460', 'Intel Core i5-4460', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '340');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('35', '1', 'Core i5', '8250U', 'Intel Core i5-8250U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '350');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('36', '1', 'Core i7', '1360P', 'Intel Core i7-1360P', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '360');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('37', '1', 'Core i7', '10700', 'Intel Core i7-10700', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '370');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('38', '1', 'Core i7', '11370H', 'Intel Core i7-11370H', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '380');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('39', '1', 'Core i7', '1165G7', 'Intel Core i7-1165G7', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '390');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('40', '1', 'Core i7', '3770', 'Intel Core i7-3770', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '400');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('41', '1', 'Core i7', '8550U', 'Intel Core i7-8550U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '410');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('42', '1', 'Core i9', '10900', 'Intel Core i9-10900', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '420');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('43', '1', 'Core Ultra 5', '226V', 'Intel Core Ultra 5 226V', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '430');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('44', '1', 'Core Ultra 7', '285V', 'Intel Core Ultra 7 285V', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '440');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('45', '1', 'Xeon 6', '6333P', 'Intel Xeon 6 6333P', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '450');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('46', '1', 'Core i7', '14700KF', 'Intel Core i7-14700KF', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '460');
INSERT INTO "cpu_types" ("id", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('47', '1', 'Core 7', '150U', 'Intel Core 7 150U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-25', '470');
SELECT setval(pg_get_serial_sequence('"cpu_types"', 'id'), (SELECT MAX(id) FROM "cpu_types"), true);

-- operating_systems (44 rows)
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('1', 'Microsoft', 'Windows', '10', 'Pro', 'x64', 'Microsoft Windows 10 Pro (x64)', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-10-home-and-pro', '2026-09-21', '10');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('10', 'Canonical', 'Ubuntu', '22.04 LTS', 'Desktop', 'amd64', 'Ubuntu 22.04 LTS Desktop (amd64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '100');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('11', 'Canonical', 'Ubuntu', '24.04 LTS', 'Desktop', 'amd64', 'Ubuntu 24.04 LTS Desktop (amd64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '110');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('12', 'Canonical', 'Ubuntu', '26.04 LTS', 'Desktop', 'amd64', 'Ubuntu 26.04 LTS Desktop (amd64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '120');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('13', 'Canonical', 'Ubuntu', '22.04 LTS', 'Server', 'arm64', 'Ubuntu 22.04 LTS Server (arm64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '130');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('14', 'Canonical', 'Ubuntu', '24.04 LTS', 'Server', 'arm64', 'Ubuntu 24.04 LTS Server (arm64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '140');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('15', 'Canonical', 'Ubuntu', '26.04 LTS', 'Server', 'arm64', 'Ubuntu 26.04 LTS Server (arm64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '150');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('16', 'Red Hat', 'Red Hat Enterprise Linux', '8', NULL, 'x64', 'Red Hat Enterprise Linux 8 (x64)', 'https://access.redhat.com/support/policy/updates/errata', '2026-09-21', '160');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('17', 'Red Hat', 'Red Hat Enterprise Linux', '9', NULL, 'x64', 'Red Hat Enterprise Linux 9 (x64)', 'https://access.redhat.com/support/policy/updates/errata', '2026-09-21', '170');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('18', 'Debian Project', 'Debian', '12', NULL, 'x64', 'Debian 12 (x64)', 'https://www.debian.org/releases/', '2026-09-21', '180');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('19', 'Debian Project', 'Debian', '13', NULL, 'x64', 'Debian 13 (x64)', 'https://www.debian.org/releases/', '2026-09-21', '190');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('2', 'Microsoft', 'Windows', '10', 'Enterprise', 'x64', 'Microsoft Windows 10 Enterprise (x64)', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-10-enterprise-and-education', '2026-09-21', '20');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('20', 'Apple', 'macOS', '14 Sonoma', NULL, 'ARM64', 'Apple macOS 14 Sonoma', 'https://support.apple.com/en-us/109033', '2026-09-21', '200');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('21', 'Apple', 'macOS', '15 Sequoia', NULL, 'ARM64', 'Apple macOS 15 Sequoia', 'https://support.apple.com/en-us/109033', '2026-09-21', '210');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('22', 'Canonical', 'Ubuntu', '20.04 LTS', 'Server', 'amd64', 'Ubuntu 20.04 LTS Server (amd64)', 'https://documentation.ubuntu.com/release-notes/', '2026-09-25', '220');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('23', 'Canonical', 'Ubuntu', '22.04 LTS', 'Server', 'amd64', 'Ubuntu 22.04 LTS Server (amd64)', 'https://documentation.ubuntu.com/release-notes/', '2026-09-25', '230');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('24', 'Canonical', 'Ubuntu', '24.04 LTS', 'Server', 'amd64', 'Ubuntu 24.04 LTS Server (amd64)', 'https://documentation.ubuntu.com/release-notes/', '2026-09-25', '240');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('25', 'Canonical', 'Ubuntu', '26.04 LTS', 'Server', 'amd64', 'Ubuntu 26.04 LTS Server (amd64)', 'https://documentation.ubuntu.com/release-notes/', '2026-09-25', '250');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('26', 'CentOS Project', 'CentOS Linux', '7', NULL, 'x64', 'CentOS Linux 7 (x64)', 'https://www.centos.org/centos-linux/', '2026-09-25', '260');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('27', 'CentOS Project', 'CentOS Linux', '8', NULL, 'x64', 'CentOS Linux 8 (x64)', 'https://www.centos.org/centos-linux/', '2026-09-25', '270');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('28', 'CentOS Project', 'CentOS Stream', '8', NULL, 'x64', 'CentOS Stream 8 (x64)', 'https://www.centos.org/cl-vs-cs/', '2026-09-25', '280');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('29', 'CentOS Project', 'CentOS Stream', '9', NULL, 'x64', 'CentOS Stream 9 (x64)', 'https://www.centos.org/download/', '2026-09-25', '290');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('30', 'CentOS Project', 'CentOS Stream', '10', NULL, 'x64', 'CentOS Stream 10 (x64)', 'https://www.centos.org/centos10/', '2026-09-25', '300');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('31', 'Google', 'ChromeOS', '154', 'Stable', NULL, 'Google ChromeOS 154 Stable', 'https://support.google.com/chrome/a/answer/7679408', '2026-09-25', '310');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('32', 'Google', 'ChromeOS', '144', 'LTS', NULL, 'Google ChromeOS 144 LTS', 'https://support.google.com/chrome/a/answer/12239814', '2026-09-25', '320');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('33', 'CachyOS', 'CachyOS', 'Rolling', 'Desktop', 'x64', 'CachyOS Rolling Desktop (x64)', 'https://www.cachyos.org/download/', '2026-09-25', '330');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('34', 'CachyOS', 'CachyOS', 'Rolling', 'Handheld', 'x64', 'CachyOS Rolling Handheld (x64)', 'https://www.cachyos.org/download/', '2026-09-25', '340');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('35', 'Microsoft', 'Windows', '7 SP1', 'Professional', 'x64', 'Microsoft Windows 7 SP1 Professional (x64)', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-7', '2026-09-25', '350');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('36', 'Microsoft', 'Windows', '7 SP1', 'Enterprise', 'x64', 'Microsoft Windows 7 SP1 Enterprise (x64)', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-7', '2026-09-25', '360');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('37', 'Microsoft', 'Windows', '8', 'Professional', 'x64', 'Microsoft Windows 8 Professional (x64)', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-8', '2026-09-25', '370');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('38', 'Microsoft', 'Windows', '8', 'Enterprise', 'x64', 'Microsoft Windows 8 Enterprise (x64)', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-8', '2026-09-25', '380');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('39', 'Microsoft', 'Windows', '8.1', 'Professional', 'x64', 'Microsoft Windows 8.1 Professional (x64)', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-81', '2026-09-25', '390');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('40', 'Microsoft', 'Windows', '8.1', 'Enterprise', 'x64', 'Microsoft Windows 8.1 Enterprise (x64)', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-81', '2026-09-25', '400');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('41', 'Microsoft', 'Windows', 'XP SP3', 'Professional', 'x86', 'Microsoft Windows XP SP3 Professional (x86)', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-xp', '2026-09-25', '410');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('42', 'Microsoft', 'Windows', 'XP SP2', 'Professional', 'x64', 'Microsoft Windows XP SP2 Professional (x64)', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-xp', '2026-09-25', '420');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('43', 'Microsoft', 'Windows', '2000 SP4', 'Professional', 'x86', 'Microsoft Windows 2000 SP4 Professional (x86)', 'https://learn.microsoft.com/en-us/windows/win32/sysinfo/operating-system-version', '2026-09-25', '430');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('44', 'Microsoft', 'Windows Server', '2000 SP4', 'Server', 'x86', 'Microsoft Windows 2000 Server SP4 (x86)', 'https://learn.microsoft.com/en-us/windows/win32/sysinfo/operating-system-version', '2026-09-25', '440');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('3', 'Microsoft', 'Windows', '11', 'Pro', 'x64', 'Microsoft Windows 11 Pro (x64)', 'https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information', '2026-09-21', '30');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('4', 'Microsoft', 'Windows', '11', 'Enterprise', 'x64', 'Microsoft Windows 11 Enterprise (x64)', 'https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information', '2026-09-21', '40');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('5', 'Microsoft', 'Windows', '11', 'Pro', 'ARM64', 'Microsoft Windows 11 Pro (ARM64)', 'https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information', '2026-09-21', '50');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('6', 'Microsoft', 'Windows Server', '2019', 'Standard', 'x64', 'Microsoft Windows Server 2019 Standard', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2019', '2026-09-21', '60');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('7', 'Microsoft', 'Windows Server', '2022', 'Standard', 'x64', 'Microsoft Windows Server 2022 Standard', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2022', '2026-09-21', '70');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('8', 'Microsoft', 'Windows Server', '2025', 'Standard', 'x64', 'Microsoft Windows Server 2025 Standard', 'https://learn.microsoft.com/en-us/windows-server/get-started/windows-server-release-info', '2026-09-21', '80');
INSERT INTO "operating_systems" ("id", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('9', 'Canonical', 'Ubuntu', '20.04 LTS', 'Desktop', 'amd64', 'Ubuntu 20.04 LTS Desktop (amd64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '90');
SELECT setval(pg_get_serial_sequence('"operating_systems"', 'id'), (SELECT MAX(id) FROM "operating_systems"), true);

-- roles (3 rows)
INSERT INTO "roles" ("id", "code", "name") VALUES ('1', 'system_administrator', 'System Administrator');
INSERT INTO "roles" ("id", "code", "name") VALUES ('2', 'business_administrator', 'Business Administrator');
INSERT INTO "roles" ("id", "code", "name") VALUES ('3', 'general_user', 'General User');
SELECT setval(pg_get_serial_sequence('"roles"', 'id'), (SELECT MAX(id) FROM "roles"), true);

-- Weekend date attributes used by work calendars.
INSERT INTO "calendar_date_attributes" ("calendar_date", "kind", "name", "source")
SELECT day::date,
       CASE WHEN EXTRACT(ISODOW FROM day) = 7 THEN 'sunday' ELSE 'saturday' END,
       CASE WHEN EXTRACT(ISODOW FROM day) = 7 THEN 'Sunday' ELSE 'Saturday' END,
       'calculated'
FROM generate_series(DATE '2011-01-01', DATE '2100-12-31', INTERVAL '1 day') AS day
WHERE EXTRACT(ISODOW FROM day) IN (6, 7);
