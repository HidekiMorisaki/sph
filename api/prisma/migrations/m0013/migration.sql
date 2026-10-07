DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.employees WHERE gender !~ '[^[:space:]]') THEN
    RAISE EXCEPTION 'Employee gender values require cleanup before m0013';
  END IF;
END $$;

ALTER TABLE public.employees
  ADD CONSTRAINT employee_gender_nonblank CHECK (gender ~ '[^[:space:]]');
