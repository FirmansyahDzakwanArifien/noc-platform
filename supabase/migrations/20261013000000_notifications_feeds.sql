-- =============================================================================
-- Notifikasi otomatis lintas app, tolak tukar shift, feed kalender pribadi (iCal),
-- dan "siapa jaga sekarang".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper notifikasi (internal, dipanggil dari trigger)
-- -----------------------------------------------------------------------------
-- Tidak mengirim ke diri sendiri (aksi yang dilakukan user itu sendiri tidak perlu dinotifikasi).
create or replace function public.notify(p_user uuid, p_app text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, app, title, body, link)
  select p_user, p_app, p_title, p_body, p_link
   where p_user is not null and p_user is distinct from auth.uid();
$$;

-- Semua user aktif yang memiliki permission tertentu.
create or replace function public.users_with_permission(p_perm text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select distinct ur.user_id
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.profiles p          on p.id = ur.user_id
   where rp.permission_key = p_perm and p.is_active;
$$;

-- -----------------------------------------------------------------------------
-- 2. Trigger notifikasi per modul
-- -----------------------------------------------------------------------------
-- Perizinan: approver ditunjuk / keputusan approval
create or replace function public.tg_notify_permit_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_permit public.permits%rowtype;
begin
  select * into v_permit from public.permits where id = new.permit_id;
  if tg_op = 'INSERT' and new.decision = 'pending' then
    perform public.notify(new.approver_id, 'perizinan', 'Izin kerja menunggu persetujuan Anda',
      coalesce(v_permit.permit_no || ' · ', '') || v_permit.title, '/' || new.permit_id);
  elsif tg_op = 'UPDATE' and new.decision <> old.decision and new.decision in ('approved', 'rejected') then
    perform public.notify(v_permit.requested_by, 'perizinan',
      case when new.decision = 'approved' then 'Izin kerja disetujui (tahap ' || new.step || ')'
           else 'Izin kerja ditolak (tahap ' || new.step || ')' end,
      coalesce(v_permit.permit_no || ' · ', '') || v_permit.title || coalesce(' — ' || new.comment, ''),
      '/' || new.permit_id);
  end if;
  return null;
end $$;

create trigger notify_permit_approval
  after insert or update of decision on public.permit_approvals
  for each row execute function public.tg_notify_permit_approval();

-- Cuti / izin / tukar shift
create or replace function public.tg_notify_leave()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name  text;
  v_label text;
begin
  select full_name into v_name from public.profiles where id = new.user_id;
  v_label := case new.leave_type
    when 'cuti' then 'Cuti' when 'izin' then 'Izin' when 'sakit' then 'Sakit'
    when 'tukar_shift' then 'Tukar shift' else 'Dinas' end;

  if tg_op = 'INSERT' then
    if new.leave_type = 'tukar_shift' then
      perform public.notify(new.swap_with, 'perizinan', 'Permintaan tukar shift dari ' || v_name,
        to_char(new.start_date, 'DD-MM-YYYY') || ' · ' || new.reason, '/cuti');
    end if;
    perform public.notify(u, 'perizinan', v_label || ' baru menunggu persetujuan',
        v_name || ' · ' || to_char(new.start_date, 'DD-MM-YYYY')
        || case when new.end_date <> new.start_date then ' s/d ' || to_char(new.end_date, 'DD-MM-YYYY') else '' end,
        '/cuti')
      from public.users_with_permission('leave.approve') u
     where u <> new.user_id and u is distinct from new.swap_with;
    return null;
  end if;

  if new.swap_accepted_at is not null and old.swap_accepted_at is null then
    perform public.notify(new.user_id, 'perizinan', 'Rekan menyetujui tukar shift',
      'Tinggal menunggu persetujuan atasan.', '/cuti');
  end if;
  if new.status <> old.status and new.status in ('approved', 'rejected') then
    perform public.notify(new.user_id, 'perizinan',
      v_label || case when new.status = 'approved' then ' disetujui' else ' ditolak' end,
      coalesce(new.request_no || ' · ', '') || coalesce(new.decision_note, to_char(new.start_date, 'DD-MM-YYYY')), '/cuti');
    if new.leave_type = 'tukar_shift' and new.status = 'approved' then
      perform public.notify(new.swap_with, 'jadwal', 'Tukar shift disetujui — jadwal Anda bertambah',
        to_char(new.start_date, 'DD-MM-YYYY') || ' menggantikan ' || v_name, '/');
    end if;
  end if;
  return null;
end $$;

create trigger notify_leave
  after insert or update on public.leave_requests
  for each row execute function public.tg_notify_leave();

-- Handover: diajukan → penerima; diterima/dikembalikan → pengirim
create or replace function public.tg_notify_handover()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_from text;
begin
  if new.status = old.status then return null; end if;
  select full_name into v_from from public.profiles where id = new.outgoing_by;
  if new.status = 'submitted' then
    if new.incoming_by is not null then
      perform public.notify(new.incoming_by, 'handover', 'Handover menunggu Anda terima',
        coalesce(new.handover_no || ' · ', '') || 'dari ' || v_from, '/' || new.id);
    else
      perform public.notify(m.user_id, 'handover', 'Handover menunggu Anda terima',
          coalesce(new.handover_no || ' · ', '') || 'dari ' || v_from, '/' || new.id)
        from public.handover_members m
       where m.handover_id = new.id and m.side = 'incoming';
    end if;
  elsif new.status in ('acknowledged', 'returned') then
    perform public.notify(new.outgoing_by, 'handover',
      case when new.status = 'acknowledged' then 'Handover Anda sudah diterima' else 'Handover Anda dikembalikan' end,
      coalesce(new.handover_no || ' · ', '') || coalesce(new.ack_note, ''), '/' || new.id);
  end if;
  return null;
end $$;

create trigger notify_handover
  after update of status on public.handovers
  for each row execute function public.tg_notify_handover();

-- Perkembangan: task ditugaskan
create or replace function public.tg_notify_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_project text;
begin
  if new.assignee_id is null or (tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id) then
    return null;
  end if;
  select coalesce(code || ' · ', '') || name into v_project from public.projects where id = new.project_id;
  perform public.notify(new.assignee_id, 'perkembangan', 'Task baru untuk Anda',
    new.title || ' — ' || v_project || coalesce(' · tenggat ' || to_char(new.due_date, 'DD-MM-YYYY'), ''),
    '/' || new.project_id);
  return null;
end $$;

create trigger notify_task
  after insert or update of assignee_id on public.project_tasks
  for each row execute function public.tg_notify_task();

-- Incident: ditugaskan → assignee; incident kritis baru → semua pengelola incident
create or replace function public.tg_notify_incident()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    perform public.notify(new.assigned_to, 'handover', 'Incident ditugaskan ke Anda',
      coalesce(new.ticket_no || ' · ', '') || new.title, '/incident/' || new.id);
  end if;
  if new.severity = 'critical' and (tg_op = 'INSERT' or old.severity <> 'critical') then
    perform public.notify(u, 'handover', 'Incident KRITIS', coalesce(new.ticket_no || ' · ', '') || new.title,
        '/incident/' || new.id)
      from public.users_with_permission('incident.manage') u
     where u is distinct from new.assigned_to;
  end if;
  return null;
end $$;

create trigger notify_incident
  after insert or update of assigned_to, severity on public.incidents
  for each row execute function public.tg_notify_incident();

-- -----------------------------------------------------------------------------
-- 3. Rekan menolak permintaan tukar shift
-- -----------------------------------------------------------------------------
create or replace function public.decline_shift_swap(p_request_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.leave_requests
     set status = 'rejected',
         decision_note = 'Ditolak oleh rekan' || coalesce(': ' || nullif(trim(p_note), ''), '')
   where id = p_request_id
     and leave_type = 'tukar_shift'
     and status = 'pending'
     and swap_accepted_at is null
     and swap_with = auth.uid();
  if not found then
    raise exception 'Permintaan tukar shift tidak ditemukan, sudah diproses, atau bukan untuk Anda';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Feed kalender pribadi (iCal) — token rahasia per user
-- -----------------------------------------------------------------------------
create table public.calendar_feeds (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  token      uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
create policy "own read" on public.calendar_feeds for select to authenticated using (user_id = auth.uid());

-- Ambil (atau buat) token feed milik sendiri. p_reset = true → token baru (link lama mati).
create or replace function public.my_calendar_feed(p_reset boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Harus login' using errcode = '42501';
  end if;
  insert into public.calendar_feeds (user_id) values (auth.uid())
  on conflict (user_id) do update
    set token = case when p_reset then gen_random_uuid() else public.calendar_feeds.token end,
        created_at = case when p_reset then now() else public.calendar_feeds.created_at end
  returning token into v_token;
  return v_token;
end $$;

-- Dibaca route /ical/<token> (anon). Hanya jadwal published milik pemilik token, 30 hari ke belakang s/d 180 hari ke depan.
create or replace function public.get_calendar_feed(p_token uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'full_name', p.full_name,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'work_date', s.work_date, 'is_leader', s.is_leader, 'note', s.note,
               'code', sh.code, 'name', sh.name, 'start_time', sh.start_time, 'end_time', sh.end_time,
               'is_working', sh.is_working, 'site', si.name, 'updated_at', s.updated_at
             ) order by s.work_date)
        from public.shift_schedules s
        join public.schedule_periods sp on sp.id = s.period_id and sp.status = 'published'
        join public.shifts sh on sh.id = s.shift_id
        left join public.sites si on si.id = s.site_id
       where s.user_id = f.user_id
         and s.work_date between current_date - 30 and current_date + 180
    ), '[]'::jsonb))
    from public.calendar_feeds f
    join public.profiles p on p.id = f.user_id and p.is_active
   where f.token = p_token;
$$;

-- -----------------------------------------------------------------------------
-- 5. Siapa jaga sekarang (mengikuti RLS pemanggil → hanya jadwal yang boleh ia lihat)
-- -----------------------------------------------------------------------------
create or replace function public.on_duty_now()
returns table (user_id uuid, full_name text, team_name text, shift_code text, shift_name text, color text,
               start_time time, end_time time, is_leader boolean, ends_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with now_wib as (select (now() at time zone 'Asia/Jakarta') as ts)
  select s.user_id, p.full_name, t.name, sh.code, sh.name, sh.color, sh.start_time, sh.end_time, s.is_leader,
         ((s.work_date + sh.end_time
           + case when sh.end_time <= sh.start_time then interval '1 day' else interval '0' end)
          at time zone 'Asia/Jakarta') as ends_at
    from public.shift_schedules s
    join public.shifts sh on sh.id = s.shift_id and sh.is_working
    join public.profiles p on p.id = s.user_id
    left join public.teams t on t.id = p.team_id
    cross join now_wib n
   where s.work_date between (n.ts::date - 1) and n.ts::date
     and n.ts >= s.work_date + sh.start_time
     and n.ts <  s.work_date + sh.end_time
                 + case when sh.end_time <= sh.start_time then interval '1 day' else interval '0' end
   order by sh.sort_order, s.is_leader desc, p.full_name;
$$;

-- -----------------------------------------------------------------------------
-- 6. Hak eksekusi
-- -----------------------------------------------------------------------------
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.users_with_permission(text) from public, anon, authenticated;
revoke execute on function public.tg_notify_permit_approval() from public, anon, authenticated;
revoke execute on function public.tg_notify_leave() from public, anon, authenticated;
revoke execute on function public.tg_notify_handover() from public, anon, authenticated;
revoke execute on function public.tg_notify_task() from public, anon, authenticated;
revoke execute on function public.tg_notify_incident() from public, anon, authenticated;

revoke execute on function public.decline_shift_swap(uuid, text) from public, anon;
grant  execute on function public.decline_shift_swap(uuid, text) to authenticated;
revoke execute on function public.my_calendar_feed(boolean) from public, anon;
grant  execute on function public.my_calendar_feed(boolean) to authenticated;
revoke execute on function public.get_calendar_feed(uuid) from public;
grant  execute on function public.get_calendar_feed(uuid) to anon, authenticated;
revoke execute on function public.on_duty_now() from public, anon;
grant  execute on function public.on_duty_now() to authenticated;

-- Realtime: lonceng notifikasi bisa langsung bertambah tanpa refresh
alter publication supabase_realtime add table public.notifications;
