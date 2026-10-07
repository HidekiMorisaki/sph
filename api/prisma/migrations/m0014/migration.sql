DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.employees WHERE gender NOT IN ('female', 'male', 'unspecified')) THEN
    RAISE EXCEPTION 'Employee gender values require cleanup before m0014';
  END IF;
END $$;

ALTER TABLE public.employees
  ADD CONSTRAINT employee_gender_allowed CHECK (gender IN ('female', 'male', 'unspecified'));
