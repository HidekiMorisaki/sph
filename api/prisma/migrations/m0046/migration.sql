-- Fresh-install baseline; replaces the complete pre-m0046 history.
-- Columns, checks, identities and indexes are created in their final form.
-- Foreign keys and sequence ownership are finalized after all tables exist.
BEGIN;

CREATE TYPE public."AccountStatus" AS ENUM (
    'unprovisioned',
    'active',
    'suspended'
);

CREATE TYPE public."DisposalDatePolicy" AS ENUM (
    'prohibited',
    'optional',
    'required'
);

CREATE SEQUENCE public.book_catalog_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.book_copy_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.book_loan_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.book_reservation_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.engagement_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.project_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE SEQUENCE public.team_code_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE FUNCTION public.canonical_book_isbn(value text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE STRICT
    AS $_$
DECLARE v TEXT := upper(regexp_replace(value, '[[:space:]-]', '', 'g')); total INTEGER := 0; i INTEGER;
BEGIN
 IF v ~ '^[0-9]{9}[0-9X]$' THEN
  FOR i IN 1..10 LOOP total := total + (CASE WHEN substr(v,i,1)='X' THEN 10 ELSE substr(v,i,1)::int END)*(11-i); END LOOP;
  IF total % 11 <> 0 THEN RETURN NULL; END IF;
  v := '978' || substr(v,1,9); total := 0;
  FOR i IN 1..12 LOOP total := total + substr(v,i,1)::int*(CASE WHEN i%2=1 THEN 1 ELSE 3 END); END LOOP;
  RETURN v || ((10-total%10)%10)::text;
 ELSIF v ~ '^(978|979)[0-9]{10}$' THEN
  FOR i IN 1..13 LOOP total := total + substr(v,i,1)::int*(CASE WHEN i%2=1 THEN 1 ELSE 3 END); END LOOP;
  IF total%10=0 THEN RETURN v; END IF;
 END IF;
 RETURN NULL;
END $_$;

CREATE FUNCTION public.check_operating_system_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

CREATE FUNCTION public.check_operating_system_vendor_name() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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

CREATE FUNCTION public.os_full_name(vendor_name text, product_name text, version_name text, edition_name text, architecture_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT vendor_name || ' ' || product_name || ' ' || version_name ||
    COALESCE(' ' || NULLIF(edition_name, ''), '') ||
    COALESCE(' (' || NULLIF(architecture_name, '') || ')', '')
$$;

CREATE FUNCTION public.prevent_permission_identifier_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.identifier IS DISTINCT FROM OLD.identifier THEN
        RAISE EXCEPTION 'Permission identifiers cannot be changed.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION public.set_record_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW."updated_at" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TABLE public.account_invitation_settings (
    id SERIAL NOT NULL,
    key character varying(32) DEFAULT 'main'::character varying NOT NULL,
    validity_minutes integer DEFAULT 30 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT account_invitation_settings_key_check CHECK (((key)::text = 'main'::text)),
    CONSTRAINT account_invitation_settings_validity_minutes_check CHECK (((validity_minutes >= 1) AND (validity_minutes <= 60))),
    CONSTRAINT account_invitation_settings_key_key UNIQUE (key),
    CONSTRAINT account_invitation_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE public.account_invitations (
    id SERIAL NOT NULL,
    token_hash text NOT NULL,
    employee_id integer NOT NULL,
    issued_by_id integer NOT NULL,
    email_at_issue text NOT NULL,
    expires_at timestamp(3) with time zone NOT NULL,
    used_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT account_invitations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.audit_logs (
    id SERIAL NOT NULL,
    event_key uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id integer NOT NULL,
    action text NOT NULL,
    resource text NOT NULL,
    resource_id integer NOT NULL,
    detail jsonb,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT audit_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.authentication_throttles (
    id SERIAL NOT NULL,
    bucket_key character varying(64) NOT NULL,
    failure_times timestamp(3) with time zone[] DEFAULT (ARRAY[]::timestamp with time zone[])::timestamp(3) with time zone[] NOT NULL,
    blocked_until timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT authentication_throttles_bucket_key CHECK (((bucket_key)::text ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT authentication_throttles_failure_bound CHECK ((cardinality(failure_times) <= 100)),
    CONSTRAINT authentication_throttles_bucket_key_key UNIQUE (bucket_key),
    CONSTRAINT authentication_throttles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.book_change_history (
    id SERIAL NOT NULL,
    event_key uuid DEFAULT gen_random_uuid() NOT NULL,
    resource character varying(30) NOT NULL,
    resource_id integer NOT NULL,
    actor_id integer NOT NULL,
    action character varying(20) NOT NULL,
    changes jsonb NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT book_change_history_pkey PRIMARY KEY (id)
);

CREATE TABLE public.book_copies (
    id SERIAL NOT NULL,
    copy_code character varying(40) NOT NULL,
    title_id integer NOT NULL,
    storage_id integer NOT NULL,
    batch_id integer,
    purchased_on date,
    status character varying(20) DEFAULT 'available'::character varying NOT NULL,
    notes text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    purchase_order_id integer,
    purchase_amount numeric(16,2),
    purchase_currency character varying(3),
    CONSTRAINT book_copies_purchase_money_check CHECK ((((purchase_amount IS NULL) AND (purchase_currency IS NULL)) OR ((purchase_amount IS NOT NULL) AND (purchase_currency IS NOT NULL) AND (purchase_amount >= (0)::numeric) AND ((purchase_currency)::text ~ '^[A-Z]{3}$'::text)))),
    CONSTRAINT book_copies_status_check CHECK (((status)::text = ANY ((ARRAY['available'::character varying, 'unavailable'::character varying])::text[]))),
    CONSTRAINT book_copies_pkey PRIMARY KEY (id)
);

CREATE TABLE public.book_copy_batches (
    id SERIAL NOT NULL,
    request_key character varying(100) NOT NULL,
    actor_id integer NOT NULL,
    body_hash character varying(64) NOT NULL,
    result jsonb,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT book_copy_batches_pkey PRIMARY KEY (id)
);

CREATE TABLE public.book_loans (
    id SERIAL NOT NULL,
    loan_code character varying(40) NOT NULL,
    copy_id integer NOT NULL,
    employee_id integer NOT NULL,
    manager_id integer NOT NULL,
    loaned_on date NOT NULL,
    due_on date NOT NULL,
    returned_on date,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT book_loans_dates_check CHECK (((due_on >= loaned_on) AND ((returned_on IS NULL) OR (returned_on >= loaned_on)))),
    CONSTRAINT book_loans_pkey PRIMARY KEY (id)
);

CREATE TABLE public.book_purchase_orders (
    id SERIAL NOT NULL,
    order_code character varying(40) DEFAULT (gen_random_uuid())::text NOT NULL,
    title_id integer NOT NULL,
    branch_id integer NOT NULL,
    quantity integer NOT NULL,
    status character varying(20) DEFAULT 'approved'::character varying NOT NULL,
    decision_reason text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT book_purchase_orders_quantity_check CHECK (((quantity >= 1) AND (quantity <= 100))),
    CONSTRAINT book_purchase_orders_status_check CHECK (((status)::text = ANY ((ARRAY['approved'::character varying, 'ordered'::character varying, 'completed'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT book_purchase_orders_order_code_key UNIQUE (order_code),
    CONSTRAINT book_purchase_orders_pkey PRIMARY KEY (id)
);

CREATE TABLE public.book_purchase_requests (
    id SERIAL NOT NULL,
    request_code character varying(40) DEFAULT (gen_random_uuid())::text NOT NULL,
    title_id integer NOT NULL,
    branch_id integer NOT NULL,
    employee_id integer NOT NULL,
    order_id integer,
    kind character varying(20) NOT NULL,
    quantity integer NOT NULL,
    reason text,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    decision_reason text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT book_purchase_requests_additional_reason CHECK ((((kind)::text <> 'additional'::text) OR ((length(TRIM(BOTH FROM reason)) > 0) AND (reason IS NOT NULL)))),
    CONSTRAINT book_purchase_requests_kind_check CHECK (((kind)::text = ANY ((ARRAY['new'::character varying, 'additional'::character varying])::text[]))),
    CONSTRAINT book_purchase_requests_order_check CHECK ((((status)::text <> ALL ((ARRAY['approved'::character varying, 'ordered'::character varying, 'completed'::character varying])::text[])) OR (order_id IS NOT NULL))),
    CONSTRAINT book_purchase_requests_quantity_check CHECK (((quantity >= 1) AND (quantity <= 100))),
    CONSTRAINT book_purchase_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'ordered'::character varying, 'completed'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT book_purchase_requests_pkey PRIMARY KEY (id),
    CONSTRAINT book_purchase_requests_request_code_key UNIQUE (request_code)
);

CREATE TABLE public.book_reservations (
    id SERIAL NOT NULL,
    reservation_code character varying(40) NOT NULL,
    title_id integer NOT NULL,
    employee_id integer NOT NULL,
    branch_id integer NOT NULL,
    status character varying(20) DEFAULT 'waiting'::character varying NOT NULL,
    reserved_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_on date,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT book_reservations_status_check CHECK (((status)::text = ANY ((ARRAY['waiting'::character varying, 'held'::character varying, 'fulfilled'::character varying, 'cancelled'::character varying, 'expired'::character varying])::text[]))),
    CONSTRAINT book_reservations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.book_titles (
    id SERIAL NOT NULL,
    catalog_code character varying(40) NOT NULL,
    name character varying(500) NOT NULL,
    author character varying(500),
    publisher character varying(255),
    edition character varying(100),
    isbn character varying(13),
    notes text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    cover_image bytea,
    source_provider character varying(40),
    source_url character varying(500),
    source_retrieved_at timestamp(3) with time zone,
    cover_source character varying(20),
    cover_source_url character varying(500),
    CONSTRAINT book_titles_cover_metadata_check CHECK ((((cover_image IS NULL) AND (cover_source IS NULL) AND (cover_source_url IS NULL)) OR ((cover_image IS NOT NULL) AND (cover_source IS NOT NULL) AND ((((cover_source)::text = 'manual'::text) AND (cover_source_url IS NULL)) OR (((cover_source)::text = 'openbd'::text) AND (cover_source_url IS NOT NULL)))))),
    CONSTRAINT book_titles_isbn_canonical_check CHECK (((deleted_at IS NOT NULL) OR (isbn IS NULL) OR ((public.canonical_book_isbn((isbn)::text) IS NOT NULL) AND ((isbn)::text = public.canonical_book_isbn((isbn)::text))))),
    CONSTRAINT book_titles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.branches (
    id SERIAL NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    opened_on date,
    closed_on date,
    postal_code character varying(10),
    prefecture character varying(64),
    city character varying(128),
    street_address character varying(255),
    building_name character varying(255),
    phone_number_1 character varying(32),
    phone_number_1_label character varying(128),
    phone_number_2 character varying(32),
    phone_number_2_label character varying(128),
    fax_number_1 character varying(32),
    fax_number_1_label character varying(128),
    fax_number_2 character varying(32),
    fax_number_2_label character varying(128),
    manager_employee_id integer,
    deputy_manager_employee_id integer,
    notes text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    country_code character varying(2) DEFAULT 'JP'::character varying NOT NULL,
    CONSTRAINT branches_country_code_check CHECK (((country_code)::text = ANY ((ARRAY['JP'::character varying, 'US'::character varying])::text[]))),
    CONSTRAINT branches_date_order CHECK (((opened_on IS NULL) OR (closed_on IS NULL) OR (closed_on >= opened_on))),
    CONSTRAINT branches_pkey PRIMARY KEY (id)
);

CREATE TABLE public.calendar_date_attributes (
    id SERIAL NOT NULL,
    calendar_date date NOT NULL,
    kind character varying(32) NOT NULL,
    name character varying(128) NOT NULL,
    source character varying(32) NOT NULL,
    source_url character varying(500),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    country_code character varying(2) DEFAULT 'JP'::character varying NOT NULL,
    CONSTRAINT calendar_date_attributes_country_code_check CHECK (((country_code)::text = ANY ((ARRAY['JP'::character varying, 'US'::character varying])::text[]))),
    CONSTRAINT calendar_date_attributes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.calendar_holiday_imports (
    id SERIAL NOT NULL,
    import_key uuid DEFAULT gen_random_uuid() NOT NULL,
    source_url character varying(500) NOT NULL,
    range_start date,
    range_end date,
    imported_count integer DEFAULT 0 NOT NULL,
    status character varying(20) NOT NULL,
    error_message character varying(500),
    completed_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    country_code character varying(2) DEFAULT 'JP'::character varying NOT NULL,
    CONSTRAINT calendar_holiday_imports_country_code_check CHECK (((country_code)::text = ANY ((ARRAY['JP'::character varying, 'US'::character varying])::text[]))),
    CONSTRAINT calendar_holiday_imports_pkey PRIMARY KEY (id)
);

CREATE TABLE public.clients (
    id SERIAL NOT NULL,
    name character varying(128) NOT NULL,
    country_code character varying(2) DEFAULT 'JP'::character varying NOT NULL,
    postal_code character varying(10),
    prefecture character varying(64),
    city character varying(128),
    street_address character varying(255),
    building_name character varying(255),
    phone_number_1 character varying(32),
    phone_number_2 character varying(32),
    fax_number_1 character varying(32),
    fax_number_2 character varying(32),
    notes text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone DEFAULT NULL::timestamp with time zone,
    company_name character varying(128) NOT NULL,
    contact_name character varying(128),
    contact_department character varying(128),
    contact_email character varying(254),
    contact_mobile character varying(32),
    CONSTRAINT clients_company_name_check CHECK (((length(btrim((company_name)::text)) >= 1) AND (length(btrim((company_name)::text)) <= 128))),
    CONSTRAINT clients_name_key UNIQUE (name),
    CONSTRAINT clients_pkey PRIMARY KEY (id)
);

CREATE TABLE public.cpu_types (
    id SERIAL NOT NULL,
    manufacturer_id integer NOT NULL,
    series text NOT NULL,
    model_number text NOT NULL,
    name text NOT NULL,
    official_url text,
    source_checked_on date,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    notes character varying(5000),
    CONSTRAINT cpu_types_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employee_avatars (
    id integer GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.employee_avatars_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
) NOT NULL,
    employee_id integer NOT NULL,
    image bytea NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT employee_avatars_employee_id_key UNIQUE (employee_id),
    CONSTRAINT employee_avatars_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employee_change_history (
    id SERIAL NOT NULL,
    event_key uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id integer NOT NULL,
    actor_id integer NOT NULL,
    action character varying(20) NOT NULL,
    changes jsonb NOT NULL,
    changed_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT employee_change_history_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employee_departments (
    id SERIAL NOT NULL,
    employee_id integer NOT NULL,
    department_id integer NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT employee_departments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employee_groups (
    id SERIAL NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    department_id integer,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    notes character varying(5000),
    CONSTRAINT employee_groups_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employee_positions (
    id SERIAL NOT NULL,
    employee_id integer NOT NULL,
    position_id integer NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT employee_positions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employee_roles (
    id SERIAL NOT NULL,
    employee_id integer NOT NULL,
    role_id integer NOT NULL,
    scope_type text DEFAULT 'global'::text NOT NULL,
    scope_key text DEFAULT 'global'::text NOT NULL,
    department_id integer,
    scope_employee_id integer,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT employee_roles_scope_check CHECK ((((scope_type = 'global'::text) AND (scope_key = 'global'::text) AND (department_id IS NULL) AND (scope_employee_id IS NULL)) OR ((scope_type = 'own_branch'::text) AND (scope_key = 'own_branch'::text) AND (department_id IS NULL) AND (scope_employee_id IS NULL)) OR ((scope_type = 'department'::text) AND (department_id IS NOT NULL) AND (scope_employee_id IS NULL) AND (scope_key = ('department:'::text || (department_id)::text))) OR ((scope_type = 'employee'::text) AND (department_id IS NULL) AND (scope_employee_id IS NOT NULL) AND (scope_key = ('employee:'::text || (scope_employee_id)::text))))),
    CONSTRAINT employee_roles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employee_settings (
    id SERIAL NOT NULL,
    employee_id integer NOT NULL,
    time_zone character varying(64) DEFAULT 'Asia/Tokyo'::character varying NOT NULL,
    display_language character varying(64) DEFAULT 'en'::character varying NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    analytics_selection jsonb,
    display_currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    project_ticket_columns jsonb,
    project_columns jsonb,
    CONSTRAINT employee_settings_display_currency_check CHECK (((display_currency)::text = ANY ((ARRAY['JPY'::character varying, 'USD'::character varying])::text[]))),
    CONSTRAINT employee_settings_display_language_check CHECK (((char_length((display_language)::text) >= 2) AND (char_length((display_language)::text) <= 64) AND ((display_language)::text ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'::text))),
    CONSTRAINT employee_settings_employee_id_key UNIQUE (employee_id),
    CONSTRAINT employee_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employee_skills (
    id SERIAL NOT NULL,
    employee_id integer NOT NULL,
    skill_id integer NOT NULL,
    proficiency smallint NOT NULL,
    experience_years numeric(3,1),
    notes character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone DEFAULT NULL::timestamp with time zone,
    CONSTRAINT employee_skills_experience_years_check CHECK (((experience_years >= (0)::numeric) AND (experience_years <= (80)::numeric))),
    CONSTRAINT employee_skills_proficiency_check CHECK (((proficiency >= 1) AND (proficiency <= 3))),
    CONSTRAINT employee_skills_employee_id_skill_id_key UNIQUE (employee_id, skill_id),
    CONSTRAINT employee_skills_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employee_social_links (
    id SERIAL NOT NULL,
    link_key uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id integer NOT NULL,
    platform character varying(32) NOT NULL,
    url character varying(2048) NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT employee_social_links_platform_check CHECK (((platform)::text = ANY ((ARRAY['website'::character varying, 'blog'::character varying, 'github'::character varying, 'linkedin'::character varying, 'x'::character varying, 'threads'::character varying, 'bluesky'::character varying, 'mastodon'::character varying, 'facebook'::character varying, 'instagram'::character varying, 'youtube'::character varying, 'qiita'::character varying, 'note'::character varying])::text[]))),
    CONSTRAINT employee_social_links_url_check CHECK (((url)::text ~* '^https?://'::text)),
    CONSTRAINT employee_social_links_employee_id_platform_key UNIQUE (employee_id, platform),
    CONSTRAINT employee_social_links_link_key_key UNIQUE (link_key),
    CONSTRAINT employee_social_links_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employee_teams (
    id SERIAL NOT NULL,
    employee_id integer NOT NULL,
    team_id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone DEFAULT NULL::timestamp with time zone,
    CONSTRAINT employee_teams_employee_id_team_id_key UNIQUE (employee_id, team_id),
    CONSTRAINT employee_teams_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employees (
    id SERIAL NOT NULL,
    employee_code text NOT NULL,
    first_name text NOT NULL,
    middle_name text,
    last_name text NOT NULL,
    name_kana text,
    birth_date date NOT NULL,
    gender text NOT NULL,
    blood_type text,
    postal_code character varying(10),
    prefecture character varying(64),
    city character varying(128),
    street_address character varying(255),
    building_name character varying(255),
    mobile_phone text,
    email text NOT NULL,
    hired_at date NOT NULL,
    group_id integer,
    employment_type_id integer NOT NULL,
    branch_id integer NOT NULL,
    work_calendar_id integer,
    retired_at date,
    notes text,
    username text,
    password_hash text,
    account_status public."AccountStatus" DEFAULT 'unprovisioned'::public."AccountStatus" NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    country_code character varying(2) DEFAULT 'JP'::character varying NOT NULL,
    deletion_scheduled_on date,
    deletion_requested_by_id integer,
    asset_return_completed_at timestamp(3) with time zone,
    CONSTRAINT employee_gender_allowed CHECK ((gender = ANY (ARRAY['female'::text, 'male'::text, 'unspecified'::text]))),
    CONSTRAINT employee_gender_nonblank CHECK ((gender ~ '[^[:space:]]'::text)),
    CONSTRAINT employees_active_account_credentials_check CHECK (((account_status <> 'active'::public."AccountStatus") OR ((email IS NOT NULL) AND (password_hash IS NOT NULL)))),
    CONSTRAINT employees_country_code_check CHECK (((country_code)::text = ANY ((ARRAY['JP'::character varying, 'US'::character varying])::text[]))),
    CONSTRAINT employees_deletion_request_check CHECK (((deletion_scheduled_on IS NULL) = (deletion_requested_by_id IS NULL))),
    CONSTRAINT employees_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employment_departments (
    id SERIAL NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    notes character varying(5000),
    CONSTRAINT employment_departments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employment_positions (
    id SERIAL NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    notes character varying(5000),
    CONSTRAINT employment_positions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employment_types (
    id SERIAL NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    notes character varying(5000),
    CONSTRAINT employment_types_pkey PRIMARY KEY (id)
);

CREATE TABLE public.engagements (
    id SERIAL NOT NULL,
    code character varying(64) NOT NULL DEFAULT ('ENG-'::text || (nextval('public.engagement_code_seq'::regclass))::text),
    name character varying(128) NOT NULL,
    description character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone DEFAULT NULL::timestamp with time zone,
    client_id integer,
    contract_starts_on date,
    contract_ends_on date,
    CONSTRAINT engagements_client_contract_pair_check CHECK (((client_id IS NULL) = (contract_starts_on IS NULL))),
    CONSTRAINT engagements_code_check CHECK (((code)::text ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'::text)),
    CONSTRAINT engagements_contract_period_check CHECK (((contract_ends_on IS NULL) OR ((contract_starts_on IS NOT NULL) AND (contract_ends_on >= contract_starts_on)))),
    CONSTRAINT engagements_code_key UNIQUE (code),
    CONSTRAINT engagements_pkey PRIMARY KEY (id)
);

CREATE TABLE public.engagement_participations (
    id SERIAL NOT NULL,
    employee_id integer NOT NULL,
    engagement_id integer NOT NULL,
    starts_on date NOT NULL,
    ends_on date,
    responsibility character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone DEFAULT NULL::timestamp with time zone,
    CONSTRAINT engagement_participations_check CHECK ((ends_on >= starts_on)),
    CONSTRAINT engagement_participations_employee_id_engagement_id_starts__key UNIQUE (employee_id, engagement_id, starts_on),
    CONSTRAINT engagement_participations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.external_links (
    id SERIAL NOT NULL,
    name character varying(128) NOT NULL,
    url character varying(2048) NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    notes character varying(5000),
    CONSTRAINT external_links_pkey PRIMARY KEY (id)
);

CREATE TABLE public.financial_exchange_rates (
    id SERIAL NOT NULL,
    month date NOT NULL,
    base_currency character varying(3) NOT NULL,
    quote_currency character varying(3) NOT NULL,
    rate numeric(20,8) NOT NULL,
    source character varying(64) NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT financial_exchange_rates_month_start_check CHECK ((EXTRACT(day FROM month) = (1)::numeric)),
    CONSTRAINT financial_exchange_rates_rate_check CHECK ((rate > (0)::numeric)),
    CONSTRAINT financial_exchange_rates_month_base_currency_quote_currency_key UNIQUE (month, base_currency, quote_currency),
    CONSTRAINT financial_exchange_rates_pkey PRIMARY KEY (id)
);

CREATE TABLE public.financial_months (
    id SERIAL NOT NULL,
    branch_id integer NOT NULL,
    month date NOT NULL,
    currency character varying(3) NOT NULL,
    revenue numeric(20,2) NOT NULL,
    variable_cost numeric(20,2) NOT NULL,
    fixed_cost numeric(20,2) NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT financial_months_amount_check CHECK (((revenue >= (0)::numeric) AND (variable_cost >= (0)::numeric) AND (fixed_cost >= (0)::numeric))),
    CONSTRAINT financial_months_currency_check CHECK (((currency)::text = ANY ((ARRAY['JPY'::character varying, 'USD'::character varying])::text[]))),
    CONSTRAINT financial_months_jpy_whole_check CHECK ((((currency)::text <> 'JPY'::text) OR ((revenue = trunc(revenue)) AND (variable_cost = trunc(variable_cost)) AND (fixed_cost = trunc(fixed_cost))))),
    CONSTRAINT financial_months_month_start_check CHECK ((EXTRACT(day FROM month) = (1)::numeric)),
    CONSTRAINT financial_months_branch_id_month_key UNIQUE (branch_id, month),
    CONSTRAINT financial_months_pkey PRIMARY KEY (id)
);

CREATE TABLE public.financial_period_settings (
    id SERIAL NOT NULL,
    key character varying(32) DEFAULT 'main'::character varying NOT NULL,
    basis character varying(16) DEFAULT 'calendar'::character varying NOT NULL,
    fiscal_start_month integer DEFAULT 4 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT financial_period_settings_basis_check CHECK (((basis)::text = ANY ((ARRAY['calendar'::character varying, 'fiscal'::character varying])::text[]))),
    CONSTRAINT financial_period_settings_start_check CHECK (((fiscal_start_month >= 1) AND (fiscal_start_month <= 12))),
    CONSTRAINT financial_period_settings_key_key UNIQUE (key),
    CONSTRAINT financial_period_settings_pkey PRIMARY KEY (id)
);

CREATE TABLE public.financial_publications (
    id SERIAL NOT NULL,
    branch_id integer NOT NULL,
    basis character varying(16) NOT NULL,
    fiscal_start_month integer NOT NULL,
    year integer NOT NULL,
    published boolean DEFAULT false NOT NULL,
    published_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT financial_publications_basis_check CHECK (((basis)::text = ANY ((ARRAY['calendar'::character varying, 'fiscal'::character varying])::text[]))),
    CONSTRAINT financial_publications_start_check CHECK (((fiscal_start_month >= 1) AND (fiscal_start_month <= 12))),
    CONSTRAINT financial_publications_branch_id_basis_fiscal_start_month_y_key UNIQUE (branch_id, basis, fiscal_start_month, year),
    CONSTRAINT financial_publications_pkey PRIMARY KEY (id)
);

CREATE TABLE public.it_asset_assignments (
    id SERIAL NOT NULL,
    asset_id integer NOT NULL,
    employee_id integer NOT NULL,
    assigned_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    returned_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT it_asset_assignments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.it_asset_change_history (
    id SERIAL NOT NULL,
    event_key uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id integer NOT NULL,
    actor_id integer NOT NULL,
    action character varying(20) NOT NULL,
    changes jsonb NOT NULL,
    changed_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT it_asset_change_history_pkey PRIMARY KEY (id)
);

CREATE TABLE public.it_asset_credentials (
    id SERIAL NOT NULL,
    asset_id integer NOT NULL,
    credential_type character varying(32) NOT NULL,
    ciphertext text NOT NULL,
    initialization_vector character varying(32) NOT NULL,
    authentication_tag character varying(32) NOT NULL,
    key_version integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT it_asset_credentials_key_version_check CHECK ((key_version > 0)),
    CONSTRAINT it_asset_credentials_type_check CHECK (((credential_type)::text = ANY (ARRAY[('admin'::character varying)::text, ('login'::character varying)::text, ('management_console'::character varying)::text]))),
    CONSTRAINT it_asset_credentials_pkey PRIMARY KEY (id)
);

CREATE TABLE public.it_asset_ip_addresses (
    id SERIAL NOT NULL,
    asset_id integer NOT NULL,
    slot smallint NOT NULL,
    room_id integer NOT NULL,
    ip_address character varying(45) NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT it_asset_ip_addresses_slot_check CHECK ((slot = ANY (ARRAY[1, 2]))),
    CONSTRAINT it_asset_ip_addresses_pkey PRIMARY KEY (id)
);

CREATE TABLE public.it_asset_management_codes (
    id SERIAL NOT NULL,
    code character varying(64) NOT NULL,
    asset_id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT it_asset_management_codes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.it_asset_statuses (
    id SERIAL NOT NULL,
    name text NOT NULL,
    disposal_date_policy public."DisposalDatePolicy" DEFAULT 'prohibited'::public."DisposalDatePolicy" NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    notes character varying(5000),
    CONSTRAINT it_asset_statuses_pkey PRIMARY KEY (id)
);

CREATE TABLE public.it_asset_types (
    id SERIAL NOT NULL,
    name text NOT NULL,
    management_code_prefix character varying(5) NOT NULL,
    next_management_number integer DEFAULT 1 NOT NULL,
    supports_cpu boolean DEFAULT false NOT NULL,
    supports_ram boolean DEFAULT false NOT NULL,
    supports_os boolean DEFAULT false NOT NULL,
    supports_login_username boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    notes character varying(5000),
    CONSTRAINT it_asset_types_management_code_prefix_format CHECK (((management_code_prefix)::text ~ '^[A-Z]{3,5}$'::text)),
    CONSTRAINT it_asset_types_next_management_number_range CHECK (((next_management_number >= 1) AND (next_management_number <= 10000))),
    CONSTRAINT it_asset_types_pkey PRIMARY KEY (id)
);

CREATE TABLE public.it_assets (
    id SERIAL NOT NULL,
    asset_tag text NOT NULL,
    type_id integer NOT NULL,
    manufacturer_id integer,
    model_number text,
    serial_number text,
    cpu_type_id integer,
    ram_gb integer,
    operating_system_id integer,
    login_username text,
    storage_id integer NOT NULL,
    status_id integer NOT NULL,
    purchased_on date NOT NULL,
    disposal_on date,
    notes text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    hostname character varying(253),
    admin_username character varying(255),
    management_console_url character varying(2048),
    management_console_username character varying(255),
    purchase_amount numeric(16,2),
    purchase_currency character varying(3),
    CONSTRAINT it_assets_asset_tag_format CHECK ((asset_tag ~ '^[A-Z]{3,5}-[0-9]{3,4}$'::text)),
    CONSTRAINT it_assets_date_order CHECK (((purchased_on IS NULL) OR (disposal_on IS NULL) OR (disposal_on >= purchased_on))),
    CONSTRAINT it_assets_purchase_money_check CHECK ((((purchase_amount IS NULL) AND (purchase_currency IS NULL)) OR ((purchase_amount IS NOT NULL) AND (purchase_currency IS NOT NULL) AND (purchase_amount >= (0)::numeric) AND ((purchase_currency)::text ~ '^[A-Z]{3}$'::text)))),
    CONSTRAINT it_assets_ram_gb_positive CHECK (((ram_gb IS NULL) OR (ram_gb > 0))),
    CONSTRAINT it_assets_pkey PRIMARY KEY (id)
);

CREATE TABLE public.manufacturers (
    id SERIAL NOT NULL,
    name text NOT NULL,
    official_url text,
    source_checked_on date,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    notes character varying(5000),
    CONSTRAINT manufacturers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.master_change_history (
    id integer GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.master_change_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
) NOT NULL,
    event_key uuid DEFAULT gen_random_uuid() NOT NULL,
    resource text NOT NULL,
    resource_id integer NOT NULL,
    actor_id integer NOT NULL,
    action character varying(20) NOT NULL,
    changes jsonb NOT NULL,
    changed_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT master_change_history_event_key_key UNIQUE (event_key),
    CONSTRAINT master_change_history_pkey PRIMARY KEY (id)
);

CREATE TABLE public.notification_events (
    id SERIAL NOT NULL,
    notification_key uuid DEFAULT gen_random_uuid() NOT NULL,
    type character varying(80) NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    source character varying(40) NOT NULL,
    target_type character varying(80) NOT NULL,
    target_key character varying(128) NOT NULL,
    deduplication_key character varying(180) NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT notification_events_pkey PRIMARY KEY (id)
);

CREATE TABLE public.notification_recipients (
    id SERIAL NOT NULL,
    notification_id integer NOT NULL,
    employee_id integer NOT NULL,
    read_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT notification_recipients_pkey PRIMARY KEY (id)
);

CREATE TABLE public.operating_system_vendors (
    id SERIAL NOT NULL,
    name character varying(128) NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    notes character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT operating_system_vendors_pkey PRIMARY KEY (id)
);

CREATE TABLE public.operating_systems (
    id SERIAL NOT NULL,
    product text NOT NULL,
    version text NOT NULL,
    edition text,
    architecture text,
    official_url text,
    source_checked_on date,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    notes character varying(5000),
    vendor_id integer NOT NULL,
    CONSTRAINT operating_systems_pkey PRIMARY KEY (id)
);

CREATE TABLE public.password_reset_tokens (
    id SERIAL NOT NULL,
    token_hash text NOT NULL,
    employee_id integer NOT NULL,
    expires_at timestamp(3) with time zone NOT NULL,
    used_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id)
);

CREATE TABLE public.permission_operations (
    id SERIAL NOT NULL,
    operation text NOT NULL,
    permission_id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT permission_operations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.permissions (
    id SERIAL NOT NULL,
    identifier uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT permissions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.project_attachments (
    id SERIAL NOT NULL,
    ticket_id integer NOT NULL,
    uploader_id integer NOT NULL,
    name character varying(255) NOT NULL,
    mime text NOT NULL,
    size integer NOT NULL,
    content bytea NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_attachments_size_check CHECK (((size > 0) AND (size <= 10485760))),
    CONSTRAINT project_attachments_pkey PRIMARY KEY (id),
    CONSTRAINT project_attachments_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_baseline_items (
    id SERIAL NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    baseline_id integer NOT NULL,
    ticket_id integer NOT NULL,
    budget numeric(20,2) NOT NULL,
    title character varying(500) NOT NULL,
    CONSTRAINT project_baseline_items_budget_check CHECK ((budget >= (0)::numeric)),
    CONSTRAINT project_baseline_items_baseline_id_ticket_id_key UNIQUE (baseline_id, ticket_id),
    CONSTRAINT project_baseline_items_pkey PRIMARY KEY (id),
    CONSTRAINT project_baseline_items_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_baseline_months (
    id SERIAL NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    item_id integer NOT NULL,
    month date NOT NULL,
    amount numeric(20,2) NOT NULL,
    CONSTRAINT project_baseline_months_check CHECK (((amount >= (0)::numeric) AND (EXTRACT(day FROM month) = (1)::numeric))),
    CONSTRAINT project_baseline_months_item_id_month_key UNIQUE (item_id, month),
    CONSTRAINT project_baseline_months_pkey PRIMARY KEY (id),
    CONSTRAINT project_baseline_months_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_baselines (
    scope_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    id SERIAL NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    project_id integer NOT NULL,
    version integer NOT NULL,
    title character varying(200) NOT NULL,
    reason text NOT NULL,
    state character varying(16) DEFAULT 'draft'::character varying NOT NULL,
    author_id integer NOT NULL,
    confirmed_at timestamp(3) with time zone,
    CONSTRAINT project_baselines_check CHECK (((version > 0) AND ((state)::text = ANY ((ARRAY['draft'::character varying, 'confirmed'::character varying])::text[])) AND (((state)::text = 'confirmed'::text) = (confirmed_at IS NOT NULL)))),
    CONSTRAINT project_baselines_pkey PRIMARY KEY (id),
    CONSTRAINT project_baselines_project_id_version_key UNIQUE (project_id, version),
    CONSTRAINT project_baselines_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_checklists (
    id SERIAL NOT NULL,
    ticket_id integer NOT NULL,
    text character varying(500) NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_checklists_pkey PRIMARY KEY (id),
    CONSTRAINT project_checklists_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_comments (
    id SERIAL NOT NULL,
    ticket_id integer NOT NULL,
    author_id integer NOT NULL,
    body text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_comments_pkey PRIMARY KEY (id),
    CONSTRAINT project_comments_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_cost_rates (
    id SERIAL NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    project_id integer NOT NULL,
    starts_on date NOT NULL,
    hourly_rate numeric(20,2) NOT NULL,
    CONSTRAINT project_cost_rates_hourly_rate_check CHECK ((hourly_rate >= (0)::numeric)),
    CONSTRAINT project_cost_rates_pkey PRIMARY KEY (id),
    CONSTRAINT project_cost_rates_project_id_starts_on_key UNIQUE (project_id, starts_on),
    CONSTRAINT project_cost_rates_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_custom_field_options (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    field_id integer NOT NULL,
    name character varying(128) NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    CONSTRAINT project_custom_field_options_pkey PRIMARY KEY (id)
);

CREATE TABLE public.project_custom_field_selections (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    value_id integer NOT NULL,
    option_id integer NOT NULL,
    CONSTRAINT project_custom_field_selections_pkey PRIMARY KEY (id)
);

CREATE TABLE public.project_custom_field_types (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    field_id integer NOT NULL,
    type_id integer NOT NULL,
    CONSTRAINT project_custom_field_types_pkey PRIMARY KEY (id)
);

CREATE TABLE public.project_custom_field_values (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    field_id integer NOT NULL,
    ticket_id integer NOT NULL,
    value jsonb NOT NULL,
    CONSTRAINT project_custom_field_values_pkey PRIMARY KEY (id)
);

CREATE TABLE public.project_custom_fields (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    project_id integer NOT NULL,
    name character varying(128) NOT NULL,
    kind character varying(20) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    required boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    default_value jsonb,
    min numeric(20,6),
    max numeric(20,6),
    max_length integer,
    CONSTRAINT custom_field_bounds_check CHECK (((min IS NULL) OR (max IS NULL) OR (min <= max))),
    CONSTRAINT custom_field_kind_check CHECK (((kind)::text = ANY ((ARRAY['select'::character varying, 'multiselect'::character varying, 'integer'::character varying, 'decimal'::character varying, 'duration'::character varying, 'text'::character varying, 'textarea'::character varying, 'date'::character varying, 'boolean'::character varying])::text[]))),
    CONSTRAINT custom_field_length_check CHECK (((max_length IS NULL) OR ((max_length >= 1) AND (max_length <= 20000)))),
    CONSTRAINT project_custom_fields_pkey PRIMARY KEY (id)
);

CREATE TABLE public.project_evm_reports (
    id SERIAL NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    project_id integer NOT NULL,
    baseline_id integer NOT NULL,
    month date NOT NULL,
    version integer NOT NULL,
    stale boolean DEFAULT false NOT NULL,
    snapshot jsonb NOT NULL,
    author_id integer NOT NULL,
    CONSTRAINT project_evm_reports_check CHECK (((version > 0) AND (EXTRACT(day FROM month) = (1)::numeric))),
    CONSTRAINT project_evm_reports_pkey PRIMARY KEY (id),
    CONSTRAINT project_evm_reports_project_id_month_version_key UNIQUE (project_id, month, version),
    CONSTRAINT project_evm_reports_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_evm_settings (
    id SERIAL NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    project_id integer NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    start_month date NOT NULL,
    currency character varying(3) DEFAULT 'JPY'::character varying NOT NULL,
    CONSTRAINT project_evm_settings_check CHECK ((((currency)::text = ANY ((ARRAY['JPY'::character varying, 'USD'::character varying])::text[])) AND (EXTRACT(day FROM start_month) = (1)::numeric))),
    CONSTRAINT project_evm_settings_pkey PRIMARY KEY (id),
    CONSTRAINT project_evm_settings_project_id_key UNIQUE (project_id),
    CONSTRAINT project_evm_settings_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_expenses (
    id SERIAL NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    project_id integer NOT NULL,
    code character varying(64) NOT NULL,
    ticket_id integer NOT NULL,
    incurred_on date NOT NULL,
    amount numeric(20,2) NOT NULL,
    category character varying(100) NOT NULL,
    evidence text NOT NULL,
    author_id integer NOT NULL,
    CONSTRAINT project_expenses_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT project_expenses_pkey PRIMARY KEY (id),
    CONSTRAINT project_expenses_project_id_code_key UNIQUE (project_id, code),
    CONSTRAINT project_expenses_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_history (
    id SERIAL NOT NULL,
    project_id integer NOT NULL,
    ticket_id integer,
    actor_id integer NOT NULL,
    kind text NOT NULL,
    detail jsonb NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_history_pkey PRIMARY KEY (id),
    CONSTRAINT project_history_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_markdown_images (
    id SERIAL NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    uploader_id integer NOT NULL,
    target_type text NOT NULL,
    project_id integer,
    ticket_id integer,
    comment_id integer,
    bound boolean DEFAULT false NOT NULL,
    name character varying(255) NOT NULL,
    mime text NOT NULL,
    size integer NOT NULL,
    content bytea NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_markdown_images_check CHECK ((octet_length(content) = size)),
    CONSTRAINT project_markdown_images_check1 CHECK ((((target_type = 'project'::text) AND (ticket_id IS NULL) AND (comment_id IS NULL)) OR ((target_type = 'ticket'::text) AND (project_id IS NOT NULL) AND (comment_id IS NULL)) OR ((target_type = 'comment'::text) AND (project_id IS NOT NULL) AND (ticket_id IS NOT NULL)))),
    CONSTRAINT project_markdown_images_check2 CHECK (((NOT bound) OR ((project_id IS NOT NULL) AND ((target_type = 'project'::text) OR ((ticket_id IS NOT NULL) AND ((target_type = 'ticket'::text) OR (comment_id IS NOT NULL))))))),
    CONSTRAINT project_markdown_images_mime_check CHECK ((mime = ANY (ARRAY['image/png'::text, 'image/jpeg'::text, 'image/webp'::text]))),
    CONSTRAINT project_markdown_images_size_check CHECK (((size >= 1) AND (size <= 10485760))),
    CONSTRAINT project_markdown_images_target_type_check CHECK ((target_type = ANY (ARRAY['project'::text, 'ticket'::text, 'comment'::text]))),
    CONSTRAINT project_markdown_images_pkey PRIMARY KEY (id),
    CONSTRAINT project_markdown_images_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_members (
    id SERIAL NOT NULL,
    project_id integer NOT NULL,
    employee_id integer NOT NULL,
    role text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_members_role_check CHECK ((role = ANY (ARRAY['manager'::text, 'editor'::text, 'viewer'::text]))),
    CONSTRAINT project_members_pkey PRIMARY KEY (id),
    CONSTRAINT project_members_project_id_employee_id_key UNIQUE (project_id, employee_id)
);

CREATE TABLE public.project_progress_records (
    id SERIAL NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    project_id integer NOT NULL,
    ticket_id integer NOT NULL,
    month date NOT NULL,
    version integer NOT NULL,
    percent numeric(5,2) NOT NULL,
    evidence text NOT NULL,
    author_id integer NOT NULL,
    CONSTRAINT project_progress_records_check CHECK ((((percent >= (0)::numeric) AND (percent <= (100)::numeric)) AND (version > 0) AND (EXTRACT(day FROM month) = (1)::numeric))),
    CONSTRAINT project_progress_records_pkey PRIMARY KEY (id),
    CONSTRAINT project_progress_records_project_id_ticket_id_month_version_key UNIQUE (project_id, ticket_id, month, version),
    CONSTRAINT project_progress_records_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_ticket_relations (
    id SERIAL NOT NULL,
    project_id integer NOT NULL,
    from_id integer NOT NULL,
    to_id integer NOT NULL,
    kind text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_ticket_relations_check CHECK ((from_id <> to_id)),
    CONSTRAINT project_ticket_relations_kind_check CHECK ((kind = ANY (ARRAY['relates'::text, 'blocks'::text, 'duplicates'::text, 'finish_start'::text]))),
    CONSTRAINT project_ticket_relations_from_id_to_id_kind_key UNIQUE (from_id, to_id, kind),
    CONSTRAINT project_ticket_relations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.project_ticket_statuses (
    id SERIAL NOT NULL,
    project_id integer NOT NULL,
    name character varying(64) NOT NULL,
    category text DEFAULT 'open'::text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_ticket_statuses_category_check CHECK ((category = ANY (ARRAY['open'::text, 'active'::text, 'done'::text, 'cancelled'::text]))),
    CONSTRAINT project_ticket_statuses_pkey PRIMARY KEY (id),
    CONSTRAINT project_ticket_statuses_project_id_name_key UNIQUE (project_id, name)
);

CREATE TABLE public.project_ticket_types (
    milestone boolean DEFAULT false NOT NULL,
    id SERIAL NOT NULL,
    project_id integer NOT NULL,
    name character varying(64) NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_ticket_types_pkey PRIMARY KEY (id),
    CONSTRAINT project_ticket_types_project_id_name_key UNIQUE (project_id, name)
);

CREATE TABLE public.project_tickets (
    id SERIAL NOT NULL,
    project_id integer NOT NULL,
    number integer NOT NULL,
    parent_id integer,
    type_id integer NOT NULL,
    status_id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    assignee_id integer,
    author_id integer NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    starts_on date,
    due_on date,
    estimated_minutes numeric(12,2) DEFAULT 0 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    labels jsonb DEFAULT '[]'::jsonb NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_tickets_check CHECK (((estimated_minutes >= (0)::numeric) AND (revision > 0) AND (number > 0))),
    CONSTRAINT project_tickets_check1 CHECK (((starts_on IS NULL) OR (due_on IS NULL) OR (starts_on <= due_on))),
    CONSTRAINT project_tickets_check2 CHECK (((parent_id IS NULL) OR (parent_id <> id))),
    CONSTRAINT project_tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT project_tickets_pkey PRIMARY KEY (id),
    CONSTRAINT project_tickets_project_id_number_key UNIQUE (project_id, number)
);

CREATE TABLE public.project_time_entries (
    id SERIAL NOT NULL,
    ticket_id integer NOT NULL,
    employee_id integer NOT NULL,
    work_date date NOT NULL,
    minutes numeric(12,2) NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    record_key uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_time_entries_minutes_check CHECK (((minutes > (0)::numeric) AND (minutes <= (1440)::numeric))),
    CONSTRAINT project_time_entries_pkey PRIMARY KEY (id),
    CONSTRAINT project_time_entries_record_key_key UNIQUE (record_key)
);

CREATE TABLE public.project_type_statuses (
    id SERIAL NOT NULL,
    project_id integer NOT NULL,
    type_id integer NOT NULL,
    status_id integer NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    initial boolean DEFAULT false NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_type_statuses_pkey PRIMARY KEY (id),
    CONSTRAINT project_type_statuses_type_id_status_id_key UNIQUE (type_id, status_id)
);

CREATE TABLE public.project_watchers (
    id SERIAL NOT NULL,
    ticket_id integer NOT NULL,
    employee_id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT project_watchers_pkey PRIMARY KEY (id),
    CONSTRAINT project_watchers_ticket_id_employee_id_key UNIQUE (ticket_id, employee_id)
);

CREATE TABLE public.projects (
    id SERIAL NOT NULL,
    code text DEFAULT ('PJT-'::text || nextval('public.project_code_seq'::regclass)) NOT NULL,
    name character varying(128) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    visibility text DEFAULT 'private'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    engagement_id integer,
    revision integer DEFAULT 1 NOT NULL,
    next_ticket_number integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT projects_check CHECK (((revision > 0) AND (next_ticket_number > 0))),
    CONSTRAINT projects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'on_hold'::text, 'completed'::text, 'archived'::text]))),
    CONSTRAINT projects_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'internal'::text]))),
    CONSTRAINT projects_code_key UNIQUE (code),
    CONSTRAINT projects_pkey PRIMARY KEY (id)
);

CREATE TABLE public.reservable_resources (
    id SERIAL NOT NULL,
    resource_key uuid DEFAULT gen_random_uuid() NOT NULL,
    kind character varying(16) NOT NULL,
    room_id integer,
    asset_id integer,
    is_bookable boolean DEFAULT false NOT NULL,
    time_zone character varying(64) NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT resource_kind_check CHECK (((((kind)::text = 'room'::text) AND (room_id IS NOT NULL) AND (asset_id IS NULL)) OR (((kind)::text = 'asset'::text) AND (asset_id IS NOT NULL) AND (room_id IS NULL)))),
    CONSTRAINT reservable_resources_pkey PRIMARY KEY (id)
);

CREATE TABLE public.resource_reservations (
    id SERIAL NOT NULL,
    occurrence_id integer NOT NULL,
    resource_id integer NOT NULL,
    starts_at timestamp(3) with time zone NOT NULL,
    ends_at timestamp(3) with time zone NOT NULL,
    released_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT reservation_interval_check CHECK ((starts_at < ends_at)),
    CONSTRAINT resource_reservations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.role_permissions (
    id SERIAL NOT NULL,
    role_id integer NOT NULL,
    permission_id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    scope_type text DEFAULT 'global'::text NOT NULL,
    CONSTRAINT role_permissions_scope_type_check CHECK ((scope_type = ANY (ARRAY['global'::text, 'own_branch'::text]))),
    CONSTRAINT role_permissions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.roles (
    id SERIAL NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    notes character varying(5000),
    default_key text,
    sort_order integer DEFAULT 2147483647 NOT NULL,
    CONSTRAINT roles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.rooms (
    id SERIAL NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    notes text,
    branch_id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT rooms_pkey PRIMARY KEY (id)
);

CREATE TABLE public.saved_search_filters (
    id SERIAL NOT NULL,
    owner_employee_id integer NOT NULL,
    target character varying(16) NOT NULL,
    name character varying(100) NOT NULL,
    filter_code uuid DEFAULT gen_random_uuid() NOT NULL,
    definition jsonb NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone DEFAULT NULL::timestamp with time zone,
    CONSTRAINT saved_search_filters_definition_check CHECK ((jsonb_typeof(definition) = 'object'::text)),
    CONSTRAINT saved_search_filters_name_check CHECK (((length(btrim((name)::text)) >= 1) AND (length(btrim((name)::text)) <= 100))),
    CONSTRAINT saved_search_filters_revision_check CHECK ((revision > 0)),
    CONSTRAINT saved_search_filters_schema_version_check CHECK ((schema_version = 1)),
    CONSTRAINT saved_search_filters_target_check CHECK (((target)::text = ANY ((ARRAY['employees'::character varying, 'books'::character varying, 'assets'::character varying, 'workflows'::character varying, 'teams'::character varying, 'skills'::character varying, 'clients'::character varying, 'engagements'::character varying, 'projects'::character varying, 'projectTickets'::character varying, 'projectMembers'::character varying])::text[]))),
    CONSTRAINT saved_search_filters_filter_code_key UNIQUE (filter_code),
    CONSTRAINT saved_search_filters_pkey PRIMARY KEY (id)
);

CREATE TABLE public.schedule_events (
    id SERIAL NOT NULL,
    event_key uuid DEFAULT gen_random_uuid() NOT NULL,
    organizer_id integer NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    definition jsonb NOT NULL,
    idempotency_key character varying(128) NOT NULL,
    request_hash character varying(64) NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT schedule_events_pkey PRIMARY KEY (id)
);

CREATE TABLE public.schedule_occurrences (
    id SERIAL NOT NULL,
    occurrence_key uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id integer NOT NULL,
    sequence integer NOT NULL,
    original_start timestamp(3) with time zone NOT NULL,
    starts_at timestamp(3) with time zone NOT NULL,
    ends_at timestamp(3) with time zone NOT NULL,
    time_zone character varying(64) NOT NULL,
    all_day boolean DEFAULT false NOT NULL,
    start_date date,
    end_date date,
    title character varying(255) NOT NULL,
    description character varying(10000) DEFAULT ''::character varying NOT NULL,
    location character varying(500) DEFAULT ''::character varying NOT NULL,
    visibility character varying(16) DEFAULT 'public'::character varying NOT NULL,
    is_exception boolean DEFAULT false NOT NULL,
    canceled_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT occurrence_interval_check CHECK (((starts_at < ends_at) AND ((visibility)::text = ANY ((ARRAY['public'::character varying, 'private'::character varying])::text[])) AND (((NOT all_day) AND (start_date IS NULL) AND (end_date IS NULL)) OR (all_day AND (start_date IS NOT NULL) AND (end_date IS NOT NULL) AND (start_date < end_date))))),
    CONSTRAINT schedule_occurrences_pkey PRIMARY KEY (id)
);

CREATE TABLE public.schedule_participants (
    id SERIAL NOT NULL,
    occurrence_id integer NOT NULL,
    employee_id integer NOT NULL,
    response character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT schedule_response_check CHECK (((response)::text = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'tentative'::character varying, 'declined'::character varying])::text[]))),
    CONSTRAINT schedule_participants_pkey PRIMARY KEY (id)
);

CREATE TABLE public.schedule_preferences (
    id SERIAL NOT NULL,
    employee_id integer NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    settings jsonb NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT schedule_preferences_pkey PRIMARY KEY (id)
);

CREATE TABLE public.sessions (
    id SERIAL NOT NULL,
    token_hash text NOT NULL,
    employee_id integer NOT NULL,
    expires_at timestamp(3) with time zone NOT NULL,
    last_seen_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT sessions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.skills (
    id SERIAL NOT NULL,
    name character varying(128) NOT NULL,
    name_key character varying(128) NOT NULL,
    category character varying(128),
    description character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone DEFAULT NULL::timestamp with time zone,
    CONSTRAINT skills_name_key_key UNIQUE (name_key),
    CONSTRAINT skills_pkey PRIMARY KEY (id)
);

CREATE TABLE public.software_assignments (
    id integer GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.software_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
) NOT NULL,
    contract_id integer NOT NULL,
    employee_id integer,
    asset_id integer,
    key_id integer,
    assignment_no integer NOT NULL,
    assigned_on date NOT NULL,
    planned_release_on date,
    released_on date,
    release_reason character varying(1000),
    deactivated_on date,
    notes character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT software_assignments_dates_check CHECK ((((planned_release_on IS NULL) OR (planned_release_on >= assigned_on)) AND ((released_on IS NULL) OR (released_on >= assigned_on)) AND ((deactivated_on IS NULL) OR (released_on IS NOT NULL)))),
    CONSTRAINT software_assignments_target_check CHECK (((employee_id IS NULL) <> (asset_id IS NULL))),
    CONSTRAINT software_assignments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.software_change_history (
    id integer GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.software_change_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
) NOT NULL,
    event_key uuid DEFAULT gen_random_uuid() NOT NULL,
    resource character varying(32) NOT NULL,
    resource_id integer NOT NULL,
    actor_id integer NOT NULL,
    action character varying(32) NOT NULL,
    changes jsonb NOT NULL,
    changed_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT software_change_history_pkey PRIMARY KEY (id)
);

CREATE TABLE public.software_contracts (
    id integer GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.software_contracts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
) NOT NULL,
    product_id integer NOT NULL,
    reference character varying(255) NOT NULL,
    license_type character varying(32) NOT NULL,
    purchased_quantity integer NOT NULL,
    starts_on date NOT NULL,
    ends_on date,
    renews_on date,
    auto_renew boolean DEFAULT false NOT NULL,
    vendor character varying(255),
    order_number character varying(128),
    amount numeric(16,2),
    currency character varying(3),
    evidence_reference character varying(2048),
    notes character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT software_contracts_date_check CHECK ((((ends_on IS NULL) OR (ends_on >= starts_on)) AND ((renews_on IS NULL) OR (renews_on >= starts_on)))),
    CONSTRAINT software_contracts_license_type_check CHECK (((license_type)::text = ANY ((ARRAY['user'::character varying, 'device'::character varying, 'concurrent'::character varying])::text[]))),
    CONSTRAINT software_contracts_quantity_check CHECK ((purchased_quantity > 0)),
    CONSTRAINT software_contracts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.software_installation_users (
    id integer GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.software_installation_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
) NOT NULL,
    installation_id integer NOT NULL,
    employee_id integer NOT NULL,
    usage_no integer NOT NULL,
    started_on date NOT NULL,
    ended_on date,
    notes character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT software_installation_users_dates_check CHECK (((ended_on IS NULL) OR (ended_on >= started_on))),
    CONSTRAINT software_installation_users_installation_id_usage_no_key UNIQUE (installation_id, usage_no),
    CONSTRAINT software_installation_users_pkey PRIMARY KEY (id)
);

CREATE TABLE public.software_installations (
    id integer GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.software_installations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
) NOT NULL,
    contract_id integer NOT NULL,
    asset_id integer NOT NULL,
    installation_no integer NOT NULL,
    installed_on date NOT NULL,
    removed_on date,
    notes character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT software_installations_dates_check CHECK (((removed_on IS NULL) OR (removed_on >= installed_on))),
    CONSTRAINT software_installations_contract_id_installation_no_key UNIQUE (contract_id, installation_no),
    CONSTRAINT software_installations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.software_license_keys (
    id integer GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.software_license_keys_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
) NOT NULL,
    contract_id integer NOT NULL,
    fingerprint character varying(64) NOT NULL,
    label character varying(255),
    last_four character varying(4) NOT NULL,
    activation_limit integer,
    expires_on date,
    notes character varying(5000),
    ciphertext text NOT NULL,
    initialization_vector character varying(32) NOT NULL,
    authentication_tag character varying(32) NOT NULL,
    key_version integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT software_license_keys_activation_check CHECK (((activation_limit IS NULL) OR (activation_limit > 0))),
    CONSTRAINT software_license_keys_pkey PRIMARY KEY (id)
);

CREATE TABLE public.software_license_terms (
    id integer GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.software_license_terms_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
) NOT NULL,
    contract_id integer NOT NULL,
    counting_unit character varying(32) NOT NULL,
    users_per_license integer,
    devices_per_user integer,
    concurrent_limit integer,
    evidence_status character varying(16) DEFAULT 'unverified'::character varying NOT NULL,
    terms_reference character varying(2048),
    notes character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    users_per_device integer,
    CONSTRAINT software_license_terms_counting_unit_check CHECK (((counting_unit)::text = ANY ((ARRAY['employee'::character varying, 'asset'::character varying, 'concurrent'::character varying])::text[]))),
    CONSTRAINT software_license_terms_evidence_check CHECK (((evidence_status)::text = ANY ((ARRAY['confirmed'::character varying, 'unverified'::character varying])::text[]))),
    CONSTRAINT software_license_terms_positive_check CHECK ((((users_per_license IS NULL) OR (users_per_license > 0)) AND ((devices_per_user IS NULL) OR (devices_per_user > 0)) AND ((concurrent_limit IS NULL) OR (concurrent_limit > 0)))),
    CONSTRAINT software_license_terms_users_per_device_check CHECK (((users_per_device IS NULL) OR (users_per_device > 0))),
    CONSTRAINT software_license_terms_pkey PRIMARY KEY (id)
);

CREATE TABLE public.software_products (
    id integer GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.software_products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
) NOT NULL,
    catalog_key character varying(1024) NOT NULL,
    name character varying(255) NOT NULL,
    manufacturer character varying(255) NOT NULL,
    edition character varying(128),
    version character varying(128),
    product_code character varying(128),
    notes character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT software_products_pkey PRIMARY KEY (id)
);

CREATE TABLE public.storage (
    id SERIAL NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    notes text,
    branch_id integer NOT NULL,
    room_id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT storage_pkey PRIMARY KEY (id)
);

CREATE TABLE public.system_metric_samples (
    id SERIAL NOT NULL,
    slot integer NOT NULL,
    measured_at timestamp(3) with time zone NOT NULL,
    measurement jsonb NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT system_metric_samples_slot_check CHECK (((slot >= 0) AND (slot < 10080))),
    CONSTRAINT system_metric_samples_pkey PRIMARY KEY (id),
    CONSTRAINT system_metric_samples_slot_key UNIQUE (slot)
);

CREATE TABLE public.teams (
    id SERIAL NOT NULL,
    code character varying(64) NOT NULL DEFAULT ('TEAM-'::text || (nextval('public.team_code_seq'::regclass))::text),
    name character varying(128) NOT NULL,
    description character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone DEFAULT NULL::timestamp with time zone,
    CONSTRAINT teams_code_check CHECK (((code)::text ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'::text)),
    CONSTRAINT teams_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT teams_code_key UNIQUE (code),
    CONSTRAINT teams_pkey PRIMARY KEY (id)
);

CREATE TABLE public.widget_approvals (
    id SERIAL NOT NULL,
    release_id integer NOT NULL,
    allowed boolean DEFAULT false NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT widget_approvals_pkey PRIMARY KEY (id),
    CONSTRAINT widget_approvals_release_id_key UNIQUE (release_id)
);

CREATE TABLE public.widget_drafts (
    id SERIAL NOT NULL,
    employee_id integer NOT NULL,
    widget_code character varying(100) NOT NULL,
    version character varying(40) NOT NULL,
    content jsonb NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT widget_drafts_revision_check CHECK ((revision > 0)),
    CONSTRAINT widget_drafts_employee_id_widget_code_version_key UNIQUE (employee_id, widget_code, version),
    CONSTRAINT widget_drafts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.widget_instances (
    id SERIAL NOT NULL,
    instance_key uuid DEFAULT gen_random_uuid() NOT NULL,
    layout_id integer NOT NULL,
    release_id integer NOT NULL,
    size character varying(8) NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT widget_instances_size_check CHECK (((size)::text ~ '^[1-8]x[1-8]$'::text)),
    CONSTRAINT widget_instances_sort_order_check CHECK ((sort_order >= 0)),
    CONSTRAINT widget_instances_instance_key_key UNIQUE (instance_key),
    CONSTRAINT widget_instances_pkey PRIMARY KEY (id)
);

CREATE TABLE public.widget_layouts (
    id SERIAL NOT NULL,
    employee_id integer NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT widget_layouts_revision_check CHECK ((revision > 0)),
    CONSTRAINT widget_layouts_employee_id_key UNIQUE (employee_id),
    CONSTRAINT widget_layouts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.widget_records (
    id SERIAL NOT NULL,
    instance_id integer NOT NULL,
    record_key character varying(64) NOT NULL,
    "values" jsonb NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT widget_records_record_key_check CHECK (((record_key)::text ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$'::text)),
    CONSTRAINT widget_records_revision_check CHECK ((revision > 0)),
    CONSTRAINT widget_records_values_check CHECK ((jsonb_typeof("values") = 'object'::text)),
    CONSTRAINT widget_records_instance_id_record_key_key UNIQUE (instance_id, record_key),
    CONSTRAINT widget_records_pkey PRIMARY KEY (id)
);

CREATE TABLE public.widget_releases (
    id SERIAL NOT NULL,
    source_id integer NOT NULL,
    widget_code character varying(100) NOT NULL,
    version character varying(40) NOT NULL,
    definition jsonb NOT NULL,
    digest character varying(64) NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT widget_releases_pkey PRIMARY KEY (id),
    CONSTRAINT widget_releases_source_id_widget_code_version_key UNIQUE (source_id, widget_code, version)
);

CREATE TABLE public.widget_sources (
    id SERIAL NOT NULL,
    source_key character varying(100) NOT NULL,
    name character varying(128) NOT NULL,
    url character varying(2048) NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT widget_sources_pkey PRIMARY KEY (id),
    CONSTRAINT widget_sources_source_key_key UNIQUE (source_key),
    CONSTRAINT widget_sources_url_key UNIQUE (url)
);

CREATE TABLE public.work_calendar_days (
    id SERIAL NOT NULL,
    calendar_id integer NOT NULL,
    work_date date NOT NULL,
    entry_type character varying(32) DEFAULT 'working_day'::character varying NOT NULL,
    title character varying(128) NOT NULL,
    note character varying(5000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT work_calendar_days_pkey PRIMARY KEY (id)
);

CREATE TABLE public.work_calendars (
    id SERIAL NOT NULL,
    name character varying(128) NOT NULL,
    calendar_year integer NOT NULL,
    scheduled_work_minutes_per_day integer DEFAULT 465 NOT NULL,
    description character varying(1000),
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    country_code character varying(2) DEFAULT 'JP'::character varying NOT NULL,
    CONSTRAINT work_calendars_calendar_year_check CHECK (((calendar_year >= 2011) AND (calendar_year <= 9999))),
    CONSTRAINT work_calendars_country_code_check CHECK (((country_code)::text = ANY ((ARRAY['JP'::character varying, 'US'::character varying])::text[]))),
    CONSTRAINT work_calendars_scheduled_work_minutes_per_day_check CHECK (((scheduled_work_minutes_per_day >= 15) AND (scheduled_work_minutes_per_day <= 1440) AND ((scheduled_work_minutes_per_day % 15) = 0))),
    CONSTRAINT work_calendars_pkey PRIMARY KEY (id)
);

CREATE TABLE public.workflow_actions (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    action_key uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id integer NOT NULL,
    actor_id integer NOT NULL,
    actor_name text NOT NULL,
    attempt integer NOT NULL,
    "position" integer,
    type character varying(32) NOT NULL,
    message text DEFAULT ''::text NOT NULL,
    detail jsonb NOT NULL,
    CONSTRAINT workflow_actions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.workflow_attachments (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    attachment_key uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id integer NOT NULL,
    name character varying(200) NOT NULL,
    mime character varying(80) NOT NULL,
    size integer NOT NULL,
    digest character varying(64) NOT NULL,
    content bytea NOT NULL,
    CONSTRAINT workflow_attachments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.workflow_requests (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    request_key uuid DEFAULT gen_random_uuid() NOT NULL,
    template_version_id integer NOT NULL,
    applicant_id integer NOT NULL,
    title character varying(160) NOT NULL,
    currency character varying(3) DEFAULT 'JPY'::character varying NOT NULL,
    "values" jsonb NOT NULL,
    status character varying(24) DEFAULT 'draft'::character varying NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    attempt integer DEFAULT 0 NOT NULL,
    current_step integer DEFAULT 0 NOT NULL,
    CONSTRAINT workflow_request_state CHECK ((((status)::text = ANY ((ARRAY['draft'::character varying, 'pending'::character varying, 'approved'::character varying, 'returned'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])) AND (revision > 0) AND (attempt >= 0) AND (current_step >= 0))),
    CONSTRAINT workflow_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.workflow_steps (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    request_id integer NOT NULL,
    attempt integer NOT NULL,
    "position" integer NOT NULL,
    employee_id integer NOT NULL,
    employee_name text NOT NULL,
    status character varying(24) DEFAULT 'waiting'::character varying NOT NULL,
    CONSTRAINT workflow_step_state CHECK ((((status)::text = ANY ((ARRAY['waiting'::character varying, 'pending'::character varying, 'approved'::character varying, 'returned'::character varying, 'rejected'::character varying, 'stopped'::character varying])::text[])) AND (attempt > 0) AND ("position" >= 0))),
    CONSTRAINT workflow_steps_pkey PRIMARY KEY (id)
);

CREATE TABLE public.workflow_submission_attachments (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    submission_id integer NOT NULL,
    attachment_id integer NOT NULL,
    CONSTRAINT workflow_submission_attachments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.workflow_submissions (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    request_id integer NOT NULL,
    attempt integer NOT NULL,
    snapshot jsonb NOT NULL,
    CONSTRAINT workflow_submissions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.workflow_template_versions (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    template_id integer NOT NULL,
    version integer NOT NULL,
    name character varying(160) NOT NULL,
    description text NOT NULL,
    definition jsonb NOT NULL,
    route jsonb NOT NULL,
    CONSTRAINT workflow_template_versions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.workflow_templates (
    id SERIAL NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    template_key uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(160) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    definition jsonb NOT NULL,
    route jsonb NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    published_version integer,
    active boolean DEFAULT false NOT NULL,
    CONSTRAINT workflow_templates_pkey PRIMARY KEY (id)
);

CREATE TABLE public.workforce_change_history (
    id SERIAL NOT NULL,
    event_key uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id integer NOT NULL,
    actor_id integer NOT NULL,
    resource character varying(40) NOT NULL,
    resource_id integer NOT NULL,
    action character varying(20) NOT NULL,
    changes jsonb NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone DEFAULT NULL::timestamp with time zone,
    CONSTRAINT workforce_change_history_event_key_key UNIQUE (event_key),
    CONSTRAINT workforce_change_history_pkey PRIMARY KEY (id)
);

CREATE INDEX account_invitations_employee_id_created_at_idx ON public.account_invitations USING btree (employee_id, created_at);

CREATE INDEX account_invitations_expires_at_idx ON public.account_invitations USING btree (expires_at);

CREATE INDEX account_invitations_issued_by_id_idx ON public.account_invitations USING btree (issued_by_id);

CREATE UNIQUE INDEX account_invitations_token_hash_key ON public.account_invitations USING btree (token_hash);

CREATE UNIQUE INDEX audit_logs_event_key_key ON public.audit_logs USING btree (event_key);

CREATE INDEX audit_logs_resource_resource_id_idx ON public.audit_logs USING btree (resource, resource_id);

CREATE UNIQUE INDEX book_change_history_event_key_key ON public.book_change_history USING btree (event_key);

CREATE INDEX book_change_history_resource_resource_id_created_at_idx ON public.book_change_history USING btree (resource, resource_id, created_at);

CREATE UNIQUE INDEX book_copies_copy_code_key ON public.book_copies USING btree (copy_code);

CREATE INDEX book_copies_storage_id_idx ON public.book_copies USING btree (storage_id);

CREATE INDEX book_copies_title_id_idx ON public.book_copies USING btree (title_id);

CREATE UNIQUE INDEX book_copy_batches_request_key_key ON public.book_copy_batches USING btree (request_key);

CREATE UNIQUE INDEX book_loans_active_copy ON public.book_loans USING btree (copy_id) WHERE ((returned_on IS NULL) AND (deleted_at IS NULL));

CREATE INDEX book_loans_employee_id_due_on_idx ON public.book_loans USING btree (employee_id, due_on);

CREATE UNIQUE INDEX book_loans_loan_code_key ON public.book_loans USING btree (loan_code);

CREATE INDEX book_purchase_orders_branch_id_title_id_status_idx ON public.book_purchase_orders USING btree (branch_id, title_id, status);

CREATE UNIQUE INDEX book_purchase_requests_active_person_title ON public.book_purchase_requests USING btree (title_id, branch_id, employee_id) WHERE ((deleted_at IS NULL) AND ((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'ordered'::character varying])::text[])));

CREATE INDEX book_purchase_requests_branch_id_title_id_status_idx ON public.book_purchase_requests USING btree (branch_id, title_id, status);

CREATE UNIQUE INDEX book_reservations_active_employee_title ON public.book_reservations USING btree (title_id, employee_id) WHERE (((status)::text = ANY ((ARRAY['waiting'::character varying, 'held'::character varying])::text[])) AND (deleted_at IS NULL));

CREATE UNIQUE INDEX book_reservations_reservation_code_key ON public.book_reservations USING btree (reservation_code);

CREATE INDEX book_reservations_title_id_branch_id_reserved_at_idx ON public.book_reservations USING btree (title_id, branch_id, reserved_at);

CREATE UNIQUE INDEX book_titles_active_isbn_key ON public.book_titles USING btree (isbn) WHERE ((deleted_at IS NULL) AND (isbn IS NOT NULL));

CREATE UNIQUE INDEX book_titles_catalog_code_key ON public.book_titles USING btree (catalog_code);

CREATE INDEX book_titles_isbn_idx ON public.book_titles USING btree (isbn);

CREATE INDEX branches_deputy_manager_employee_id_idx ON public.branches USING btree (deputy_manager_employee_id);

CREATE INDEX branches_manager_employee_id_idx ON public.branches USING btree (manager_employee_id);

CREATE UNIQUE INDEX branches_name_key ON public.branches USING btree (name);

CREATE INDEX calendar_date_attributes_calendar_date_idx ON public.calendar_date_attributes USING btree (calendar_date);

CREATE UNIQUE INDEX calendar_date_attributes_country_code_calendar_date_kind_key ON public.calendar_date_attributes USING btree (country_code, calendar_date, kind);

CREATE INDEX calendar_holiday_imports_completed_at_idx ON public.calendar_holiday_imports USING btree (completed_at);

CREATE INDEX calendar_holiday_imports_country_code_completed_at_idx ON public.calendar_holiday_imports USING btree (country_code, completed_at);

CREATE UNIQUE INDEX calendar_holiday_imports_import_key_key ON public.calendar_holiday_imports USING btree (import_key);

CREATE INDEX cpu_types_manufacturer_id_idx ON public.cpu_types USING btree (manufacturer_id);

CREATE UNIQUE INDEX cpu_types_manufacturer_id_model_number_key ON public.cpu_types USING btree (manufacturer_id, model_number);

CREATE UNIQUE INDEX cpu_types_name_key ON public.cpu_types USING btree (name);

CREATE INDEX employee_change_history_actor_id_idx ON public.employee_change_history USING btree (actor_id);

CREATE INDEX employee_change_history_employee_id_changed_at_idx ON public.employee_change_history USING btree (employee_id, changed_at);

CREATE UNIQUE INDEX employee_change_history_event_key_key ON public.employee_change_history USING btree (event_key);

CREATE INDEX employee_departments_department_id_idx ON public.employee_departments USING btree (department_id);

CREATE UNIQUE INDEX employee_departments_employee_id_department_id_key ON public.employee_departments USING btree (employee_id, department_id);

CREATE UNIQUE INDEX employee_departments_one_active_primary ON public.employee_departments USING btree (employee_id) WHERE (is_primary AND (deleted_at IS NULL));

CREATE UNIQUE INDEX employee_groups_department_id_name_key ON public.employee_groups USING btree (department_id, name);

CREATE UNIQUE INDEX employee_groups_unassigned_name_key ON public.employee_groups USING btree (name) WHERE (department_id IS NULL);

CREATE UNIQUE INDEX employee_positions_employee_id_position_id_key ON public.employee_positions USING btree (employee_id, position_id);

CREATE UNIQUE INDEX employee_positions_one_active_primary ON public.employee_positions USING btree (employee_id) WHERE (is_primary AND (deleted_at IS NULL));

CREATE INDEX employee_positions_position_id_idx ON public.employee_positions USING btree (position_id);

CREATE INDEX employee_roles_department_id_idx ON public.employee_roles USING btree (department_id);

CREATE UNIQUE INDEX employee_roles_employee_id_role_id_scope_type_scope_key_key ON public.employee_roles USING btree (employee_id, role_id, scope_type, scope_key);

CREATE UNIQUE INDEX employee_roles_one_active_per_employee ON public.employee_roles USING btree (employee_id) WHERE (deleted_at IS NULL);

CREATE INDEX employee_roles_role_id_idx ON public.employee_roles USING btree (role_id);

CREATE INDEX employee_roles_scope_employee_id_idx ON public.employee_roles USING btree (scope_employee_id);

CREATE INDEX employee_skills_skill_id_idx ON public.employee_skills USING btree (skill_id);

CREATE INDEX employee_social_links_employee_id_deleted_at_idx ON public.employee_social_links USING btree (employee_id, deleted_at);

CREATE INDEX employee_teams_team_id_idx ON public.employee_teams USING btree (team_id);

CREATE INDEX employees_deletion_scheduled_on_deleted_at_idx ON public.employees USING btree (deletion_scheduled_on, deleted_at);

CREATE UNIQUE INDEX employees_email_key ON public.employees USING btree (email);

CREATE UNIQUE INDEX employees_employee_code_key ON public.employees USING btree (employee_code);

CREATE UNIQUE INDEX employees_username_key ON public.employees USING btree (username);

CREATE INDEX employees_work_calendar_id_idx ON public.employees USING btree (work_calendar_id);

CREATE UNIQUE INDEX employment_departments_name_key ON public.employment_departments USING btree (name);

CREATE UNIQUE INDEX employment_positions_name_key ON public.employment_positions USING btree (name);

CREATE UNIQUE INDEX employment_types_name_key ON public.employment_types USING btree (name);

CREATE INDEX engagement_participations_engagement_id_ends_on_idx ON public.engagement_participations USING btree (engagement_id, ends_on);

CREATE INDEX engagements_client_id_idx ON public.engagements USING btree (client_id);

CREATE UNIQUE INDEX external_links_name_key ON public.external_links USING btree (name);

CREATE INDEX external_links_sort_order_name_idx ON public.external_links USING btree (sort_order, name);

CREATE INDEX financial_months_month_idx ON public.financial_months USING btree (month);

CREATE INDEX financial_publications_basis_fiscal_start_month_year_idx ON public.financial_publications USING btree (basis, fiscal_start_month, year);

CREATE UNIQUE INDEX it_asset_assignments_asset_id_assigned_at_key ON public.it_asset_assignments USING btree (asset_id, assigned_at);

CREATE INDEX it_asset_assignments_asset_id_idx ON public.it_asset_assignments USING btree (asset_id);

CREATE INDEX it_asset_assignments_employee_id_idx ON public.it_asset_assignments USING btree (employee_id);

CREATE UNIQUE INDEX it_asset_assignments_one_active_per_asset ON public.it_asset_assignments USING btree (asset_id) WHERE ((returned_at IS NULL) AND (deleted_at IS NULL));

CREATE INDEX it_asset_change_history_actor_id_idx ON public.it_asset_change_history USING btree (actor_id);

CREATE INDEX it_asset_change_history_asset_id_changed_at_idx ON public.it_asset_change_history USING btree (asset_id, changed_at);

CREATE UNIQUE INDEX it_asset_change_history_event_key_key ON public.it_asset_change_history USING btree (event_key);

CREATE UNIQUE INDEX it_asset_credentials_asset_id_credential_type_key ON public.it_asset_credentials USING btree (asset_id, credential_type);

CREATE INDEX it_asset_credentials_asset_id_idx ON public.it_asset_credentials USING btree (asset_id);

CREATE UNIQUE INDEX it_asset_ip_addresses_active_room_ip_key ON public.it_asset_ip_addresses USING btree (room_id, ip_address) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX it_asset_ip_addresses_asset_id_slot_key ON public.it_asset_ip_addresses USING btree (asset_id, slot);

CREATE INDEX it_asset_ip_addresses_room_id_idx ON public.it_asset_ip_addresses USING btree (room_id);

CREATE INDEX it_asset_management_codes_asset_id_idx ON public.it_asset_management_codes USING btree (asset_id);

CREATE UNIQUE INDEX it_asset_management_codes_code_key ON public.it_asset_management_codes USING btree (code);

CREATE UNIQUE INDEX it_asset_statuses_name_key ON public.it_asset_statuses USING btree (name);

CREATE UNIQUE INDEX it_asset_types_management_code_prefix_key ON public.it_asset_types USING btree (management_code_prefix);

CREATE UNIQUE INDEX it_asset_types_name_key ON public.it_asset_types USING btree (name);

CREATE UNIQUE INDEX it_assets_asset_tag_key ON public.it_assets USING btree (asset_tag);

CREATE INDEX it_assets_cpu_type_id_idx ON public.it_assets USING btree (cpu_type_id);

CREATE INDEX it_assets_manufacturer_id_idx ON public.it_assets USING btree (manufacturer_id);

CREATE UNIQUE INDEX it_assets_manufacturer_id_serial_number_key ON public.it_assets USING btree (manufacturer_id, serial_number);

CREATE INDEX it_assets_operating_system_id_idx ON public.it_assets USING btree (operating_system_id);

CREATE INDEX it_assets_status_id_idx ON public.it_assets USING btree (status_id);

CREATE INDEX it_assets_storage_id_idx ON public.it_assets USING btree (storage_id);

CREATE INDEX it_assets_type_id_idx ON public.it_assets USING btree (type_id);

CREATE UNIQUE INDEX manufacturers_name_key ON public.manufacturers USING btree (name);

CREATE INDEX master_change_history_actor_id_idx ON public.master_change_history USING btree (actor_id);

CREATE INDEX master_change_history_resource_resource_id_changed_at_idx ON public.master_change_history USING btree (resource, resource_id, changed_at);

CREATE UNIQUE INDEX notification_events_deduplication_key_key ON public.notification_events USING btree (deduplication_key);

CREATE UNIQUE INDEX notification_events_notification_key_key ON public.notification_events USING btree (notification_key);

CREATE INDEX notification_recipients_employee_id_read_at_deleted_at_idx ON public.notification_recipients USING btree (employee_id, read_at, deleted_at);

CREATE UNIQUE INDEX notification_recipients_notification_id_employee_id_key ON public.notification_recipients USING btree (notification_id, employee_id);

CREATE UNIQUE INDEX operating_system_vendors_name_key ON public.operating_system_vendors USING btree (name);

CREATE UNIQUE INDEX operating_systems_natural_key ON public.operating_systems USING btree (vendor_id, product, version, edition, architecture) NULLS NOT DISTINCT;

CREATE INDEX operating_systems_vendor_id_idx ON public.operating_systems USING btree (vendor_id);

CREATE INDEX password_reset_tokens_employee_id_idx ON public.password_reset_tokens USING btree (employee_id);

CREATE INDEX password_reset_tokens_expires_at_idx ON public.password_reset_tokens USING btree (expires_at);

CREATE UNIQUE INDEX password_reset_tokens_token_hash_key ON public.password_reset_tokens USING btree (token_hash);

CREATE UNIQUE INDEX permission_operations_operation_key ON public.permission_operations USING btree (operation);

CREATE INDEX permission_operations_permission_id_idx ON public.permission_operations USING btree (permission_id);

CREATE UNIQUE INDEX permission_operations_permission_id_key ON public.permission_operations USING btree (permission_id);

CREATE UNIQUE INDEX permissions_identifier_key ON public.permissions USING btree (identifier);

CREATE UNIQUE INDEX permissions_name_key ON public.permissions USING btree (name);

CREATE INDEX project_attachments_ticket_id_idx ON public.project_attachments USING btree (ticket_id);

CREATE INDEX project_attachments_uploader_id_idx ON public.project_attachments USING btree (uploader_id);

CREATE INDEX project_baseline_items_baseline_id_idx ON public.project_baseline_items USING btree (baseline_id);

CREATE INDEX project_baseline_items_ticket_id_idx ON public.project_baseline_items USING btree (ticket_id);

CREATE INDEX project_baseline_months_item_id_idx ON public.project_baseline_months USING btree (item_id);

CREATE INDEX project_baselines_author_id_idx ON public.project_baselines USING btree (author_id);

CREATE INDEX project_baselines_project_id_idx ON public.project_baselines USING btree (project_id);

CREATE INDEX project_checklists_ticket_id_idx ON public.project_checklists USING btree (ticket_id);

CREATE INDEX project_comments_author_id_idx ON public.project_comments USING btree (author_id);

CREATE INDEX project_comments_ticket_id_idx ON public.project_comments USING btree (ticket_id);

CREATE INDEX project_cost_rates_project_id_idx ON public.project_cost_rates USING btree (project_id);

CREATE UNIQUE INDEX project_custom_field_options_field_id_name_key ON public.project_custom_field_options USING btree (field_id, name);

CREATE INDEX project_custom_field_selections_option_id_value_id_idx ON public.project_custom_field_selections USING btree (option_id, value_id);

CREATE UNIQUE INDEX project_custom_field_selections_value_id_option_id_key ON public.project_custom_field_selections USING btree (value_id, option_id);

CREATE UNIQUE INDEX project_custom_field_types_field_id_type_id_key ON public.project_custom_field_types USING btree (field_id, type_id);

CREATE INDEX project_custom_field_values_field_id_ticket_id_idx ON public.project_custom_field_values USING btree (field_id, ticket_id);

CREATE UNIQUE INDEX project_custom_field_values_ticket_id_field_id_key ON public.project_custom_field_values USING btree (ticket_id, field_id);

CREATE INDEX project_custom_fields_project_id_enabled_position_idx ON public.project_custom_fields USING btree (project_id, enabled, "position");

CREATE UNIQUE INDEX project_custom_fields_project_id_name_key ON public.project_custom_fields USING btree (project_id, name);

CREATE INDEX project_evm_reports_author_id_idx ON public.project_evm_reports USING btree (author_id);

CREATE INDEX project_evm_reports_baseline_id_idx ON public.project_evm_reports USING btree (baseline_id);

CREATE INDEX project_evm_reports_project_id_idx ON public.project_evm_reports USING btree (project_id);

CREATE INDEX project_evm_settings_project_id_idx ON public.project_evm_settings USING btree (project_id);

CREATE INDEX project_expenses_author_id_idx ON public.project_expenses USING btree (author_id);

CREATE INDEX project_expenses_project_id_idx ON public.project_expenses USING btree (project_id);

CREATE INDEX project_expenses_ticket_id_idx ON public.project_expenses USING btree (ticket_id);

CREATE INDEX project_history_actor_id_idx ON public.project_history USING btree (actor_id);

CREATE INDEX project_history_project_id_idx ON public.project_history USING btree (project_id);

CREATE INDEX project_history_ticket_id_idx ON public.project_history USING btree (ticket_id);

CREATE INDEX project_markdown_images_comment_id_idx ON public.project_markdown_images USING btree (comment_id);

CREATE INDEX project_markdown_images_draft_owner_idx ON public.project_markdown_images USING btree (uploader_id) WHERE ((NOT bound) AND (deleted_at IS NULL));

CREATE INDEX project_markdown_images_project_id_idx ON public.project_markdown_images USING btree (project_id);

CREATE INDEX project_markdown_images_ticket_id_idx ON public.project_markdown_images USING btree (ticket_id);

CREATE INDEX project_members_employee_id_idx ON public.project_members USING btree (employee_id);

CREATE INDEX project_members_project_id_idx ON public.project_members USING btree (project_id);

CREATE INDEX project_progress_records_author_id_idx ON public.project_progress_records USING btree (author_id);

CREATE INDEX project_progress_records_project_id_idx ON public.project_progress_records USING btree (project_id);

CREATE INDEX project_progress_records_ticket_id_idx ON public.project_progress_records USING btree (ticket_id);

CREATE INDEX project_ticket_relations_from_id_idx ON public.project_ticket_relations USING btree (from_id);

CREATE INDEX project_ticket_relations_project_id_idx ON public.project_ticket_relations USING btree (project_id);

CREATE INDEX project_ticket_relations_to_id_idx ON public.project_ticket_relations USING btree (to_id);

CREATE INDEX project_ticket_statuses_project_id_idx ON public.project_ticket_statuses USING btree (project_id);

CREATE INDEX project_ticket_types_project_id_idx ON public.project_ticket_types USING btree (project_id);

CREATE INDEX project_tickets_assignee_id_idx ON public.project_tickets USING btree (assignee_id);

CREATE INDEX project_tickets_author_id_idx ON public.project_tickets USING btree (author_id);

CREATE INDEX project_tickets_parent_id_idx ON public.project_tickets USING btree (parent_id);

CREATE INDEX project_tickets_project_id_idx ON public.project_tickets USING btree (project_id);

CREATE INDEX project_tickets_status_id_idx ON public.project_tickets USING btree (status_id);

CREATE INDEX project_tickets_type_id_idx ON public.project_tickets USING btree (type_id);

CREATE INDEX project_time_entries_employee_id_idx ON public.project_time_entries USING btree (employee_id);

CREATE INDEX project_time_entries_ticket_id_idx ON public.project_time_entries USING btree (ticket_id);

CREATE UNIQUE INDEX project_type_status_initial_idx ON public.project_type_statuses USING btree (type_id) WHERE (initial AND (deleted_at IS NULL));

CREATE INDEX project_type_statuses_project_id_idx ON public.project_type_statuses USING btree (project_id);

CREATE INDEX project_type_statuses_status_id_idx ON public.project_type_statuses USING btree (status_id);

CREATE INDEX project_type_statuses_type_id_idx ON public.project_type_statuses USING btree (type_id);

CREATE INDEX project_watchers_employee_id_idx ON public.project_watchers USING btree (employee_id);

CREATE INDEX project_watchers_ticket_id_idx ON public.project_watchers USING btree (ticket_id);

CREATE INDEX projects_engagement_id_idx ON public.projects USING btree (engagement_id);

CREATE UNIQUE INDEX reservable_resources_asset_id_key ON public.reservable_resources USING btree (asset_id);

CREATE UNIQUE INDEX reservable_resources_resource_key_key ON public.reservable_resources USING btree (resource_key);

CREATE UNIQUE INDEX reservable_resources_room_id_key ON public.reservable_resources USING btree (room_id);

CREATE UNIQUE INDEX resource_reservations_occurrence_id_resource_id_key ON public.resource_reservations USING btree (occurrence_id, resource_id);

CREATE INDEX resource_reservations_resource_id_starts_at_ends_at_idx ON public.resource_reservations USING btree (resource_id, starts_at, ends_at);

CREATE INDEX role_permissions_permission_id_idx ON public.role_permissions USING btree (permission_id);

CREATE UNIQUE INDEX role_permissions_role_id_permission_id_key ON public.role_permissions USING btree (role_id, permission_id);

CREATE UNIQUE INDEX roles_default_key_key ON public.roles USING btree (default_key);

CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);

CREATE INDEX roles_sort_order_name_idx ON public.roles USING btree (sort_order, name);

CREATE UNIQUE INDEX rooms_branch_id_id_key ON public.rooms USING btree (branch_id, id);

CREATE INDEX rooms_branch_id_idx ON public.rooms USING btree (branch_id);

CREATE UNIQUE INDEX rooms_branch_id_name_key ON public.rooms USING btree (branch_id, name);

CREATE INDEX saved_search_filters_owner_employee_id_target_deleted_at_idx ON public.saved_search_filters USING btree (owner_employee_id, target, deleted_at);

CREATE UNIQUE INDEX schedule_events_event_key_key ON public.schedule_events USING btree (event_key);

CREATE UNIQUE INDEX schedule_events_organizer_id_idempotency_key_key ON public.schedule_events USING btree (organizer_id, idempotency_key);

CREATE UNIQUE INDEX schedule_occurrences_event_id_sequence_key ON public.schedule_occurrences USING btree (event_id, sequence);

CREATE UNIQUE INDEX schedule_occurrences_occurrence_key_key ON public.schedule_occurrences USING btree (occurrence_key);

CREATE INDEX schedule_occurrences_starts_at_ends_at_idx ON public.schedule_occurrences USING btree (starts_at, ends_at);

CREATE INDEX schedule_participants_employee_id_deleted_at_idx ON public.schedule_participants USING btree (employee_id, deleted_at);

CREATE UNIQUE INDEX schedule_participants_occurrence_id_employee_id_key ON public.schedule_participants USING btree (occurrence_id, employee_id);

CREATE UNIQUE INDEX schedule_preferences_employee_id_key ON public.schedule_preferences USING btree (employee_id);

CREATE INDEX sessions_employee_id_idx ON public.sessions USING btree (employee_id);

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);

CREATE UNIQUE INDEX sessions_token_hash_key ON public.sessions USING btree (token_hash);

CREATE UNIQUE INDEX software_assignments_active_asset_key ON public.software_assignments USING btree (contract_id, asset_id) WHERE ((asset_id IS NOT NULL) AND (released_on IS NULL) AND (deleted_at IS NULL));

CREATE UNIQUE INDEX software_assignments_active_employee_key ON public.software_assignments USING btree (contract_id, employee_id) WHERE ((employee_id IS NOT NULL) AND (released_on IS NULL) AND (deleted_at IS NULL));

CREATE INDEX software_assignments_asset_id_idx ON public.software_assignments USING btree (asset_id);

CREATE UNIQUE INDEX software_assignments_contract_id_assignment_no_key ON public.software_assignments USING btree (contract_id, assignment_no);

CREATE INDEX software_assignments_employee_id_idx ON public.software_assignments USING btree (employee_id);

CREATE UNIQUE INDEX software_change_history_event_key_key ON public.software_change_history USING btree (event_key);

CREATE INDEX software_change_history_resource_resource_id_changed_at_idx ON public.software_change_history USING btree (resource, resource_id, changed_at);

CREATE INDEX software_contracts_product_id_deleted_at_idx ON public.software_contracts USING btree (product_id, deleted_at);

CREATE UNIQUE INDEX software_contracts_product_id_reference_key ON public.software_contracts USING btree (product_id, reference);

CREATE UNIQUE INDEX software_installation_users_active_employee_key ON public.software_installation_users USING btree (installation_id, employee_id) WHERE ((ended_on IS NULL) AND (deleted_at IS NULL));

CREATE INDEX software_installation_users_employee_id_idx ON public.software_installation_users USING btree (employee_id);

CREATE UNIQUE INDEX software_installations_active_asset_key ON public.software_installations USING btree (contract_id, asset_id) WHERE ((removed_on IS NULL) AND (deleted_at IS NULL));

CREATE INDEX software_installations_asset_id_idx ON public.software_installations USING btree (asset_id);

CREATE UNIQUE INDEX software_license_keys_contract_id_fingerprint_key ON public.software_license_keys USING btree (contract_id, fingerprint);

CREATE UNIQUE INDEX software_license_terms_contract_id_key ON public.software_license_terms USING btree (contract_id);

CREATE UNIQUE INDEX software_products_catalog_key_key ON public.software_products USING btree (catalog_key);

CREATE UNIQUE INDEX storage_branch_id_room_id_name_key ON public.storage USING btree (branch_id, room_id, name);

CREATE INDEX storage_room_id_idx ON public.storage USING btree (room_id);

CREATE INDEX system_metric_samples_measured_at_idx ON public.system_metric_samples USING btree (measured_at);

CREATE UNIQUE INDEX teams_active_name_key ON public.teams USING btree (lower(btrim((name)::text))) WHERE (deleted_at IS NULL);

CREATE INDEX widget_instances_layout_id_deleted_at_idx ON public.widget_instances USING btree (layout_id, deleted_at);

CREATE INDEX widget_records_instance_id_deleted_at_idx ON public.widget_records USING btree (instance_id, deleted_at);

CREATE INDEX work_calendar_days_calendar_id_idx ON public.work_calendar_days USING btree (calendar_id);

CREATE UNIQUE INDEX work_calendar_days_calendar_id_work_date_key ON public.work_calendar_days USING btree (calendar_id, work_date);

CREATE INDEX work_calendars_calendar_year_idx ON public.work_calendars USING btree (calendar_year);

CREATE UNIQUE INDEX work_calendars_name_key ON public.work_calendars USING btree (name);

CREATE UNIQUE INDEX workflow_actions_action_key_key ON public.workflow_actions USING btree (action_key);

CREATE INDEX workflow_actions_request_id_created_at_idx ON public.workflow_actions USING btree (request_id, created_at);

CREATE UNIQUE INDEX workflow_attachments_attachment_key_key ON public.workflow_attachments USING btree (attachment_key);

CREATE INDEX workflow_attachments_request_id_deleted_at_idx ON public.workflow_attachments USING btree (request_id, deleted_at);

CREATE UNIQUE INDEX workflow_one_pending_step ON public.workflow_steps USING btree (request_id, attempt) WHERE (((status)::text = 'pending'::text) AND (deleted_at IS NULL));

CREATE INDEX workflow_requests_applicant_id_status_deleted_at_idx ON public.workflow_requests USING btree (applicant_id, status, deleted_at);

CREATE UNIQUE INDEX workflow_requests_request_key_key ON public.workflow_requests USING btree (request_key);

CREATE INDEX workflow_steps_employee_id_status_deleted_at_idx ON public.workflow_steps USING btree (employee_id, status, deleted_at);

CREATE UNIQUE INDEX workflow_steps_request_id_attempt_position_key ON public.workflow_steps USING btree (request_id, attempt, "position");

CREATE UNIQUE INDEX workflow_submission_attachments_submission_id_attachment_id_key ON public.workflow_submission_attachments USING btree (submission_id, attachment_id);

CREATE UNIQUE INDEX workflow_submissions_request_id_attempt_key ON public.workflow_submissions USING btree (request_id, attempt);

CREATE UNIQUE INDEX workflow_template_versions_template_id_version_key ON public.workflow_template_versions USING btree (template_id, version);

CREATE UNIQUE INDEX workflow_templates_template_key_key ON public.workflow_templates USING btree (template_key);

CREATE INDEX workforce_change_history_employee_id_created_at_idx ON public.workforce_change_history USING btree (employee_id, created_at);

ALTER SEQUENCE public.engagement_code_seq OWNED BY public.engagements.code;

ALTER SEQUENCE public.team_code_seq OWNED BY public.teams.code;

ALTER TABLE ONLY public.account_invitations
    ADD CONSTRAINT account_invitations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.account_invitations
    ADD CONSTRAINT account_invitations_issued_by_id_fkey FOREIGN KEY (issued_by_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_change_history
    ADD CONSTRAINT book_change_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_copies
    ADD CONSTRAINT book_copies_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.book_copy_batches(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_copies
    ADD CONSTRAINT book_copies_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.book_purchase_orders(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_copies
    ADD CONSTRAINT book_copies_storage_id_fkey FOREIGN KEY (storage_id) REFERENCES public.storage(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_copies
    ADD CONSTRAINT book_copies_title_id_fkey FOREIGN KEY (title_id) REFERENCES public.book_titles(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_copy_batches
    ADD CONSTRAINT book_copy_batches_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_loans
    ADD CONSTRAINT book_loans_copy_id_fkey FOREIGN KEY (copy_id) REFERENCES public.book_copies(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_loans
    ADD CONSTRAINT book_loans_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_loans
    ADD CONSTRAINT book_loans_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_purchase_orders
    ADD CONSTRAINT book_purchase_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_purchase_orders
    ADD CONSTRAINT book_purchase_orders_title_id_fkey FOREIGN KEY (title_id) REFERENCES public.book_titles(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_purchase_requests
    ADD CONSTRAINT book_purchase_requests_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_purchase_requests
    ADD CONSTRAINT book_purchase_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_purchase_requests
    ADD CONSTRAINT book_purchase_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.book_purchase_orders(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_purchase_requests
    ADD CONSTRAINT book_purchase_requests_title_id_fkey FOREIGN KEY (title_id) REFERENCES public.book_titles(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_reservations
    ADD CONSTRAINT book_reservations_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_reservations
    ADD CONSTRAINT book_reservations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.book_reservations
    ADD CONSTRAINT book_reservations_title_id_fkey FOREIGN KEY (title_id) REFERENCES public.book_titles(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_deputy_manager_employee_id_fkey FOREIGN KEY (deputy_manager_employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_manager_employee_id_fkey FOREIGN KEY (manager_employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.cpu_types
    ADD CONSTRAINT cpu_types_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_avatars
    ADD CONSTRAINT employee_avatars_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_change_history
    ADD CONSTRAINT employee_change_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_change_history
    ADD CONSTRAINT employee_change_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_departments
    ADD CONSTRAINT employee_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.employment_departments(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_departments
    ADD CONSTRAINT employee_departments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_groups
    ADD CONSTRAINT employee_groups_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.employment_departments(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_positions
    ADD CONSTRAINT employee_positions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_positions
    ADD CONSTRAINT employee_positions_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.employment_positions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.employment_departments(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_scope_employee_id_fkey FOREIGN KEY (scope_employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_settings
    ADD CONSTRAINT employee_settings_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_skills
    ADD CONSTRAINT employee_skills_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_skills
    ADD CONSTRAINT employee_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_social_links
    ADD CONSTRAINT employee_social_links_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_teams
    ADD CONSTRAINT employee_teams_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employee_teams
    ADD CONSTRAINT employee_teams_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_deletion_requested_by_id_fkey FOREIGN KEY (deletion_requested_by_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employment_type_id_fkey FOREIGN KEY (employment_type_id) REFERENCES public.employment_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.employee_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_work_calendar_id_fkey FOREIGN KEY (work_calendar_id) REFERENCES public.work_calendars(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.engagement_participations
    ADD CONSTRAINT engagement_participations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.engagement_participations
    ADD CONSTRAINT engagement_participations_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.financial_months
    ADD CONSTRAINT financial_months_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.financial_publications
    ADD CONSTRAINT financial_publications_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.it_asset_assignments
    ADD CONSTRAINT it_asset_assignments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.it_assets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.it_asset_assignments
    ADD CONSTRAINT it_asset_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.it_asset_change_history
    ADD CONSTRAINT it_asset_change_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.it_asset_change_history
    ADD CONSTRAINT it_asset_change_history_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.it_assets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.it_asset_credentials
    ADD CONSTRAINT it_asset_credentials_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.it_assets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.it_asset_ip_addresses
    ADD CONSTRAINT it_asset_ip_addresses_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.it_assets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.it_asset_ip_addresses
    ADD CONSTRAINT it_asset_ip_addresses_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.it_asset_management_codes
    ADD CONSTRAINT it_asset_management_codes_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.it_assets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_cpu_type_id_fkey FOREIGN KEY (cpu_type_id) REFERENCES public.cpu_types(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_operating_system_id_fkey FOREIGN KEY (operating_system_id) REFERENCES public.operating_systems(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.it_asset_statuses(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_storage_id_fkey FOREIGN KEY (storage_id) REFERENCES public.storage(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.it_asset_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.master_change_history
    ADD CONSTRAINT master_change_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.notification_recipients
    ADD CONSTRAINT notification_recipients_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.notification_recipients
    ADD CONSTRAINT notification_recipients_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notification_events(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.operating_systems
    ADD CONSTRAINT operating_systems_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.operating_system_vendors(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.permission_operations
    ADD CONSTRAINT permission_operations_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_attachments
    ADD CONSTRAINT project_attachments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_attachments
    ADD CONSTRAINT project_attachments_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_baseline_items
    ADD CONSTRAINT project_baseline_items_baseline_id_fkey FOREIGN KEY (baseline_id) REFERENCES public.project_baselines(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_baseline_items
    ADD CONSTRAINT project_baseline_items_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_baseline_months
    ADD CONSTRAINT project_baseline_months_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.project_baseline_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_baselines
    ADD CONSTRAINT project_baselines_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_baselines
    ADD CONSTRAINT project_baselines_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_checklists
    ADD CONSTRAINT project_checklists_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_comments
    ADD CONSTRAINT project_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_comments
    ADD CONSTRAINT project_comments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_cost_rates
    ADD CONSTRAINT project_cost_rates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_custom_field_options
    ADD CONSTRAINT project_custom_field_options_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.project_custom_fields(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_custom_field_selections
    ADD CONSTRAINT project_custom_field_selections_option_id_fkey FOREIGN KEY (option_id) REFERENCES public.project_custom_field_options(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_custom_field_selections
    ADD CONSTRAINT project_custom_field_selections_value_id_fkey FOREIGN KEY (value_id) REFERENCES public.project_custom_field_values(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_custom_field_types
    ADD CONSTRAINT project_custom_field_types_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.project_custom_fields(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_custom_field_types
    ADD CONSTRAINT project_custom_field_types_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.project_ticket_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_custom_field_values
    ADD CONSTRAINT project_custom_field_values_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.project_custom_fields(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_custom_field_values
    ADD CONSTRAINT project_custom_field_values_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_custom_fields
    ADD CONSTRAINT project_custom_fields_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_evm_reports
    ADD CONSTRAINT project_evm_reports_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_evm_reports
    ADD CONSTRAINT project_evm_reports_baseline_id_fkey FOREIGN KEY (baseline_id) REFERENCES public.project_baselines(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_evm_reports
    ADD CONSTRAINT project_evm_reports_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_evm_settings
    ADD CONSTRAINT project_evm_settings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_expenses
    ADD CONSTRAINT project_expenses_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_expenses
    ADD CONSTRAINT project_expenses_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_expenses
    ADD CONSTRAINT project_expenses_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_history
    ADD CONSTRAINT project_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_history
    ADD CONSTRAINT project_history_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_history
    ADD CONSTRAINT project_history_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_markdown_images
    ADD CONSTRAINT project_markdown_images_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.project_comments(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_markdown_images
    ADD CONSTRAINT project_markdown_images_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_markdown_images
    ADD CONSTRAINT project_markdown_images_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_markdown_images
    ADD CONSTRAINT project_markdown_images_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_members
    ADD CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_progress_records
    ADD CONSTRAINT project_progress_records_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_progress_records
    ADD CONSTRAINT project_progress_records_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_progress_records
    ADD CONSTRAINT project_progress_records_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_ticket_relations
    ADD CONSTRAINT project_ticket_relations_from_id_fkey FOREIGN KEY (from_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_ticket_relations
    ADD CONSTRAINT project_ticket_relations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_ticket_relations
    ADD CONSTRAINT project_ticket_relations_to_id_fkey FOREIGN KEY (to_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_ticket_statuses
    ADD CONSTRAINT project_ticket_statuses_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_ticket_types
    ADD CONSTRAINT project_ticket_types_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_tickets
    ADD CONSTRAINT project_tickets_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_tickets
    ADD CONSTRAINT project_tickets_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_tickets
    ADD CONSTRAINT project_tickets_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_tickets
    ADD CONSTRAINT project_tickets_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_tickets
    ADD CONSTRAINT project_tickets_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.project_ticket_statuses(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_tickets
    ADD CONSTRAINT project_tickets_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.project_ticket_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_time_entries
    ADD CONSTRAINT project_time_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_time_entries
    ADD CONSTRAINT project_time_entries_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_type_statuses
    ADD CONSTRAINT project_type_statuses_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_type_statuses
    ADD CONSTRAINT project_type_statuses_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.project_ticket_statuses(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_type_statuses
    ADD CONSTRAINT project_type_statuses_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.project_ticket_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_watchers
    ADD CONSTRAINT project_watchers_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.project_watchers
    ADD CONSTRAINT project_watchers_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.project_tickets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.reservable_resources
    ADD CONSTRAINT reservable_resources_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.it_assets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.reservable_resources
    ADD CONSTRAINT reservable_resources_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.resource_reservations
    ADD CONSTRAINT resource_reservations_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES public.schedule_occurrences(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.resource_reservations
    ADD CONSTRAINT resource_reservations_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.reservable_resources(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.saved_search_filters
    ADD CONSTRAINT saved_search_filters_owner_employee_id_fkey FOREIGN KEY (owner_employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.schedule_events
    ADD CONSTRAINT schedule_events_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.schedule_occurrences
    ADD CONSTRAINT schedule_occurrences_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.schedule_events(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.schedule_participants
    ADD CONSTRAINT schedule_participants_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.schedule_participants
    ADD CONSTRAINT schedule_participants_occurrence_id_fkey FOREIGN KEY (occurrence_id) REFERENCES public.schedule_occurrences(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.schedule_preferences
    ADD CONSTRAINT schedule_preferences_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.software_assignments
    ADD CONSTRAINT software_assignments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.it_assets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.software_assignments
    ADD CONSTRAINT software_assignments_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.software_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.software_assignments
    ADD CONSTRAINT software_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.software_assignments
    ADD CONSTRAINT software_assignments_key_id_fkey FOREIGN KEY (key_id) REFERENCES public.software_license_keys(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.software_change_history
    ADD CONSTRAINT software_change_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.software_contracts
    ADD CONSTRAINT software_contracts_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.software_products(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.software_installation_users
    ADD CONSTRAINT software_installation_users_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.software_installation_users
    ADD CONSTRAINT software_installation_users_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES public.software_installations(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.software_installations
    ADD CONSTRAINT software_installations_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.it_assets(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.software_installations
    ADD CONSTRAINT software_installations_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.software_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.software_license_keys
    ADD CONSTRAINT software_license_keys_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.software_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.software_license_terms
    ADD CONSTRAINT software_license_terms_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.software_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.storage
    ADD CONSTRAINT storage_branch_id_room_id_fkey FOREIGN KEY (branch_id, room_id) REFERENCES public.rooms(branch_id, id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.widget_approvals
    ADD CONSTRAINT widget_approvals_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.widget_releases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.widget_drafts
    ADD CONSTRAINT widget_drafts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.widget_instances
    ADD CONSTRAINT widget_instances_layout_id_fkey FOREIGN KEY (layout_id) REFERENCES public.widget_layouts(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.widget_instances
    ADD CONSTRAINT widget_instances_release_id_fkey FOREIGN KEY (release_id) REFERENCES public.widget_releases(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.widget_layouts
    ADD CONSTRAINT widget_layouts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.widget_records
    ADD CONSTRAINT widget_records_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.widget_instances(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.widget_releases
    ADD CONSTRAINT widget_releases_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.widget_sources(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.work_calendar_days
    ADD CONSTRAINT work_calendar_days_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.work_calendars(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workflow_actions
    ADD CONSTRAINT workflow_actions_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workflow_actions
    ADD CONSTRAINT workflow_actions_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.workflow_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workflow_attachments
    ADD CONSTRAINT workflow_attachments_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.workflow_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workflow_requests
    ADD CONSTRAINT workflow_requests_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workflow_requests
    ADD CONSTRAINT workflow_requests_template_version_id_fkey FOREIGN KEY (template_version_id) REFERENCES public.workflow_template_versions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workflow_steps
    ADD CONSTRAINT workflow_steps_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.workflow_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workflow_submission_attachments
    ADD CONSTRAINT workflow_submission_attachments_attachment_id_fkey FOREIGN KEY (attachment_id) REFERENCES public.workflow_attachments(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workflow_submission_attachments
    ADD CONSTRAINT workflow_submission_attachments_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.workflow_submissions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workflow_submissions
    ADD CONSTRAINT workflow_submissions_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.workflow_requests(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workflow_template_versions
    ADD CONSTRAINT workflow_template_versions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.workflow_templates(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workforce_change_history
    ADD CONSTRAINT workforce_change_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.workforce_change_history
    ADD CONSTRAINT workforce_change_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TRIGGER account_invitation_settings_set_updated_at BEFORE UPDATE ON public.account_invitation_settings FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER account_invitations_set_updated_at BEFORE UPDATE ON public.account_invitations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER audit_logs_set_updated_at BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER book_change_history_set_updated_at BEFORE UPDATE ON public.book_change_history FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER book_copies_set_updated_at BEFORE UPDATE ON public.book_copies FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER book_copy_batches_set_updated_at BEFORE UPDATE ON public.book_copy_batches FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER book_loans_set_updated_at BEFORE UPDATE ON public.book_loans FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER book_purchase_orders_set_updated_at BEFORE UPDATE ON public.book_purchase_orders FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER book_purchase_requests_set_updated_at BEFORE UPDATE ON public.book_purchase_requests FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER book_reservations_set_updated_at BEFORE UPDATE ON public.book_reservations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER book_titles_set_updated_at BEFORE UPDATE ON public.book_titles FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER branches_set_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER calendar_date_attributes_set_updated_at BEFORE UPDATE ON public.calendar_date_attributes FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER calendar_holiday_imports_set_updated_at BEFORE UPDATE ON public.calendar_holiday_imports FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER cpu_types_set_updated_at BEFORE UPDATE ON public.cpu_types FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_change_history_set_updated_at BEFORE UPDATE ON public.employee_change_history FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_departments_set_updated_at BEFORE UPDATE ON public.employee_departments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_groups_set_updated_at BEFORE UPDATE ON public.employee_groups FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_positions_set_updated_at BEFORE UPDATE ON public.employee_positions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_roles_set_updated_at BEFORE UPDATE ON public.employee_roles FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_settings_set_updated_at BEFORE UPDATE ON public.employee_settings FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_skills_set_updated_at BEFORE UPDATE ON public.employee_skills FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_social_links_set_updated_at BEFORE UPDATE ON public.employee_social_links FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_teams_set_updated_at BEFORE UPDATE ON public.employee_teams FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employees_set_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employment_departments_set_updated_at BEFORE UPDATE ON public.employment_departments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employment_positions_set_updated_at BEFORE UPDATE ON public.employment_positions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employment_types_set_updated_at BEFORE UPDATE ON public.employment_types FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER engagement_participations_set_updated_at BEFORE UPDATE ON public.engagement_participations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER engagements_set_updated_at BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER external_links_set_updated_at BEFORE UPDATE ON public.external_links FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER it_asset_assignments_set_updated_at BEFORE UPDATE ON public.it_asset_assignments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER it_asset_change_history_set_updated_at BEFORE UPDATE ON public.it_asset_change_history FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER it_asset_credentials_set_updated_at BEFORE UPDATE ON public.it_asset_credentials FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER it_asset_ip_addresses_set_updated_at BEFORE UPDATE ON public.it_asset_ip_addresses FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER it_asset_management_codes_set_updated_at BEFORE UPDATE ON public.it_asset_management_codes FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER it_asset_statuses_set_updated_at BEFORE UPDATE ON public.it_asset_statuses FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER it_asset_types_set_updated_at BEFORE UPDATE ON public.it_asset_types FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER it_assets_set_updated_at BEFORE UPDATE ON public.it_assets FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER manufacturers_set_updated_at BEFORE UPDATE ON public.manufacturers FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER notification_events_set_updated_at BEFORE UPDATE ON public.notification_events FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER notification_recipients_set_updated_at BEFORE UPDATE ON public.notification_recipients FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER operating_system_vendors_check_name BEFORE UPDATE OF name ON public.operating_system_vendors FOR EACH ROW EXECUTE FUNCTION public.check_operating_system_vendor_name();

CREATE TRIGGER operating_system_vendors_set_updated_at BEFORE UPDATE ON public.operating_system_vendors FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER operating_systems_check_name BEFORE INSERT OR UPDATE OF vendor_id, product, version, edition, architecture ON public.operating_systems FOR EACH ROW EXECUTE FUNCTION public.check_operating_system_name();

CREATE TRIGGER operating_systems_set_updated_at BEFORE UPDATE ON public.operating_systems FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER password_reset_tokens_set_updated_at BEFORE UPDATE ON public.password_reset_tokens FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER permission_operations_set_updated_at BEFORE UPDATE ON public.permission_operations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER permissions_identifier_immutable BEFORE UPDATE OF identifier ON public.permissions FOR EACH ROW EXECUTE FUNCTION public.prevent_permission_identifier_update();

CREATE TRIGGER permissions_set_updated_at BEFORE UPDATE ON public.permissions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER project_baseline_items_set_updated_at BEFORE UPDATE ON public.project_baseline_items FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER project_baseline_months_set_updated_at BEFORE UPDATE ON public.project_baseline_months FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER project_baselines_set_updated_at BEFORE UPDATE ON public.project_baselines FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER project_cost_rates_set_updated_at BEFORE UPDATE ON public.project_cost_rates FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER project_evm_reports_set_updated_at BEFORE UPDATE ON public.project_evm_reports FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER project_evm_settings_set_updated_at BEFORE UPDATE ON public.project_evm_settings FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER project_expenses_set_updated_at BEFORE UPDATE ON public.project_expenses FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER project_progress_records_set_updated_at BEFORE UPDATE ON public.project_progress_records FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER reservable_resources_set_updated_at BEFORE UPDATE ON public.reservable_resources FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER resource_reservations_set_updated_at BEFORE UPDATE ON public.resource_reservations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER role_permissions_set_updated_at BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER rooms_set_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER saved_search_filters_set_updated_at BEFORE UPDATE ON public.saved_search_filters FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER schedule_events_set_updated_at BEFORE UPDATE ON public.schedule_events FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER schedule_occurrences_set_updated_at BEFORE UPDATE ON public.schedule_occurrences FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER schedule_participants_set_updated_at BEFORE UPDATE ON public.schedule_participants FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER schedule_preferences_set_updated_at BEFORE UPDATE ON public.schedule_preferences FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER sessions_set_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER skills_set_updated_at BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER software_assignments_set_updated_at BEFORE UPDATE ON public.software_assignments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER software_change_history_set_updated_at BEFORE UPDATE ON public.software_change_history FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER software_contracts_set_updated_at BEFORE UPDATE ON public.software_contracts FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER software_installation_users_set_updated_at BEFORE UPDATE ON public.software_installation_users FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER software_installations_set_updated_at BEFORE UPDATE ON public.software_installations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER software_license_keys_set_updated_at BEFORE UPDATE ON public.software_license_keys FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER software_license_terms_set_updated_at BEFORE UPDATE ON public.software_license_terms FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER software_products_set_updated_at BEFORE UPDATE ON public.software_products FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER storage_set_updated_at BEFORE UPDATE ON public.storage FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER system_metric_samples_set_updated_at BEFORE UPDATE ON public.system_metric_samples FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER widget_approvals_set_updated_at BEFORE UPDATE ON public.widget_approvals FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER widget_drafts_set_updated_at BEFORE UPDATE ON public.widget_drafts FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER widget_instances_set_updated_at BEFORE UPDATE ON public.widget_instances FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER widget_layouts_set_updated_at BEFORE UPDATE ON public.widget_layouts FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER widget_records_set_updated_at BEFORE UPDATE ON public.widget_records FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER widget_releases_set_updated_at BEFORE UPDATE ON public.widget_releases FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER widget_sources_set_updated_at BEFORE UPDATE ON public.widget_sources FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER work_calendar_days_set_updated_at BEFORE UPDATE ON public.work_calendar_days FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER work_calendars_set_updated_at BEFORE UPDATE ON public.work_calendars FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER workflow_actions_set_updated_at BEFORE UPDATE ON public.workflow_actions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER workflow_attachments_set_updated_at BEFORE UPDATE ON public.workflow_attachments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER workflow_requests_set_updated_at BEFORE UPDATE ON public.workflow_requests FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER workflow_steps_set_updated_at BEFORE UPDATE ON public.workflow_steps FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER workflow_submission_attachments_set_updated_at BEFORE UPDATE ON public.workflow_submission_attachments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER workflow_submissions_set_updated_at BEFORE UPDATE ON public.workflow_submissions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER workflow_template_versions_set_updated_at BEFORE UPDATE ON public.workflow_template_versions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER workflow_templates_set_updated_at BEFORE UPDATE ON public.workflow_templates FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER workforce_change_history_set_updated_at BEFORE UPDATE ON public.workforce_change_history FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

INSERT INTO account_invitation_settings(key) VALUES ('main');
INSERT INTO widget_sources(source_key,name,url) VALUES('sph-official','SPH official','bundled:sph');
-- BEGIN official-widget-seed
INSERT INTO widget_releases(source_id,widget_code,version,definition,digest) SELECT id,'sph.calculator','1.0.1','{"author":"H.Morisaki","capabilities":[],"description":{"en":"A standard calculator with arithmetic, decimals, percentages, sign changes, C (clear all), CE (clear entry) and backspace. Supports keyboard digits, operators, Enter, Backspace, Delete and Escape. Operations execute in entry order, with results rounded to 16 significant digits. Calculations stay in the browser and reset when the page reloads.","ja":"四則演算、小数、パーセント、符号切り替え、C（すべてクリア）、CE（入力クリア）、1文字削除に対応する標準電卓です。キーボードの数字・演算子・Enter・Backspace・Delete・Escapeでも操作できます。計算は入力順に実行し、結果は有効数字16桁に丸めます。計算内容はブラウザー内だけで処理し、ページを再読み込みするとリセットされます。"},"id":"sph.calculator","license":{"name":"MIT","url":"https://github.com/HidekiMorisaki/sph/blob/main/LICENSE"},"name":{"en":"Calculator (Standard)","ja":"電卓（標準）"},"provider":"SPH Official","runtime":{"css":"*{box-sizing:border-box}\nbutton,input,select{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--sph-radius-6px,6px);min-width:0;max-width:100%}\nbutton{cursor:pointer;touch-action:manipulation}\nbutton:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--primary);outline-offset:2px}\nbutton:disabled{opacity:.35;cursor:default}\n.tool{display:grid;gap:var(--sph-space-8px,8px);min-width:0;padding:var(--sph-space-2px,2px)}\n#calculator,#programmer{height:auto;container-type:inline-size}\n#root[data-layout=\"stretch\"]>#calculator,#root[data-layout=\"stretch\"]>#programmer{height:100%}\n.expression{min-height:26px;font-size:clamp(var(--sph-type-20px,20px),4cqi,var(--sph-type-26px,26px));line-height:var(--sph-leading-1-3,1.3);color:var(--muted);text-align:right;overflow-wrap:anywhere}\n.copy{padding:0;border:0;background:transparent;text-align:right;cursor:copy;width:100%;min-height:0}\n.result{display:block;min-width:0;max-width:100%;font-size:clamp(var(--sph-type-48px,48px),10cqi,var(--sph-type-72px,72px));font-weight:var(--sph-weight-600,600);line-height:var(--sph-leading-1-15,1.15);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}\n.result-long{font-size:clamp(var(--sph-type-22px,22px),4.5cqi,var(--sph-type-40px,40px))}\n.error{font-size:var(--sph-type-20px,20px);line-height:var(--sph-leading-1-35,1.35);color:var(--danger);overflow-wrap:anywhere}\n.error:empty{display:none}\n.keys,.six{display:grid;gap:var(--sph-space-6px,6px);min-width:0;min-height:0;grid-auto-rows:minmax(44px,1fr)}\n.keys{grid-template-columns:repeat(4,minmax(0,1fr))}\n.six{grid-template-columns:repeat(6,minmax(0,1fr))}\n.keys button,.six button{min-height:44px;padding:var(--sph-space-4px,4px);white-space:nowrap;font-size:clamp(var(--sph-type-28px,28px),6cqi,var(--sph-type-40px,40px));font-weight:var(--sph-weight-500,500);line-height:var(--sph-leading-1-1,1.1)}\n.key-number{background:color-mix(in srgb,var(--surface) 94%,var(--text));font-weight:var(--sph-weight-600,600)!important}\n.key-function,.key-bit{background:color-mix(in srgb,var(--surface) 87%,var(--text))}\n.key-operator{background:color-mix(in srgb,var(--sph-color-calculator-operator,#d89326) 19%,var(--surface));color:light-dark(var(--sph-color-calculator-operator-text-light,#704514),var(--sph-color-calculator-operator-text-dark,#ffda9b));border-color:color-mix(in srgb,var(--sph-color-calculator-operator,#d89326) 48%,var(--border))}\n.key-clear{background:color-mix(in srgb,var(--danger) 10%,var(--surface));color:light-dark(var(--sph-color-calculator-clear-text-light,#9f1d2b),var(--sph-color-calculator-clear-text-dark,#ffb4b4));border-color:color-mix(in srgb,var(--danger) 35%,var(--border))}\n.keys button:hover:not(:disabled),.six button:hover:not(:disabled){box-shadow:inset 0 0 0 100vmax color-mix(in srgb,var(--text) 8%,transparent)}\n.primary,.bases [aria-pressed=\"true\"]{background:var(--action-primary-background,var(--primary-bg));color:var(--action-primary-text,var(--primary));border-color:var(--action-primary-button-border,var(--primary));font-weight:var(--sph-weight-600,600)}\n.primary:hover:not(:disabled),.bases [aria-pressed=\"true\"]:hover:not(:disabled){background:var(--action-primary-background-hover,var(--surface-secondary));filter:none}\n#calculator{grid-template-rows:auto auto auto minmax(0,1fr)}\n#expression{grid-row:1}#copy{grid-row:2}#error{grid-row:3}.keys{grid-row:4;grid-template-rows:repeat(6,minmax(44px,1fr))}\n.keys button{font-size:clamp(var(--sph-type-32px,32px),7cqi,var(--sph-type-44px,44px));min-height:56px}\n.keys .primary{grid-column:1/-1}\n","html":"<div id=\"app\" class=\"tool\"></div>\n","javascript":"const initialCalculator = () => ({ entry: ''0'', operand: null, operation: null, replace: false, operandEntered: false, repeatOperation: null, repeatOperand: null, expression: '''', error: null });\nconst power = (n) => 10n ** BigInt(n);\nfunction fraction(value) {\n    const match = /^(-?)(\\d+)(?:\\.(\\d*))?(?:e([+-]?\\d+))?$/i.exec(value);\n    if (!match)\n        throw Error(''range'');\n    const scale = (match[3]?.length ?? 0) - Number(match[4] ?? 0);\n    const n = BigInt((match[1] || '''') + match[2] + (match[3] ?? ''''));\n    return scale >= 0 ? [n, power(scale)] : [n * power(-scale), 1n];\n}\nfunction format(n, d) {\n    if (d === 0n)\n        throw Error(''zero'');\n    if (n === 0n)\n        return ''0'';\n    const negative = (n < 0n) !== (d < 0n);\n    n = n < 0n ? -n : n;\n    d = d < 0n ? -d : d;\n    let exponent = n.toString().length - d.toString().length;\n    if (exponent >= 0 ? n < d * power(exponent) : n * power(-exponent) < d)\n        exponent--;\n    if (exponent > 99 || exponent < -99)\n        throw Error(''range'');\n    const shift = 15 - exponent, top = shift >= 0 ? n * power(shift) : n, bottom = shift >= 0 ? d : d * power(-shift);\n    let rounded = (top + bottom / 2n) / bottom;\n    if (rounded.toString().length > 16) {\n        rounded /= 10n;\n        exponent++;\n    }\n    if (exponent > 99)\n        throw Error(''range'');\n    const digits = rounded.toString().padStart(16, ''0'');\n    let result;\n    if (exponent >= 16 || exponent < -8) {\n        const tail = digits.slice(1).replace(/0+$/, '''');\n        result = digits[0] + (tail ? ''.'' + tail : '''') + ''e'' + (exponent >= 0 ? ''+'' : '''') + exponent;\n    }\n    else {\n        const point = exponent + 1;\n        result = point <= 0 ? ''0.'' + ''0''.repeat(-point) + digits : point >= digits.length ? digits + ''0''.repeat(point - digits.length) : digits.slice(0, point) + ''.'' + digits.slice(point);\n        if (result.includes(''.''))\n            result = result.replace(/0+$/, '''').replace(/\\.$/, '''');\n    }\n    return (negative ? ''-'' : '''') + result;\n}\nfunction calculatorValue(a, b, operation) {\n    const [an, ad] = fraction(a), [bn, bd] = fraction(b);\n    if (operation === ''+'')\n        return format(an * bd + bn * ad, ad * bd);\n    if (operation === ''-'')\n        return format(an * bd - bn * ad, ad * bd);\n    if (operation === ''*'')\n        return format(an * bn, ad * bd);\n    return format(an * bd, ad * bn);\n}\nfunction calculatorInput(previous, key) {\n    if (key === ''C'')\n        return initialCalculator();\n    let state = { ...previous };\n    if (state.error) {\n        if (/^\\d$|^\\.$|^CE$/.test(key))\n            state = initialCalculator();\n        else\n            return state;\n    }\n    try {\n        if (/^\\d$/.test(key) || key === ''.'') {\n            if (state.replace) {\n                state.entry = ''0'';\n                state.replace = false;\n                if (!state.operation)\n                    state.expression = '''';\n            }\n            if (key === ''.'') {\n                if (!state.entry.includes(''.'') && !state.entry.includes(''e''))\n                    state.entry += ''.'';\n            }\n            else if (state.entry.replace(/[-.]/g, '''').length < 16)\n                state.entry = state.entry === ''0'' ? key : state.entry === ''-0'' ? ''-'' + key : state.entry + key;\n            state.operandEntered = true;\n            state.repeatOperation = null;\n            state.repeatOperand = null;\n            return state;\n        }\n        if (key === ''CE'') {\n            state.entry = ''0'';\n            state.replace = false;\n            state.operandEntered = true;\n            state.repeatOperation = null;\n            state.repeatOperand = null;\n            if (!state.operation)\n                state.expression = '''';\n            return state;\n        }\n        if (key === ''Backspace'') {\n            if (!state.replace && !state.entry.includes(''e'')) {\n                state.entry = state.entry.slice(0, -1);\n                if (!state.entry || state.entry === ''-'')\n                    state.entry = ''0'';\n            }\n            return state;\n        }\n        if (key === ''sign'') {\n            if (state.entry !== ''0'')\n                state.entry = state.entry.startsWith(''-'') ? state.entry.slice(1) : ''-'' + state.entry;\n            state.replace = false;\n            state.operandEntered = true;\n            return state;\n        }\n        if (key === ''%'') {\n            let percent = calculatorValue(state.entry, ''100'', ''/'');\n            if (state.operand !== null && (state.operation === ''+'' || state.operation === ''-''))\n                percent = calculatorValue(state.operand, percent, ''*'');\n            state.entry = percent;\n            state.replace = true;\n            state.operandEntered = true;\n            return state;\n        }\n        if ([''+'', ''-'', ''*'', ''/''].includes(key)) {\n            if (state.operand !== null && state.operation && state.operandEntered)\n                state.entry = calculatorValue(state.operand, state.entry, state.operation);\n            state.operand = state.entry;\n            state.operation = key;\n            state.replace = true;\n            state.operandEntered = false;\n            state.repeatOperation = null;\n            state.repeatOperand = null;\n            state.expression = state.entry + '' '' + key;\n            return state;\n        }\n        if (key === ''='') {\n            const operation = state.operation ?? state.repeatOperation, operand = state.operation ? state.entry : state.repeatOperand;\n            if (operation && operand !== null) {\n                const first = state.operand ?? state.entry;\n                state.entry = calculatorValue(first, operand, operation);\n                state.expression = first + '' '' + operation + '' '' + operand + '' ='';\n                state.repeatOperation = operation;\n                state.repeatOperand = operand;\n            }\n            state.operand = null;\n            state.operation = null;\n            state.replace = true;\n            return state;\n        }\n        return state;\n    }\n    catch (error) {\n        return { ...initialCalculator(), error: error instanceof Error && error.message === ''zero'' ? ''zero'' : ''range'' };\n    }\n}\n\nsph.ready(context=>{\n let state=initialCalculator(),lang=context.language;\n const keys=[[''%'',''%''],[''CE'',''CE''],[''C'',''C''],[''Backspace'',''⌫''],[''7'',''7''],[''8'',''8''],[''9'',''9''],[''/'',''÷''],[''4'',''4''],[''5'',''5''],[''6'',''6''],[''*'',''×''],[''1'',''1''],[''2'',''2''],[''3'',''3''],[''-'',''−''],[''sign'',''±''],[''0'',''0''],[''.'',''.''],[''+'',''+''],[''='',''='']];\n const keyClass=key=>key===''=''?''primary'':/^[0-9.]$/.test(key)?''key-number'':[''+'',''-'',''*'',''/''].includes(key)?''key-operator'':[''C'',''CE'',''Backspace''].includes(key)?''key-clear'':''key-function'';\n function draw(){sph.ui.patch([{id:''expression'',text:state.expression.replaceAll(''*'',''×'').replaceAll(''/'',''÷'')},{id:''result'',text:state.error?''—'':state.entry},{id:''result'',attribute:''class'',attributeValue:''result''+(state.entry.length>10?'' result-long'':'''')},{id:''error'',text:state.error?(lang===''ja''?(state.error===''zero''?''0で割ることはできません。'':''計算結果が範囲外です。''):(state.error===''zero''?''Cannot divide by zero.'':''Result is out of range.'')):''''}]);}\n function press(key){state=calculatorInput(state,key);draw();}\n sph.ui.html(''<div id=\"calculator\" class=\"tool\" role=\"group\" tabindex=\"0\" aria-label=\"Calculator\"><div id=\"expression\" class=\"expression\"></div><button id=\"copy\" class=\"copy\" data-copy=\"result\" aria-label=\"Copy result\"><output id=\"result\" class=\"result\">0</output></button><small id=\"error\" class=\"error\" role=\"alert\"></small><div class=\"keys\">''+keys.map(([key,label],i)=>''<button id=\"key''+i+''\" data-calc-key=\"''+key+''\" class=\"''+keyClass(key)+''\">''+label+''</button>'').join('''')+''</div></div>'');\n keys.forEach(([key],i)=>sph.ui.on(''key''+i,''click'',()=>press(key)));\n const keyboard=[''0'',''1'',''2'',''3'',''4'',''5'',''6'',''7'',''8'',''9'',''.'',''+'',''-'',''*'',''/'',''%'',''Enter'',''Backspace'',''Delete'',''Escape''];\n sph.ui.on(''calculator'',''keydown'',e=>press(({Enter:''='',Delete:''CE'',Escape:''C''})[e.key]??e.key),keyboard);draw();\n sph.ui.on(''$context'',''change'',c=>{lang=c.language;draw();});\n});\n","sdkVersion":1},"schemaVersion":2,"settings":{},"sizeLayouts":{"2x1":{"columns":1,"rows":2},"2x2":{"columns":2,"rows":2},"3x2":{"columns":2,"rows":3}},"sizes":["2x1","2x2","3x2"],"version":"1.0.1","view":[{"type":"runtime"}]}'::jsonb,'19012bc6a529de41c869439846bd9df5b9e684b5e9d0508d58b4c944c94e6e9d' FROM widget_sources WHERE source_key='sph-official';
INSERT INTO widget_releases(source_id,widget_code,version,definition,digest) SELECT id,'sph.personal_note','1.0.1','{"author":"H.Morisaki","capabilities":[],"configuration":{"fields":{"title":{"default":"","label":{"en":"Title (optional)","ja":"タイトル（任意）"},"maxLength":40,"type":"string"}},"listFields":["title"],"operations":{"create":false,"delete":false,"update":false},"titleField":"title"},"description":{"en":"A private plain-text note. Edit and save up to 5,000 characters in settings. Open details to read longer notes. HTML and scripts are never executed.","ja":"本人専用のプレーンテキストメモです。設定画面で最大5,000文字を入力して保存します。長文は詳細画面で確認できます。HTMLやスクリプトは実行しません。"},"id":"sph.personal_note","license":{"name":"MIT","url":"https://github.com/HidekiMorisaki/sph/blob/main/LICENSE"},"name":{"en":"Note","ja":"メモ"},"provider":"SPH Official","runtime":{"css":"*{box-sizing:border-box}\nbutton,input{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--sph-radius-6px,6px);min-width:0;max-width:100%}\nbutton{min-height:44px;padding:var(--sph-space-6px,6px) var(--sph-space-10px,10px);font-size:var(--sph-type-24px,24px);line-height:var(--sph-leading-1-25,1.25);cursor:pointer}\nbutton:hover{background:var(--surface-secondary)}\nbutton:focus-visible,input:focus-visible{outline:2px solid var(--primary);outline-offset:2px}\nbutton:disabled{opacity:.45;cursor:default}\n.tool{padding:var(--sph-space-2px,2px);display:grid;gap:var(--sph-space-6px,6px);min-width:0;container-type:inline-size}\n.primary{background:var(--action-primary-background,var(--primary-bg));color:var(--action-primary-text,var(--primary));border-color:var(--action-primary-button-border,var(--primary))}\n.primary:hover{background:var(--action-primary-background-hover,var(--surface-secondary))}\n.hidden{display:none}\n.summary,.full{font-size:var(--sph-type-26px,26px);line-height:var(--sph-leading-1-5,1.5);white-space:pre-wrap;overflow-wrap:anywhere;margin:0;min-width:0}\n.note-layout{height:320px;grid-template-rows:minmax(0,1fr)}\n#root[data-layout=\"stretch\"]>.note-layout{height:100%}\n.note-layout.truncated{grid-template-rows:minmax(0,1fr) auto}\n.summary{min-height:0;overflow:hidden}\n.empty{display:flex;align-items:center;justify-content:center;min-height:0;margin:0;padding:var(--sph-space-16px,16px);border:1px dashed var(--border);border-radius:var(--sph-radius-6px,6px);color:var(--muted);font-size:var(--sph-type-22px,22px);line-height:var(--sph-leading-1-5,1.5);text-align:center;overflow-wrap:anywhere}\n","html":"<div id=\"app\" class=\"tool\"></div>\n","javascript":"\nsph.ready(async context=>{\n let record;try{record=await sph.records.get(''default'');}catch{record={values:{note:''''}};}\n let renderId=0;\n async function render(){\n  const current=++renderId,text=String(record.values.note??''''),empty=!text.trim(),ja=context.language===''ja'';\n  sph.ui.html(''<div id=\"note-layout\" class=\"tool note-layout\"><p id=\"note\" class=\"''+(empty?''empty'':context.expanded?''full'':''summary'')+''\"></p><button id=\"expand\" class=\"hidden\">''+(ja?''全文を表示'':''Read full note'')+''</button></div>'');\n  sph.ui.patch([{id:''note'',text:empty?(ja?''設定アイコンからメモを入力して保存できます。'':''Write and save a note in settings.''):text}]);\n  sph.ui.on(''expand'',''click'',()=>sph.expand(''<p class=\"full\">''+text.replaceAll(''&'',''&amp;'').replaceAll(''<'',''&lt;'').replaceAll(''>'',''&gt;'')+''</p>''));\n  if(empty||context.expanded)return;\n  // Measure with the button hidden so the entire card body is available first.\n  const bounds=await sph.ui.measure(''note'');if(current!==renderId)return;\n  if(bounds.scrollHeight>bounds.clientHeight+1)sph.ui.patch([{id:''note-layout'',attribute:''class'',attributeValue:''tool note-layout truncated''},{id:''expand'',attribute:''class'',attributeValue:''''}]);\n }\n await render();sph.ui.on(''$context'',''change'',c=>{context=c;render();});\n});\n","sdkVersion":1},"schemaVersion":2,"settings":{},"sizeLayouts":{"1x2":{"columns":2,"rows":1},"2x2":{"columns":2,"rows":2}},"sizes":["2x2","1x2"],"storage":{"fields":{"note":{"default":"","label":{"en":"Note","ja":"本文"},"maxLength":5000,"type":"text"}},"initialRecords":[{"recordKey":"default","values":{"note":""}}],"listFields":["note"],"maxRecords":1,"operations":{"create":false,"delete":false,"update":true},"titleField":"note"},"version":"1.0.1","view":[{"type":"runtime"}]}'::jsonb,'73d20ccff6f4b4433e191fe77fdda4c623d7cdfd7423fe80c5f84be6266e8407' FROM widget_sources WHERE source_key='sph-official';
INSERT INTO widget_releases(source_id,widget_code,version,definition,digest) SELECT id,'sph.programmer_calculator','1.0.1','{"author":"H.Morisaki","capabilities":[],"description":{"en":"Converts between HEX, DEC, OCT and BIN, with 8-, 16-, 32- and 64-bit signed or unsigned integer arithmetic. Supports entry-order arithmetic, remainder, AND, OR, XOR, NOT and shifts. Overflow wraps to the selected word width; right shift fills with zeroes. Shift counts must be at least zero and less than the word width. Division truncates toward zero; remainder follows the left operand sign. Changing word width or signed mode clears pending operations. Widening signed negative values sign-extends them. Calculations stay in browser memory and reset on reload.","ja":"HEX・DEC・OCT・BINの相互変換、8・16・32・64ビット、符号付き／符号なしの整数演算に対応します。四則演算、剰余、AND・OR・XOR・NOT、左右シフトを入力順に実行します。桁あふれは選択幅の下位ビットに折り返し、右シフトはゼロ埋めです。シフト数は0以上、ビット幅未満とします。割り算は小数部を切り捨て（0方向）、剰余は左の値の符号に従います。ビット幅や符号モードの変更は計算途中をクリアします。ビット幅を広げる際、符号付きの負数は符号拡張します。計算内容はブラウザー内だけで処理し、再読み込みでリセットします。"},"id":"sph.programmer_calculator","license":{"name":"MIT","url":"https://github.com/HidekiMorisaki/sph/blob/main/LICENSE"},"name":{"en":"Calculator (Programmer)","ja":"電卓（プログラマー）"},"provider":"SPH Official","runtime":{"css":"*{box-sizing:border-box}\nbutton,input,select{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--sph-radius-6px,6px);min-width:0;max-width:100%}\nbutton{cursor:pointer;touch-action:manipulation}\nbutton:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--primary);outline-offset:2px}\nbutton:disabled{opacity:.35;cursor:default}\n.tool{display:grid;gap:var(--sph-space-8px,8px);min-width:0;padding:var(--sph-space-2px,2px)}\n#calculator,#programmer{height:auto;container-type:inline-size}\n#root[data-layout=\"stretch\"]>#calculator,#root[data-layout=\"stretch\"]>#programmer{height:100%}\n.expression{min-height:26px;font-size:clamp(var(--sph-type-20px,20px),4cqi,var(--sph-type-26px,26px));line-height:var(--sph-leading-1-3,1.3);color:var(--muted);text-align:right;overflow-wrap:anywhere}\n.copy{padding:0;border:0;background:transparent;text-align:right;cursor:copy;width:100%;min-height:0}\n.result{display:block;min-width:0;max-width:100%;font-size:clamp(var(--sph-type-48px,48px),10cqi,var(--sph-type-72px,72px));font-weight:var(--sph-weight-600,600);line-height:var(--sph-leading-1-15,1.15);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}\n.result-long{font-size:clamp(var(--sph-type-22px,22px),4.5cqi,var(--sph-type-40px,40px))}\n.error{font-size:var(--sph-type-20px,20px);line-height:var(--sph-leading-1-35,1.35);color:var(--danger);overflow-wrap:anywhere}\n.error:empty{display:none}\n.keys,.six{display:grid;gap:var(--sph-space-6px,6px);min-width:0;min-height:0;grid-auto-rows:minmax(44px,1fr)}\n.keys{grid-template-columns:repeat(4,minmax(0,1fr))}\n.six{grid-template-columns:repeat(6,minmax(0,1fr))}\n.keys button,.six button{min-height:44px;padding:var(--sph-space-4px,4px);white-space:nowrap;font-size:clamp(var(--sph-type-28px,28px),6cqi,var(--sph-type-40px,40px));font-weight:var(--sph-weight-500,500);line-height:var(--sph-leading-1-1,1.1)}\n.key-number{background:color-mix(in srgb,var(--surface) 94%,var(--text));font-weight:var(--sph-weight-600,600)!important}\n.key-function,.key-bit{background:color-mix(in srgb,var(--surface) 87%,var(--text))}\n.key-operator{background:color-mix(in srgb,var(--sph-color-calculator-operator,#d89326) 19%,var(--surface));color:light-dark(var(--sph-color-calculator-operator-text-light,#704514),var(--sph-color-calculator-operator-text-dark,#ffda9b));border-color:color-mix(in srgb,var(--sph-color-calculator-operator,#d89326) 48%,var(--border))}\n.key-clear{background:color-mix(in srgb,var(--danger) 10%,var(--surface));color:light-dark(var(--sph-color-calculator-clear-text-light,#9f1d2b),var(--sph-color-calculator-clear-text-dark,#ffb4b4));border-color:color-mix(in srgb,var(--danger) 35%,var(--border))}\n.keys button:hover:not(:disabled),.six button:hover:not(:disabled){box-shadow:inset 0 0 0 100vmax color-mix(in srgb,var(--text) 8%,transparent)}\n.primary,.bases [aria-pressed=\"true\"]{background:var(--action-primary-background,var(--primary-bg));color:var(--action-primary-text,var(--primary));border-color:var(--action-primary-button-border,var(--primary));font-weight:var(--sph-weight-600,600)}\n.primary:hover:not(:disabled),.bases [aria-pressed=\"true\"]:hover:not(:disabled){background:var(--action-primary-background-hover,var(--surface-secondary));filter:none}\n#programmer{grid-template-rows:auto auto auto auto auto auto minmax(88px,2fr) minmax(244px,5fr)}\n.bases{grid-row:1;grid-template-columns:repeat(4,minmax(0,1fr))}\n.bases button{font-size:clamp(var(--sph-type-20px,20px),4cqi,var(--sph-type-26px,26px));background:var(--surface-secondary)}\n.word{grid-row:2;display:flex;gap:var(--sph-space-12px,12px);align-items:center;flex-wrap:wrap;font-size:var(--sph-type-20px,20px);line-height:var(--sph-leading-1-3,1.3)}\n.word label{display:flex;gap:var(--sph-space-6px,6px);align-items:center}\n.word select{min-height:44px;padding:var(--sph-space-4px,4px);font-size:var(--sph-type-20px,20px)}\n.word input{width:22px;height:22px;accent-color:var(--primary)}\n.conversions{grid-row:3;display:grid;gap:var(--sph-space-3px,3px)}\n.conversions>div{display:grid;grid-template-columns:52px minmax(0,1fr);gap:var(--sph-space-8px,8px);align-items:baseline}\n.conversions small{font-size:var(--sph-type-18px,18px);color:var(--muted)}\n.conversions output{font-size:clamp(var(--sph-type-20px,20px),3cqi,var(--sph-type-26px,26px));line-height:var(--sph-leading-1-2,1.2);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}\n#expression{grid-row:4}#copy{grid-row:5}#error{grid-row:6}.bit-keys{grid-row:7}.keys{grid-row:8}\n.bit-keys button{font-size:clamp(var(--sph-type-16px,16px),3.7cqi,var(--sph-type-28px,28px))}\n.bases [aria-pressed=\"true\"]{background:var(--action-primary-background,var(--primary-bg))}\n#programmer.short{gap:var(--sph-space-4px,4px);grid-template-rows:auto auto auto auto auto auto minmax(68px,2fr) minmax(176px,5fr)}\n.short .keys,.short .six{gap:var(--sph-space-4px,4px);grid-auto-rows:minmax(32px,1fr)}\n.short .keys button,.short .six button{min-height:32px;padding:var(--sph-space-2px,2px);font-size:clamp(var(--sph-type-24px,24px),4cqi,var(--sph-type-30px,30px))}\n.short .bases button{font-size:var(--sph-type-18px,18px)}\n.short .bit-keys button{font-size:clamp(var(--sph-type-16px,16px),3cqi,var(--sph-type-22px,22px))}\n.short .word{font-size:var(--sph-type-18px,18px);gap:var(--sph-space-8px,8px)}\n.short .word select{min-height:32px;font-size:var(--sph-type-18px,18px);padding:var(--sph-space-2px,2px)}\n.short .conversions{gap:var(--sph-space-2px,2px)}\n.short .conversions small{font-size:var(--sph-type-16px,16px)}\n.short .conversions output{font-size:var(--sph-type-18px,18px);line-height:var(--sph-leading-1-2,1.2)}\n.short .expression{min-height:20px;font-size:var(--sph-type-20px,20px)}\n.short .result{font-size:clamp(var(--sph-type-36px,36px),7cqi,var(--sph-type-48px,48px))}\n.short .result-long{font-size:clamp(var(--sph-type-20px,20px),4cqi,var(--sph-type-28px,28px))}\n","html":"<div id=\"app\" class=\"tool\"></div>\n","javascript":"const initialProgrammer = () => ({ value: 0n, base: 10, bits: 64, signed: true, left: null, operation: null, replace: false, entered: false, repeat: null, repeatValue: null, last: null, error: null });\nconst integer = (value, bits, signed) => signed ? BigInt.asIntN(bits, value) : BigInt.asUintN(bits, value);\nconst programmerFormat = (value, base, bits, signed) => (base === 10 ? integer(value, bits, signed) : BigInt.asUintN(bits, value)).toString(base).toUpperCase();\nconst programmerDisplay = (state) => programmerFormat(state.value, state.base, state.bits, state.signed);\nfunction programmerValue(left, right, operation, bits, signed) {\n    const a = integer(left, bits, signed), b = integer(right, bits, signed);\n    let result;\n    switch (operation) {\n        case ''+'':\n            result = a + b;\n            break;\n        case ''-'':\n            result = a - b;\n            break;\n        case ''*'':\n            result = a * b;\n            break;\n        case ''/'':\n            if (b === 0n)\n                throw Error(''zero'');\n            result = a / b;\n            break;\n        case ''mod'':\n            if (b === 0n)\n                throw Error(''zero'');\n            result = a % b;\n            break;\n        case ''and'':\n            result = left & right;\n            break;\n        case ''or'':\n            result = left | right;\n            break;\n        case ''xor'':\n            result = left ^ right;\n            break;\n        case ''shl'':\n        case ''shr'':\n            if (right < 0n || right >= BigInt(bits))\n                throw Error(''shift'');\n            result = operation === ''shl'' ? BigInt.asUintN(bits, left) << right : BigInt.asUintN(bits, left) >> right;\n            break;\n    }\n    return BigInt.asUintN(bits, result);\n}\nfunction programmerConfigure(state, change) {\n    if (change.base !== undefined && ![2, 8, 10, 16].includes(change.base) || change.bits !== undefined && ![8, 16, 32, 64].includes(change.bits))\n        return state;\n    let result = { ...state, ...change };\n    if (change.bits !== undefined || change.signed !== undefined) {\n        result = { ...initialProgrammer(), base: result.base, bits: result.bits, signed: result.signed, value: BigInt.asUintN(result.bits, integer(state.value, state.bits, state.signed)) };\n    }\n    return result;\n}\nconst read = (text, base) => BigInt(base === 10 ? text : (base === 16 ? ''0x'' : base === 8 ? ''0o'' : ''0b'') + text);\nfunction programmerInput(previous, key) {\n    const reset = () => ({ ...initialProgrammer(), base: previous.base, bits: previous.bits, signed: previous.signed });\n    if (key === ''clear'')\n        return reset();\n    let state = { ...previous };\n    if (state.error) {\n        if (/^[0-9A-F]$/.test(key) || key === ''ce'')\n            state = reset();\n        else\n            return state;\n    }\n    try {\n        if (/^[0-9A-F]$/.test(key)) {\n            const digit = parseInt(key, 16);\n            if (digit >= state.base)\n                return state;\n            const current = state.replace ? 0n : state.base === 10 ? integer(state.value, state.bits, state.signed) : state.value;\n            const next = current < 0n ? current * BigInt(state.base) - BigInt(digit) : current * BigInt(state.base) + BigInt(digit);\n            const max = state.base === 10 && state.signed ? (1n << BigInt(state.bits - 1)) - 1n : (1n << BigInt(state.bits)) - 1n;\n            const min = state.base === 10 && state.signed ? -(1n << BigInt(state.bits - 1)) : 0n;\n            if (next < min || next > max)\n                return state;\n            state.value = BigInt.asUintN(state.bits, next);\n            state.replace = false;\n            state.entered = true;\n            state.repeat = null;\n            state.repeatValue = null;\n            state.last = null;\n            return state;\n        }\n        if (key === ''ce'') {\n            state.value = 0n;\n            state.replace = false;\n            state.entered = true;\n            state.repeat = null;\n            state.repeatValue = null;\n            state.last = null;\n            return state;\n        }\n        if (key === ''back'') {\n            if (!state.replace) {\n                const text = programmerDisplay(state).slice(0, -1);\n                state.value = BigInt.asUintN(state.bits, read(!text || text === ''-'' ? ''0'' : text, state.base));\n            }\n            return state;\n        }\n        if (key === ''not'' || key === ''sign'') {\n            state.value = BigInt.asUintN(state.bits, key === ''not'' ? ~state.value : -state.value);\n            state.replace = key === ''not'';\n            state.entered = true;\n            return state;\n        }\n        if ([''+'', ''-'', ''*'', ''/'', ''mod'', ''and'', ''or'', ''xor'', ''shl'', ''shr''].includes(key)) {\n            if (state.left !== null && state.operation && state.entered)\n                state.value = programmerValue(state.left, state.value, state.operation, state.bits, state.signed);\n            state.left = state.value;\n            state.operation = key;\n            state.replace = true;\n            state.entered = false;\n            state.repeat = null;\n            state.repeatValue = null;\n            state.last = null;\n            return state;\n        }\n        if (key === ''='') {\n            const operation = state.operation ?? state.repeat, right = state.operation ? state.value : state.repeatValue;\n            if (operation && right !== null) {\n                const left = state.left ?? state.value;\n                state.value = programmerValue(left, right, operation, state.bits, state.signed);\n                state.last = { left, right, operation };\n                state.repeat = operation;\n                state.repeatValue = right;\n            }\n            state.left = null;\n            state.operation = null;\n            state.replace = true;\n            return state;\n        }\n        return state;\n    }\n    catch (error) {\n        return { ...reset(), error: error instanceof Error && error.message === ''shift'' ? ''shift'' : ''zero'' };\n    }\n}\n\nsph.ready(context=>{\n let state=initialProgrammer(),lang=context.language;\n const ops=[[''and'',''AND''],[''or'',''OR''],[''xor'',''XOR''],[''not'',''NOT''],[''shl'',''Lsh''],[''shr'',''Rsh'']],digits=[[''clear'',''C''],[''ce'',''CE''],[''back'',''⌫''],[''mod'',''mod''],...[''7'',''8'',''9'',''/'',''4'',''5'',''6'',''*'',''1'',''2'',''3'',''-'',''sign'',''0'',''='',''+''].map(k=>[k,k===''sign''?''±'':k===''*''?''×'':k===''/''?''÷'':k])],keys=[...ops,...[''A'',''B'',''C'',''D'',''E'',''F''].map(k=>[k,k]),...digits];\n const keyClass=key=>key===''=''?''primary'':/^[0-9A-F]$/.test(key)?''key-number'':[''+'',''-'',''*'',''/'',''mod''].includes(key)?''key-operator'':[''clear'',''ce'',''back''].includes(key)?''key-clear'':ops.some(([k])=>k===key)?''key-bit'':''key-function'';\n function draw(){sph.ui.patch([{id:''programmer'',attribute:''class'',attributeValue:context.size===''2x2''?''tool short'':''tool''},{id:''result'',text:state.error?''—'':programmerDisplay(state)},{id:''result'',attribute:''class'',attributeValue:''result''+(programmerDisplay(state).length>10?'' result-long'':'''')},{id:''expression'',text:state.operation?programmerFormat(state.left??0n,state.base,state.bits,state.signed)+'' ''+state.operation:state.last?programmerFormat(state.last.left,state.base,state.bits,state.signed)+'' ''+state.last.operation+'' ''+programmerFormat(state.last.right,state.base,state.bits,state.signed)+'' ='':''''},{id:''bits-label'',text:lang===''ja''?''ビット幅'':''Word size''},{id:''signed-label'',text:lang===''ja''?''符号付き'':''Signed''},{id:''error'',text:state.error?(lang===''ja''?(state.error===''zero''?''0で割ることはできません。'':''シフト数は0以上、ビット幅未満を指定してください。''):(state.error===''zero''?''Cannot divide by zero.'':''Shift count must be smaller than word size.'')):''''},...[16,10,8,2].map(base=>({id:''conversion''+base,text:programmerFormat(state.value,base,state.bits,state.signed)})),...keys.filter(([k])=>/^[0-9A-F]$/.test(k)).map(([k])=>({id:''key''+keys.findIndex(([a])=>a===k),attribute:''disabled'',attributeValue:parseInt(k,16)>=state.base?'''':null})),...[16,10,8,2].map(base=>({id:''base''+base,attribute:''aria-pressed'',attributeValue:String(base===state.base)}))]);}\n function press(k){state=programmerInput(state,k);draw();}\n sph.ui.html(''<div id=\"programmer\" class=\"tool\" role=\"group\" tabindex=\"0\"><div class=\"six bases\">''+[16,10,8,2].map((base,i)=>''<button id=\"base''+base+''\" data-prog-base=\"''+base+''\">''+[''HEX'',''DEC'',''OCT'',''BIN''][i]+''</button>'').join('''')+''</div><div class=\"word\"><label><span id=\"bits-label\">Bits</span><select id=\"bits\">''+[8,16,32,64].map(n=>''<option value=\"''+n+''\" ''+(n===64?''selected'':'''')+''>''+n+'' bit</option>'').join('''')+''</select></label><label><input id=\"signed\" type=\"checkbox\" checked> <span id=\"signed-label\">Signed</span></label></div><div class=\"conversions\">''+[16,10,8,2].map((base,i)=>''<div><small>''+[''HEX'',''DEC'',''OCT'',''BIN''][i]+''</small><output id=\"conversion''+base+''\"></output></div>'').join('''')+''</div><div id=\"expression\" class=\"expression\"></div><button id=\"copy\" class=\"copy\" data-copy=\"result\" aria-label=\"Copy result\"><output id=\"result\" class=\"result\">0</output></button><small id=\"error\" role=\"alert\" class=\"error\"></small><div class=\"six bit-keys\">''+keys.slice(0,12).map(([k,label],i)=>''<button id=\"key''+i+''\" data-prog-key=\"''+k+''\" class=\"''+keyClass(k)+''\">''+label+''</button>'').join('''')+''</div><div class=\"keys\">''+keys.slice(12).map(([k,label],i)=>''<button id=\"key''+(i+12)+''\" data-prog-key=\"''+k+''\" class=\"''+keyClass(k)+''\">''+label+''</button>'').join('''')+''</div></div>'');\n keys.forEach(([k],i)=>sph.ui.on(''key''+i,''click'',()=>press(k)));[16,10,8,2].forEach(base=>sph.ui.on(''base''+base,''click'',()=>{state=programmerConfigure(state,{base});draw();}));\n sph.ui.on(''bits'',''change'',e=>{state=programmerConfigure(state,{bits:Number(e.value)});draw();});sph.ui.on(''signed'',''change'',e=>{state=programmerConfigure(state,{signed:e.checked});draw();});\n sph.ui.on(''programmer'',''keydown'',e=>press(({Enter:''='',Escape:''clear'',Delete:''ce'',Backspace:''back'',''&'':''and'',''|'':''or'',''^'':''xor'',''~'':''not'',''<'':''shl'',''>'':''shr'',''%'':''mod''})[e.key]??e.key.toUpperCase()),[...''0123456789abcdefABCDEF'',''+'',''-'',''*'',''/'',''Enter'',''Escape'',''Delete'',''Backspace'',''&'',''|'',''^'',''~'',''<'',''>'',''%'']);draw();\n sph.ui.on(''$context'',''change'',c=>{context=c;lang=c.language;draw();});\n});\n","sdkVersion":1},"schemaVersion":2,"settings":{},"sizeLayouts":{"2x2":{"columns":2,"rows":2},"3x2":{"columns":2,"rows":3},"3x3":{"columns":3,"rows":3},"3x4":{"columns":4,"rows":3}},"sizes":["3x2","3x3","3x4","2x2"],"version":"1.0.1","view":[{"type":"runtime"}]}'::jsonb,'9d446084f89886d66c1cc5ca9badbcf7350c82bc239d8dfa42f7ed0a500b9a30' FROM widget_sources WHERE source_key='sph-official';
INSERT INTO widget_releases(source_id,widget_code,version,definition,digest) SELECT id,'sph.stopwatch','1.0.1','{"author":"H.Morisaki","capabilities":[],"description":{"en":"A stopwatch with start, pause, resume, reset and up to 100 laps. Open the full list when laps do not fit the card. Timing and laps reset on reload.","ja":"開始・一時停止・再開・リセットと最大100件のラップ計測ができます。ラップがカードに収まらない場合は全文画面で確認できます。計測とラップは再読込するとリセットされます。"},"id":"sph.stopwatch","license":{"name":"MIT","url":"https://github.com/HidekiMorisaki/sph/blob/main/LICENSE"},"name":{"en":"Stopwatch","ja":"ストップウォッチ"},"provider":"SPH Official","runtime":{"css":"*{box-sizing:border-box}\nbutton,input{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--sph-radius-6px,6px);min-width:0;max-width:100%}\nbutton{min-height:44px;padding:var(--sph-space-6px,6px) var(--sph-space-10px,10px);font-size:var(--sph-type-24px,24px);line-height:var(--sph-leading-1-25,1.25);cursor:pointer}\nbutton:hover{background:var(--surface-secondary)}\nbutton:focus-visible,input:focus-visible{outline:2px solid var(--primary);outline-offset:2px}\nbutton:disabled{opacity:.45;cursor:default}\n.tool{position:relative;height:320px;padding:var(--sph-space-2px,2px);display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:var(--sph-space-6px,6px);min-width:0;container-type:inline-size}\n#root[data-layout=\"stretch\"]>.tool{position:relative;height:100%}\n.primary{background:var(--action-primary-background,var(--primary-bg));color:var(--action-primary-text,var(--primary));border-color:var(--action-primary-button-border,var(--primary))}\n.primary:hover{background:var(--action-primary-background-hover,var(--surface-secondary))}\n.hidden{display:none}\nlabel{display:grid;gap:var(--sph-space-4px,4px);font-size:var(--sph-type-20px,20px);line-height:var(--sph-leading-1-2,1.2)}\n.duration{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sph-space-8px,8px);min-width:0}\n.duration input{width:100%;min-height:40px;padding:var(--sph-space-2px,2px) var(--sph-space-6px,6px);font-size:var(--sph-type-26px,26px);line-height:var(--sph-leading-1-2,1.2)}\n.time{display:block;text-align:center;font-size:clamp(var(--sph-type-48px,48px),8cqi,var(--sph-type-64px,64px));line-height:var(--sph-leading-1-1,1.1);white-space:nowrap;font-variant-numeric:tabular-nums}\n.actions{display:flex;flex-wrap:wrap;justify-content:center;gap:var(--sph-space-8px,8px)}\n#hint{font-size:var(--sph-type-22px,22px);line-height:var(--sph-leading-1-25,1.25);color:var(--muted);overflow-wrap:anywhere}\n.laps{display:grid;grid-template-columns:repeat(3,max-content);justify-content:space-evenly;align-content:start;column-gap:0;row-gap:var(--sph-space-8px,8px);container-type:inline-size;--lap-space:calc(var(--widget-compact-body-font,16px)/2);min-height:0;border:1px dashed var(--border);border-radius:var(--sph-radius-6px,6px);padding:var(--sph-space-10px,10px) 0;white-space:pre-wrap;overflow:hidden;overflow-wrap:anywhere;font-family:inherit;font-size:var(--sph-type-22px,22px);line-height:var(--sph-leading-1-5,1.5);font-variant-numeric:tabular-nums;margin:var(--sph-space-10px,10px) 0 0}\n.laps.full{overflow:visible;margin:0}\n.laps.empty{display:flex;align-items:center;justify-content:center;padding:var(--sph-space-16px,16px);color:var(--muted);text-align:center;white-space:normal}\n.time{font-size:clamp(var(--sph-type-40px,40px),8cqi,var(--sph-type-64px,64px))}\n\n.lap-entry{display:grid;gap:var(--sph-space-2px,2px);min-width:0;width:min(11ch,calc((100cqi - 4 * var(--lap-space))/3));container-type:inline-size;font-family:monospace;text-align:center}\n#root .lap-entry .lap-number{font-size:var(--sph-type-22px,22px);line-height:var(--sph-leading-1-25,1.25);color:var(--muted)}\n#root .lap-entry .lap-time{display:flex;flex-wrap:wrap;justify-content:center;font-family:monospace;font-size:var(--sph-type-22px,22px);line-height:var(--sph-leading-1-4,1.4);white-space:normal}\n.lap-probe{position:absolute;left:3px;right:3px;top:0;display:grid;grid-template-columns:repeat(3,max-content);justify-content:space-evenly;column-gap:0;row-gap:var(--sph-space-8px,8px);container-type:inline-size;--lap-space:calc(var(--widget-compact-body-font,16px)/2);font-size:var(--sph-type-22px,22px);visibility:hidden;pointer-events:none}\n#root .laps.empty #lap-empty{font-size:inherit;line-height:inherit}\n#root[data-compact=\"true\"] :is(.laps:not(.empty),.lap-probe){font-size:var(--widget-compact-body-font)}\n#root .lap-entry .lap-time>span{display:block;font-size:inherit;line-height:inherit;white-space:nowrap}\n#root[data-compact=\"true\"] .lap-entry :is(.lap-number,.lap-time){font-size:var(--widget-compact-body-font)}\n#root[data-compact=\"true\"] .lap-entry{width:min(8ch,calc((100cqi - 4 * var(--lap-space))/3))}\n","html":"<div id=\"app\" class=\"tool\"></div>\n","javascript":"const elapsedAt = (clock, now) => clock.elapsed + (clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt));\nconst startClock = (clock, now) => clock.startedAt === null ? { ...clock, startedAt: now } : clock;\nconst pauseClock = (clock, now) => ({ elapsed: elapsedAt(clock, now), startedAt: null });\nfunction formatDuration(milliseconds, fraction = false) {\n    const total = Math.max(0, Math.floor(milliseconds / 1000));\n    const text = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(v => String(v).padStart(2, ''0'')).join('':'');\n    return text + (fraction ? ''.'' + Math.floor(Math.max(0, milliseconds) % 1000 / 10).toString().padStart(2, ''0'') : '''');\n}\n\nsph.ready(context=>{\n let lang=context.language,elapsed=0,started=null,laps=[],renderId=0;\n const text=()=>lang===''ja''?{start:''開始'',pause:''一時停止'',reset:''リセット'',lap:''ラップ'',all:''すべて表示'',empty:''計測中に記録したラップが表示されます。''}:{start:''Start'',pause:''Pause'',reset:''Reset'',lap:''Lap'',all:''Show all'',empty:''Laps recorded while running appear here.''};\n const now=()=>elapsedAt({elapsed,startedAt:started},performance.now());\n const format=ms=>formatDuration(ms,true);\n const parts=value=>{const time=format(value),colon=time.indexOf('':'');return [time.slice(0,colon+1),time.slice(colon+1)];};\n const timeHtml=value=>{const [hours,tail]=parts(value);return ''<span class=\"lap-hours\">''+hours+''</span><span class=\"lap-tail\">''+tail+''</span>'';};\n const entry=(value,i,id='''')=>''<div ''+(id?''id=\"''+id+''\" '':'''')+''class=\"lap-entry\"><small class=\"lap-number\">''+(i+1)+''.</small><span class=\"lap-time\">''+timeHtml(value)+''</span></div>'';\n function draw(){const t=text();sph.ui.patch([{id:''time'',text:format(now())},{id:''toggle'',text:started===null?t.start:t.pause}]);}\n async function renderLaps(){\n  const current=++renderId;\n  // Measure all laps with the button hidden before reserving any button space.\n  sph.ui.patch([{id:''laps'',attribute:''class'',attributeValue:laps.length?''laps'':''laps empty''},{id:''lap-empty'',attribute:''class'',attributeValue:laps.length?''hidden'':''''},{id:''expand'',attribute:''class'',attributeValue:''hidden''},...Array.from({length:100},(_,i)=>({id:''lap-''+i,attribute:''class'',attributeValue:i<laps.length?''lap-entry'':''hidden''}))]);\n  if(laps.length)sph.ui.patch(laps.flatMap((v,i)=>{const [hours,tail]=parts(v);return [{id:''lap-hours-''+i,text:hours},{id:''lap-tail-''+i,text:tail}];}));\n  if(!laps.length||context.expanded)return;\n  const full=await sph.ui.measure(''laps'');if(current!==renderId)return;\n  if(full.scrollHeight<=full.clientHeight+1)return;\n  sph.ui.patch([{id:''expand'',attribute:''class'',attributeValue:''''}]);\n  const [bounds,line]=await Promise.all([sph.ui.measure(''laps''),sph.ui.measure(''lap-line'')]);if(current!==renderId)return;\n  // clientHeight includes 20px of padding. Each row has three laps and an 8px gap.\n  let rows=Math.max(0,Math.floor((bounds.clientHeight-20+8)/(Math.max(1,line.clientHeight)+8))+1);\n  // Measure the actual grid to avoid losing a row to rounded clientHeight values.\n  while(current===renderId){\n   const start=Math.max(0,laps.length-rows*3);\n   sph.ui.patch(Array.from({length:100},(_,i)=>({id:''lap-''+i,attribute:''class'',attributeValue:i>=start&&i<laps.length?''lap-entry'':''hidden''})));\n   const fit=await sph.ui.measure(''laps'');if(current!==renderId)return;\n   if(rows===0||fit.scrollHeight<=fit.clientHeight+1)return;\n   rows--;\n  }\n }\n function render(){const t=text();\n  const cells=Array.from({length:100},(_,i)=>''<div id=\"lap-''+i+''\" class=\"hidden\"><small class=\"lap-number\">''+(i+1)+''.</small><span class=\"lap-time\"><span id=\"lap-hours-''+i+''\" class=\"lap-hours\"></span><span id=\"lap-tail-''+i+''\" class=\"lap-tail\"></span></span></div>'').join('''');\n  sph.ui.html(''<div class=\"tool\"><output id=\"time\" class=\"time\"></output><div class=\"actions\"><button id=\"toggle\" class=\"primary\">''+t.start+''</button><button id=\"reset\">''+t.reset+''</button><button id=\"lap\">''+t.lap+''</button></div><div id=\"laps\" class=\"laps empty\"><span id=\"lap-empty\">''+t.empty+''</span>''+cells+''</div><div class=\"lap-probe\" aria-hidden=\"true\">''+[0,1,2].map(i=>entry(0,i,i===0?''lap-line'':'''')).join('''')+''</div><button id=\"expand\" class=\"hidden\">''+t.all+''</button><small id=\"hint\" class=\"hidden\"></small></div>'');\n  sph.ui.on(''toggle'',''click'',()=>{if(started===null)started=performance.now();else{elapsed=now();started=null;}draw();});\n  sph.ui.on(''reset'',''click'',()=>{elapsed=0;started=null;laps=[];renderLaps();draw();});\n  sph.ui.on(''lap'',''click'',()=>{if(started!==null&&laps.length<100){laps.push(now());renderLaps();}});\n  sph.ui.on(''expand'',''click'',()=>sph.expand(''<div class=\"laps full\">''+laps.map((v,i)=>entry(v,i)).join('''')+''</div>''));\n  renderLaps();draw();\n }\n render();setInterval(draw,100);sph.ui.on(''$context'',''change'',c=>{context=c;lang=c.language;render();});\n});\n","sdkVersion":1},"schemaVersion":2,"settings":{},"sizeLayouts":{"2x2":{"columns":2,"rows":2}},"sizes":["2x2"],"version":"1.0.1","view":[{"type":"runtime"}]}'::jsonb,'7e717778872fd29cb4160d7c70ec22971893ce3b5148460a289a02fef9fb06cf' FROM widget_sources WHERE source_key='sph-official';
INSERT INTO widget_releases(source_id,widget_code,version,definition,digest) SELECT id,'sph.timer','1.0.1','{"author":"H.Morisaki","capabilities":[],"description":{"en":"A countdown timer with start, pause, resume and reset. Completion is indicated on screen. Timing is local to this page and resets on reload.","ja":"開始・一時停止・再開・リセットができるカウントダウンタイマーです。終了は画面表示で通知します。計測はこのページ内のみで、再読込するとリセットされます。"},"id":"sph.timer","license":{"name":"MIT","url":"https://github.com/HidekiMorisaki/sph/blob/main/LICENSE"},"name":{"en":"Timer","ja":"タイマー"},"provider":"SPH Official","runtime":{"css":"*{box-sizing:border-box}\nbutton,input{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--sph-radius-6px,6px);min-width:0;max-width:100%}\nbutton{min-height:44px;padding:var(--sph-space-6px,6px) var(--sph-space-10px,10px);font-size:var(--sph-type-24px,24px);line-height:var(--sph-leading-1-25,1.25);cursor:pointer}\nbutton:hover{background:var(--surface-secondary)}\nbutton:focus-visible,input:focus-visible{outline:2px solid var(--primary);outline-offset:2px}\nbutton:disabled{opacity:.45;cursor:default}\n.tool{height:240px;padding:var(--sph-space-6px,6px);display:grid;grid-template-rows:auto minmax(0,1fr) minmax(44px,.8fr);gap:var(--sph-space-6px,6px);min-width:0;container-type:inline-size}\n#root[data-layout=\"stretch\"]>.tool{height:100%}\n.primary{background:var(--action-primary-background,var(--primary-bg));color:var(--action-primary-text,var(--primary));border-color:var(--action-primary-button-border,var(--primary))}\n.primary:hover{background:var(--action-primary-background-hover,var(--surface-secondary))}\n.hidden{display:none}\nlabel{display:grid;gap:var(--sph-space-4px,4px);font-size:var(--sph-type-20px,20px);line-height:var(--sph-leading-1-2,1.2)}\n.duration{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sph-space-12px,12px);min-width:0}\n.duration input{width:100%;min-height:40px;padding:var(--sph-space-2px,2px) var(--sph-space-6px,6px);font-size:var(--sph-type-26px,26px);line-height:var(--sph-leading-1-2,1.2)}\n.time{display:flex;align-items:center;justify-content:center;text-align:center;font-size:clamp(var(--sph-type-48px,48px),8cqi,var(--sph-type-64px,64px));line-height:var(--sph-leading-1-1,1.1);white-space:nowrap;font-variant-numeric:tabular-nums}\n.actions{display:flex;flex-wrap:wrap;align-items:center;align-content:center;justify-content:center;gap:var(--sph-space-8px,8px)}\n#hint{font-size:var(--sph-type-22px,22px);line-height:var(--sph-leading-1-25,1.25);color:var(--muted);overflow-wrap:anywhere}\n.laps{min-height:100px;border:1px dashed var(--border);border-radius:var(--sph-radius-6px,6px);padding:var(--sph-space-10px,10px);white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;font-size:var(--sph-type-22px,22px);line-height:var(--sph-leading-1-5,1.5);font-variant-numeric:tabular-nums;margin:0}\n","html":"<div id=\"app\" class=\"tool\"></div>\n","javascript":"const elapsedAt = (clock, now) => clock.elapsed + (clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt));\nconst startClock = (clock, now) => clock.startedAt === null ? { ...clock, startedAt: now } : clock;\nconst pauseClock = (clock, now) => ({ elapsed: elapsedAt(clock, now), startedAt: null });\nfunction formatDuration(milliseconds, fraction = false) {\n    const total = Math.max(0, Math.floor(milliseconds / 1000));\n    const text = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(v => String(v).padStart(2, ''0'')).join('':'');\n    return text + (fraction ? ''.'' + Math.floor(Math.max(0, milliseconds) % 1000 / 10).toString().padStart(2, ''0'') : '''');\n}\n\nsph.ready(context=>{\n const countdown=true;let lang=context.language,h=0,m=25,s=0,elapsed=0,started=null,laps=[],finished=false;\n const text=()=>lang===''ja''?{start:''開始'',pause:''一時停止'',reset:''リセット'',lap:''ラップ'',all:''すべて表示'',hours:''時間'',minutes:''分'',seconds:''秒'',finished:''時間になりました。'',empty:''計測中に記録したラップが表示されます。'',invalid:''0より大きい時間を指定してください。''}:{start:''Start'',pause:''Pause'',reset:''Reset'',lap:''Lap'',all:''Show all'',hours:''Hours'',minutes:''Minutes'',seconds:''Seconds'',finished:''Time is up.'',empty:''Laps recorded while running appear here.'',invalid:''Enter a positive duration.''};\n const duration=()=>((h*60+m)*60+s)*1000,valid=()=>Number.isInteger(h)&&h>=0&&h<=99&&Number.isInteger(m)&&m>=0&&m<=59&&Number.isInteger(s)&&s>=0&&s<=59&&duration()>0;\n const now=()=>elapsedAt({elapsed,startedAt:started},performance.now());\n function format(ms){return formatDuration(ms,!countdown);}\n\n function draw(){let amount=now();if(countdown&&started!==null&&amount>=duration()){amount=duration();elapsed=amount;started=null;finished=true;}const t=text();sph.ui.patch([{id:''time'',text:format(countdown?Math.ceil(Math.max(0,duration()-amount)/1000)*1000:amount)},{id:''toggle'',text:started===null?t.start:t.pause},{id:''hint'',text:finished?t.finished:countdown&&!valid()?t.invalid:''''},{id:''hint'',attribute:''class'',attributeValue:finished||countdown&&!valid()?'''':''hidden''},...[''hours'',''minutes'',''seconds''].map(id=>({id,attribute:''disabled'',attributeValue:started!==null?'''':null})).filter(()=>countdown)]);}\n function render(){const t=text();sph.ui.html(''<div class=\"tool\">''+(countdown?''<div class=\"duration\">''+[[''hours'',t.hours,h,99],[''minutes'',t.minutes,m,59],[''seconds'',t.seconds,s,59]].map(([id,label,value,max])=>''<label>''+label+''<input id=\"''+id+''\" type=\"number\" min=\"0\" max=\"''+max+''\" step=\"1\" value=\"''+value+''\"></label>'').join('''')+''</div>'':'''')+''<output id=\"time\" class=\"time\"></output><div class=\"actions\"><button id=\"toggle\" class=\"primary\">''+t.start+''</button><button id=\"reset\">''+t.reset+''</button>''+(!countdown?''<button id=\"lap\">''+t.lap+''</button>'':'''')+''</div>''+(!countdown?''<pre id=\"laps\" class=\"laps\">''+t.empty+''</pre><button id=\"expand\">''+t.all+''</button>'':'''')+''<small id=\"hint\"></small></div>'');\n sph.ui.on(''toggle'',''click'',()=>{if(countdown&&!valid())return;if(started===null){if(finished){elapsed=0;finished=false;}started=performance.now();}else{elapsed=now();started=null;}draw();});\n sph.ui.on(''reset'',''click'',()=>{elapsed=0;started=null;finished=false;laps=[];if(!countdown)sph.ui.patch([{id:''laps'',text:text().empty},{id:''expand'',attribute:''class'',attributeValue:''hidden''}]);draw();});\n if(countdown)for(const id of [''hours'',''minutes'',''seconds''])sph.ui.on(id,''input'',e=>{const value=e.value.trim()===''''?NaN:Number(e.value);if(id===''hours'')h=value;if(id===''minutes'')m=value;if(id===''seconds'')s=value;elapsed=0;finished=false;draw();});\n else {sph.ui.on(''lap'',''click'',()=>{if(started!==null&&laps.length<100){laps.push(now());sph.ui.patch([{id:''laps'',text:(context.expanded?laps:laps.slice(-5)).map((v,i)=>String(context.expanded?i+1:Math.max(1,laps.length-4)+i)+''. ''+format(v)).join(''\\n'')},{id:''expand'',attribute:''class'',attributeValue:laps.length>5?'''':''hidden''}]);}});sph.ui.on(''expand'',''click'',()=>sph.expand());}\n if(!countdown)sph.ui.patch([{id:''expand'',attribute:''class'',attributeValue:laps.length>5?'''':''hidden''}]);draw();}\n render();setInterval(draw,100);sph.ui.on(''$context'',''change'',c=>{context=c;lang=c.language;render();});\n});\n","sdkVersion":1},"schemaVersion":2,"settings":{},"sizeLayouts":{"1x2":{"columns":2,"rows":1}},"sizes":["1x2"],"version":"1.0.1","view":[{"type":"runtime"}]}'::jsonb,'0b0a6309626f847e5934419d55269596ec3e623b025716f64c68a31a8788610d' FROM widget_sources WHERE source_key='sph-official';
INSERT INTO widget_releases(source_id,widget_code,version,definition,digest) SELECT id,'sph.unit_converter','1.0.1','{"author":"H.Morisaki","capabilities":[],"description":{"en":"Convert length, area, mass, volume, temperature, time and data size. SI prefixes use 1000; binary prefixes such as KiB use 1024. Values are not saved.","ja":"長さ・面積・重さ・体積・温度・時間・データ容量を変換します。SI接頭辞は1000、KiBなどの2進接頭辞は1024を基準にします。値は保存されません。"},"id":"sph.unit_converter","license":{"name":"MIT","url":"https://github.com/HidekiMorisaki/sph/blob/main/LICENSE"},"name":{"en":"Unit converter","ja":"単位変換"},"provider":"SPH Official","runtime":{"css":"*{box-sizing:border-box}\nbutton,input,select{font:inherit;font-size:var(--sph-type-22px,22px);line-height:var(--sph-leading-1-25,1.25);color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--sph-radius-6px,6px);min-height:40px;padding:var(--sph-space-3px,3px) var(--sph-space-6px,6px);min-width:0;max-width:100%;width:100%}\nbutton:hover{background:var(--surface-secondary)}\nbutton:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--primary);outline-offset:2px}\nlabel{display:grid;gap:var(--sph-space-8px,8px);font-size:var(--sph-type-18px,18px);line-height:var(--sph-leading-1-2,1.2);min-width:0}\n.tool{height:238px;padding:var(--sph-space-6px,6px);container-type:inline-size;display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:var(--sph-space-12px,12px);min-width:0}\n#root[data-layout=\"stretch\"]>.tool{height:100%}\n.inputs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sph-space-12px,12px);min-width:0}\n.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr)) auto;align-items:end;gap:var(--sph-space-12px,12px);min-width:0}\n#swap{width:auto;white-space:nowrap;padding-inline:var(--sph-space-8px,8px)}\n.result-row{display:grid;align-items:center;min-height:0;padding:var(--sph-space-4px,4px) var(--sph-space-6px,6px);background:var(--surface-secondary);border-radius:var(--sph-radius-4px,4px)}\n.result{display:block;font-size:var(--sph-type-32px,32px);line-height:var(--sph-leading-1-2,1.2);text-align:right;overflow-wrap:anywhere;font-variant-numeric:tabular-nums;min-width:0}\n.error{font-size:var(--sph-type-18px,18px);line-height:var(--sph-leading-1-2,1.2);color:var(--danger);overflow-wrap:anywhere}\n.hidden{display:none}\n@container(max-width:500px){#swap .swap-label{display:none}#swap{width:40px;padding:var(--sph-space-2px,2px)}}\n .result-row:has(.error:not(.hidden)){padding-block:0}\n","html":"<div id=\"app\" class=\"tool\"></div>\n","javascript":"const u = (id, ja, en, factor, offset = 0) => ({ id, ja, en, factor, offset });\nconst unitCategories = [\n    { id: ''length'', ja: ''長さ'', en: ''Length'', units: [u(''m'', ''メートル'', ''Metres'', 1), u(''km'', ''キロメートル'', ''Kilometres'', 1000), u(''cm'', ''センチメートル'', ''Centimetres'', .01), u(''mm'', ''ミリメートル'', ''Millimetres'', .001), u(''in'', ''インチ'', ''Inches'', .0254), u(''ft'', ''フィート'', ''Feet'', .3048), u(''yd'', ''ヤード'', ''Yards'', .9144), u(''mi'', ''マイル'', ''Miles'', 1609.344)] },\n    { id: ''area'', ja: ''面積'', en: ''Area'', units: [u(''m²'', ''平方メートル'', ''Square metres'', 1), u(''km²'', ''平方キロメートル'', ''Square kilometres'', 1e6), u(''ha'', ''ヘクタール'', ''Hectares'', 10000), u(''ft²'', ''平方フィート'', ''Square feet'', .09290304), u(''acre'', ''エーカー'', ''Acres'', 4046.8564224)] },\n    { id: ''mass'', ja: ''重さ'', en: ''Mass'', units: [u(''kg'', ''キログラム'', ''Kilograms'', 1), u(''g'', ''グラム'', ''Grams'', .001), u(''mg'', ''ミリグラム'', ''Milligrams'', .000001), u(''t'', ''トン'', ''Tonnes'', 1000), u(''lb'', ''ポンド'', ''Pounds'', .45359237), u(''oz'', ''オンス'', ''Ounces'', .028349523125)] },\n    { id: ''volume'', ja: ''体積'', en: ''Volume'', units: [u(''L'', ''リットル'', ''Litres'', 1), u(''mL'', ''ミリリットル'', ''Millilitres'', .001), u(''m³'', ''立方メートル'', ''Cubic metres'', 1000), u(''US gal'', ''米液量ガロン'', ''US liquid gallons'', 3.785411784), u(''imp gal'', ''英ガロン'', ''Imperial gallons'', 4.54609)] },\n    { id: ''temperature'', ja: ''温度'', en: ''Temperature'', units: [u(''°C'', ''摂氏'', ''Celsius'', 1, 273.15), u(''°F'', ''華氏'', ''Fahrenheit'', 5 / 9, 273.15 - 32 * 5 / 9), u(''K'', ''ケルビン'', ''Kelvin'', 1)] },\n    { id: ''time'', ja: ''時間'', en: ''Time'', units: [u(''s'', ''秒'', ''Seconds'', 1), u(''ms'', ''ミリ秒'', ''Milliseconds'', .001), u(''min'', ''分'', ''Minutes'', 60), u(''h'', ''時間'', ''Hours'', 3600), u(''d'', ''日（24時間）'', ''Days (24 hours)'', 86400)] },\n    { id: ''data'', ja: ''データ容量'', en: ''Data size'', units: [u(''B'', ''バイト'', ''Bytes'', 1), u(''bit'', ''ビット'', ''Bits'', 1 / 8), u(''kB'', ''キロバイト（1000）'', ''Kilobytes (1000)'', 1000), u(''MB'', ''メガバイト'', ''Megabytes'', 1e6), u(''GB'', ''ギガバイト'', ''Gigabytes'', 1e9), u(''TB'', ''テラバイト'', ''Terabytes'', 1e12), u(''KiB'', ''キビバイト（1024）'', ''Kibibytes (1024)'', 1024), u(''MiB'', ''メビバイト'', ''Mebibytes'', 1024 ** 2), u(''GiB'', ''ギビバイト'', ''Gibibytes'', 1024 ** 3), u(''TiB'', ''テビバイト'', ''Tebibytes'', 1024 ** 4)] }\n];\nfunction convertUnit(input, category, from, to) {\n    if (!/^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?$/i.test(input.trim()))\n        return null;\n    const value = Number(input), group = unitCategories.find(c => c.id === category), a = group?.units.find(u => u.id === from), b = group?.units.find(u => u.id === to);\n    if (!Number.isFinite(value) || !a || !b)\n        return null;\n    const base = value * a.factor + (a.offset ?? 0);\n    if (category === ''temperature'' && base < -1e-10)\n        return null;\n    const result = (base - (b.offset ?? 0)) / b.factor;\n    return Number.isFinite(result) ? (Object.is(result, -0) ? 0 : result) : null;\n}\n\nsph.ready(context=>{\n let lang=context.language,category=''length'',from=''m'',to=''km'',input=''1'';\n const group=()=>unitCategories.find(c=>c.id===category),escape=s=>String(s).replaceAll(''&'',''&amp;'').replaceAll(''<'',''&lt;'').replaceAll(''\"'',''&quot;'');\n function draw(){const result=convertUnit(input,category,from,to),value=result===null?''—'':new Intl.NumberFormat(lang,{maximumSignificantDigits:12,notation:result!==0&&(Math.abs(result)>=1e12||Math.abs(result)<1e-6)?''scientific'':''standard''}).format(result);sph.ui.patch([{id:''result'',text:value+'' ''+to},{id:''result'',attribute:''class'',attributeValue:result===null&&input.trim()!==''''?''result hidden'':''result''},{id:''error'',attribute:''class'',attributeValue:result===null&&input.trim()!==''''?''error'':''error hidden''},{id:''error'',text:result===null&&input.trim()!==''''?(lang===''ja''?''有効な数値を入力してください。温度は絶対零度以上にしてください。'':''Enter a finite value. Temperatures must be at or above absolute zero.'') :''''}]);}\n function render(){const options=selected=>group().units.map(u=>''<option value=\"''+u.id+''\" ''+(u.id===selected?''selected'':'''')+''>''+escape(u[lang])+'' (''+u.id+'')</option>'').join('''');sph.ui.html(''<div class=\"tool\"><div class=\"inputs\"><label>''+(lang===''ja''?''種類'':''Category'')+''<select id=\"category\">''+unitCategories.map(c=>''<option value=\"''+c.id+''\" ''+(c.id===category?''selected'':'''')+''>''+c[lang]+''</option>'').join('''')+''</select></label><label>''+(lang===''ja''?''変換する値'':''Value'')+''<input id=\"value\" type=\"text\" maxlength=\"100\" value=\"''+escape(input)+''\"></label></div><div class=\"pair\"><label>''+(lang===''ja''?''変換元'':''From'')+''<select id=\"from\">''+options(from)+''</select></label><label>''+(lang===''ja''?''変換先'':''To'')+''<select id=\"to\">''+options(to)+''</select></label><button id=\"swap\" aria-label=\"''+(lang===''ja''?''入れ替え'':''Swap'')+''\" title=\"''+(lang===''ja''?''入れ替え'':''Swap'')+''\">⇄ <span class=\"swap-label\">''+(lang===''ja''?''入れ替え'':''Swap'')+''</span></button></div><div class=\"result-row\"><output id=\"result\" class=\"result\"></output><small id=\"error\" class=\"error hidden\" role=\"status\"></small></div></div>'');sph.ui.on(''category'',''change'',e=>{category=e.value;from=group().units[0].id;to=group().units[1].id;render();});sph.ui.on(''value'',''input'',e=>{input=e.value;draw();});sph.ui.on(''from'',''change'',e=>{from=e.value;draw();});sph.ui.on(''to'',''change'',e=>{to=e.value;draw();});sph.ui.on(''swap'',''click'',()=>{[from,to]=[to,from];render();});draw();}\n render();sph.ui.on(''$context'',''change'',c=>{lang=c.language;render();});\n});\n","sdkVersion":1},"schemaVersion":2,"settings":{},"sizeLayouts":{"1x2":{"columns":2,"rows":1}},"sizes":["1x2"],"version":"1.0.1","view":[{"type":"runtime"}]}'::jsonb,'32c97e309da340fc0a4e5ff53111e904bb59890be6d45b910632bd5374046f24' FROM widget_sources WHERE source_key='sph-official';
INSERT INTO widget_releases(source_id,widget_code,version,definition,digest) SELECT id,'sph.world_clock','1.0.1','{"author":"H.Morisaki","capabilities":[],"configuration":{"fields":{"clockDesign":{"default":"digital","label":{"en":"Clock design","ja":"時計デザイン"},"options":[{"label":{"en":"Digital","ja":"デジタル"},"value":"digital"},{"label":{"en":"Analog","ja":"アナログ"},"value":"analog"}],"type":"select"}},"listFields":["clockDesign"],"operations":{"create":false,"delete":false,"update":false},"titleField":"clockDesign"},"id":"sph.world_clock","license":{"name":"MIT","url":"https://github.com/HidekiMorisaki/sph/blob/main/LICENSE"},"name":{"en":"World clock","ja":"世界時計"},"provider":"SPH Official","runtime":{"css":"*{box-sizing:border-box}button,input,select,textarea{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:var(--sph-radius-4px,4px);min-height:44px;padding:var(--sph-space-8px,8px);min-width:0;max-width:100%}button:hover{background:var(--surface-secondary)}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--primary);outline-offset:1px}button:disabled{opacity:.45;cursor:default}label{display:grid;gap:var(--sph-space-4px,4px);font-size:var(--sph-type-14px,14px)}p{margin:var(--sph-space-8px,8px) 0}output{display:block;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.actions{display:flex;flex-wrap:wrap;gap:var(--sph-space-8px,8px)}.primary{background:var(--primary-bg);color:var(--primary);border-color:var(--primary)}.error{color:var(--danger)}small{font-size:var(--sph-type-14px,14px);color:var(--muted)}.tool{padding:var(--sph-space-2px,2px);display:grid;gap:var(--sph-space-8px,8px);min-width:0}.result{font-size:var(--sph-type-32px,32px);text-align:right;min-height:44px}.keys{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--sph-space-5px,5px)}.copy{border:0;padding:0;background:transparent;cursor:copy;width:100%}.expression{text-align:right;min-height:22px;font-size:var(--sph-type-14px,14px);color:var(--muted)}.clock-layout{display:flex;align-items:center;gap:var(--sph-space-4px,4px)}.clocks{display:flex;align-items:center;justify-content:center;gap:var(--sph-space-12px,12px);min-width:0;flex:1}.world-clock{container-type:inline-size;--dial-light:var(--sph-color-clock-face-day,#fffef6);--dial-edge:var(--sph-color-clock-edge-day,#e7e0cd);--dial-ink:var(--sph-color-clock-ink-day,#26354c);--dial-line:var(--sph-color-clock-line-day,#b2aa91);--dial-ring:var(--sph-color-clock-ring-day,#4b586c);--hand-light:var(--sph-color-clock-hand-day,#728eaf);--second-hand:var(--sph-color-clock-second-day,#b34f36);display:flex;flex:1;min-width:0;flex-direction:column;align-items:center;text-align:center}.world-clock.night{--dial-light:var(--sph-color-clock-face-night,#273c57);--dial-edge:var(--sph-color-clock-edge-night,#101c2d);--dial-ink:var(--sph-color-clock-ink-night,#dfe9f6);--dial-line:var(--sph-color-clock-line-night,#627994);--dial-ring:var(--sph-color-clock-ring-night,#07111f);--hand-light:var(--sph-color-clock-hand-night,#91aed2);--second-hand:var(--sph-color-clock-second-night,#e5b777)}.analog-clock{display:block;width:192px;max-width:100%;height:auto;aspect-ratio:1;filter:drop-shadow(0 2px 3px var(--sph-color-clock-shadow,#09111f25))}.numerals{text-anchor:middle;font-size:var(--sph-type-10px,10px);font-weight:var(--sph-weight-600,600);letter-spacing:.3px}.city{max-width:100%;font-size:var(--sph-type-16px,16px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.analog .city{font-size:var(--sph-type-14px,14px)}.clock{font-size:clamp(var(--sph-type-32px,32px),23cqi,var(--sph-type-48px,48px));line-height:var(--sph-leading-1-2,1.2);white-space:nowrap;max-width:100%}.world-clock small{font-size:var(--sph-type-14px,14px);white-space:nowrap}.primary{background:var(--action-primary-background,var(--primary-bg));color:var(--action-primary-text,var(--primary));border-color:var(--action-primary-button-border,var(--primary))}.primary:hover{background:var(--action-primary-background-hover,var(--surface-secondary))}","html":"<div id=\"app\" class=\"tool\"></div>\n","javascript":"\nsph.ready(async context=>{\n let zones=[''Asia/Tokyo''],page=0;try{zones=(await sph.records.get(''default'')).values.timeZones;}catch{}\n const capacity=()=>Math.max(1,Math.floor(((context.width??320)+12)/210)),visible=()=>zones.slice(page,page+capacity());\n function face(i){const uid=''face''+i;return `<svg class=\"analog-clock\" viewBox=\"0 0 120 120\" role=\"img\" aria-label=\"Clock\"><defs><linearGradient id=\"${uid}-rim\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop stop-color=\"#f2f6fc\"/><stop offset=\".3\" stop-color=\"#8c9cb2\"/><stop offset=\".53\" stop-color=\"#e6edf7\"/><stop offset=\"1\" stop-color=\"#53647e\"/></linearGradient><radialGradient id=\"${uid}-dial\" cx=\".35\" cy=\".25\" r=\".9\"><stop stop-color=\"var(--dial-light)\"/><stop offset=\"1\" stop-color=\"var(--dial-edge)\"/></radialGradient><linearGradient id=\"${uid}-hand\"><stop stop-color=\"var(--hand-light)\"/><stop offset=\".5\" stop-color=\"var(--hand-light)\"/><stop offset=\".51\" stop-color=\"var(--dial-ink)\"/><stop offset=\"1\" stop-color=\"var(--dial-ink)\"/></linearGradient></defs><circle cx=\"60\" cy=\"61\" r=\"58\" fill=\"#09111f\" opacity=\".18\"/><circle cx=\"60\" cy=\"60\" r=\"57\" fill=\"url(#${uid}-rim)\"/><circle cx=\"60\" cy=\"60\" r=\"53\" fill=\"var(--dial-ring)\"/><circle cx=\"60\" cy=\"60\" r=\"50.5\" fill=\"url(#${uid}-dial)\" stroke=\"var(--dial-line)\" stroke-width=\".6\"/><circle cx=\"60\" cy=\"60\" r=\"40\" fill=\"none\" stroke=\"var(--dial-line)\" stroke-width=\".5\" opacity=\".65\"/>${Array.from({length:60},(_,n)=>''<line x1=\"60\" y1=\"''+(n%5===0?13:15)+''\" x2=\"60\" y2=\"''+(n%5===0?21:18)+''\" stroke=\"var(--dial-ink)\" stroke-width=\"''+(n%5===0?1.8:.65)+''\" opacity=\"''+(n%5===0?1:.55)+''\" transform=\"rotate(''+n*6+'' 60 60)\"/>'').join('''')}<g class=\"numerals\" fill=\"var(--dial-ink)\"><text x=\"60\" y=\"34\">12</text><text x=\"87\" y=\"64\">3</text><text x=\"60\" y=\"94\">6</text><text x=\"33\" y=\"64\">9</text></g><path id=\"hour${i}\" d=\"M57.5 66 58.5 39 60 30 61.5 39 62.5 66Z\" fill=\"url(#${uid}-hand)\" stroke=\"var(--dial-ink)\" stroke-width=\".5\"/><path id=\"minute${i}\" d=\"M58.5 67 59 27 60 19 61 27 61.5 67Z\" fill=\"url(#${uid}-hand)\" stroke=\"var(--dial-ink)\" stroke-width=\".45\"/><g id=\"second${i}\"><path d=\"M60 72V16\" stroke=\"var(--second-hand)\" stroke-width=\"1.1\"/><circle cx=\"60\" cy=\"71\" r=\"2.3\" fill=\"none\" stroke=\"var(--second-hand)\" stroke-width=\"1.1\"/></g><circle cx=\"60\" cy=\"60\" r=\"3.5\" fill=\"url(#${uid}-rim)\"/><circle cx=\"60\" cy=\"60\" r=\"1.8\" fill=\"var(--second-hand)\"/></svg>`;}\n function draw(){const now=new Date(),updates=[],analog=context.configuration.clockDesign===''analog'';visible().forEach((zone,i)=>{const parts=new Intl.DateTimeFormat(''en'',{timeZone:zone,hour:''2-digit'',minute:''2-digit'',second:''2-digit'',hourCycle:''h23''}).formatToParts(now),n=k=>Number(parts.find(p=>p.type===k)?.value??0);updates.push({id:''city''+i,text:zone.replaceAll(''_'','' '')},{id:''date''+i,text:new Intl.DateTimeFormat(context.language,{timeZone:zone,month:''short'',day:''numeric''}).format(now)});if(analog)updates.push({id:''clock''+i,attribute:''class'',attributeValue:''world-clock analog''+(n(''hour'')<6||n(''hour'')>=18?'' night'':'''')},...[''hour'',''minute'',''second''].map((hand,j)=>({id:hand+i,attribute:''transform'',attributeValue:''rotate(''+[(n(''hour'')%12)*30+n(''minute'')/2,n(''minute'')*6+n(''second'')/10,n(''second'')*6][j]+'' 60 60)''})));else updates.push({id:''time''+i,text:new Intl.DateTimeFormat(context.language,{timeZone:zone,hour:''2-digit'',minute:''2-digit'',second:''2-digit'',hourCycle:''h23''}).format(now)});});sph.ui.patch(updates);}\n function render(){page=Math.min(page,Math.max(0,zones.length-capacity()));const analog=context.configuration.clockDesign===''analog'';sph.ui.html(''<div class=\"clock-layout\">''+(zones.length>capacity()?''<button id=\"prev\" aria-label=\"Previous\">‹</button>'':'''')+''<div class=\"clocks\">''+visible().map((zone,i)=>''<div id=\"clock''+i+''\" class=\"world-clock ''+(analog?''analog'':'''')+''\">''+(analog?face(i):'''')+''<strong id=\"city''+i+''\" class=\"city\"></strong>''+(!analog?''<output id=\"time''+i+''\" class=\"clock\"></output>'':'''')+''<small id=\"date''+i+''\"></small></div>'').join('''')+''</div>''+(zones.length>capacity()?''<button id=\"next\" aria-label=\"Next\">›</button>'':'''')+''</div>'');if(zones.length>capacity()){sph.ui.on(''prev'',''click'',()=>{page=Math.max(0,page-1);render();});sph.ui.on(''next'',''click'',()=>{page=Math.min(zones.length-capacity(),page+1);render();});}draw();}\n render();setInterval(draw,1000);sph.ui.on(''$context'',''change'',c=>{context=c;render();});\n});\n","sdkVersion":1},"schemaVersion":2,"settings":{},"sizeLayouts":{"1x2":{"columns":2,"rows":1},"1x4":{"columns":4,"rows":1},"1x6":{"columns":6,"rows":1}},"sizes":["1x2","1x4","1x6"],"storage":{"fields":{"timeZones":{"default":["Asia/Tokyo"],"format":"timeZone","label":{"en":"Time zones","ja":"タイムゾーン"},"maxLength":64,"required":true,"type":"stringArray"}},"initialRecords":[{"recordKey":"default","values":{"timeZones":["Asia/Tokyo"]}}],"listFields":["timeZones"],"maxRecords":1,"operations":{"create":false,"delete":false,"update":true},"titleField":"timeZones"},"version":"1.0.1","view":[{"type":"runtime"}]}'::jsonb,'9cae1d76b9b5ded224dbd07b15f134733524b79fcfaeb296b4e9c172416daa17' FROM widget_sources WHERE source_key='sph-official';
INSERT INTO widget_approvals(release_id,allowed) SELECT id,false FROM widget_releases;
-- END official-widget-seed

COMMIT;
