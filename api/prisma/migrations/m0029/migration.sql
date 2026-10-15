-- Bounded seven-day telemetry ring. Slot is the minute-of-week natural key.
CREATE TABLE "system_metric_samples" (
  "id" SERIAL PRIMARY KEY,
  "slot" INTEGER NOT NULL UNIQUE CHECK ("slot" >= 0 AND "slot" < 10080),
  "measured_at" TIMESTAMPTZ(3) NOT NULL,
  "measurement" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(3)
);
CREATE INDEX "system_metric_samples_measured_at_idx" ON "system_metric_samples" ("measured_at");
CREATE TRIGGER system_metric_samples_set_updated_at BEFORE UPDATE ON "system_metric_samples"
  FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

INSERT INTO permissions (name)
SELECT 'Operation: system.metrics.read' WHERE EXISTS (SELECT 1 FROM roles)
ON CONFLICT (name) DO NOTHING;
INSERT INTO permission_operations (operation, permission_id)
SELECT 'system.metrics.read', id FROM permissions
WHERE name = 'Operation: system.metrics.read' AND deleted_at IS NULL
ON CONFLICT (operation) DO NOTHING;
-- Only roles with an existing global system management grant receive access.
INSERT INTO role_permissions (role_id, permission_id, scope_type)
SELECT DISTINCT rp.role_id, target.permission_id, 'global'
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id AND r.deleted_at IS NULL
JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
JOIN permission_operations current ON current.permission_id = p.id
  AND current.operation = 'system.manage' AND current.deleted_at IS NULL
CROSS JOIN permission_operations target
WHERE rp.deleted_at IS NULL AND rp.scope_type = 'global'
  AND target.operation = 'system.metrics.read' AND target.deleted_at IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;
