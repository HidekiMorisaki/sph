-- Register delete operations without changing grants for custom roles.
INSERT INTO permissions (name)
SELECT 'Operation: ' || code FROM unnest(ARRAY[
  'software.products.delete', 'software.contracts.delete'
]) AS code
WHERE EXISTS (SELECT 1 FROM roles)
ON CONFLICT (name) DO NOTHING;

INSERT INTO permission_operations (operation, permission_id)
SELECT substring(p.name FROM 12), p.id FROM permissions p
WHERE p.name IN ('Operation: software.products.delete', 'Operation: software.contracts.delete')
  AND p.deleted_at IS NULL
ON CONFLICT (operation) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, scope_type)
SELECT r.id, po.permission_id, 'global'
FROM roles r CROSS JOIN permission_operations po
WHERE r.default_key = 'system_administrator' AND r.deleted_at IS NULL
  AND po.operation IN ('software.products.delete', 'software.contracts.delete')
  AND po.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;
