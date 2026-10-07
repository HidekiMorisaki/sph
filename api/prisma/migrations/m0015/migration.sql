ALTER TABLE public.roles
  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 2147483647;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name, id) AS position
  FROM public.roles
  WHERE deleted_at IS NULL
)
UPDATE public.roles AS role
SET sort_order = ranked.position
FROM ranked
WHERE role.id = ranked.id;

CREATE INDEX roles_sort_order_name_idx ON public.roles (sort_order, name);
