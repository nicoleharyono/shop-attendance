alter table public.attendance
  add column if not exists updated_at timestamptz not null default now();

update public.attendance
set updated_at = now()
where updated_at is null;

with ranked_employees as (
  select id, row_number() over (order by sort_order, id) - 1 as normalized_sort_order
  from public.employees
)
update public.employees as employee
set sort_order = ranked_employees.normalized_sort_order
from ranked_employees
where employee.id = ranked_employees.id;

create index if not exists attendance_date_idx on public.attendance (date);
create unique index if not exists attendance_employee_date_key on public.attendance (employee_id, date);
create unique index if not exists employees_sort_order_key on public.employees (sort_order);
