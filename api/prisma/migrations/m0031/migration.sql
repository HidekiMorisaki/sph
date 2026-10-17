-- Consolidated unpublished m0031-m0034. Apply after m0030 or on a fresh install.
-- Tables are created in their final form. Intermediate code backfills, history
-- rewrites and saved team-selector conversions are unnecessary: their source
-- tables/features did not exist before m0031. Preserve prior migration files.
BEGIN;
CREATE SEQUENCE team_code_seq;
CREATE TABLE teams (
 id SERIAL PRIMARY KEY,
 code VARCHAR(64) NOT NULL DEFAULT ('TEAM-' || nextval('team_code_seq')::text) UNIQUE CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'),
 name VARCHAR(128) NOT NULL CHECK (length(trim(name)) > 0),
 description VARCHAR(5000),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TIMESTAMPTZ(3) DEFAULT NULL
);
ALTER SEQUENCE team_code_seq OWNED BY teams.code;
-- Keep names reusable after logical deletion. Existing duplicates must be resolved
-- explicitly rather than silently renaming teams or changing their memberships.
CREATE UNIQUE INDEX teams_active_name_key ON teams (lower(btrim(name))) WHERE deleted_at IS NULL;

CREATE TABLE employee_teams (
 id SERIAL PRIMARY KEY,
 employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TIMESTAMPTZ(3) DEFAULT NULL,
 UNIQUE(employee_id,team_id)
);
CREATE INDEX employee_teams_team_id_idx ON employee_teams(team_id);
CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER employee_teams_set_updated_at BEFORE UPDATE ON employee_teams FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

INSERT INTO permissions(name)
SELECT 'Operation: ' || code FROM unnest(ARRAY['teams.read','teams.create','teams.update','teams.delete','teams.members.add','teams.members.remove']) code
WHERE EXISTS(SELECT 1 FROM roles) ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id)
SELECT substring(name FROM 12),id FROM permissions WHERE name LIKE 'Operation: teams.%' AND deleted_at IS NULL
ON CONFLICT(operation) DO NOTHING;
-- Apply the approved defaults to built-in roles; custom roles remain deny by default.
INSERT INTO role_permissions(role_id,permission_id,scope_type)
SELECT r.id,po.permission_id,
 CASE WHEN r.default_key='branch_administrator' AND po.operation IN ('teams.members.add','teams.members.remove') THEN 'own_branch' ELSE 'global' END
FROM roles r CROSS JOIN permission_operations po
WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','server_administrator','branch_administrator','general_user')
 AND po.deleted_at IS NULL AND po.operation LIKE 'teams.%'
 AND (po.operation='teams.read' OR r.default_key<>'general_user')
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE TABLE clients (
 id SERIAL PRIMARY KEY,
 name VARCHAR(128) NOT NULL UNIQUE,
 country_code VARCHAR(2) NOT NULL DEFAULT 'JP',
 postal_code VARCHAR(10),
 prefecture VARCHAR(64),
 city VARCHAR(128),
 street_address VARCHAR(255),
 building_name VARCHAR(255),
 phone_number_1 VARCHAR(32),
 phone_number_2 VARCHAR(32),
 fax_number_1 VARCHAR(32),
 fax_number_2 VARCHAR(32),
 notes TEXT,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TIMESTAMPTZ(3) DEFAULT NULL,
 company_name VARCHAR(128) NOT NULL CHECK(length(btrim(company_name)) BETWEEN 1 AND 128),
 contact_name VARCHAR(128), contact_department VARCHAR(128), contact_email VARCHAR(254), contact_mobile VARCHAR(32)
);
CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TABLE skills (
 id SERIAL PRIMARY KEY, name VARCHAR(128) NOT NULL, name_key VARCHAR(128) NOT NULL UNIQUE,
 category VARCHAR(128), description VARCHAR(5000),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TIMESTAMPTZ(3) DEFAULT NULL
);
CREATE SEQUENCE project_code_seq;
CREATE TABLE projects (
 id SERIAL PRIMARY KEY, code VARCHAR(64) NOT NULL DEFAULT ('PRJ-' || nextval('project_code_seq')::text) UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
 name VARCHAR(128) NOT NULL, description VARCHAR(5000),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TIMESTAMPTZ(3) DEFAULT NULL,
 client_id INTEGER REFERENCES clients(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 contract_starts_on DATE, contract_ends_on DATE,
 CONSTRAINT projects_contract_period_check CHECK(contract_ends_on IS NULL OR (contract_starts_on IS NOT NULL AND contract_ends_on >= contract_starts_on)),
 CONSTRAINT projects_client_contract_pair_check CHECK((client_id IS NULL) = (contract_starts_on IS NULL))
);
ALTER SEQUENCE project_code_seq OWNED BY projects.code;
CREATE INDEX projects_client_id_idx ON projects(client_id);
CREATE TABLE employee_skills (
 id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 proficiency SMALLINT NOT NULL CHECK (proficiency BETWEEN 1 AND 3),
 experience_years DECIMAL(3,1) CHECK (experience_years BETWEEN 0 AND 80), notes VARCHAR(5000),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TIMESTAMPTZ(3) DEFAULT NULL,
 UNIQUE(employee_id,skill_id)
);
CREATE INDEX employee_skills_skill_id_idx ON employee_skills(skill_id);
CREATE TABLE project_participations (
 id SERIAL PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 starts_on DATE NOT NULL, ends_on DATE CHECK (ends_on >= starts_on), responsibility VARCHAR(5000),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TIMESTAMPTZ(3) DEFAULT NULL,
 UNIQUE(employee_id,project_id,starts_on)
);
CREATE INDEX project_participations_project_id_ends_on_idx ON project_participations(project_id,ends_on);
CREATE TABLE workforce_change_history (
 id SERIAL PRIMARY KEY, event_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 actor_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 resource VARCHAR(40) NOT NULL, resource_id INTEGER NOT NULL, action VARCHAR(20) NOT NULL, changes JSONB NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, deleted_at TIMESTAMPTZ(3) DEFAULT NULL
);
CREATE INDEX workforce_change_history_employee_id_created_at_idx ON workforce_change_history(employee_id,created_at);
CREATE TRIGGER skills_set_updated_at BEFORE UPDATE ON skills FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER employee_skills_set_updated_at BEFORE UPDATE ON employee_skills FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER project_participations_set_updated_at BEFORE UPDATE ON project_participations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
CREATE TRIGGER workforce_change_history_set_updated_at BEFORE UPDATE ON workforce_change_history FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
-- New operations are independently configurable; custom roles remain denied.
INSERT INTO permissions(name)
SELECT 'Operation: ' || code FROM unnest(ARRAY[
 'skills.read','skills.create','skills.update','skills.delete','projects.read','projects.create','projects.update','projects.delete',
 'employees.skills.create','employees.skills.update','employees.skills.delete',
 'employees.participations.create','employees.participations.update','employees.participations.delete']) code
WHERE EXISTS(SELECT 1 FROM roles) ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id)
SELECT substring(name FROM 12),id FROM permissions WHERE deleted_at IS NULL AND
 (name LIKE 'Operation: skills.%' OR name LIKE 'Operation: projects.%' OR name LIKE 'Operation: employees.skills.%' OR name LIKE 'Operation: employees.participations.%')
ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type)
SELECT r.id,po.permission_id,CASE WHEN r.default_key='branch_administrator' AND po.operation LIKE 'employees.%' THEN 'own_branch' ELSE 'global' END
FROM roles r CROSS JOIN permission_operations po
WHERE r.deleted_at IS NULL AND po.deleted_at IS NULL AND
 ((po.operation IN ('skills.read','projects.read') AND r.default_key IN ('system_administrator','business_administrator','server_administrator','branch_administrator','general_user'))
 OR ((po.operation LIKE 'skills.%' OR po.operation LIKE 'projects.%') AND r.default_key IN ('system_administrator','business_administrator','server_administrator'))
 OR ((po.operation LIKE 'employees.skills.%' OR po.operation LIKE 'employees.participations.%') AND r.default_key IN ('system_administrator','business_administrator','server_administrator','branch_administrator')))
ON CONFLICT(role_id,permission_id) DO NOTHING;

CREATE TABLE saved_search_filters (
 id SERIAL PRIMARY KEY,
 owner_employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 target VARCHAR(16) NOT NULL CHECK (target IN ('employees','books')),
 name VARCHAR(100) NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
 filter_code UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 definition JSONB NOT NULL CHECK (jsonb_typeof(definition)='object'),
 schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version=1),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>0),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 deleted_at TIMESTAMPTZ(3) DEFAULT NULL
);
CREATE INDEX saved_search_filters_owner_employee_id_target_deleted_at_idx ON saved_search_filters(owner_employee_id,target,deleted_at);
CREATE TRIGGER saved_search_filters_set_updated_at BEFORE UPDATE ON saved_search_filters FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
INSERT INTO permissions(name)
SELECT 'Operation: '||code FROM unnest(ARRAY['search_filters.read','search_filters.create','search_filters.update','search_filters.delete']) code
WHERE EXISTS(SELECT 1 FROM roles) ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id)
SELECT substring(name FROM 12),id FROM permissions WHERE deleted_at IS NULL AND name IN ('Operation: search_filters.read','Operation: search_filters.create','Operation: search_filters.update','Operation: search_filters.delete')
ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type)
SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po
WHERE r.deleted_at IS NULL AND r.default_key IN ('system_administrator','business_administrator','general_user','server_administrator','branch_administrator')
AND po.deleted_at IS NULL AND po.operation IN ('search_filters.read','search_filters.create','search_filters.update','search_filters.delete')
ON CONFLICT(role_id,permission_id) DO NOTHING;

INSERT INTO permissions(name)
SELECT 'Operation: '||code FROM unnest(ARRAY['clients.read','clients.create','clients.update','clients.delete']) code
WHERE EXISTS(SELECT 1 FROM roles) ON CONFLICT(name) DO NOTHING;
INSERT INTO permission_operations(operation,permission_id)
SELECT substring(name FROM 12),id FROM permissions WHERE deleted_at IS NULL AND name IN ('Operation: clients.read','Operation: clients.create','Operation: clients.update','Operation: clients.delete')
ON CONFLICT(operation) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,scope_type)
SELECT r.id,po.permission_id,'global' FROM roles r CROSS JOIN permission_operations po
WHERE r.deleted_at IS NULL AND po.deleted_at IS NULL AND
 (po.operation='clients.read' OR (po.operation IN ('clients.create','clients.update','clients.delete') AND r.default_key IN ('system_administrator','business_administrator')))
ON CONFLICT(role_id,permission_id) DO NOTHING;
COMMIT;
