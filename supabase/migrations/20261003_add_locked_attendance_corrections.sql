create table if not exists public.attendance_corrections (
  id bigint generated always as identity primary key,
  employee_id uuid not null,
  date date not null,
  previous_status text not null check (previous_status in ('present', 'absent')),
  new_status text not null check (new_status in ('present', 'absent')),
  corrected_at timestamptz not null,
  reason text not null check (length(trim(reason)) between 1 and 1000)
);

alter table public.attendance_corrections enable row level security;

revoke all on table public.attendance_corrections from public, anon, authenticated;
grant insert on table public.attendance_corrections to service_role;
grant usage on sequence public.attendance_corrections_id_seq to service_role;

create or replace function public.correct_locked_attendance(
  p_employee_id uuid,
  p_date date,
  p_new_status text,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_record public.attendance%rowtype;
  corrected_at timestamptz := clock_timestamp();
begin
  if p_new_status not in ('present', 'absent') then
    raise exception 'Invalid attendance status';
  end if;

  if p_reason is null or length(trim(p_reason)) not between 1 and 1000 then
    raise exception 'A reason of up to 1000 characters is required';
  end if;

  select * into existing_record
  from public.attendance
  where employee_id = p_employee_id and date = p_date
  for update;

  if not found then
    raise exception 'Attendance record not found' using errcode = 'P0002';
  end if;

  if existing_record.updated_at > corrected_at - interval '5 minutes' then
    raise exception 'Attendance record is not locked yet';
  end if;

  if existing_record.status::text = p_new_status then
    raise exception 'Choose a different attendance status';
  end if;

  insert into public.attendance_corrections (
    employee_id, date, previous_status, new_status, corrected_at, reason
  ) values (
    p_employee_id, p_date, existing_record.status::text, p_new_status, corrected_at, trim(p_reason)
  );

  update public.attendance
  set status = p_new_status, updated_at = corrected_at
  where employee_id = p_employee_id and date = p_date
  returning * into existing_record;

  return jsonb_build_object(
    'employee_id', existing_record.employee_id,
    'date', existing_record.date,
    'status', existing_record.status,
    'updated_at', existing_record.updated_at
  );
end;
$$;

revoke all on function public.correct_locked_attendance(uuid, date, text, text) from public, anon, authenticated;
grant execute on function public.correct_locked_attendance(uuid, date, text, text) to service_role;