-- Initial database schema and master data.
-- The schema includes PostgreSQL constraints, partial indexes, and update triggers.

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AccountStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AccountStatus" AS ENUM (
    'unprovisioned',
    'active',
    'suspended'
);


--
-- Name: AssetStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AssetStatus" AS ENUM (
    'available',
    'assigned',
    'maintenance',
    'retired'
);


--
-- Name: DisposalDatePolicy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DisposalDatePolicy" AS ENUM (
    'prohibited',
    'optional',
    'required'
);


--
-- Name: set_record_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_record_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW."updated_at" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_invitations (
    id integer NOT NULL,
    token_hash text NOT NULL,
    employee_id integer NOT NULL,
    issued_by_id integer NOT NULL,
    email_at_issue text NOT NULL,
    expires_at timestamp(3) with time zone NOT NULL,
    used_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: account_invitations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.account_invitations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: account_invitations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.account_invitations_id_seq OWNED BY public.account_invitations.id;


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    event_key uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id integer NOT NULL,
    action text NOT NULL,
    resource text NOT NULL,
    resource_id integer NOT NULL,
    detail jsonb,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    address text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: branches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.branches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: branches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.branches_id_seq OWNED BY public.branches.id;


--
-- Name: chair_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chair_assignments (
    id integer NOT NULL,
    chair_id integer NOT NULL,
    employee_id integer NOT NULL,
    assigned_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    returned_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: chair_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chair_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chair_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chair_assignments_id_seq OWNED BY public.chair_assignments.id;


--
-- Name: chairs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chairs (
    id integer NOT NULL,
    asset_tag text NOT NULL,
    manufacturer text,
    model text,
    location_id integer NOT NULL,
    status public."AssetStatus" DEFAULT 'available'::public."AssetStatus" NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: chairs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chairs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chairs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chairs_id_seq OWNED BY public.chairs.id;


--
-- Name: cpu_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cpu_types (
    id integer NOT NULL,
    code text NOT NULL,
    manufacturer_id integer NOT NULL,
    series text NOT NULL,
    model_number text NOT NULL,
    display_name text NOT NULL,
    official_url text,
    source_checked_on date,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: cpu_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cpu_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cpu_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cpu_types_id_seq OWNED BY public.cpu_types.id;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: departments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.departments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.departments_id_seq OWNED BY public.departments.id;


--
-- Name: desk_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desk_assignments (
    id integer NOT NULL,
    desk_id integer NOT NULL,
    employee_id integer NOT NULL,
    assigned_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    returned_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: desk_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.desk_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: desk_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.desk_assignments_id_seq OWNED BY public.desk_assignments.id;


--
-- Name: desks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desks (
    id integer NOT NULL,
    asset_tag text NOT NULL,
    location_id integer NOT NULL,
    status public."AssetStatus" DEFAULT 'available'::public."AssetStatus" NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: desks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.desks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: desks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.desks_id_seq OWNED BY public.desks.id;


--
-- Name: employee_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_groups (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: employee_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_groups_id_seq OWNED BY public.employee_groups.id;


--
-- Name: employee_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_roles (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    role_id integer NOT NULL,
    scope_type text DEFAULT 'global'::text NOT NULL,
    scope_key text DEFAULT 'global'::text NOT NULL,
    department_id integer,
    scope_employee_id integer,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT employee_roles_scope_check CHECK ((((scope_type = 'global'::text) AND (scope_key = 'global'::text) AND (department_id IS NULL) AND (scope_employee_id IS NULL)) OR ((scope_type = 'department'::text) AND (department_id IS NOT NULL) AND (scope_employee_id IS NULL) AND (scope_key = ('department:'::text || (department_id)::text))) OR ((scope_type = 'employee'::text) AND (department_id IS NULL) AND (scope_employee_id IS NOT NULL) AND (scope_key = ('employee:'::text || (scope_employee_id)::text)))))
);


--
-- Name: employee_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employee_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employee_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employee_roles_id_seq OWNED BY public.employee_roles.id;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    employee_code text NOT NULL,
    first_name text NOT NULL,
    middle_name text,
    last_name text NOT NULL,
    name_kana text,
    birth_date date NOT NULL,
    gender text NOT NULL,
    blood_type text,
    postal_code text,
    prefecture text,
    city text,
    street_address text,
    building_name text,
    mobile_phone text,
    email text NOT NULL,
    hired_at date NOT NULL,
    department_id integer,
    group_id integer,
    position_id integer,
    employment_type_id integer NOT NULL,
    retired_at date,
    notes text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    branch_id integer NOT NULL,
    account_status public."AccountStatus" DEFAULT 'unprovisioned'::public."AccountStatus" NOT NULL,
    must_change_credentials boolean DEFAULT false NOT NULL,
    password_hash text,
    username text,
    CONSTRAINT employees_active_account_credentials_check CHECK (((account_status <> 'active'::public."AccountStatus") OR ((email IS NOT NULL) AND (password_hash IS NOT NULL))))
);


--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: employment_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employment_types (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: employment_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employment_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employment_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employment_types_id_seq OWNED BY public.employment_types.id;


--
-- Name: it_asset_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.it_asset_assignments (
    id integer NOT NULL,
    asset_id integer NOT NULL,
    assigned_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    returned_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    employee_id integer NOT NULL
);


--
-- Name: it_asset_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.it_asset_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: it_asset_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.it_asset_assignments_id_seq OWNED BY public.it_asset_assignments.id;


--
-- Name: it_asset_change_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.it_asset_change_history (
    id integer NOT NULL,
    event_key uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id integer NOT NULL,
    actor_id integer NOT NULL,
    action character varying(20) NOT NULL,
    changes jsonb NOT NULL,
    changed_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: it_asset_change_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.it_asset_change_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: it_asset_change_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.it_asset_change_history_id_seq OWNED BY public.it_asset_change_history.id;


--
-- Name: it_asset_statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.it_asset_statuses (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    disposal_date_policy public."DisposalDatePolicy" DEFAULT 'prohibited'::public."DisposalDatePolicy" NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: it_asset_statuses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.it_asset_statuses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: it_asset_statuses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.it_asset_statuses_id_seq OWNED BY public.it_asset_statuses.id;


--
-- Name: it_asset_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.it_asset_types (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    supports_cpu boolean DEFAULT false NOT NULL,
    supports_ram boolean DEFAULT false NOT NULL,
    supports_os boolean DEFAULT false NOT NULL,
    supports_login_username boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    management_code_prefix character varying(5) NOT NULL,
    next_management_number integer DEFAULT 1 NOT NULL,
    CONSTRAINT it_asset_types_management_code_prefix_format CHECK (((management_code_prefix)::text ~ '^[A-Z]{3,5}$'::text)),
    CONSTRAINT it_asset_types_next_management_number_range CHECK (((next_management_number >= 1) AND (next_management_number <= 10000)))
);


--
-- Name: it_asset_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.it_asset_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: it_asset_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.it_asset_types_id_seq OWNED BY public.it_asset_types.id;


--
-- Name: it_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.it_assets (
    id integer NOT NULL,
    asset_tag text NOT NULL,
    type_id integer NOT NULL,
    manufacturer_id integer,
    model_number text,
    serial_number text,
    cpu_type_id integer,
    ram_gb integer,
    operating_system_id integer,
    login_username text,
    location_id integer NOT NULL,
    status_id integer NOT NULL,
    purchased_on date NOT NULL,
    disposal_on date,
    notes text,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    CONSTRAINT it_assets_date_order CHECK (((purchased_on IS NULL) OR (disposal_on IS NULL) OR (disposal_on >= purchased_on))),
    CONSTRAINT it_assets_ram_gb_positive CHECK (((ram_gb IS NULL) OR (ram_gb > 0)))
);


--
-- Name: it_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.it_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: it_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.it_assets_id_seq OWNED BY public.it_assets.id;


--
-- Name: manufacturers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manufacturers (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    official_url text,
    source_checked_on date,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: manufacturers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.manufacturers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: manufacturers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.manufacturers_id_seq OWNED BY public.manufacturers.id;


--
-- Name: operating_systems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operating_systems (
    id integer NOT NULL,
    code text NOT NULL,
    vendor text NOT NULL,
    product text NOT NULL,
    version text NOT NULL,
    edition text,
    architecture text,
    display_name text NOT NULL,
    official_url text,
    source_checked_on date,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: operating_systems_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.operating_systems_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: operating_systems_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.operating_systems_id_seq OWNED BY public.operating_systems.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id integer NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp(3) with time zone NOT NULL,
    used_at timestamp(3) with time zone,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    employee_id integer NOT NULL
);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- Name: positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: positions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.positions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: positions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.positions_id_seq OWNED BY public.positions.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rooms (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    floor text,
    branch_id integer NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone
);


--
-- Name: rooms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rooms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rooms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rooms_id_seq OWNED BY public.rooms.id;


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id integer NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp(3) with time zone NOT NULL,
    last_seen_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    employee_id integer NOT NULL
);


--
-- Name: sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sessions_id_seq OWNED BY public.sessions.id;


--
-- Name: storage_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_locations (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) with time zone,
    kind text,
    room_id integer NOT NULL
);


--
-- Name: storage_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.storage_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: storage_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.storage_locations_id_seq OWNED BY public.storage_locations.id;


--
-- Name: account_invitations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_invitations ALTER COLUMN id SET DEFAULT nextval('public.account_invitations_id_seq'::regclass);


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: branches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches ALTER COLUMN id SET DEFAULT nextval('public.branches_id_seq'::regclass);


--
-- Name: chair_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chair_assignments ALTER COLUMN id SET DEFAULT nextval('public.chair_assignments_id_seq'::regclass);


--
-- Name: chairs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chairs ALTER COLUMN id SET DEFAULT nextval('public.chairs_id_seq'::regclass);


--
-- Name: cpu_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cpu_types ALTER COLUMN id SET DEFAULT nextval('public.cpu_types_id_seq'::regclass);


--
-- Name: departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments ALTER COLUMN id SET DEFAULT nextval('public.departments_id_seq'::regclass);


--
-- Name: desk_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desk_assignments ALTER COLUMN id SET DEFAULT nextval('public.desk_assignments_id_seq'::regclass);


--
-- Name: desks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desks ALTER COLUMN id SET DEFAULT nextval('public.desks_id_seq'::regclass);


--
-- Name: employee_groups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_groups ALTER COLUMN id SET DEFAULT nextval('public.employee_groups_id_seq'::regclass);


--
-- Name: employee_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_roles ALTER COLUMN id SET DEFAULT nextval('public.employee_roles_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: employment_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_types ALTER COLUMN id SET DEFAULT nextval('public.employment_types_id_seq'::regclass);


--
-- Name: it_asset_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_asset_assignments ALTER COLUMN id SET DEFAULT nextval('public.it_asset_assignments_id_seq'::regclass);


--
-- Name: it_asset_change_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_asset_change_history ALTER COLUMN id SET DEFAULT nextval('public.it_asset_change_history_id_seq'::regclass);


--
-- Name: it_asset_statuses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_asset_statuses ALTER COLUMN id SET DEFAULT nextval('public.it_asset_statuses_id_seq'::regclass);


--
-- Name: it_asset_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_asset_types ALTER COLUMN id SET DEFAULT nextval('public.it_asset_types_id_seq'::regclass);


--
-- Name: it_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_assets ALTER COLUMN id SET DEFAULT nextval('public.it_assets_id_seq'::regclass);


--
-- Name: manufacturers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturers ALTER COLUMN id SET DEFAULT nextval('public.manufacturers_id_seq'::regclass);


--
-- Name: operating_systems id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operating_systems ALTER COLUMN id SET DEFAULT nextval('public.operating_systems_id_seq'::regclass);


--
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- Name: positions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions ALTER COLUMN id SET DEFAULT nextval('public.positions_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: rooms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms ALTER COLUMN id SET DEFAULT nextval('public.rooms_id_seq'::regclass);


--
-- Name: sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions ALTER COLUMN id SET DEFAULT nextval('public.sessions_id_seq'::regclass);


--
-- Name: storage_locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_locations ALTER COLUMN id SET DEFAULT nextval('public.storage_locations_id_seq'::regclass);


--
-- Name: account_invitations account_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_invitations
    ADD CONSTRAINT account_invitations_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: chair_assignments chair_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chair_assignments
    ADD CONSTRAINT chair_assignments_pkey PRIMARY KEY (id);


--
-- Name: chairs chairs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chairs
    ADD CONSTRAINT chairs_pkey PRIMARY KEY (id);


--
-- Name: cpu_types cpu_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cpu_types
    ADD CONSTRAINT cpu_types_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: desk_assignments desk_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desk_assignments
    ADD CONSTRAINT desk_assignments_pkey PRIMARY KEY (id);


--
-- Name: desks desks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desks
    ADD CONSTRAINT desks_pkey PRIMARY KEY (id);


--
-- Name: employee_groups employee_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_groups
    ADD CONSTRAINT employee_groups_pkey PRIMARY KEY (id);


--
-- Name: employee_roles employee_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: employment_types employment_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_types
    ADD CONSTRAINT employment_types_pkey PRIMARY KEY (id);


--
-- Name: it_asset_assignments it_asset_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_asset_assignments
    ADD CONSTRAINT it_asset_assignments_pkey PRIMARY KEY (id);


--
-- Name: it_asset_change_history it_asset_change_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_asset_change_history
    ADD CONSTRAINT it_asset_change_history_pkey PRIMARY KEY (id);


--
-- Name: it_asset_statuses it_asset_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_asset_statuses
    ADD CONSTRAINT it_asset_statuses_pkey PRIMARY KEY (id);


--
-- Name: it_asset_types it_asset_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_asset_types
    ADD CONSTRAINT it_asset_types_pkey PRIMARY KEY (id);


--
-- Name: it_assets it_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_pkey PRIMARY KEY (id);


--
-- Name: manufacturers manufacturers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manufacturers
    ADD CONSTRAINT manufacturers_pkey PRIMARY KEY (id);


--
-- Name: operating_systems operating_systems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operating_systems
    ADD CONSTRAINT operating_systems_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: storage_locations storage_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_locations
    ADD CONSTRAINT storage_locations_pkey PRIMARY KEY (id);


--
-- Name: account_invitations_employee_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_invitations_employee_id_created_at_idx ON public.account_invitations USING btree (employee_id, created_at);


--
-- Name: account_invitations_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_invitations_expires_at_idx ON public.account_invitations USING btree (expires_at);


--
-- Name: account_invitations_issued_by_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_invitations_issued_by_id_idx ON public.account_invitations USING btree (issued_by_id);


--
-- Name: account_invitations_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX account_invitations_token_hash_key ON public.account_invitations USING btree (token_hash);


--
-- Name: audit_logs_event_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX audit_logs_event_key_key ON public.audit_logs USING btree (event_key);


--
-- Name: audit_logs_resource_resource_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_resource_resource_id_idx ON public.audit_logs USING btree (resource, resource_id);


--
-- Name: branches_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_code_key ON public.branches USING btree (code);


--
-- Name: branches_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_name_key ON public.branches USING btree (name);


--
-- Name: chair_assignments_chair_id_assigned_at_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chair_assignments_chair_id_assigned_at_key ON public.chair_assignments USING btree (chair_id, assigned_at);


--
-- Name: chair_assignments_chair_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chair_assignments_chair_id_idx ON public.chair_assignments USING btree (chair_id);


--
-- Name: chair_assignments_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chair_assignments_employee_id_idx ON public.chair_assignments USING btree (employee_id);


--
-- Name: chairs_asset_tag_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chairs_asset_tag_key ON public.chairs USING btree (asset_tag);


--
-- Name: chairs_location_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chairs_location_id_idx ON public.chairs USING btree (location_id);


--
-- Name: cpu_types_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cpu_types_code_key ON public.cpu_types USING btree (code);


--
-- Name: cpu_types_display_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cpu_types_display_name_key ON public.cpu_types USING btree (display_name);


--
-- Name: cpu_types_manufacturer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cpu_types_manufacturer_id_idx ON public.cpu_types USING btree (manufacturer_id);


--
-- Name: cpu_types_manufacturer_id_model_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cpu_types_manufacturer_id_model_number_key ON public.cpu_types USING btree (manufacturer_id, model_number);


--
-- Name: departments_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX departments_code_key ON public.departments USING btree (code);


--
-- Name: departments_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX departments_name_key ON public.departments USING btree (name);


--
-- Name: desk_assignments_desk_id_assigned_at_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX desk_assignments_desk_id_assigned_at_key ON public.desk_assignments USING btree (desk_id, assigned_at);


--
-- Name: desk_assignments_desk_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX desk_assignments_desk_id_idx ON public.desk_assignments USING btree (desk_id);


--
-- Name: desk_assignments_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX desk_assignments_employee_id_idx ON public.desk_assignments USING btree (employee_id);


--
-- Name: desks_asset_tag_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX desks_asset_tag_key ON public.desks USING btree (asset_tag);


--
-- Name: desks_location_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX desks_location_id_idx ON public.desks USING btree (location_id);


--
-- Name: employee_groups_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employee_groups_code_key ON public.employee_groups USING btree (code);


--
-- Name: employee_groups_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employee_groups_name_key ON public.employee_groups USING btree (name);


--
-- Name: employee_roles_department_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_roles_department_id_idx ON public.employee_roles USING btree (department_id);


--
-- Name: employee_roles_employee_id_role_id_scope_type_scope_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employee_roles_employee_id_role_id_scope_type_scope_key_key ON public.employee_roles USING btree (employee_id, role_id, scope_type, scope_key);


--
-- Name: employee_roles_role_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_roles_role_id_idx ON public.employee_roles USING btree (role_id);


--
-- Name: employee_roles_scope_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_roles_scope_employee_id_idx ON public.employee_roles USING btree (scope_employee_id);


--
-- Name: employees_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_email_key ON public.employees USING btree (email);


--
-- Name: employees_employee_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_employee_code_key ON public.employees USING btree (employee_code);


--
-- Name: employees_username_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_username_key ON public.employees USING btree (username);


--
-- Name: employment_types_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employment_types_code_key ON public.employment_types USING btree (code);


--
-- Name: employment_types_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employment_types_name_key ON public.employment_types USING btree (name);


--
-- Name: it_asset_assignments_asset_id_assigned_at_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX it_asset_assignments_asset_id_assigned_at_key ON public.it_asset_assignments USING btree (asset_id, assigned_at);


--
-- Name: it_asset_assignments_asset_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX it_asset_assignments_asset_id_idx ON public.it_asset_assignments USING btree (asset_id);


--
-- Name: it_asset_assignments_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX it_asset_assignments_employee_id_idx ON public.it_asset_assignments USING btree (employee_id);


--
-- Name: it_asset_assignments_one_active_per_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX it_asset_assignments_one_active_per_asset ON public.it_asset_assignments USING btree (asset_id) WHERE ((returned_at IS NULL) AND (deleted_at IS NULL));


--
-- Name: it_asset_change_history_actor_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX it_asset_change_history_actor_id_idx ON public.it_asset_change_history USING btree (actor_id);


--
-- Name: it_asset_change_history_asset_id_changed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX it_asset_change_history_asset_id_changed_at_idx ON public.it_asset_change_history USING btree (asset_id, changed_at);


--
-- Name: it_asset_change_history_event_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX it_asset_change_history_event_key_key ON public.it_asset_change_history USING btree (event_key);


--
-- Name: it_asset_statuses_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX it_asset_statuses_code_key ON public.it_asset_statuses USING btree (code);


--
-- Name: it_asset_statuses_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX it_asset_statuses_name_key ON public.it_asset_statuses USING btree (name);


--
-- Name: it_asset_types_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX it_asset_types_code_key ON public.it_asset_types USING btree (code);


--
-- Name: it_asset_types_management_code_prefix_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX it_asset_types_management_code_prefix_key ON public.it_asset_types USING btree (management_code_prefix);


--
-- Name: it_asset_types_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX it_asset_types_name_key ON public.it_asset_types USING btree (name);


--
-- Name: it_assets_asset_tag_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX it_assets_asset_tag_key ON public.it_assets USING btree (asset_tag);


--
-- Name: it_assets_cpu_type_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX it_assets_cpu_type_id_idx ON public.it_assets USING btree (cpu_type_id);


--
-- Name: it_assets_location_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX it_assets_location_id_idx ON public.it_assets USING btree (location_id);


--
-- Name: it_assets_manufacturer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX it_assets_manufacturer_id_idx ON public.it_assets USING btree (manufacturer_id);


--
-- Name: it_assets_manufacturer_id_serial_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX it_assets_manufacturer_id_serial_number_key ON public.it_assets USING btree (manufacturer_id, serial_number);


--
-- Name: it_assets_operating_system_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX it_assets_operating_system_id_idx ON public.it_assets USING btree (operating_system_id);


--
-- Name: it_assets_status_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX it_assets_status_id_idx ON public.it_assets USING btree (status_id);


--
-- Name: it_assets_type_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX it_assets_type_id_idx ON public.it_assets USING btree (type_id);


--
-- Name: manufacturers_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX manufacturers_code_key ON public.manufacturers USING btree (code);


--
-- Name: manufacturers_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX manufacturers_name_key ON public.manufacturers USING btree (name);


--
-- Name: operating_systems_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX operating_systems_code_key ON public.operating_systems USING btree (code);


--
-- Name: operating_systems_display_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX operating_systems_display_name_key ON public.operating_systems USING btree (display_name);


--
-- Name: password_reset_tokens_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_employee_id_idx ON public.password_reset_tokens USING btree (employee_id);


--
-- Name: password_reset_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_expires_at_idx ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: password_reset_tokens_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX password_reset_tokens_token_hash_key ON public.password_reset_tokens USING btree (token_hash);


--
-- Name: positions_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX positions_code_key ON public.positions USING btree (code);


--
-- Name: positions_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX positions_name_key ON public.positions USING btree (name);


--
-- Name: roles_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_code_key ON public.roles USING btree (code);


--
-- Name: rooms_branch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rooms_branch_id_idx ON public.rooms USING btree (branch_id);


--
-- Name: rooms_branch_id_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX rooms_branch_id_name_key ON public.rooms USING btree (branch_id, name);


--
-- Name: rooms_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX rooms_code_key ON public.rooms USING btree (code);


--
-- Name: sessions_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_employee_id_idx ON public.sessions USING btree (employee_id);


--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);


--
-- Name: sessions_token_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sessions_token_hash_key ON public.sessions USING btree (token_hash);


--
-- Name: storage_locations_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX storage_locations_code_key ON public.storage_locations USING btree (code);


--
-- Name: storage_locations_room_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_locations_room_id_idx ON public.storage_locations USING btree (room_id);


--
-- Name: storage_locations_room_id_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX storage_locations_room_id_name_key ON public.storage_locations USING btree (room_id, name);


--
-- Name: account_invitations account_invitations_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER account_invitations_set_updated_at BEFORE UPDATE ON public.account_invitations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: audit_logs audit_logs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_logs_set_updated_at BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: branches branches_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER branches_set_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: chair_assignments chair_assignments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER chair_assignments_set_updated_at BEFORE UPDATE ON public.chair_assignments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: chairs chairs_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER chairs_set_updated_at BEFORE UPDATE ON public.chairs FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: cpu_types cpu_types_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cpu_types_set_updated_at BEFORE UPDATE ON public.cpu_types FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: departments departments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER departments_set_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: desk_assignments desk_assignments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER desk_assignments_set_updated_at BEFORE UPDATE ON public.desk_assignments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: desks desks_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER desks_set_updated_at BEFORE UPDATE ON public.desks FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: employee_groups employee_groups_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER employee_groups_set_updated_at BEFORE UPDATE ON public.employee_groups FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: employee_roles employee_roles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER employee_roles_set_updated_at BEFORE UPDATE ON public.employee_roles FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: employees employees_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER employees_set_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: employment_types employment_types_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER employment_types_set_updated_at BEFORE UPDATE ON public.employment_types FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: it_asset_assignments it_asset_assignments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER it_asset_assignments_set_updated_at BEFORE UPDATE ON public.it_asset_assignments FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: it_asset_change_history it_asset_change_history_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER it_asset_change_history_set_updated_at BEFORE UPDATE ON public.it_asset_change_history FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: it_asset_statuses it_asset_statuses_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER it_asset_statuses_set_updated_at BEFORE UPDATE ON public.it_asset_statuses FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: it_asset_types it_asset_types_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER it_asset_types_set_updated_at BEFORE UPDATE ON public.it_asset_types FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: it_assets it_assets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER it_assets_set_updated_at BEFORE UPDATE ON public.it_assets FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: manufacturers manufacturers_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER manufacturers_set_updated_at BEFORE UPDATE ON public.manufacturers FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: operating_systems operating_systems_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER operating_systems_set_updated_at BEFORE UPDATE ON public.operating_systems FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: password_reset_tokens password_reset_tokens_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER password_reset_tokens_set_updated_at BEFORE UPDATE ON public.password_reset_tokens FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: positions positions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER positions_set_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: roles roles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: rooms rooms_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rooms_set_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: sessions sessions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sessions_set_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: storage_locations storage_locations_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER storage_locations_set_updated_at BEFORE UPDATE ON public.storage_locations FOR EACH ROW EXECUTE FUNCTION public.set_record_updated_at();


--
-- Name: account_invitations account_invitations_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_invitations
    ADD CONSTRAINT account_invitations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: account_invitations account_invitations_issued_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_invitations
    ADD CONSTRAINT account_invitations_issued_by_id_fkey FOREIGN KEY (issued_by_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: chair_assignments chair_assignments_chair_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chair_assignments
    ADD CONSTRAINT chair_assignments_chair_id_fkey FOREIGN KEY (chair_id) REFERENCES public.chairs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: chair_assignments chair_assignments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chair_assignments
    ADD CONSTRAINT chair_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: chairs chairs_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chairs
    ADD CONSTRAINT chairs_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.storage_locations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cpu_types cpu_types_manufacturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cpu_types
    ADD CONSTRAINT cpu_types_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desk_assignments desk_assignments_desk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desk_assignments
    ADD CONSTRAINT desk_assignments_desk_id_fkey FOREIGN KEY (desk_id) REFERENCES public.desks(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desk_assignments desk_assignments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desk_assignments
    ADD CONSTRAINT desk_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desks desks_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desks
    ADD CONSTRAINT desks_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.storage_locations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_roles employee_roles_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_roles employee_roles_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_roles employee_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employee_roles employee_roles_scope_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_roles
    ADD CONSTRAINT employee_roles_scope_employee_id_fkey FOREIGN KEY (scope_employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employees employees_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employees employees_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: employees employees_employment_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_employment_type_id_fkey FOREIGN KEY (employment_type_id) REFERENCES public.employment_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: employees employees_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.employee_groups(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: employees employees_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: it_asset_assignments it_asset_assignments_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_asset_assignments
    ADD CONSTRAINT it_asset_assignments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.it_assets(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: it_asset_assignments it_asset_assignments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_asset_assignments
    ADD CONSTRAINT it_asset_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: it_asset_change_history it_asset_change_history_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_asset_change_history
    ADD CONSTRAINT it_asset_change_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: it_asset_change_history it_asset_change_history_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_asset_change_history
    ADD CONSTRAINT it_asset_change_history_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.it_assets(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: it_assets it_assets_cpu_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_cpu_type_id_fkey FOREIGN KEY (cpu_type_id) REFERENCES public.cpu_types(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: it_assets it_assets_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.storage_locations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: it_assets it_assets_manufacturer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_manufacturer_id_fkey FOREIGN KEY (manufacturer_id) REFERENCES public.manufacturers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: it_assets it_assets_operating_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_operating_system_id_fkey FOREIGN KEY (operating_system_id) REFERENCES public.operating_systems(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: it_assets it_assets_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.it_asset_statuses(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: it_assets it_assets_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.it_assets
    ADD CONSTRAINT it_assets_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.it_asset_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: password_reset_tokens password_reset_tokens_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: rooms rooms_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sessions sessions_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: storage_locations storage_locations_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_locations
    ADD CONSTRAINT storage_locations_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

SET search_path = public;

-- Initial master data. Audit timestamps use their column defaults.

-- departments (3 rows)
INSERT INTO "departments" ("id", "code", "name") VALUES ('1', 'GENERAL', 'General Affairs');
INSERT INTO "departments" ("id", "code", "name") VALUES ('2', 'ENGINEERING', 'Engineering');
INSERT INTO "departments" ("id", "code", "name") VALUES ('3', 'SALES', 'Sales');
SELECT setval(pg_get_serial_sequence('"departments"', 'id'), (SELECT MAX(id) FROM "departments"), true);

-- employee_groups (3 rows)
INSERT INTO "employee_groups" ("id", "code", "name") VALUES ('1', 'GENERAL', 'General');
INSERT INTO "employee_groups" ("id", "code", "name") VALUES ('2', 'PLATFORM', 'Platform');
INSERT INTO "employee_groups" ("id", "code", "name") VALUES ('3', 'FIELD_SALES', 'Field Sales');
SELECT setval(pg_get_serial_sequence('"employee_groups"', 'id'), (SELECT MAX(id) FROM "employee_groups"), true);

-- positions (3 rows)
INSERT INTO "positions" ("id", "code", "name") VALUES ('1', 'MEMBER', 'Member');
INSERT INTO "positions" ("id", "code", "name") VALUES ('2', 'MANAGER', 'Manager');
INSERT INTO "positions" ("id", "code", "name") VALUES ('3', 'DIRECTOR', 'Director');
SELECT setval(pg_get_serial_sequence('"positions"', 'id'), (SELECT MAX(id) FROM "positions"), true);

-- employment_types (4 rows)
INSERT INTO "employment_types" ("id", "code", "name") VALUES ('1', 'REGULAR', 'Regular');
INSERT INTO "employment_types" ("id", "code", "name") VALUES ('2', 'CONTRACT', 'Contract');
INSERT INTO "employment_types" ("id", "code", "name") VALUES ('3', 'PART_TIME', 'Part Time');
INSERT INTO "employment_types" ("id", "code", "name") VALUES ('4', 'TEMPORARY', 'Temporary');
SELECT setval(pg_get_serial_sequence('"employment_types"', 'id'), (SELECT MAX(id) FROM "employment_types"), true);

-- branches (3 rows)
INSERT INTO "branches" ("id", "code", "name", "address") VALUES ('1', 'HEAD_OFFICE', 'Head Office', NULL);
INSERT INTO "branches" ("id", "code", "name", "address") VALUES ('2', 'NAGASAKI', 'Nagasaki Branch', NULL);
INSERT INTO "branches" ("id", "code", "name", "address") VALUES ('3', 'TOKYO', 'Tokyo Branch', NULL);
SELECT setval(pg_get_serial_sequence('"branches"', 'id'), (SELECT MAX(id) FROM "branches"), true);

-- rooms (3 rows)
INSERT INTO "rooms" ("id", "code", "name", "floor", "branch_id") VALUES ('1', 'HEAD_1F_MEETING', '1F Meeting Room', '1F', '1');
INSERT INTO "rooms" ("id", "code", "name", "floor", "branch_id") VALUES ('2', 'NAGASAKI_SECURE', 'Secure Area', NULL, '2');
INSERT INTO "rooms" ("id", "code", "name", "floor", "branch_id") VALUES ('3', 'TOKYO_MEETING_B', 'Meeting Room B', NULL, '3');
SELECT setval(pg_get_serial_sequence('"rooms"', 'id'), (SELECT MAX(id) FROM "rooms"), true);

-- storage_locations (3 rows)
INSERT INTO "storage_locations" ("id", "code", "name", "kind", "room_id") VALUES ('1', 'HEAD_1F_MEETING_GENERAL', 'General placement', 'ROOM', '1');
INSERT INTO "storage_locations" ("id", "code", "name", "kind", "room_id") VALUES ('2', 'NAGASAKI_SECURE_GENERAL', 'General placement', 'SECURE_AREA', '2');
INSERT INTO "storage_locations" ("id", "code", "name", "kind", "room_id") VALUES ('3', 'TOKYO_MEETING_B_GENERAL', 'General placement', 'ROOM', '3');
SELECT setval(pg_get_serial_sequence('"storage_locations"', 'id'), (SELECT MAX(id) FROM "storage_locations"), true);

-- it_asset_types (8 rows)
INSERT INTO "it_asset_types" ("id", "code", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('1', 'LAPTOP', 'Laptop', 'true', 'true', 'true', 'true', '10', 'NPC', '1');
INSERT INTO "it_asset_types" ("id", "code", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('2', 'DESKTOP', 'Desktop', 'true', 'true', 'true', 'true', '20', 'DPC', '1');
INSERT INTO "it_asset_types" ("id", "code", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('3', 'SERVER', 'Server', 'true', 'true', 'true', 'true', '30', 'SRV', '1');
INSERT INTO "it_asset_types" ("id", "code", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('4', 'NAS', 'NAS', 'true', 'true', 'true', 'true', '40', 'NAS', '1');
INSERT INTO "it_asset_types" ("id", "code", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('5', 'UTM', 'UTM', 'false', 'false', 'false', 'false', '50', 'UTM', '1');
INSERT INTO "it_asset_types" ("id", "code", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('6', 'UPS', 'UPS', 'false', 'false', 'false', 'false', '60', 'UPS', '1');
INSERT INTO "it_asset_types" ("id", "code", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('7', 'PERIPHERAL', 'PC peripheral', 'false', 'false', 'false', 'false', '70', 'OTH', '1');
INSERT INTO "it_asset_types" ("id", "code", "name", "supports_cpu", "supports_ram", "supports_os", "supports_login_username", "sort_order", "management_code_prefix", "next_management_number") VALUES ('8', 'DISPLAY', 'Display', 'false', 'false', 'false', 'false', '65', 'DSP', '1');
SELECT setval(pg_get_serial_sequence('"it_asset_types"', 'id'), (SELECT MAX(id) FROM "it_asset_types"), true);

-- it_asset_statuses (4 rows)
INSERT INTO "it_asset_statuses" ("id", "code", "name", "disposal_date_policy", "sort_order") VALUES ('1', 'NORMAL', 'Normal', 'prohibited', '10');
INSERT INTO "it_asset_statuses" ("id", "code", "name", "disposal_date_policy", "sort_order") VALUES ('2', 'BROKEN', 'Broken', 'prohibited', '20');
INSERT INTO "it_asset_statuses" ("id", "code", "name", "disposal_date_policy", "sort_order") VALUES ('3', 'PENDING_DISPOSAL', 'Pending disposal', 'optional', '30');
INSERT INTO "it_asset_statuses" ("id", "code", "name", "disposal_date_policy", "sort_order") VALUES ('4', 'DISPOSED', 'Disposed', 'required', '40');
SELECT setval(pg_get_serial_sequence('"it_asset_statuses"', 'id'), (SELECT MAX(id) FROM "it_asset_statuses"), true);

-- manufacturers (29 rows)
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('1', 'INTEL', 'Intel', 'https://www.intel.com/', '2026-09-21', '10');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('10', 'LENOVO', 'Lenovo', 'https://www.lenovo.com/', '2026-09-21', '100');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('11', 'ASUS', 'ASUS', 'https://www.asus.com/', '2026-09-21', '110');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('12', 'ACER', 'Acer', 'https://www.acer.com/', '2026-09-21', '120');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('13', 'PANASONIC', 'Panasonic', 'https://www.panasonic.com/', '2026-09-21', '130');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('14', 'DYNABOOK', 'Dynabook', 'https://dynabook.com/', '2026-09-21', '140');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('15', 'IBM', 'IBM', 'https://www.ibm.com/', '2026-09-21', '150');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('16', 'SUPERMICRO', 'Supermicro', 'https://www.supermicro.com/', '2026-09-21', '160');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('17', 'SYNOLOGY', 'Synology', 'https://www.synology.com/', '2026-09-21', '170');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('18', 'QNAP', 'QNAP', 'https://www.qnap.com/', '2026-09-21', '180');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('19', 'BUFFALO', 'Buffalo', 'https://www.buffalo.jp/', '2026-09-21', '190');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('2', 'AMD', 'AMD', 'https://www.amd.com/', '2026-09-21', '20');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('20', 'IODATA', 'I-O DATA', 'https://www.iodata.jp/', '2026-09-21', '200');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('21', 'CISCO', 'Cisco', 'https://www.cisco.com/', '2026-09-21', '210');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('22', 'FORTINET', 'Fortinet', 'https://www.fortinet.com/', '2026-09-21', '220');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('23', 'PALOALTO', 'Palo Alto Networks', 'https://www.paloaltonetworks.com/', '2026-09-21', '230');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('24', 'YAMAHA', 'Yamaha', 'https://network.yamaha.com/', '2026-09-21', '240');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('25', 'SONICWALL', 'SonicWall', 'https://www.sonicwall.com/', '2026-09-21', '250');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('26', 'APC', 'APC by Schneider Electric', 'https://www.apc.com/', '2026-09-21', '260');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('27', 'EATON', 'Eaton', 'https://www.eaton.com/', '2026-09-21', '270');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('28', 'OMRON', 'OMRON', 'https://www.omron.com/', '2026-09-21', '280');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('29', 'CYBERPOWER', 'CyberPower', 'https://www.cyberpower.com/', '2026-09-21', '290');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('3', 'APPLE', 'Apple', 'https://www.apple.com/', '2026-09-21', '30');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('4', 'NEC', 'NEC', 'https://www.nec.com/', '2026-09-21', '40');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('5', 'MOUSE', 'Mouse Computer', 'https://www.mouse-jp.co.jp/', '2026-09-21', '50');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('6', 'FUJITSU', 'Fujitsu', 'https://www.fujitsu.com/', '2026-09-21', '60');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('7', 'DELL', 'Dell Technologies', 'https://www.dell.com/', '2026-09-21', '70');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('8', 'HP', 'HP', 'https://www.hp.com/', '2026-09-21', '80');
INSERT INTO "manufacturers" ("id", "code", "name", "official_url", "source_checked_on", "sort_order") VALUES ('9', 'HPE', 'Hewlett Packard Enterprise', 'https://www.hpe.com/', '2026-09-21', '90');
SELECT setval(pg_get_serial_sequence('"manufacturers"', 'id'), (SELECT MAX(id) FROM "manufacturers"), true);

-- cpu_types (17 rows)
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('1', 'INTEL_I5_2450M', '1', 'Core i5', 'i5-2450M', 'Intel Core i5-2450M', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '10');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('10', 'INTEL_I7_14700K', '1', 'Core i7', 'i7-14700K', 'Intel Core i7-14700K', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '100');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('11', 'AMD_RYZEN7_7840U', '2', 'Ryzen 7', '7840U', 'AMD Ryzen 7 7840U', 'https://www.amd.com/en/products/specifications.html', '2026-09-21', '110');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('12', 'AMD_RYZEN9_7950X', '2', 'Ryzen 9', '7950X', 'AMD Ryzen 9 7950X', 'https://www.amd.com/en/products/specifications.html', '2026-09-21', '120');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('13', 'AMD_EPYC_9654', '2', 'EPYC', '9654', 'AMD EPYC 9654', 'https://www.amd.com/en/products/processors/server/epyc.html', '2026-09-21', '130');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('14', 'APPLE_M1', '3', 'Apple M', 'M1', 'Apple M1', 'https://support.apple.com/', '2026-09-21', '140');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('15', 'APPLE_M2', '3', 'Apple M', 'M2', 'Apple M2', 'https://support.apple.com/', '2026-09-21', '150');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('16', 'APPLE_M3', '3', 'Apple M', 'M3', 'Apple M3', 'https://support.apple.com/', '2026-09-21', '160');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('17', 'APPLE_M4', '3', 'Apple M', 'M4', 'Apple M4', 'https://support.apple.com/', '2026-09-21', '170');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('2', 'INTEL_I5_3230M', '1', 'Core i5', 'i5-3230M', 'Intel Core i5-3230M', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '20');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('3', 'INTEL_I5_3340M', '1', 'Core i5', 'i5-3340M', 'Intel Core i5-3340M', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '30');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('4', 'INTEL_I7_4710MQ', '1', 'Core i7', 'i7-4710MQ', 'Intel Core i7-4710MQ', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '40');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('5', 'INTEL_I5_6200U', '1', 'Core i5', 'i5-6200U', 'Intel Core i5-6200U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '50');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('6', 'INTEL_I7_8565U', '1', 'Core i7', 'i7-8565U', 'Intel Core i7-8565U', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '60');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('7', 'AMD_RYZEN5_7530U', '2', 'Ryzen 5', '7530U', 'AMD Ryzen 5 7530U', 'https://www.amd.com/en/products/specifications.html', '2026-09-21', '70');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('8', 'INTEL_I9_13900', '1', 'Core i9', 'i9-13900', 'Intel Core i9-13900', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '80');
INSERT INTO "cpu_types" ("id", "code", "manufacturer_id", "series", "model_number", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('9', 'INTEL_I5_13600K', '1', 'Core i5', 'i5-13600K', 'Intel Core i5-13600K', 'https://www.intel.com/content/www/us/en/products/details/processors.html', '2026-09-21', '90');
SELECT setval(pg_get_serial_sequence('"cpu_types"', 'id'), (SELECT MAX(id) FROM "cpu_types"), true);

-- operating_systems (21 rows)
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('1', 'WIN10_PRO_X64', 'Microsoft', 'Windows', '10', 'Pro', 'x64', 'Microsoft Windows 10 Pro (x64)', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-10-home-and-pro', '2026-09-21', '10');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('10', 'UBUNTU_2204_AMD64', 'Canonical', 'Ubuntu', '22.04 LTS', NULL, 'amd64', 'Ubuntu 22.04 LTS (amd64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '100');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('11', 'UBUNTU_2404_AMD64', 'Canonical', 'Ubuntu', '24.04 LTS', NULL, 'amd64', 'Ubuntu 24.04 LTS (amd64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '110');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('12', 'UBUNTU_2604_AMD64', 'Canonical', 'Ubuntu', '26.04 LTS', NULL, 'amd64', 'Ubuntu 26.04 LTS (amd64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '120');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('13', 'UBUNTU_2204_ARM64', 'Canonical', 'Ubuntu', '22.04 LTS', NULL, 'arm64', 'Ubuntu 22.04 LTS (arm64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '130');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('14', 'UBUNTU_2404_ARM64', 'Canonical', 'Ubuntu', '24.04 LTS', NULL, 'arm64', 'Ubuntu 24.04 LTS (arm64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '140');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('15', 'UBUNTU_2604_ARM64', 'Canonical', 'Ubuntu', '26.04 LTS', NULL, 'arm64', 'Ubuntu 26.04 LTS (arm64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '150');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('16', 'RHEL_8_X64', 'Red Hat', 'Red Hat Enterprise Linux', '8', NULL, 'x64', 'Red Hat Enterprise Linux 8 (x64)', 'https://access.redhat.com/support/policy/updates/errata', '2026-09-21', '160');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('17', 'RHEL_9_X64', 'Red Hat', 'Red Hat Enterprise Linux', '9', NULL, 'x64', 'Red Hat Enterprise Linux 9 (x64)', 'https://access.redhat.com/support/policy/updates/errata', '2026-09-21', '170');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('18', 'DEBIAN_12_X64', 'Debian Project', 'Debian', '12', NULL, 'x64', 'Debian 12 (x64)', 'https://www.debian.org/releases/', '2026-09-21', '180');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('19', 'DEBIAN_13_X64', 'Debian Project', 'Debian', '13', NULL, 'x64', 'Debian 13 (x64)', 'https://www.debian.org/releases/', '2026-09-21', '190');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('2', 'WIN10_ENT_X64', 'Microsoft', 'Windows', '10', 'Enterprise', 'x64', 'Microsoft Windows 10 Enterprise (x64)', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-10-enterprise-and-education', '2026-09-21', '20');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('20', 'MACOS_14_ARM64', 'Apple', 'macOS', '14 Sonoma', NULL, 'ARM64', 'Apple macOS 14 Sonoma', 'https://support.apple.com/en-us/109033', '2026-09-21', '200');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('21', 'MACOS_15_ARM64', 'Apple', 'macOS', '15 Sequoia', NULL, 'ARM64', 'Apple macOS 15 Sequoia', 'https://support.apple.com/en-us/109033', '2026-09-21', '210');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('3', 'WIN11_PRO_X64', 'Microsoft', 'Windows', '11', 'Pro', 'x64', 'Microsoft Windows 11 Pro (x64)', 'https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information', '2026-09-21', '30');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('4', 'WIN11_ENT_X64', 'Microsoft', 'Windows', '11', 'Enterprise', 'x64', 'Microsoft Windows 11 Enterprise (x64)', 'https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information', '2026-09-21', '40');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('5', 'WIN11_PRO_ARM64', 'Microsoft', 'Windows', '11', 'Pro', 'ARM64', 'Microsoft Windows 11 Pro (ARM64)', 'https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information', '2026-09-21', '50');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('6', 'WIN_SERVER_2019_STD', 'Microsoft', 'Windows Server', '2019', 'Standard', 'x64', 'Microsoft Windows Server 2019 Standard', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2019', '2026-09-21', '60');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('7', 'WIN_SERVER_2022_STD', 'Microsoft', 'Windows Server', '2022', 'Standard', 'x64', 'Microsoft Windows Server 2022 Standard', 'https://learn.microsoft.com/en-us/lifecycle/products/windows-server-2022', '2026-09-21', '70');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('8', 'WIN_SERVER_2025_STD', 'Microsoft', 'Windows Server', '2025', 'Standard', 'x64', 'Microsoft Windows Server 2025 Standard', 'https://learn.microsoft.com/en-us/windows-server/get-started/windows-server-release-info', '2026-09-21', '80');
INSERT INTO "operating_systems" ("id", "code", "vendor", "product", "version", "edition", "architecture", "display_name", "official_url", "source_checked_on", "sort_order") VALUES ('9', 'UBUNTU_2004_AMD64', 'Canonical', 'Ubuntu', '20.04 LTS', NULL, 'amd64', 'Ubuntu 20.04 LTS (amd64)', 'https://ubuntu.com/about/release-cycle', '2026-09-21', '90');
SELECT setval(pg_get_serial_sequence('"operating_systems"', 'id'), (SELECT MAX(id) FROM "operating_systems"), true);

-- roles (3 rows)
INSERT INTO "roles" ("id", "code", "name") VALUES ('1', 'system_administrator', 'System Administrator');
INSERT INTO "roles" ("id", "code", "name") VALUES ('2', 'business_administrator', 'Business Administrator');
INSERT INTO "roles" ("id", "code", "name") VALUES ('3', 'general_user', 'General User');
SELECT setval(pg_get_serial_sequence('"roles"', 'id'), (SELECT MAX(id) FROM "roles"), true);
