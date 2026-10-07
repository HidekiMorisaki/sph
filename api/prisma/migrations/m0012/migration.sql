-- Keep the existing OS and asset identifiers while moving vendors to a master.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.operating_systems WHERE vendor <> btrim(vendor) OR btrim(vendor) = '' OR length(vendor) > 128) THEN
    RAISE EXCEPTION 'Operating system vendor names require cleanup before m0012';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.operating_systems
    WHERE length(vendor || ' ' || product || ' ' || version ||
      COALESCE(' ' || NULLIF(edition, ''), '') || COALESCE(' (' || NULLIF(architecture, '') || ')', '')) > 255
  ) THEN
    RAISE EXCEPTION 'Operating system names exceed 255 characters before m0012';
  END IF;
END $$;

CREATE TABLE public.operating_system_vendors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 9999,
  notes VARCHAR(5000),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ(3)
);
CREATE UNIQUE INDEX operating_system_vendors_name_key ON public.operating_system_vendors (name);
CREATE TRIGGER operating_system_vendors_set_updated_at BEFORE UPDATE ON public.operating_system_vendors
  FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

INSERT INTO public.operating_system_vendors (name)
SELECT DISTINCT vendor FROM public.operating_systems ORDER BY vendor;
ALTER TABLE public.operating_systems ADD COLUMN vendor_id INTEGER;
UPDATE public.operating_systems AS os SET vendor_id = v.id
FROM public.operating_system_vendors AS v WHERE v.name = os.vendor;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.operating_systems WHERE vendor_id IS NULL) THEN
    RAISE EXCEPTION 'Operating system vendor migration left unmatched rows';
  END IF;
END $$;
ALTER TABLE public.operating_systems ALTER COLUMN vendor_id SET NOT NULL;
ALTER TABLE public.operating_systems ADD CONSTRAINT operating_systems_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES public.operating_system_vendors(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX operating_systems_vendor_id_idx ON public.operating_systems (vendor_id);
DROP INDEX public.operating_systems_natural_key;
CREATE UNIQUE INDEX operating_systems_natural_key ON public.operating_systems
  (vendor_id, product, version, edition, architecture) NULLS NOT DISTINCT;
DROP INDEX public.operating_systems_generated_name_key;
ALTER TABLE public.operating_systems DROP COLUMN vendor;

-- All competing OS writes and vendor renames use one transaction lock. The
-- checks include logically deleted records, matching the previous unique index.
CREATE FUNCTION public.os_full_name(vendor_name text, product_name text, version_name text, edition_name text, architecture_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT vendor_name || ' ' || product_name || ' ' || version_name ||
    COALESCE(' ' || NULLIF(edition_name, ''), '') ||
    COALESCE(' (' || NULLIF(architecture_name, '') || ')', '')
$$;

CREATE FUNCTION public.check_operating_system_name() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE vendor_name text; full_name text;
BEGIN
  PERFORM pg_advisory_xact_lock(61112, 1);
  SELECT name INTO vendor_name FROM public.operating_system_vendors WHERE id = NEW.vendor_id;
  full_name := public.os_full_name(vendor_name, NEW.product, NEW.version, NEW.edition, NEW.architecture);
  IF length(full_name) > 255 THEN
    RAISE EXCEPTION 'Operating system name exceeds 255 characters' USING ERRCODE = '22001', CONSTRAINT = 'operating_systems_name_length';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.operating_systems os JOIN public.operating_system_vendors v ON v.id = os.vendor_id
    WHERE os.id <> NEW.id AND public.os_full_name(v.name, os.product, os.version, os.edition, os.architecture) = full_name
  ) THEN
    RAISE EXCEPTION 'Operating system name already exists' USING ERRCODE = '23505', CONSTRAINT = 'operating_systems_generated_name_key';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER operating_systems_check_name BEFORE INSERT OR UPDATE OF vendor_id, product, version, edition, architecture
ON public.operating_systems FOR EACH ROW EXECUTE FUNCTION public.check_operating_system_name();

CREATE FUNCTION public.check_operating_system_vendor_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name = OLD.name THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(61112, 1);
  IF EXISTS (
    SELECT 1 FROM public.operating_systems os
    WHERE os.vendor_id = NEW.id AND length(public.os_full_name(NEW.name, os.product, os.version, os.edition, os.architecture)) > 255
  ) THEN
    RAISE EXCEPTION 'Operating system name exceeds 255 characters' USING ERRCODE = '22001', CONSTRAINT = 'operating_systems_name_length';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.operating_systems own_os JOIN public.operating_systems other_os ON other_os.id <> own_os.id
    JOIN public.operating_system_vendors other_vendor ON other_vendor.id = other_os.vendor_id
    WHERE own_os.vendor_id = NEW.id AND other_os.vendor_id <> NEW.id
      AND public.os_full_name(NEW.name, own_os.product, own_os.version, own_os.edition, own_os.architecture) =
          public.os_full_name(other_vendor.name, other_os.product, other_os.version, other_os.edition, other_os.architecture)
  ) THEN
    RAISE EXCEPTION 'Operating system name already exists' USING ERRCODE = '23505', CONSTRAINT = 'operating_systems_generated_name_key';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER operating_system_vendors_check_name BEFORE UPDATE OF name ON public.operating_system_vendors
FOR EACH ROW EXECUTE FUNCTION public.check_operating_system_vendor_name();
