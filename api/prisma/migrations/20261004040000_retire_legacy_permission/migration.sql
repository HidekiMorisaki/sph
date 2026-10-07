BEGIN;
UPDATE public.permission_operations po SET deleted_at = now()
WHERE po.operation = 'administration.manage' AND po.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL
    WHERE rp.permission_id = po.permission_id AND rp.deleted_at IS NULL
  );

UPDATE public.permissions p SET deleted_at = now()
WHERE p.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.permission_operations po WHERE po.permission_id = p.id AND po.operation = 'administration.manage' AND po.deleted_at IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.permission_operations po WHERE po.permission_id = p.id AND po.deleted_at IS NULL);
COMMIT;
