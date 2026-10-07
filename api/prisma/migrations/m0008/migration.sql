BEGIN;

-- Keep existing calendar access while introducing separate operation permissions.
INSERT INTO public.permissions (name)
SELECT 'Operation: ' || catalog.operation
FROM (VALUES ('calendars.read'), ('calendars.assign')) AS catalog(operation)
WHERE EXISTS (SELECT 1 FROM public.roles)
  AND NOT EXISTS (
    SELECT 1 FROM public.permission_operations po
    WHERE po.operation = catalog.operation AND po.deleted_at IS NULL
  );

INSERT INTO public.permission_operations (operation, permission_id)
SELECT substring(p.name FROM 12), p.id
FROM public.permissions p
WHERE p.name IN ('Operation: calendars.read', 'Operation: calendars.assign')
  AND p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.permission_operations po
    WHERE po.operation = substring(p.name FROM 12) AND po.deleted_at IS NULL
  );

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, po.permission_id
FROM public.roles r
JOIN public.permission_operations po ON po.operation = 'calendars.read' AND po.deleted_at IS NULL
WHERE r.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = po.permission_id AND rp.deleted_at IS NULL
  );

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT DISTINCT r.id, assign.permission_id
FROM public.roles r
JOIN public.role_permissions rp ON rp.role_id = r.id AND rp.deleted_at IS NULL
JOIN public.permission_operations admin ON admin.permission_id = rp.permission_id
  AND admin.operation = 'system.manage' AND admin.deleted_at IS NULL
JOIN public.permission_operations assign ON assign.operation = 'calendars.assign' AND assign.deleted_at IS NULL
WHERE r.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions existing
    WHERE existing.role_id = r.id AND existing.permission_id = assign.permission_id AND existing.deleted_at IS NULL
  );

COMMIT;
