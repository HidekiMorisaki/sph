BEGIN;

-- Retire only definitions that use the removed feature, and the four already
-- retired official codes. Preserve audit/history and all current SDK records.
UPDATE widget_records SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL AND instance_id IN (
 SELECT i.id FROM widget_instances i JOIN widget_releases r ON r.id = i.release_id
 JOIN widget_sources s ON s.id = r.source_id
 WHERE r.definition->'capabilities' ? 'today'
 OR (s.source_key = 'sph-official' AND r.widget_code IN ('sph.account','sph.book_notices','sph.book_loans','sph.today'))
);
WITH retired_instances AS (
 UPDATE widget_instances i SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
 FROM widget_releases r JOIN widget_sources s ON s.id = r.source_id
 WHERE i.release_id = r.id AND i.deleted_at IS NULL AND (
  r.definition->'capabilities' ? 'today'
  OR (s.source_key = 'sph-official' AND r.widget_code IN ('sph.account','sph.book_notices','sph.book_loans','sph.today'))
 ) RETURNING i.layout_id
)
UPDATE widget_layouts SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT layout_id FROM retired_instances);
UPDATE widget_approvals a SET allowed = false, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
FROM widget_releases r JOIN widget_sources s ON s.id = r.source_id
WHERE a.release_id = r.id AND a.deleted_at IS NULL AND (
 r.definition->'capabilities' ? 'today'
 OR (s.source_key = 'sph-official' AND r.widget_code IN ('sph.account','sph.book_notices','sph.book_loans','sph.today'))
);
UPDATE widget_releases r SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
FROM widget_sources s WHERE r.source_id = s.id AND r.deleted_at IS NULL AND (
 r.definition->'capabilities' ? 'today'
 OR (s.source_key = 'sph-official' AND r.widget_code IN ('sph.account','sph.book_notices','sph.book_loans','sph.today'))
);

UPDATE role_permissions SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL AND permission_id IN (
 SELECT permission_id FROM permission_operations WHERE operation = 'widgets.consent.update'
);
UPDATE permissions SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL AND id IN (
 SELECT permission_id FROM permission_operations WHERE operation = 'widgets.consent.update'
);
UPDATE permission_operations SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL AND operation = 'widgets.consent.update';

ALTER TABLE employee_settings DROP COLUMN birthday_consent;
DROP TABLE employee_widgets;

-- BEGIN permission consistency DML
-- Retire only the obsolete operations; preserve permissions shared by live operations.
UPDATE permission_operations SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
WHERE deleted_at IS NULL AND operation IN ('assets.reorder','books.reservations.manage');
UPDATE role_permissions rp SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
WHERE rp.deleted_at IS NULL AND EXISTS (SELECT 1 FROM permission_operations po WHERE po.permission_id=rp.permission_id AND po.operation IN ('assets.reorder','books.reservations.manage'))
AND NOT EXISTS (SELECT 1 FROM permission_operations po WHERE po.permission_id=rp.permission_id AND po.deleted_at IS NULL);
UPDATE permissions p SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
WHERE p.deleted_at IS NULL AND EXISTS (SELECT 1 FROM permission_operations po WHERE po.permission_id=p.id AND po.operation IN ('assets.reorder','books.reservations.manage'))
AND NOT EXISTS (SELECT 1 FROM permission_operations po WHERE po.permission_id=p.id AND po.deleted_at IS NULL);
-- Keep existing branch-delete grants and custom-role grants unchanged.
UPDATE role_permissions rp SET scope_type='own_branch', updated_at=CURRENT_TIMESTAMP
FROM roles r WHERE rp.role_id=r.id AND r.default_key='branch_administrator' AND r.deleted_at IS NULL AND rp.deleted_at IS NULL
AND EXISTS (SELECT 1 FROM permission_operations po WHERE po.permission_id=rp.permission_id AND po.deleted_at IS NULL AND po.operation IN ('books.manage','books.copies.create','books.copies.update','books.copies.delete','books.loans.create','books.loans.return','books.purchases.manage'));
UPDATE role_permissions rp SET deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
FROM roles r WHERE rp.role_id=r.id AND r.default_key='branch_administrator' AND r.deleted_at IS NULL AND rp.deleted_at IS NULL
AND EXISTS (SELECT 1 FROM permission_operations po WHERE po.permission_id=rp.permission_id AND po.deleted_at IS NULL AND po.operation IN ('books.covers.update','books.titles.update','books.titles.delete'));
-- END permission consistency DML

COMMIT;
