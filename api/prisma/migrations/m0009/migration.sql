ALTER TABLE public.roles ADD COLUMN default_key text;

-- Required roles are inserted in this order by the initial data installer.
UPDATE public.roles
SET default_key = CASE id
  WHEN 1 THEN 'system_administrator'
  WHEN 2 THEN 'business_administrator'
  WHEN 3 THEN 'general_user'
  WHEN 4 THEN 'server_administrator'
END
WHERE id BETWEEN 1 AND 4 AND deleted_at IS NULL;

CREATE UNIQUE INDEX roles_default_key_key ON public.roles (default_key);
