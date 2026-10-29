-- Consolidated v0.7.0 migration (formerly m0037-m0041).
-- Requires the m0036 baseline. Do not replay on databases with the former chain.
BEGIN;

-- BEGIN engagement-rename
-- Rename the client-engagement domain without recreating business records.

DO $$
BEGIN
 IF to_regclass('public.projects') IS NULL OR to_regclass('public.project_participations') IS NULL
    OR to_regclass('public.engagements') IS NOT NULL OR to_regclass('public.engagement_participations') IS NOT NULL THEN
  RAISE EXCEPTION 'Unexpected engagement rename baseline';
 END IF;
 IF EXISTS (SELECT 1 FROM permission_operations WHERE operation LIKE 'engagements.%'
   OR (operation LIKE 'projects.%' AND operation NOT IN ('projects.read','projects.create','projects.update','projects.delete'))) THEN
  RAISE EXCEPTION 'Conflicting or unknown engagement permission operation';
 END IF;
 IF EXISTS (SELECT 1 FROM saved_search_filters WHERE target='engagements'
   OR (target='projects' AND (schema_version<>1 OR definition->>'schemaVersion' IS DISTINCT FROM '1'
     OR jsonb_typeof(definition->'conditions') IS DISTINCT FROM 'object'
     OR jsonb_typeof(definition->'options') IS DISTINCT FROM 'object'))) THEN
  RAISE EXCEPTION 'Unknown saved engagement search format';
 END IF;
END $$;

ALTER TABLE projects RENAME TO engagements;
ALTER TABLE project_participations RENAME TO engagement_participations;
ALTER TABLE engagement_participations RENAME COLUMN project_id TO engagement_id;
ALTER SEQUENCE projects_id_seq RENAME TO engagements_id_seq;
ALTER SEQUENCE project_participations_id_seq RENAME TO engagement_participations_id_seq;
ALTER SEQUENCE project_code_seq RENAME TO engagement_code_seq;
ALTER TABLE engagements ALTER COLUMN code SET DEFAULT ('ENG-' || nextval('engagement_code_seq')::text);

-- PostgreSQL keeps FK targets and sequence ownership attached to their OIDs.
-- Rename the attached objects too; constraint-backed indexes follow constraints.
DO $$
DECLARE item record; new_name text;
BEGIN
 FOR item IN SELECT conrelid::regclass AS tbl,conname FROM pg_constraint
   WHERE conrelid IN ('engagements'::regclass,'engagement_participations'::regclass)
     AND conname LIKE 'project%' LOOP
  new_name := replace(item.conname,'project','engagement');
  -- Match Prisma's 63-byte generated-name limit while retaining the key suffix.
  IF length(new_name)>63 AND right(new_name,4)='_key' THEN new_name:=left(new_name,59)||'_key'; END IF;
  EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I',item.tbl,item.conname,new_name);
 END LOOP;
 FOR item IN SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
   WHERE i.indrelid IN ('engagements'::regclass,'engagement_participations'::regclass)
     AND c.relname LIKE 'project%' LOOP
  EXECUTE format('ALTER INDEX %I RENAME TO %I',item.relname,replace(item.relname,'project','engagement'));
 END LOOP;
 FOR item IN SELECT tgrelid::regclass AS tbl,tgname FROM pg_trigger
   WHERE tgrelid IN ('engagements'::regclass,'engagement_participations'::regclass)
     AND NOT tgisinternal AND tgname LIKE 'project%' LOOP
  EXECUTE format('ALTER TRIGGER %I ON %s RENAME TO %I',item.tgname,item.tbl,replace(item.tgname,'project','engagement'));
 END LOOP;
END $$;

-- Keep permission IDs, UUIDs, timestamps, deleted rows and every role grant.
ALTER TABLE permissions DISABLE TRIGGER permissions_set_updated_at;
ALTER TABLE permission_operations DISABLE TRIGGER permission_operations_set_updated_at;
UPDATE permissions p SET name='Operation: engagements.' || split_part(po.operation,'.',2)
 FROM permission_operations po WHERE po.permission_id=p.id
 AND po.operation IN ('projects.read','projects.create','projects.update','projects.delete')
 AND p.name='Operation: ' || po.operation;
UPDATE permission_operations SET operation='engagements.' || split_part(operation,'.',2)
 WHERE operation IN ('projects.read','projects.create','projects.update','projects.delete');
ALTER TABLE permission_operations ENABLE TRIGGER permission_operations_set_updated_at;
ALTER TABLE permissions ENABLE TRIGGER permissions_set_updated_at;

-- Definitions contain root field rules; employee-related context remains
-- 'participations'. Only the target identifier changes, preserving revisions,
-- selection IDs, names, condition values and timestamps (also deleted filters).
ALTER TABLE saved_search_filters DROP CONSTRAINT saved_search_filters_target_check;
ALTER TABLE saved_search_filters DISABLE TRIGGER saved_search_filters_set_updated_at;
UPDATE saved_search_filters SET target='engagements' WHERE target='projects';
ALTER TABLE saved_search_filters ENABLE TRIGGER saved_search_filters_set_updated_at;
ALTER TABLE saved_search_filters ADD CONSTRAINT saved_search_filters_target_check
 CHECK (target IN ('employees','books','assets','workflows','teams','skills','clients','engagements','projects','projectTickets'));

-- Audit and change-history contents are immutable evidence. Readers support
-- legacy resource/field identifiers; new writes use engagement terminology.
-- END engagement-rename

-- BEGIN projects
-- Independent Projects domain; never reuses legacy Engagement grants.

CREATE SEQUENCE project_code_seq;

CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL DEFAULT ('PJT-' || nextval('project_code_seq')) UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private',
  status TEXT NOT NULL DEFAULT 'active',
  engagement_id INTEGER,
  revision INTEGER NOT NULL DEFAULT 1,
  next_ticket_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  CONSTRAINT projects_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (visibility IN ('private','internal')),
  CHECK (status IN ('active','on_hold','completed','archived')),
  CHECK (revision>0 AND next_ticket_number>0)
);

CREATE TABLE project_members (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  UNIQUE (project_id, employee_id),
  CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_members_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (role IN ('manager','editor','viewer'))
);

CREATE TABLE project_ticket_types (
  milestone BOOLEAN NOT NULL DEFAULT false,
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  name VARCHAR(64) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  UNIQUE (project_id, name),
  CONSTRAINT project_ticket_types_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE project_ticket_statuses (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  name VARCHAR(64) NOT NULL,
  category TEXT NOT NULL DEFAULT 'open',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  UNIQUE (project_id, name),
  CONSTRAINT project_ticket_statuses_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (category IN ('open','active','done','cancelled'))
);

CREATE TABLE project_type_statuses (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  type_id INTEGER NOT NULL,
  status_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  initial BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  UNIQUE (type_id, status_id),
  CONSTRAINT project_type_statuses_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_type_statuses_type_id_fkey FOREIGN KEY (type_id) REFERENCES project_ticket_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_type_statuses_status_id_fkey FOREIGN KEY (status_id) REFERENCES project_ticket_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE project_tickets (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  parent_id INTEGER,
  type_id INTEGER NOT NULL,
  status_id INTEGER NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignee_id INTEGER,
  author_id INTEGER NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  starts_on DATE,
  due_on DATE,
  estimated_minutes INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  labels JSONB NOT NULL DEFAULT '[]',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  UNIQUE (project_id, number),
  CONSTRAINT project_tickets_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_tickets_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES project_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_tickets_type_id_fkey FOREIGN KEY (type_id) REFERENCES project_ticket_types(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_tickets_status_id_fkey FOREIGN KEY (status_id) REFERENCES project_ticket_statuses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_tickets_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_tickets_author_id_fkey FOREIGN KEY (author_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (estimated_minutes>=0 AND revision>0 AND number>0),
  CHECK (starts_on IS NULL OR due_on IS NULL OR starts_on<=due_on),
  CHECK (priority IN ('low','normal','high','urgent')),
  CHECK (parent_id IS NULL OR parent_id<>id)
);

CREATE TABLE project_ticket_relations (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  UNIQUE (from_id, to_id, kind),
  CONSTRAINT project_ticket_relations_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_ticket_relations_from_id_fkey FOREIGN KEY (from_id) REFERENCES project_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_ticket_relations_to_id_fkey FOREIGN KEY (to_id) REFERENCES project_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (from_id<>to_id),
  CHECK (kind IN ('relates','blocks','duplicates','finish_start'))
);

CREATE TABLE project_comments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  record_key UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  CONSTRAINT project_comments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES project_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE project_checklists (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL,
  text VARCHAR(500) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  record_key UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  CONSTRAINT project_checklists_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES project_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE project_time_entries (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  work_date DATE NOT NULL,
  minutes INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  record_key UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  CONSTRAINT project_time_entries_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES project_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_time_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (minutes>0 AND minutes<=1440)
);

CREATE TABLE project_watchers (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  UNIQUE (ticket_id, employee_id),
  CONSTRAINT project_watchers_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES project_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_watchers_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE project_attachments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  content BYTEA NOT NULL,
  record_key UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  CONSTRAINT project_attachments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES project_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_attachments_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK (size>0 AND size<=10485760)
);

CREATE TABLE project_history (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL,
  ticket_id INTEGER,
  actor_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  detail JSONB NOT NULL,
  record_key UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  CONSTRAINT project_history_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_history_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES project_tickets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT project_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE
);


CREATE INDEX projects_engagement_id_idx ON projects(engagement_id);


CREATE INDEX project_members_project_id_idx ON project_members(project_id);


CREATE INDEX project_members_employee_id_idx ON project_members(employee_id);


CREATE INDEX project_ticket_types_project_id_idx ON project_ticket_types(project_id);


CREATE INDEX project_ticket_statuses_project_id_idx ON project_ticket_statuses(project_id);


CREATE INDEX project_type_statuses_project_id_idx ON project_type_statuses(project_id);


CREATE INDEX project_type_statuses_type_id_idx ON project_type_statuses(type_id);


CREATE INDEX project_type_statuses_status_id_idx ON project_type_statuses(status_id);


CREATE INDEX project_tickets_project_id_idx ON project_tickets(project_id);


CREATE INDEX project_tickets_parent_id_idx ON project_tickets(parent_id);


CREATE INDEX project_tickets_type_id_idx ON project_tickets(type_id);


CREATE INDEX project_tickets_status_id_idx ON project_tickets(status_id);


CREATE INDEX project_tickets_assignee_id_idx ON project_tickets(assignee_id);


CREATE INDEX project_tickets_author_id_idx ON project_tickets(author_id);


CREATE INDEX project_ticket_relations_project_id_idx ON project_ticket_relations(project_id);


CREATE INDEX project_ticket_relations_from_id_idx ON project_ticket_relations(from_id);


CREATE INDEX project_ticket_relations_to_id_idx ON project_ticket_relations(to_id);


CREATE INDEX project_comments_ticket_id_idx ON project_comments(ticket_id);


CREATE INDEX project_comments_author_id_idx ON project_comments(author_id);


CREATE INDEX project_checklists_ticket_id_idx ON project_checklists(ticket_id);


CREATE INDEX project_time_entries_ticket_id_idx ON project_time_entries(ticket_id);


CREATE INDEX project_time_entries_employee_id_idx ON project_time_entries(employee_id);


CREATE INDEX project_watchers_ticket_id_idx ON project_watchers(ticket_id);


CREATE INDEX project_watchers_employee_id_idx ON project_watchers(employee_id);


CREATE INDEX project_attachments_ticket_id_idx ON project_attachments(ticket_id);


CREATE INDEX project_attachments_uploader_id_idx ON project_attachments(uploader_id);


CREATE INDEX project_history_project_id_idx ON project_history(project_id);


CREATE INDEX project_history_ticket_id_idx ON project_history(ticket_id);


CREATE INDEX project_history_actor_id_idx ON project_history(actor_id);

CREATE UNIQUE INDEX project_type_status_initial_idx ON project_type_statuses(type_id) WHERE initial AND deleted_at IS NULL;








INSERT INTO permissions(name) SELECT 'Operation: projects.read' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.read',id FROM permissions WHERE name='Operation: projects.read' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND po.operation='projects.read' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: projects.create' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.create',id FROM permissions WHERE name='Operation: projects.create' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND po.operation='projects.create' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: projects.update' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.update',id FROM permissions WHERE name='Operation: projects.update' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND po.operation='projects.update' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: projects.delete' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.delete',id FROM permissions WHERE name='Operation: projects.delete' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND po.operation='projects.delete' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: projects.members.manage' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.members.manage',id FROM permissions WHERE name='Operation: projects.members.manage' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND po.operation='projects.members.manage' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: projects.settings.manage' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.settings.manage',id FROM permissions WHERE name='Operation: projects.settings.manage' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND po.operation='projects.settings.manage' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: projects.tickets.create' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.tickets.create',id FROM permissions WHERE name='Operation: projects.tickets.create' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND po.operation='projects.tickets.create' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: projects.tickets.update' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.tickets.update',id FROM permissions WHERE name='Operation: projects.tickets.update' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND po.operation='projects.tickets.update' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: projects.tickets.delete' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.tickets.delete',id FROM permissions WHERE name='Operation: projects.tickets.delete' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND po.operation='projects.tickets.delete' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: projects.comments.manage' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.comments.manage',id FROM permissions WHERE name='Operation: projects.comments.manage' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND po.operation='projects.comments.manage' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: projects.time.manage' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.time.manage',id FROM permissions WHERE name='Operation: projects.time.manage' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND po.operation='projects.time.manage' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: projects.attachments.manage' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.attachments.manage',id FROM permissions WHERE name='Operation: projects.attachments.manage' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND po.operation='projects.attachments.manage' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name) SELECT 'Operation: projects.admin' WHERE EXISTS(SELECT 1 FROM roles WHERE default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator') AND deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;

INSERT INTO permission_operations(operation,permission_id) SELECT 'projects.admin',id FROM permissions WHERE name='Operation: projects.admin' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id,scope_type) SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po WHERE r.deleted_at IS NULL AND r.default_key = 'system_administrator' AND po.operation='projects.admin' AND po.deleted_at IS NULL ON CONFLICT(role_id,permission_id) DO NOTHING;
-- END projects

-- BEGIN project-preferences
-- Cross-project ticket search and employee-specific list columns.
ALTER TABLE employee_settings ADD COLUMN project_ticket_columns JSONB;
ALTER TABLE employee_settings ADD COLUMN project_columns JSONB;

INSERT INTO permissions(name) SELECT 'Operation: projects.preferences.update'
 WHERE EXISTS (SELECT 1 FROM roles WHERE deleted_at IS NULL) ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id)
 SELECT 'projects.preferences.update',id FROM permissions WHERE name='Operation: projects.preferences.update' AND deleted_at IS NULL ON CONFLICT(operation) DO NOTHING;
-- Grant personal column editing only to roles with an existing global Projects read grant.
INSERT INTO role_permissions(role_id,permission_id,scope_type)
 SELECT DISTINCT rp.role_id,target.permission_id,'global'
 FROM role_permissions rp JOIN permission_operations source ON source.permission_id=rp.permission_id
 JOIN permissions p ON p.id=source.permission_id AND p.deleted_at IS NULL
 JOIN roles r ON r.id=rp.role_id AND r.deleted_at IS NULL
 CROSS JOIN permission_operations target
 WHERE rp.deleted_at IS NULL AND rp.scope_type='global' AND source.operation='projects.read' AND source.deleted_at IS NULL
 AND target.operation='projects.preferences.update' AND target.deleted_at IS NULL
 ON CONFLICT(role_id,permission_id) DO NOTHING;
-- END project-preferences

COMMIT;
