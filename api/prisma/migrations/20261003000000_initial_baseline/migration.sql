-- Consolidated initial schema from the verified development PostgreSQL database.
-- No business data. Initial configuration and optional samples belong to the installer.

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

CREATE TABLE public.branches (
    id SERIAL NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    opened_on date,
    closed_on date,
    postal_code character varying(8),
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
    CONSTRAINT calendar_holiday_imports_pkey PRIMARY KEY (id)
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
    CONSTRAINT cpu_types_pkey PRIMARY KEY (id)
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
    CONSTRAINT employee_roles_scope_check CHECK ((((scope_type = 'global'::text) AND (scope_key = 'global'::text) AND (department_id IS NULL) AND (scope_employee_id IS NULL)) OR ((scope_type = 'department'::text) AND (department_id IS NOT NULL) AND (scope_employee_id IS NULL) AND (scope_key = ('department:'::text || (department_id)::text))) OR ((scope_type = 'employee'::text) AND (department_id IS NULL) AND (scope_employee_id IS NOT NULL) AND (scope_key = ('employee:'::text || (scope_employee_id)::text))))),
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
    CONSTRAINT employee_settings_display_language_check CHECK ((((char_length((display_language)::text) >= 2) AND (char_length((display_language)::text) <= 64)) AND ((display_language)::text ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'::text))),
    CONSTRAINT employee_settings_employee_id_key UNIQUE (employee_id),
    CONSTRAINT employee_settings_pkey PRIMARY KEY (id)
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
    CONSTRAINT employee_social_links_platform_check CHECK (((platform)::text = ANY ((ARRAY['website'::character varying, 'blog'::character varying, 'github'::character varying, 'linkedin'::character varying, 'x'::character varying, 'facebook'::character varying, 'instagram'::character varying, 'youtube'::character varying, 'qiita'::character varying, 'note'::character varying])::text[]))),
    CONSTRAINT employee_social_links_url_check CHECK (((url)::text ~* '^https?://'::text)),
    CONSTRAINT employee_social_links_employee_id_platform_key UNIQUE (employee_id, platform),
    CONSTRAINT employee_social_links_link_key_key UNIQUE (link_key),
    CONSTRAINT employee_social_links_pkey PRIMARY KEY (id)
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
    postal_code character varying(8),
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
    CONSTRAINT employees_active_account_credentials_check CHECK (((account_status <> 'active'::public."AccountStatus") OR ((email IS NOT NULL) AND (password_hash IS NOT NULL)))),
    CONSTRAINT employees_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employment_departments (
    id SERIAL NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT employment_departments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employment_positions (
    id SERIAL NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT employment_positions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employment_types (
    id SERIAL NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT employment_types_pkey PRIMARY KEY (id)
);

CREATE TABLE public.external_links (
    id SERIAL NOT NULL,
    name character varying(128) NOT NULL,
    url character varying(2048) NOT NULL,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT external_links_pkey PRIMARY KEY (id)
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
    CONSTRAINT it_asset_credentials_type_check CHECK (((credential_type)::text = ANY ((ARRAY['admin'::character varying, 'login'::character varying, 'management_console'::character varying])::text[]))),
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
    CONSTRAINT it_assets_asset_tag_format CHECK ((asset_tag ~ '^[A-Z]{3,5}-[0-9]{3,4}$'::text)),
    CONSTRAINT it_assets_date_order CHECK (((purchased_on IS NULL) OR (disposal_on IS NULL) OR (disposal_on >= purchased_on))),
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
    CONSTRAINT manufacturers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.operating_systems (
    id SERIAL NOT NULL,
    vendor text NOT NULL,
    product text NOT NULL,
    version text NOT NULL,
    edition text,
    architecture text,
    display_name text NOT NULL,
    official_url text,
    source_checked_on date,
    sort_order integer DEFAULT 9999 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
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

CREATE TABLE public.role_permissions (
    id SERIAL NOT NULL,
    role_id integer NOT NULL,
    permission_id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT role_permissions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.roles (
    id SERIAL NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
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
    CONSTRAINT work_calendars_calendar_year_check CHECK (((calendar_year >= 2011) AND (calendar_year <= 9999))),
    CONSTRAINT work_calendars_scheduled_work_minutes_per_day_check CHECK ((((scheduled_work_minutes_per_day >= 15) AND (scheduled_work_minutes_per_day <= 1440)) AND ((scheduled_work_minutes_per_day % 15) = 0))),
    CONSTRAINT work_calendars_pkey PRIMARY KEY (id)
);

CREATE INDEX account_invitations_employee_id_created_at_idx ON public.account_invitations USING btree (employee_id, created_at);

CREATE INDEX account_invitations_expires_at_idx ON public.account_invitations USING btree (expires_at);

CREATE INDEX account_invitations_issued_by_id_idx ON public.account_invitations USING btree (issued_by_id);

CREATE UNIQUE INDEX account_invitations_token_hash_key ON public.account_invitations USING btree (token_hash);

CREATE UNIQUE INDEX audit_logs_event_key_key ON public.audit_logs USING btree (event_key);

CREATE INDEX audit_logs_resource_resource_id_idx ON public.audit_logs USING btree (resource, resource_id);

CREATE INDEX branches_deputy_manager_employee_id_idx ON public.branches USING btree (deputy_manager_employee_id);

CREATE INDEX branches_manager_employee_id_idx ON public.branches USING btree (manager_employee_id);

CREATE UNIQUE INDEX branches_name_key ON public.branches USING btree (name);

CREATE INDEX calendar_date_attributes_calendar_date_idx ON public.calendar_date_attributes USING btree (calendar_date);

CREATE UNIQUE INDEX calendar_date_attributes_calendar_date_kind_key ON public.calendar_date_attributes USING btree (calendar_date, kind);

CREATE INDEX calendar_holiday_imports_completed_at_idx ON public.calendar_holiday_imports USING btree (completed_at);

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

CREATE INDEX employee_roles_role_id_idx ON public.employee_roles USING btree (role_id);

CREATE INDEX employee_roles_scope_employee_id_idx ON public.employee_roles USING btree (scope_employee_id);

CREATE INDEX employee_social_links_employee_id_deleted_at_idx ON public.employee_social_links USING btree (employee_id, deleted_at);

CREATE UNIQUE INDEX employees_email_key ON public.employees USING btree (email);

CREATE UNIQUE INDEX employees_employee_code_key ON public.employees USING btree (employee_code);

CREATE UNIQUE INDEX employees_username_key ON public.employees USING btree (username);

CREATE INDEX employees_work_calendar_id_idx ON public.employees USING btree (work_calendar_id);

CREATE UNIQUE INDEX employment_departments_name_key ON public.employment_departments USING btree (name);

CREATE UNIQUE INDEX employment_positions_name_key ON public.employment_positions USING btree (name);

CREATE UNIQUE INDEX employment_types_name_key ON public.employment_types USING btree (name);

CREATE UNIQUE INDEX external_links_name_key ON public.external_links USING btree (name);

CREATE INDEX external_links_sort_order_name_idx ON public.external_links USING btree (sort_order, name);

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

CREATE UNIQUE INDEX operating_systems_display_name_key ON public.operating_systems USING btree (display_name);

CREATE INDEX password_reset_tokens_employee_id_idx ON public.password_reset_tokens USING btree (employee_id);

CREATE INDEX password_reset_tokens_expires_at_idx ON public.password_reset_tokens USING btree (expires_at);

CREATE UNIQUE INDEX password_reset_tokens_token_hash_key ON public.password_reset_tokens USING btree (token_hash);

CREATE UNIQUE INDEX permission_operations_operation_key ON public.permission_operations USING btree (operation);

CREATE INDEX permission_operations_permission_id_idx ON public.permission_operations USING btree (permission_id);

CREATE UNIQUE INDEX permissions_identifier_key ON public.permissions USING btree (identifier);

CREATE UNIQUE INDEX permissions_name_key ON public.permissions USING btree (name);

CREATE INDEX role_permissions_permission_id_idx ON public.role_permissions USING btree (permission_id);

CREATE UNIQUE INDEX role_permissions_role_id_permission_id_key ON public.role_permissions USING btree (role_id, permission_id);

CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);

CREATE UNIQUE INDEX rooms_branch_id_id_key ON public.rooms USING btree (branch_id, id);

CREATE INDEX rooms_branch_id_idx ON public.rooms USING btree (branch_id);

CREATE UNIQUE INDEX rooms_branch_id_name_key ON public.rooms USING btree (branch_id, name);

CREATE INDEX sessions_employee_id_idx ON public.sessions USING btree (employee_id);

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);

CREATE UNIQUE INDEX sessions_token_hash_key ON public.sessions USING btree (token_hash);

CREATE UNIQUE INDEX storage_branch_id_room_id_name_key ON public.storage USING btree (branch_id, room_id, name);

CREATE INDEX storage_room_id_idx ON public.storage USING btree (room_id);

CREATE INDEX work_calendar_days_calendar_id_idx ON public.work_calendar_days USING btree (calendar_id);

CREATE UNIQUE INDEX work_calendar_days_calendar_id_work_date_key ON public.work_calendar_days USING btree (calendar_id, work_date);

CREATE INDEX work_calendars_calendar_year_idx ON public.work_calendars USING btree (calendar_year);

CREATE UNIQUE INDEX work_calendars_name_key ON public.work_calendars USING btree (name);

ALTER TABLE ONLY public.account_invitations
    ADD CONSTRAINT account_invitations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.account_invitations
    ADD CONSTRAINT account_invitations_issued_by_id_fkey FOREIGN KEY (issued_by_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_deputy_manager_employee_id_fkey FOREIGN KEY (deputy_manager_employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_manager_employee_id_fkey FOREIGN KEY (manager_employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.cpu_types
    ADD CONSTRAINT cpu_types_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id) ON UPDATE CASCADE ON DELETE RESTRICT;

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

ALTER TABLE ONLY public.employee_social_links
    ADD CONSTRAINT employee_social_links_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employment_type_id_fkey FOREIGN KEY (employment_type_id) REFERENCES public.employment_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.employee_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_work_calendar_id_fkey FOREIGN KEY (work_calendar_id) REFERENCES public.work_calendars(id) ON UPDATE CASCADE ON DELETE RESTRICT;

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

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.permission_operations
    ADD CONSTRAINT permission_operations_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.storage
    ADD CONSTRAINT storage_branch_id_room_id_fkey FOREIGN KEY (branch_id, room_id) REFERENCES public.rooms(branch_id, id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public.work_calendar_days
    ADD CONSTRAINT work_calendar_days_calendar_id_fkey FOREIGN KEY (calendar_id) REFERENCES public.work_calendars(id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE TRIGGER account_invitations_set_updated_at BEFORE UPDATE ON public.account_invitations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER audit_logs_set_updated_at BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER branches_set_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER calendar_date_attributes_set_updated_at BEFORE UPDATE ON public.calendar_date_attributes FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER calendar_holiday_imports_set_updated_at BEFORE UPDATE ON public.calendar_holiday_imports FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER cpu_types_set_updated_at BEFORE UPDATE ON public.cpu_types FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_change_history_set_updated_at BEFORE UPDATE ON public.employee_change_history FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_departments_set_updated_at BEFORE UPDATE ON public.employee_departments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_groups_set_updated_at BEFORE UPDATE ON public.employee_groups FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_positions_set_updated_at BEFORE UPDATE ON public.employee_positions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_roles_set_updated_at BEFORE UPDATE ON public.employee_roles FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_settings_set_updated_at BEFORE UPDATE ON public.employee_settings FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employee_social_links_set_updated_at BEFORE UPDATE ON public.employee_social_links FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employees_set_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employment_departments_set_updated_at BEFORE UPDATE ON public.employment_departments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employment_positions_set_updated_at BEFORE UPDATE ON public.employment_positions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER employment_types_set_updated_at BEFORE UPDATE ON public.employment_types FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

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

CREATE TRIGGER operating_systems_set_updated_at BEFORE UPDATE ON public.operating_systems FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER password_reset_tokens_set_updated_at BEFORE UPDATE ON public.password_reset_tokens FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER permission_operations_set_updated_at BEFORE UPDATE ON public.permission_operations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER permissions_identifier_immutable BEFORE UPDATE OF identifier ON public.permissions FOR EACH ROW EXECUTE FUNCTION public.prevent_permission_identifier_update();

CREATE TRIGGER permissions_set_updated_at BEFORE UPDATE ON public.permissions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER role_permissions_set_updated_at BEFORE UPDATE ON public.role_permissions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER rooms_set_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER sessions_set_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER storage_set_updated_at BEFORE UPDATE ON public.storage FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER work_calendar_days_set_updated_at BEFORE UPDATE ON public.work_calendar_days FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();

CREATE TRIGGER work_calendars_set_updated_at BEFORE UPDATE ON public.work_calendars FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();
