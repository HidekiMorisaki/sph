-- Optional parts are equal when both are absent. Keep the natural key unique
-- for active and logically deleted records, as the former display_name key was.
CREATE UNIQUE INDEX operating_systems_natural_key
    ON public.operating_systems (vendor, product, version, edition, architecture) NULLS NOT DISTINCT;

-- Different component boundaries can otherwise produce the same visible name.
CREATE UNIQUE INDEX operating_systems_generated_name_key
    ON public.operating_systems ((vendor || ' ' || product || ' ' || version ||
        COALESCE(' ' || NULLIF(edition, ''), '') ||
        COALESCE(' (' || NULLIF(architecture, '') || ')', '')));

DROP INDEX public.operating_systems_display_name_key;
ALTER TABLE public.operating_systems DROP COLUMN display_name;
