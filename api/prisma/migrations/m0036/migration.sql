BEGIN;
-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "template_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "definition" JSONB NOT NULL,
    "route" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "published_version" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_template_versions" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "template_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "route" JSONB NOT NULL,

    CONSTRAINT "workflow_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_requests" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "request_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_version_id" INTEGER NOT NULL,
    "applicant_id" INTEGER NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'JPY',
    "values" JSONB NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "current_step" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "workflow_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_submissions" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "request_id" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "workflow_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "request_id" INTEGER NOT NULL,
    "attempt" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "employee_name" TEXT NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'waiting',

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_actions" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "action_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" INTEGER NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "actor_name" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "position" INTEGER,
    "type" VARCHAR(32) NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "detail" JSONB NOT NULL,

    CONSTRAINT "workflow_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_attachments" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "attachment_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "mime" VARCHAR(80) NOT NULL,
    "size" INTEGER NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "content" BYTEA NOT NULL,

    CONSTRAINT "workflow_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_submission_attachments" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "submission_id" INTEGER NOT NULL,
    "attachment_id" INTEGER NOT NULL,

    CONSTRAINT "workflow_submission_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex

-- CreateIndex

-- CreateIndex

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_template_key_key" ON "workflow_templates"("template_key");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_template_versions_template_id_version_key" ON "workflow_template_versions"("template_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_requests_request_key_key" ON "workflow_requests"("request_key");

-- CreateIndex
CREATE INDEX "workflow_requests_applicant_id_status_deleted_at_idx" ON "workflow_requests"("applicant_id", "status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_submissions_request_id_attempt_key" ON "workflow_submissions"("request_id", "attempt");

-- CreateIndex
CREATE INDEX "workflow_steps_employee_id_status_deleted_at_idx" ON "workflow_steps"("employee_id", "status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_steps_request_id_attempt_position_key" ON "workflow_steps"("request_id", "attempt", "position");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_actions_action_key_key" ON "workflow_actions"("action_key");

-- CreateIndex
CREATE INDEX "workflow_actions_request_id_created_at_idx" ON "workflow_actions"("request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_attachments_attachment_key_key" ON "workflow_attachments"("attachment_key");

-- CreateIndex
CREATE INDEX "workflow_attachments_request_id_deleted_at_idx" ON "workflow_attachments"("request_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_submission_attachments_submission_id_attachment_id_key" ON "workflow_submission_attachments"("submission_id", "attachment_id");

-- AddForeignKey

-- AddForeignKey

-- AddForeignKey

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "workflow_template_versions" ADD CONSTRAINT "workflow_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "workflow_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "workflow_requests" ADD CONSTRAINT "workflow_requests_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "workflow_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_requests" ADD CONSTRAINT "workflow_requests_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_submissions" ADD CONSTRAINT "workflow_submissions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "workflow_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "workflow_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_actions" ADD CONSTRAINT "workflow_actions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "workflow_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_actions" ADD CONSTRAINT "workflow_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_attachments" ADD CONSTRAINT "workflow_attachments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "workflow_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_submission_attachments" ADD CONSTRAINT "workflow_submission_attachments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "workflow_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_submission_attachments" ADD CONSTRAINT "workflow_submission_attachments_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "workflow_attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Workflow invariants and update timestamps.
CREATE TRIGGER workflow_templates_set_updated_at BEFORE UPDATE ON workflow_templates FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER workflow_template_versions_set_updated_at BEFORE UPDATE ON workflow_template_versions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER workflow_requests_set_updated_at BEFORE UPDATE ON workflow_requests FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER workflow_submissions_set_updated_at BEFORE UPDATE ON workflow_submissions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER workflow_steps_set_updated_at BEFORE UPDATE ON workflow_steps FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER workflow_actions_set_updated_at BEFORE UPDATE ON workflow_actions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER workflow_attachments_set_updated_at BEFORE UPDATE ON workflow_attachments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER workflow_submission_attachments_set_updated_at BEFORE UPDATE ON workflow_submission_attachments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
ALTER TABLE workflow_requests ADD CONSTRAINT workflow_request_state CHECK (status IN ('draft','pending','approved','returned','rejected','cancelled') AND revision>0 AND attempt>=0 AND current_step>=0);
ALTER TABLE workflow_steps ADD CONSTRAINT workflow_step_state CHECK (status IN ('waiting','pending','approved','returned','rejected','stopped') AND attempt>0 AND position>=0);
CREATE UNIQUE INDEX workflow_one_pending_step ON workflow_steps(request_id,attempt) WHERE status='pending' AND deleted_at IS NULL;
INSERT INTO permissions(name) SELECT 'Operation: workflows.read' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='system_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.read',id FROM permissions WHERE name='Operation: workflows.read' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='system_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.read' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.create' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='system_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.create',id FROM permissions WHERE name='Operation: workflows.create' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='system_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.create' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.update' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='system_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.update',id FROM permissions WHERE name='Operation: workflows.update' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='system_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.update' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.submit' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='system_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.submit',id FROM permissions WHERE name='Operation: workflows.submit' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='system_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.submit' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.approve' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='system_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.approve',id FROM permissions WHERE name='Operation: workflows.approve' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='system_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.approve' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.comment' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='system_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.comment',id FROM permissions WHERE name='Operation: workflows.comment' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='system_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.comment' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.cancel' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='system_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.cancel',id FROM permissions WHERE name='Operation: workflows.cancel' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='system_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.cancel' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.templates.manage' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='system_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.templates.manage',id FROM permissions WHERE name='Operation: workflows.templates.manage' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='system_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.templates.manage' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.read' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='business_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.read',id FROM permissions WHERE name='Operation: workflows.read' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='business_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.read' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.create' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='business_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.create',id FROM permissions WHERE name='Operation: workflows.create' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='business_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.create' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.update' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='business_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.update',id FROM permissions WHERE name='Operation: workflows.update' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='business_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.update' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.submit' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='business_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.submit',id FROM permissions WHERE name='Operation: workflows.submit' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='business_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.submit' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.approve' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='business_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.approve',id FROM permissions WHERE name='Operation: workflows.approve' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='business_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.approve' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.comment' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='business_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.comment',id FROM permissions WHERE name='Operation: workflows.comment' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='business_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.comment' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.cancel' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='business_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.cancel',id FROM permissions WHERE name='Operation: workflows.cancel' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='business_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.cancel' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.read' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='general_user') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.read',id FROM permissions WHERE name='Operation: workflows.read' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='general_user' AND r.deleted_at IS NULL AND po.operation='workflows.read' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.create' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='general_user') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.create',id FROM permissions WHERE name='Operation: workflows.create' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='general_user' AND r.deleted_at IS NULL AND po.operation='workflows.create' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.update' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='general_user') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.update',id FROM permissions WHERE name='Operation: workflows.update' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='general_user' AND r.deleted_at IS NULL AND po.operation='workflows.update' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.submit' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='general_user') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.submit',id FROM permissions WHERE name='Operation: workflows.submit' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='general_user' AND r.deleted_at IS NULL AND po.operation='workflows.submit' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.approve' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='general_user') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.approve',id FROM permissions WHERE name='Operation: workflows.approve' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='general_user' AND r.deleted_at IS NULL AND po.operation='workflows.approve' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.comment' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='general_user') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.comment',id FROM permissions WHERE name='Operation: workflows.comment' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='general_user' AND r.deleted_at IS NULL AND po.operation='workflows.comment' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.cancel' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='general_user') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.cancel',id FROM permissions WHERE name='Operation: workflows.cancel' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='general_user' AND r.deleted_at IS NULL AND po.operation='workflows.cancel' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.read' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='server_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.read',id FROM permissions WHERE name='Operation: workflows.read' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='server_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.read' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.create' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='server_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.create',id FROM permissions WHERE name='Operation: workflows.create' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='server_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.create' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.update' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='server_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.update',id FROM permissions WHERE name='Operation: workflows.update' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='server_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.update' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.submit' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='server_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.submit',id FROM permissions WHERE name='Operation: workflows.submit' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='server_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.submit' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.approve' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='server_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.approve',id FROM permissions WHERE name='Operation: workflows.approve' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='server_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.approve' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.comment' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='server_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.comment',id FROM permissions WHERE name='Operation: workflows.comment' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='server_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.comment' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.cancel' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='server_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.cancel',id FROM permissions WHERE name='Operation: workflows.cancel' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='server_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.cancel' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.read' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='branch_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.read',id FROM permissions WHERE name='Operation: workflows.read' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='branch_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.read' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.create' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='branch_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.create',id FROM permissions WHERE name='Operation: workflows.create' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='branch_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.create' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.update' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='branch_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.update',id FROM permissions WHERE name='Operation: workflows.update' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='branch_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.update' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.submit' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='branch_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.submit',id FROM permissions WHERE name='Operation: workflows.submit' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='branch_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.submit' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.approve' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='branch_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.approve',id FROM permissions WHERE name='Operation: workflows.approve' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='branch_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.approve' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.comment' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='branch_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.comment',id FROM permissions WHERE name='Operation: workflows.comment' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='branch_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.comment' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO permissions(name) SELECT 'Operation: workflows.cancel' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key='branch_administrator') ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id) SELECT 'workflows.cancel',id FROM permissions WHERE name='Operation: workflows.cancel' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.default_key='branch_administrator' AND r.deleted_at IS NULL AND po.operation='workflows.cancel' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

-- Draft deletion: explicitly granted to the five initial roles, never custom roles.
INSERT INTO permissions(name) SELECT 'Operation: workflows.delete'
WHERE EXISTS(SELECT 1 FROM roles WHERE deleted_at IS NULL AND default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator'))
ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id)
SELECT 'workflows.delete',id FROM permissions WHERE name='Operation: workflows.delete' AND deleted_at IS NULL
ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type)
SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po
WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator')
AND po.operation='workflows.delete' AND po.deleted_at IS NULL
ON CONFLICT(role_id,permission_id) DO NOTHING;

-- Workflow search target: only expand the saved-filter target allowlist.
ALTER TABLE saved_search_filters DROP CONSTRAINT saved_search_filters_target_check;
ALTER TABLE saved_search_filters ADD CONSTRAINT saved_search_filters_target_check
  CHECK (target IN ('employees', 'books', 'assets', 'workflows'));

-- Retire workflow finance: explicitly approved removal of transfers and links.
DROP TABLE IF EXISTS workflow_payments;
ALTER TABLE workflow_requests DROP CONSTRAINT IF EXISTS workflow_request_state;
ALTER TABLE workflow_requests DROP COLUMN IF EXISTS advance_request_id;
ALTER TABLE workflow_requests ADD CONSTRAINT workflow_request_state
  CHECK (status IN ('draft','pending','approved','returned','rejected','cancelled') AND revision>0 AND attempt>=0 AND current_step>=0);
-- Keep all submitted snapshots and approval/action history as immutable evidence.
UPDATE workflow_templates SET definition=definition-'kind'-'amountField',revision=revision+1
  WHERE definition ? 'kind' OR definition ? 'amountField';
UPDATE workflow_template_versions SET definition=definition-'kind'-'amountField'
  WHERE definition ? 'kind' OR definition ? 'amountField';
UPDATE role_permissions SET deleted_at=CURRENT_TIMESTAMP
  WHERE deleted_at IS NULL AND permission_id IN (SELECT permission_id FROM permission_operations WHERE operation IN ('workflows.payments.return','workflows.payments.confirm','workflows.payments.manage'));
UPDATE permission_operations SET deleted_at=CURRENT_TIMESTAMP
  WHERE deleted_at IS NULL AND operation IN ('workflows.payments.return','workflows.payments.confirm','workflows.payments.manage');
UPDATE permissions SET deleted_at=CURRENT_TIMESTAMP
  WHERE deleted_at IS NULL AND name IN ('Operation: workflows.payments.return','Operation: workflows.payments.confirm','Operation: workflows.payments.manage')
  AND NOT EXISTS(SELECT 1 FROM permission_operations operation WHERE operation.permission_id=permissions.id AND operation.deleted_at IS NULL);

COMMIT;
