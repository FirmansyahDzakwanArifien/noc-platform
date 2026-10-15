-- Perbaikan status undangan, pesan hook pendaftaran, dan batas rank pada role_permissions.

-- Undangan dianggap "menunggu" selama user belum pernah membuat password (membuka link
-- undangan saja sudah tercatat sebagai login oleh Supabase). User OAuth tidak termasuk.
create or replace function public.auth_invite_pending(u auth.users)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select u.invited_at is not null
     and coalesce(u.encrypted_password, '') = ''
     and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider <> 'email');
$$;
revoke all on function public.auth_invite_pending(auth.users) from public, anon, authenticated;

create or replace function public.user_auth_status()
returns table(user_id uuid, invited_at timestamptz, confirmed_at timestamptz, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select u.id,
         u.invited_at,
         coalesce(u.email_confirmed_at, u.confirmed_at),
         case when public.auth_invite_pending(u) then null else u.last_sign_in_at end
    from auth.users u
   where public.has_permission('user.manage');
$$;

-- Dipakai edge function invite-user (service role) untuk memutuskan boleh kirim ulang.
create or replace function public.invite_pending(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((select public.auth_invite_pending(u) from auth.users u where u.id = p_user), false);
$$;
revoke all on function public.invite_pending(uuid) from public, anon, authenticated;
grant execute on function public.invite_pending(uuid) to service_role;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.is_email_allowed(event -> 'user' ->> 'email') then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message',   'Email tidak diizinkan. Gunakan email @corp.jarvis.biz.id / @jarvis.biz.id, atau minta admin menambahkan email Anda ke allowlist.'
    ));
  end if;
  return '{}'::jsonb;
end $$;

-- Pengelola role tidak boleh mengubah hak role yang rank-nya di atas dirinya.
alter policy manage on public.role_permissions
  using (public.has_permission('role.manage')
         and (select r.rank from public.roles r where r.id = role_id) <= public.my_max_rank())
  with check (public.has_permission('role.manage')
              and (select r.rank from public.roles r where r.id = role_id) <= public.my_max_rank());

-- Laporan bulanan: tugas & incident dihitung dengan batas bulan WIB, bukan UTC.
create or replace function public.monthly_report(p_user uuid, p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_full boolean := public.can_view_full_review(p_user);
  v_start date := p_month;
  v_end date := (p_month + interval '1 month')::date;
  v_start_ts timestamptz := (p_month::timestamp at time zone 'Asia/Jakarta');
  v_end_ts timestamptz := ((p_month + interval '1 month')::timestamp at time zone 'Asia/Jakarta');
  v_result jsonb;
begin
  if p_user <> auth.uid() and not v_full then
    raise exception 'Anda tidak memiliki akses ke laporan ini.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'user', (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'team', t.name)
               from public.profiles p left join public.teams t on t.id = p.team_id where p.id = p_user),
    'full_access', v_full,
    'criteria', (select coalesce(jsonb_agg(jsonb_build_object('key', c.key, 'name', c.name, 'description', c.description) order by c.sort_order, c.name), '[]')
                   from public.review_criteria_for(p_user) c),
    'self', (select jsonb_build_object(
                      'highlights', r.highlights, 'improvements', r.improvements, 'goals', r.goals, 'comment', r.comment,
                      'updated_at', r.updated_at,
                      'scores', (select jsonb_object_agg(s.criterion_key, s.score) from public.performance_review_scores s where s.review_id = r.id))
               from public.performance_reviews r
              where r.period_month = p_month and r.reviewer_id = p_user and r.reviewee_id = p_user),
    'peer_count', (select count(*) from public.performance_reviews r
                    where r.period_month = p_month and r.reviewee_id = p_user and not r.is_self),
    'peer_avg', (select jsonb_object_agg(x.criterion_key, x.avg)
                   from (select s.criterion_key, round(avg(s.score), 2) avg
                           from public.performance_reviews r join public.performance_review_scores s on s.review_id = r.id
                          where r.period_month = p_month and r.reviewee_id = p_user and not r.is_self
                          group by s.criterion_key) x),
    'peers', (select coalesce(jsonb_agg(jsonb_build_object(
                        'reviewer', case when v_full then rv.full_name end,
                        'highlights', r.highlights, 'improvements', r.improvements, 'comment', r.comment,
                        'avg', (select round(avg(s.score), 2) from public.performance_review_scores s where s.review_id = r.id))
                      order by md5(r.id::text)), '[]')
                from public.performance_reviews r join public.profiles rv on rv.id = r.reviewer_id
               where r.period_month = p_month and r.reviewee_id = p_user and not r.is_self),
    'given_count', (select count(*) from public.performance_reviews r
                     where r.period_month = p_month and r.reviewer_id = p_user and not r.is_self),
    'activity', jsonb_build_object(
      'shifts', (select count(*) from public.shift_schedules ss
                   join public.schedule_periods sp on sp.id = ss.period_id and sp.status = 'published'
                   join public.shifts sh on sh.id = ss.shift_id and sh.is_working
                  where ss.user_id = p_user and ss.work_date >= v_start and ss.work_date < v_end),
      'leader_shifts', (select count(*) from public.shift_schedules ss
                   join public.schedule_periods sp on sp.id = ss.period_id and sp.status = 'published'
                  where ss.user_id = p_user and ss.is_leader and ss.work_date >= v_start and ss.work_date < v_end),
      'handovers_sent', (select count(*) from public.handovers h
                  where h.outgoing_by = p_user and h.status <> 'draft' and h.shift_date >= v_start and h.shift_date < v_end),
      'handovers_received', (select count(*) from public.handovers h
                  where h.incoming_by = p_user and h.status = 'acknowledged' and h.shift_date >= v_start and h.shift_date < v_end),
      'tasks_done', (select count(*) from public.project_tasks pt
                  where pt.assignee_id = p_user and pt.status = 'done'
                    and pt.completed_at >= v_start_ts and pt.completed_at < v_end_ts),
      'incidents_resolved', (select count(*) from public.incidents i
                  where i.assigned_to = p_user and i.resolved_at >= v_start_ts and i.resolved_at < v_end_ts),
      'leave_days', (select coalesce(sum(least(lr.end_date, v_end - 1) - greatest(lr.start_date, v_start) + 1), 0)
                  from public.leave_requests lr
                 where lr.user_id = p_user and lr.status = 'approved' and lr.leave_type in ('cuti', 'izin', 'sakit')
                   and lr.start_date < v_end and lr.end_date >= v_start)
    )
  ) into v_result;
  return v_result;
end;
$function$;

-- Jadwal yang dihapus tidak lagi terhalang permintaan tukar shift lama.
alter table public.leave_requests drop constraint leave_requests_swap_schedule_id_fkey,
  add constraint leave_requests_swap_schedule_id_fkey foreign key (swap_schedule_id)
  references public.shift_schedules(id) on delete set null;

-- Pemilih approver izin hanya menampilkan user yang punya hak approve.
grant execute on function public.users_with_permission(text) to authenticated;

-- Item terbuka ikut membawa divisi handover-nya.
create or replace view public.v_open_handover_items with (security_invoker = true) as
select i.id, i.handover_id, i.category, i.title, i.description, i.priority, i.status, i.incident_id, i.ref_ticket,
       i.carried_from, i.due_at, i.sort_order, i.created_at, i.updated_at, h.handover_no, h.shift_date, h.site_id, h.division_id
  from public.handover_items i join public.handovers h on h.id = i.handover_id
 where i.status in ('open', 'in_progress');
