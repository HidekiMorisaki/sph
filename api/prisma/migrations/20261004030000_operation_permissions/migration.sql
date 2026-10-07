BEGIN;
-- Preserve each role's effective operations before replacing the legacy groups.
CREATE TEMP TABLE migrated_role_operations (role_id integer NOT NULL, operation text NOT NULL) ON COMMIT DROP;
INSERT INTO migrated_role_operations (role_id, operation)
SELECT DISTINCT rp.role_id, mapping.operation
FROM public.role_permissions rp
JOIN public.permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
JOIN public.permission_operations po ON po.permission_id = p.id AND po.deleted_at IS NULL
JOIN (VALUES
  ('system.manage','system.manage'),
  ('system.manage','branches.manage'),
  ('administration.manage','employees.manage'),
  ('administration.manage','masters.manage'),
  ('administration.manage','roles.read'),
  ('assets.manage','assets.manage'),
  ('assets.credentials.read','assets.credentials.read'),
  ('assets.credentials.write','assets.credentials.write')
) AS mapping(previous_operation, operation) ON mapping.previous_operation = po.operation
WHERE rp.deleted_at IS NULL;

-- All previously assignable roles could read these resources.
INSERT INTO migrated_role_operations (role_id, operation)
SELECT r.id, reading.operation
FROM public.roles r CROSS JOIN (VALUES ('employees.read'), ('masters.read'), ('assets.read')) AS reading(operation)
WHERE r.deleted_at IS NULL;

INSERT INTO public.permissions (name)
SELECT 'Operation: ' || catalog.operation
FROM (VALUES
 ('system.manage'), ('employees.read'), ('employees.manage'), ('masters.read'),
 ('masters.manage'), ('branches.manage'), ('roles.read'), ('assets.read'),
 ('assets.manage'), ('assets.credentials.read'), ('assets.credentials.write')
) AS catalog(operation)
WHERE EXISTS (SELECT 1 FROM public.roles)
  AND (NOT EXISTS (SELECT 1 FROM public.permission_operations po WHERE po.operation = catalog.operation AND po.deleted_at IS NULL)
   OR EXISTS (SELECT 1 FROM public.permission_operations po JOIN public.permissions p ON p.id = po.permission_id WHERE po.operation = catalog.operation AND p.name <> 'Operation: ' || catalog.operation));

-- Give each operation its own permission record. Existing operation identifiers remain stable.
UPDATE public.permission_operations po
SET permission_id = p.id
FROM public.permissions p
WHERE p.name = 'Operation: ' || po.operation AND p.deleted_at IS NULL
  AND po.permission_id <> p.id;

INSERT INTO public.permission_operations (operation, permission_id)
SELECT substring(p.name FROM 12), p.id FROM public.permissions p
WHERE p.name LIKE 'Operation: %'
  AND NOT EXISTS (SELECT 1 FROM public.permission_operations po WHERE po.operation = substring(p.name FROM 12));

UPDATE public.role_permissions SET deleted_at = now() WHERE deleted_at IS NULL;
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT m.role_id, po.permission_id
FROM migrated_role_operations m
JOIN public.permission_operations po ON po.operation = m.operation AND po.deleted_at IS NULL;

UPDATE public.permissions p SET deleted_at = now()
WHERE p.deleted_at IS NULL AND p.name NOT LIKE 'Operation: %'
  AND NOT EXISTS (SELECT 1 FROM public.permission_operations po WHERE po.permission_id = p.id AND po.deleted_at IS NULL);

CREATE UNIQUE INDEX permission_operations_permission_id_key ON public.permission_operations (permission_id);
COMMIT;
