-- Unassigned legacy attendance may have duplicate records. Keep those untouched.
-- Every tenant-scoped employee may have only one attendance record on a date.
CREATE UNIQUE INDEX IF NOT EXISTS ux_attendance_restaurant_employee_date
  ON public.attendance (restaurant_id, employee_id, date)
  WHERE restaurant_id IS NOT NULL AND employee_id IS NOT NULL AND date IS NOT NULL;
