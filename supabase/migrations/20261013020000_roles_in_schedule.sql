-- =============================================================================
-- Role tertentu (admin, supervisor) tidak masuk jadwal shift.
-- Diatur lewat roles.in_schedule; user dengan salah satu role in_schedule=false
-- tidak bisa dijadwalkan dan tidak bisa dipilih sebagai rekan tukar shift.
-- =============================================================================
alter table public.roles add column in_schedule boolean not null default true;
comment on column public.roles.in_schedule is 'false = pemegang role ini tidak masuk jadwal shift';
update public.roles set in_schedule = false where key in ('admin', 'supervisor');

create or replace function public.is_schedulable(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
     where ur.user_id = p_user and not r.in_schedule
  );
$$;

-- Daftar user yang tidak masuk jadwal (dipakai UI untuk menyaring pilihan).
create or replace function public.unschedulable_users()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select distinct ur.user_id from public.user_roles ur join public.roles r on r.id = ur.role_id where not r.in_schedule;
$$;

revoke all on function public.is_schedulable(uuid) from public, anon;
revoke all on function public.unschedulable_users() from public, anon;
grant execute on function public.is_schedulable(uuid) to authenticated;
grant execute on function public.unschedulable_users() to authenticated;

create or replace function public.guard_schedule_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_schedulable(new.user_id) then
    raise exception 'Administrator/Supervisor tidak masuk jadwal shift.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger guard_schedule_user
  before insert or update of user_id on public.shift_schedules
  for each row execute function public.guard_schedule_user();

create or replace function public.guard_swap_partner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.swap_with is not null and not public.is_schedulable(new.swap_with) then
    raise exception 'Administrator/Supervisor tidak bisa dipilih sebagai rekan tukar shift.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger guard_swap_partner
  before insert or update of swap_with on public.leave_requests
  for each row execute function public.guard_swap_partner();

revoke all on function public.guard_schedule_user() from public, anon, authenticated;
revoke all on function public.guard_swap_partner() from public, anon, authenticated;
