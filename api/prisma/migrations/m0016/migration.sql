BEGIN;

CREATE TABLE public.financial_period_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(32) NOT NULL UNIQUE DEFAULT 'main',
  basis VARCHAR(16) NOT NULL DEFAULT 'calendar',
  fiscal_start_month INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  CONSTRAINT financial_period_settings_basis_check CHECK (basis IN ('calendar', 'fiscal')),
  CONSTRAINT financial_period_settings_start_check CHECK (fiscal_start_month BETWEEN 1 AND 12)
);

CREATE TABLE public.financial_months (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  month DATE NOT NULL,
  currency VARCHAR(3) NOT NULL,
  revenue DECIMAL(20,2) NOT NULL,
  variable_cost DECIMAL(20,2) NOT NULL,
  fixed_cost DECIMAL(20,2) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  CONSTRAINT financial_months_branch_id_month_key UNIQUE (branch_id, month),
  CONSTRAINT financial_months_currency_check CHECK (currency IN ('JPY', 'USD')),
  CONSTRAINT financial_months_amount_check CHECK (revenue >= 0 AND variable_cost >= 0 AND fixed_cost >= 0),
  CONSTRAINT financial_months_jpy_whole_check CHECK (currency <> 'JPY' OR (revenue = TRUNC(revenue) AND variable_cost = TRUNC(variable_cost) AND fixed_cost = TRUNC(fixed_cost))),
  CONSTRAINT financial_months_month_start_check CHECK (EXTRACT(DAY FROM month) = 1)
);
CREATE INDEX financial_months_month_idx ON public.financial_months(month);

CREATE TABLE public.financial_exchange_rates (
  id SERIAL PRIMARY KEY,
  month DATE NOT NULL,
  base_currency VARCHAR(3) NOT NULL,
  quote_currency VARCHAR(3) NOT NULL,
  rate DECIMAL(20,8) NOT NULL,
  source VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  CONSTRAINT financial_exchange_rates_month_base_currency_quote_currency_key UNIQUE (month, base_currency, quote_currency),
  CONSTRAINT financial_exchange_rates_rate_check CHECK (rate > 0),
  CONSTRAINT financial_exchange_rates_month_start_check CHECK (EXTRACT(DAY FROM month) = 1)
);

CREATE TABLE public.financial_publications (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  basis VARCHAR(16) NOT NULL,
  fiscal_start_month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3),
  CONSTRAINT financial_publications_branch_id_basis_fiscal_start_month_y_key UNIQUE (branch_id, basis, fiscal_start_month, year),
  CONSTRAINT financial_publications_basis_check CHECK (basis IN ('calendar', 'fiscal')),
  CONSTRAINT financial_publications_start_check CHECK (fiscal_start_month BETWEEN 1 AND 12)
);
CREATE INDEX financial_publications_basis_fiscal_start_month_year_idx ON public.financial_publications(basis, fiscal_start_month, year);


ALTER TABLE public.employee_settings
  ADD COLUMN display_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  ADD CONSTRAINT employee_settings_display_currency_check CHECK (display_currency IN ('JPY', 'USD'));

UPDATE public.employee_settings
SET display_currency = 'JPY'
WHERE display_language = 'ja';

ALTER TABLE employee_roles
  DROP CONSTRAINT employee_roles_scope_check,
  ADD CONSTRAINT employee_roles_scope_check CHECK (
  (scope_type = 'global' AND scope_key = 'global' AND department_id IS NULL AND scope_employee_id IS NULL)
  OR (scope_type = 'own_branch' AND scope_key = 'own_branch' AND department_id IS NULL AND scope_employee_id IS NULL)
  OR (scope_type = 'department' AND department_id IS NOT NULL AND scope_employee_id IS NULL AND scope_key = 'department:' || department_id::text)
  OR (scope_type = 'employee' AND department_id IS NULL AND scope_employee_id IS NOT NULL AND scope_key = 'employee:' || scope_employee_id::text)
);

INSERT INTO roles (name, default_key)
SELECT CASE WHEN name = 'システム管理者' THEN '拠点管理者' ELSE 'Branch Administrator' END,
       'branch_administrator'
FROM roles
WHERE default_key = 'system_administrator' AND deleted_at IS NULL;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, operation.permission_id
FROM roles AS role
JOIN permission_operations AS operation ON operation.deleted_at IS NULL
WHERE role.default_key = 'branch_administrator'
  AND operation.operation IN (
    'employees.read', 'employees.manage', 'masters.read', 'branches.manage',
    'assets.read', 'assets.manage', 'assets.credentials.read',
    'assets.credentials.write', 'calendars.read', 'calendars.assign'
  );



-- Keep role-grant history while allowing only one active grant per employee.
-- Permissions on inactive department/employee scopes were never effective.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM employee_roles er JOIN employees e ON e.id = er.employee_id
    LEFT JOIN roles r ON r.id = er.role_id AND r.deleted_at IS NULL
    WHERE er.deleted_at IS NULL AND e.deleted_at IS NULL AND r.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Active role grants reference an inactive role; resolve before migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM employee_roles er JOIN roles r ON r.id = er.role_id
    WHERE er.deleted_at IS NULL AND r.deleted_at IS NULL
      AND ((r.default_key = 'branch_administrator' AND er.scope_type <> 'own_branch')
        OR (r.default_key = 'system_administrator' AND er.scope_type <> 'global'))
  ) THEN
    RAISE EXCEPTION 'A protected role has an invalid assignment scope';
  END IF;
END $$;

CREATE TEMP TABLE role_grant_choice (employee_id integer PRIMARY KEY, grant_id integer NOT NULL) ON COMMIT DROP;

WITH active AS (
  SELECT er.id, er.employee_id, er.role_id, er.scope_type, er.scope_key, r.default_key
  FROM employee_roles er JOIN roles r ON r.id = er.role_id AND r.deleted_at IS NULL
  WHERE er.deleted_at IS NULL
), candidates AS (
  SELECT candidate.employee_id, candidate.id AS grant_id,
         row_number() OVER (PARTITION BY candidate.employee_id ORDER BY
           CASE candidate.scope_type WHEN 'global' THEN 0 WHEN 'own_branch' THEN 1 ELSE 2 END,
           candidate.id) AS choice_order
  FROM active candidate
  WHERE NOT EXISTS (
    SELECT 1 FROM active other
    WHERE other.employee_id = candidate.employee_id AND other.id <> candidate.id
      AND NOT (
        other.scope_type IN ('department', 'employee')
        OR (
          (candidate.scope_type = 'global' OR
            (candidate.scope_type = other.scope_type AND candidate.scope_key = other.scope_key))
          AND NOT EXISTS (
            SELECT 1 FROM role_permissions other_rp
            JOIN permission_operations other_op ON other_op.permission_id = other_rp.permission_id AND other_op.deleted_at IS NULL
            WHERE other_rp.role_id = other.role_id AND other_rp.deleted_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM role_permissions candidate_rp
                JOIN permission_operations candidate_op ON candidate_op.permission_id = candidate_rp.permission_id AND candidate_op.deleted_at IS NULL
                WHERE candidate_rp.role_id = candidate.role_id AND candidate_rp.deleted_at IS NULL
                  AND candidate_op.operation = other_op.operation
              )
          )
        )
      )
  )
)
INSERT INTO role_grant_choice (employee_id, grant_id)
SELECT employee_id, grant_id FROM candidates WHERE choice_order = 1;

-- The approved exception: Business Administrator takes precedence over General User.
INSERT INTO role_grant_choice (employee_id, grant_id)
SELECT business.employee_id, business.id
FROM employee_roles business
JOIN roles business_role ON business_role.id = business.role_id AND business_role.default_key = 'business_administrator'
JOIN employee_roles general ON general.employee_id = business.employee_id AND general.deleted_at IS NULL
JOIN roles general_role ON general_role.id = general.role_id AND general_role.default_key = 'general_user'
WHERE business.deleted_at IS NULL AND business.scope_type = 'global' AND general.scope_type = 'global'
  AND (SELECT count(*) FROM employee_roles er WHERE er.employee_id = business.employee_id AND er.deleted_at IS NULL) = 2
ON CONFLICT (employee_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM employee_roles er WHERE er.deleted_at IS NULL
    GROUP BY er.employee_id HAVING count(*) > 1
       AND NOT EXISTS (SELECT 1 FROM role_grant_choice choice WHERE choice.employee_id = er.employee_id)
  ) THEN
    RAISE EXCEPTION 'Incomparable role grants remain; resolve before migration';
  END IF;
END $$;

UPDATE employee_roles er SET deleted_at = now()
FROM role_grant_choice choice
WHERE er.employee_id = choice.employee_id AND er.id <> choice.grant_id AND er.deleted_at IS NULL;

CREATE UNIQUE INDEX employee_roles_one_active_per_employee ON employee_roles (employee_id) WHERE deleted_at IS NULL;




CREATE TEMP TABLE granular_catalog (code text PRIMARY KEY, prerequisites text[] NOT NULL, system_only boolean NOT NULL) ON COMMIT DROP;
INSERT INTO granular_catalog (code, prerequisites, system_only) VALUES
  ('employees.create', ARRAY['employees.manage']::text[], false),
  ('employees.update', ARRAY['employees.manage']::text[], false),
  ('employees.delete', ARRAY['employees.manage']::text[], false),
  ('employees.invite', ARRAY['system.manage']::text[], true),
  ('masters.create', ARRAY['masters.manage']::text[], false),
  ('masters.update', ARRAY['masters.manage']::text[], false),
  ('masters.delete', ARRAY['masters.manage']::text[], false),
  ('masters.reorder', ARRAY['masters.manage']::text[], false),
  ('branches.create', ARRAY['branches.manage']::text[], true),
  ('branches.update', ARRAY['branches.manage']::text[], true),
  ('branches.delete', ARRAY['branches.manage']::text[], true),
  ('rooms.create', ARRAY['masters.manage', 'branches.manage']::text[], false),
  ('rooms.update', ARRAY['masters.manage', 'branches.manage']::text[], false),
  ('rooms.delete', ARRAY['masters.manage', 'branches.manage']::text[], false),
  ('storage.create', ARRAY['masters.manage', 'branches.manage']::text[], false),
  ('storage.update', ARRAY['masters.manage', 'branches.manage']::text[], false),
  ('storage.delete', ARRAY['masters.manage', 'branches.manage']::text[], false),
  ('assets.create', ARRAY['assets.manage']::text[], false),
  ('assets.update', ARRAY['assets.manage']::text[], false),
  ('assets.delete', ARRAY['assets.manage']::text[], false),
  ('assets.assign', ARRAY['assets.manage']::text[], false),
  ('assets.return', ARRAY['assets.manage']::text[], false),
  ('assets.reorder', ARRAY['assets.manage']::text[], false),
  ('assets.credentials.view', ARRAY['assets.credentials.read']::text[], false),
  ('assets.credentials.update', ARRAY['assets.credentials.write']::text[], false),
  ('assets.credentials.access', ARRAY['assets.credentials.read']::text[], false),
  ('calendars.create', ARRAY['system.manage']::text[], true),
  ('calendars.update', ARRAY['system.manage']::text[], true),
  ('calendars.delete', ARRAY['system.manage']::text[], true),
  ('calendars.entries.create', ARRAY['system.manage']::text[], true),
  ('calendars.entries.update', ARRAY['system.manage']::text[], true),
  ('calendars.entries.delete', ARRAY['system.manage']::text[], true),
  ('calendars.holidays.import', ARRAY['system.manage']::text[], true),
  ('financial.update', ARRAY['branches.manage']::text[], false),
  ('financial.read', ARRAY['branches.manage']::text[], false),
  ('financial.preview', ARRAY['branches.manage']::text[], false),
  ('financial.publish', ARRAY['branches.manage']::text[], false),
  ('financial.settings.update', ARRAY['system.manage']::text[], true),
  ('financial.rates.refresh', ARRAY['system.manage']::text[], true),
  ('roles.create', ARRAY['system.manage']::text[], true),
  ('roles.update', ARRAY['system.manage']::text[], true),
  ('roles.delete', ARRAY['system.manage']::text[], true),
  ('roles.permissions.update', ARRAY['system.manage']::text[], true),
  ('roles.assign', ARRAY['system.manage']::text[], true),
  ('system.links.create', ARRAY['system.manage']::text[], true),
  ('system.links.update', ARRAY['system.manage']::text[], true),
  ('system.links.delete', ARRAY['system.manage']::text[], true),
  ('system.links.reorder', ARRAY['system.manage']::text[], true);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM roles) AND EXISTS (SELECT 1 FROM granular_catalog c WHERE EXISTS (
    SELECT 1 FROM unnest(c.prerequisites) AS code WHERE NOT EXISTS (
      SELECT 1 FROM permission_operations po WHERE po.operation = code AND po.deleted_at IS NULL
    )
  )) THEN RAISE EXCEPTION 'Missing prerequisite permission operation'; END IF;
END $$;

INSERT INTO permissions (name)
SELECT 'Operation: ' || code FROM granular_catalog c
WHERE EXISTS (SELECT 1 FROM roles)
  AND NOT EXISTS (SELECT 1 FROM permissions p WHERE p.name = 'Operation: ' || c.code);

INSERT INTO permission_operations (operation, permission_id)
SELECT c.code, p.id FROM granular_catalog c JOIN permissions p ON p.name = 'Operation: ' || c.code
WHERE EXISTS (SELECT 1 FROM roles)
  AND NOT EXISTS (SELECT 1 FROM permission_operations existing WHERE existing.operation = c.code);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, fine.permission_id
FROM roles r CROSS JOIN granular_catalog c
JOIN permission_operations fine ON fine.operation = c.code AND fine.deleted_at IS NULL
WHERE r.deleted_at IS NULL
  AND (NOT c.system_only OR r.default_key = 'system_administrator' OR (r.default_key = 'branch_administrator' AND c.code = 'branches.update'))
  AND EXISTS (
    SELECT 1 FROM role_permissions rp
    JOIN permission_operations base ON base.permission_id = rp.permission_id AND base.deleted_at IS NULL
    WHERE rp.role_id = r.id AND rp.deleted_at IS NULL AND base.operation = ANY(c.prerequisites)
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;




ALTER TABLE role_permissions
  ADD COLUMN scope_type text NOT NULL DEFAULT 'global',
  ADD CONSTRAINT role_permissions_scope_type_check CHECK (scope_type IN ('global', 'own_branch'));

UPDATE role_permissions rp SET scope_type = 'own_branch', updated_at = CURRENT_TIMESTAMP
FROM roles r, permission_operations po
WHERE rp.role_id = r.id AND rp.permission_id = po.permission_id
  AND r.default_key = 'branch_administrator' AND rp.deleted_at IS NULL
  AND po.operation IN (
    'employees.read', 'employees.manage', 'employees.create', 'employees.update', 'employees.delete',
    'masters.read', 'branches.manage', 'branches.update',
    'rooms.create', 'rooms.update', 'rooms.delete', 'storage.create', 'storage.update', 'storage.delete',
    'assets.read', 'assets.manage', 'assets.create', 'assets.update', 'assets.delete', 'assets.assign', 'assets.return',
    'assets.credentials.read', 'assets.credentials.write', 'assets.credentials.view', 'assets.credentials.update', 'assets.credentials.access',
    'calendars.read', 'calendars.assign', 'financial.read', 'financial.update', 'financial.preview', 'financial.publish'
  );



-- Branch administrators can issue invitations for general users in their own branch.
-- Keep branch deletion scoped to the same branch as every other branch operation.
INSERT INTO role_permissions (role_id, permission_id, scope_type)
SELECT role.id, operation.permission_id, 'own_branch'
FROM roles AS role
JOIN permission_operations AS operation ON operation.operation IN ('employees.invite', 'branches.delete') AND operation.deleted_at IS NULL
WHERE role.default_key = 'branch_administrator' AND role.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE
SET scope_type = 'own_branch', deleted_at = NULL, updated_at = CURRENT_TIMESTAMP;

COMMIT;
