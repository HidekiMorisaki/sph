ALTER TABLE public.work_calendars ADD COLUMN country_code varchar(2) NOT NULL DEFAULT 'JP';
ALTER TABLE public.calendar_date_attributes ADD COLUMN country_code varchar(2) NOT NULL DEFAULT 'JP';
ALTER TABLE public.calendar_holiday_imports ADD COLUMN country_code varchar(2) NOT NULL DEFAULT 'JP';

ALTER TABLE public.work_calendars ADD CONSTRAINT work_calendars_country_code_check CHECK (country_code IN ('JP', 'US'));
ALTER TABLE public.calendar_date_attributes ADD CONSTRAINT calendar_date_attributes_country_code_check CHECK (country_code IN ('JP', 'US'));
ALTER TABLE public.calendar_holiday_imports ADD CONSTRAINT calendar_holiday_imports_country_code_check CHECK (country_code IN ('JP', 'US'));

DROP INDEX public.calendar_date_attributes_calendar_date_kind_key;
CREATE UNIQUE INDEX calendar_date_attributes_country_code_calendar_date_kind_key ON public.calendar_date_attributes (country_code, calendar_date, kind);
CREATE INDEX calendar_holiday_imports_country_code_completed_at_idx ON public.calendar_holiday_imports (country_code, completed_at);
