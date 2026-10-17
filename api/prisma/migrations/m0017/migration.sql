ALTER TABLE public.employees ADD COLUMN country_code varchar(2) NOT NULL DEFAULT 'JP';
ALTER TABLE public.branches ADD COLUMN country_code varchar(2) NOT NULL DEFAULT 'JP';
ALTER TABLE public.employees ALTER COLUMN postal_code TYPE varchar(10);
ALTER TABLE public.branches ALTER COLUMN postal_code TYPE varchar(10);
ALTER TABLE public.employees ADD CONSTRAINT employees_country_code_check CHECK (country_code IN ('JP', 'US'));
ALTER TABLE public.branches ADD CONSTRAINT branches_country_code_check CHECK (country_code IN ('JP', 'US'));
