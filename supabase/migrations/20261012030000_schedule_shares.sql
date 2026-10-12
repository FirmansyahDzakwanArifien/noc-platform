-- =============================================================================
-- Jadwal: link publik (tanpa login) untuk rentang tanggal tertentu
-- =============================================================================
-- Token = UUID acak (122 bit). Hanya jadwal dari periode yang sudah published yang ikut tampil,
-- dan data yang dibuka ke publik hanya nama lengkap + shift (tanpa email/telepon).

create table public.schedule_shares (
  id          uuid primary key default gen_random_uuid(),
  token       uuid not null unique default gen_random_uuid(),
  title       text not null,
  start_date  date not null,
  end_date    date not null,
  team_id     uuid references public.teams(id) on delete set null,
  expires_at  timestamptz,
  revoked_at  timestamptz,
  view_count  integer not null default 0,
  last_viewed_at timestamptz,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date >= start_date),
  check (end_date - start_date <= 92)
);
create index on public.schedule_shares (created_at desc);

create trigger set_updated_at before update on public.schedule_shares
  for each row execute function public.tg_set_updated_at();

alter table public.schedule_shares enable row level security;

create policy "read" on public.schedule_shares for select to authenticated
  using (public.has_permission('schedule.manage'));
create policy "insert" on public.schedule_shares for insert to authenticated
  with check (public.has_permission('schedule.manage') and created_by = auth.uid());
create policy "update" on public.schedule_shares for update to authenticated
  using (public.has_permission('schedule.manage'))
  with check (public.has_permission('schedule.manage'));
create policy "delete" on public.schedule_shares for delete to authenticated
  using (public.has_permission('schedule.manage'));

-- Dipanggil halaman publik /s/<token> (anon). Null jika token tidak valid / dicabut / kedaluwarsa.
create or replace function public.get_shared_schedule(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_share public.schedule_shares%rowtype;
  v_team  text;
  v_rows  jsonb;
  v_shifts jsonb;
begin
  select * into v_share from public.schedule_shares
   where token = p_token
     and revoked_at is null
     and (expires_at is null or expires_at > now());
  if not found then
    return null;
  end if;

  update public.schedule_shares
     set view_count = view_count + 1, last_viewed_at = now()
   where id = v_share.id;

  select name into v_team from public.teams where id = v_share.team_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'work_date', s.work_date,
           'user_key', md5(s.user_id::text || v_share.token::text),
           'full_name', pr.full_name,
           'shift_code', sh.code,
           'is_leader', s.is_leader
         ) order by s.work_date, sh.sort_order, pr.full_name), '[]'::jsonb)
    into v_rows
    from public.shift_schedules s
    join public.schedule_periods p on p.id = s.period_id and p.status = 'published'
    join public.shifts sh on sh.id = s.shift_id
    join public.profiles pr on pr.id = s.user_id
   where s.work_date between v_share.start_date and v_share.end_date
     and (v_share.team_id is null or p.team_id = v_share.team_id or pr.team_id = v_share.team_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'code', sh.code, 'name', sh.name, 'color', sh.color,
           'start_time', sh.start_time, 'end_time', sh.end_time, 'is_working', sh.is_working
         ) order by sh.sort_order), '[]'::jsonb)
    into v_shifts
    from public.shifts sh;

  return jsonb_build_object(
    'title', v_share.title,
    'start_date', v_share.start_date,
    'end_date', v_share.end_date,
    'team_name', v_team,
    'expires_at', v_share.expires_at,
    'rows', v_rows,
    'shifts', v_shifts
  );
end $$;

revoke execute on function public.get_shared_schedule(uuid) from public;
grant execute on function public.get_shared_schedule(uuid) to anon, authenticated;
