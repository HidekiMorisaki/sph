-- Consolidated m0038-m0040: exact time values, Markdown images and final references.
-- Preserve existing minute values, including soft-deleted evidence. Hundredths
-- of an hour are represented exactly as 0.60 minutes; no data is rounded.
BEGIN;
ALTER TABLE project_tickets
  ALTER COLUMN estimated_minutes TYPE NUMERIC(12,2) USING estimated_minutes::numeric;
ALTER TABLE project_time_entries
  ALTER COLUMN minutes TYPE NUMERIC(12,2) USING minutes::numeric;

-- Align the existing employee reference once; new image references are final at creation.
ALTER TABLE employees
  DROP CONSTRAINT employees_deletion_requested_by_id_fkey,
  ADD CONSTRAINT employees_deletion_requested_by_id_fkey
    FOREIGN KEY (deletion_requested_by_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Markdown images are private drafts until atomically bound to saved text.
CREATE TABLE project_markdown_images (
 id SERIAL PRIMARY KEY,
 record_key UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 uploader_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 target_type TEXT NOT NULL CHECK (target_type IN ('project','ticket','comment')),
 project_id INTEGER REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ticket_id INTEGER REFERENCES project_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 comment_id INTEGER REFERENCES project_comments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 bound BOOLEAN NOT NULL DEFAULT FALSE,
 name VARCHAR(255) NOT NULL,
 mime TEXT NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/webp')),
 size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 10485760),
 content BYTEA NOT NULL CHECK (octet_length(content)=size),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TIMESTAMPTZ(3),
 CHECK ((target_type='project' AND ticket_id IS NULL AND comment_id IS NULL) OR
        (target_type='ticket' AND project_id IS NOT NULL AND comment_id IS NULL) OR
        (target_type='comment' AND project_id IS NOT NULL AND ticket_id IS NOT NULL)),
 CHECK (NOT bound OR (project_id IS NOT NULL AND
        (target_type='project' OR (ticket_id IS NOT NULL AND
        (target_type='ticket' OR comment_id IS NOT NULL)))))
);
CREATE INDEX project_markdown_images_project_id_idx ON project_markdown_images(project_id);
CREATE INDEX project_markdown_images_ticket_id_idx ON project_markdown_images(ticket_id);
CREATE INDEX project_markdown_images_comment_id_idx ON project_markdown_images(comment_id);
CREATE INDEX project_markdown_images_draft_owner_idx ON project_markdown_images(uploader_id) WHERE NOT bound AND deleted_at IS NULL;

INSERT INTO permissions(name)
 SELECT 'Operation: '||operation FROM unnest(ARRAY['projects.images.read','projects.images.create','projects.images.delete','projects.diagrams.render']) AS operation
 WHERE EXISTS (SELECT 1 FROM roles WHERE deleted_at IS NULL)
 ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id)
 SELECT replace(name,'Operation: ',''),id FROM permissions
 WHERE deleted_at IS NULL AND name IN ('Operation: projects.images.read','Operation: projects.images.create','Operation: projects.images.delete','Operation: projects.diagrams.render')
 ON CONFLICT(operation) DO NOTHING;
-- Inherit only active global counterpart grants. Revoked/scoped grants stay revoked.
INSERT INTO role_permissions(role_id,permission_id,scope_type)
 SELECT DISTINCT rp.role_id,new_operation.permission_id,'global'
 FROM role_permissions rp
 JOIN permissions old_permission ON old_permission.id=rp.permission_id AND old_permission.deleted_at IS NULL
 JOIN permission_operations old_operation ON old_operation.permission_id=rp.permission_id AND old_operation.deleted_at IS NULL
 JOIN roles r ON r.id=rp.role_id AND r.deleted_at IS NULL
 CROSS JOIN permission_operations new_operation
 WHERE rp.deleted_at IS NULL AND rp.scope_type='global' AND new_operation.deleted_at IS NULL AND
 ((old_operation.operation='projects.read' AND new_operation.operation IN ('projects.images.read','projects.diagrams.render')) OR
  (old_operation.operation='projects.attachments.manage' AND new_operation.operation IN ('projects.images.create','projects.images.delete')))
 ON CONFLICT(role_id,permission_id) DO NOTHING;
COMMIT;
