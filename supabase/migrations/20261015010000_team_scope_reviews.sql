-- =============================================================================
-- 1. Tim pembina: sebuah tim bisa dibina oleh tim lain (mis. NOC PKL dibina NOC Dedicated).
--    Lead tim pembina ikut mengelola jadwal & melihat laporan review tim binaannya.
-- 2. Lingkup kelola jadwal: schedule.manage_all (admin, supervisor) = semua tim;
--    schedule.manage tanpa _all (lead) = tim sendiri + tim binaan.
-- 3. Review bulanan: self review + peer review antar anggota tim (lead & staff).
-- =============================================================================

alter table public.teams add column managed_by_team_id uuid references public.teams(id) on delete set null;
alter table public.teams add constraint teams_not_self_managed check (managed_by_team_id is distinct from id);
comment on column public.teams.managed_by_team_id is 'Tim pembina: lead tim ini ikut mengelola jadwal & melihat review tim binaan';

insert into public.teams (name, description, managed_by_team_id)
select 'NOC PKL', 'Peserta PKL / magang NOC', t.id from public.teams t where t.name = 'NOC Dedicated'
on conflict (name) do nothing;

insert into public.permissions (key, module, description) values
  ('schedule.manage_all', 'jadwal',       'Kelola jadwal semua tim (tanpa batasan tim)'),
  ('review.submit',       'perkembangan', 'Mengisi self review & peer review bulanan'),
  ('review.manage',       'perkembangan', 'Melihat semua laporan review bulanan')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r
  join (values ('admin', 'schedule.manage_all'), ('supervisor', 'schedule.manage_all'),
               ('admin', 'review.manage'), ('supervisor', 'review.manage'),
               ('lead', 'review.submit'), ('staff', 'review.submit')) as p(role_key, key)
    on p.role_key = r.key
on conflict do nothing;

-- Tim yang dikelola user saat ini: tim sendiri + tim binaan tim sendiri.
create or replace function public.my_managed_teams()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select p.team_id from public.profiles p where p.id = auth.uid() and p.team_id is not null
  union
  select t.id from public.teams t join public.profiles p on p.team_id = t.managed_by_team_id where p.id = auth.uid();
$$;

create or replace function public.can_manage_schedule(p_team uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_permission('schedule.manage')
     and (public.has_permission('schedule.manage_all')
          or (p_team is not null and p_team in (select public.my_managed_teams())));
$$;

revoke all on function public.my_managed_teams() from public, anon;
revoke all on function public.can_manage_schedule(uuid) from public, anon;
grant execute on function public.my_managed_teams() to authenticated;
grant execute on function public.can_manage_schedule(uuid) to authenticated;

alter policy "read" on public.schedule_periods
  using (public.can_manage_schedule(team_id) or (status = 'published' and public.has_permission('schedule.view')));
alter policy "manage" on public.schedule_periods
  using (public.can_manage_schedule(team_id)) with check (public.can_manage_schedule(team_id));

alter policy "read" on public.shift_schedules
  using (exists (
    select 1 from public.schedule_periods p
     where p.id = period_id
       and (public.can_manage_schedule(p.team_id) or (p.status = 'published' and public.has_permission('schedule.view')))
  ));
alter policy "manage" on public.shift_schedules
  using (exists (select 1 from public.schedule_periods p where p.id = period_id and public.can_manage_schedule(p.team_id)))
  with check (exists (select 1 from public.schedule_periods p where p.id = period_id and public.can_manage_schedule(p.team_id)));

-- =============================================================================
-- Review bulanan
-- =============================================================================
create table public.review_criteria (
  key          text primary key,
  name         text not null,
  description  text,
  sort_order   smallint not null default 0,
  is_active    boolean not null default true
);

insert into public.review_criteria (key, name, description, sort_order) values
  ('kualitas',    'Kualitas kerja',          'Ketelitian monitoring, ketepatan analisa & penanganan gangguan', 1),
  ('disiplin',    'Disiplin & tanggung jawab', 'Kehadiran shift, ketepatan waktu, menyelesaikan tugas sampai tuntas', 2),
  ('komunikasi',  'Komunikasi & handover',   'Kejelasan laporan, eskalasi, dan serah terima shift', 3),
  ('kerja_sama',  'Kerja sama tim',          'Membantu rekan, berbagi informasi, menjaga suasana kerja', 4),
  ('inisiatif',   'Inisiatif & belajar',     'Proaktif mencari solusi, mau belajar hal baru', 5);

create table public.performance_reviews (
  id            uuid primary key default gen_random_uuid(),
  period_month  date not null check (extract(day from period_month) = 1),
  reviewer_id   uuid not null references public.profiles(id) on delete cascade,
  reviewee_id   uuid not null references public.profiles(id) on delete cascade,
  is_self       boolean generated always as (reviewer_id = reviewee_id) stored,
  highlights    text,                 -- pencapaian / kelebihan
  improvements  text,                 -- yang perlu ditingkatkan
  goals         text,                 -- target bulan depan (self review)
  comment       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (period_month, reviewer_id, reviewee_id)
);
create index on public.performance_reviews (reviewee_id, period_month);

create table public.performance_review_scores (
  review_id     uuid not null references public.performance_reviews(id) on delete cascade,
  criterion_key text not null references public.review_criteria(key) on update cascade,
  score         smallint not null check (score between 1 and 5),
  primary key (review_id, criterion_key)
);

create trigger set_updated_at before update on public.performance_reviews
  for each row execute function public.tg_set_updated_at();

-- Peserta review: aktif + punya review.submit.
create or replace function public.is_review_participant(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
      join public.user_roles ur on ur.user_id = p.id
      join public.role_permissions rp on rp.role_id = ur.role_id
     where p.id = p_user and p.is_active and rp.permission_key = 'review.submit'
  );
$$;

-- Bolehkah user saat ini menilai p_reviewee sebagai rekan?
-- Rekan satu tim, atau lead tim pembina menilai anggota tim binaan.
create or replace function public.can_peer_review(p_reviewee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_reviewee <> auth.uid()
     and public.is_review_participant(auth.uid())
     and public.is_review_participant(p_reviewee)
     and exists (
       select 1 from public.profiles me, public.profiles them
        where me.id = auth.uid() and them.id = p_reviewee and me.team_id is not null
          and (them.team_id = me.team_id
               or (exists (select 1 from public.teams t where t.id = them.team_id and t.managed_by_team_id = me.team_id)
                   and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                                where ur.user_id = auth.uid() and r.key = 'lead')))
     );
$$;

-- Bolehkah user saat ini melihat laporan lengkap (dengan nama penilai) milik p_user?
-- review.manage = semua; lead = anggota tim binaan (bukan tim sendiri, agar peer review antar rekan tetap anonim).
create or replace function public.can_view_full_review(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_permission('review.manage')
      or (p_user <> auth.uid()
          and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                       where ur.user_id = auth.uid() and r.key = 'lead')
          and exists (select 1 from public.profiles them join public.teams t on t.id = them.team_id
                        join public.profiles me on me.id = auth.uid()
                       where them.id = p_user and t.managed_by_team_id = me.team_id));
$$;

alter table public.review_criteria enable row level security;
alter table public.performance_reviews enable row level security;
alter table public.performance_review_scores enable row level security;

create policy "read" on public.review_criteria for select to authenticated using (true);
create policy "manage" on public.review_criteria for all to authenticated
  using (public.has_permission('review.manage')) with check (public.has_permission('review.manage'));

-- Tulis hanya lewat submit_review(); baca: milik sendiri sebagai penilai, atau akses penuh.
create policy "read" on public.performance_reviews for select to authenticated
  using (reviewer_id = auth.uid() or public.can_view_full_review(reviewee_id));
create policy "read" on public.performance_review_scores for select to authenticated
  using (exists (select 1 from public.performance_reviews r where r.id = review_id
                  and (r.reviewer_id = auth.uid() or public.can_view_full_review(r.reviewee_id))));

-- Bulan yang masih boleh diisi: bulan ini & bulan lalu (WIB).
create or replace function public.review_month_open(p_month date)
returns boolean
language sql stable set search_path = ''
as $$
  select p_month in (
    date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date,
    (date_trunc('month', (now() at time zone 'Asia/Jakarta')) - interval '1 month')::date
  );
$$;

create or replace function public.submit_review(
  p_month date, p_reviewee uuid, p_scores jsonb,
  p_highlights text, p_improvements text, p_goals text, p_comment text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_new boolean;
  v_key text;
  v_missing int;
begin
  if v_me is null or not public.is_review_participant(v_me) then
    raise exception 'Anda tidak termasuk peserta review bulanan.' using errcode = '42501';
  end if;
  if not public.review_month_open(p_month) then
    raise exception 'Review untuk bulan ini sudah ditutup (hanya bulan ini & bulan lalu yang bisa diisi).';
  end if;
  if p_reviewee <> v_me and not public.can_peer_review(p_reviewee) then
    raise exception 'Anda tidak bisa menilai user ini.' using errcode = '42501';
  end if;

  select count(*) into v_missing from public.review_criteria c
   where c.is_active and not (coalesce(p_scores, '{}'::jsonb) ? c.key);
  if v_missing > 0 then
    raise exception 'Semua aspek penilaian wajib diberi nilai.';
  end if;
  for v_key in select jsonb_object_keys(p_scores) loop
    if not exists (select 1 from public.review_criteria where key = v_key and is_active) then
      raise exception 'Aspek penilaian tidak dikenal: %', v_key;
    end if;
    if jsonb_typeof(p_scores -> v_key) <> 'number' or (p_scores ->> v_key)::numeric not in (1, 2, 3, 4, 5) then
      raise exception 'Nilai harus 1 sampai 5.';
    end if;
  end loop;

  select not exists (select 1 from public.performance_reviews
                      where period_month = p_month and reviewer_id = v_me and reviewee_id = p_reviewee) into v_new;

  insert into public.performance_reviews (period_month, reviewer_id, reviewee_id, highlights, improvements, goals, comment)
  values (p_month, v_me, p_reviewee, nullif(trim(p_highlights), ''), nullif(trim(p_improvements), ''),
          case when p_reviewee = v_me then nullif(trim(p_goals), '') end, nullif(trim(p_comment), ''))
  on conflict (period_month, reviewer_id, reviewee_id) do update
     set highlights = excluded.highlights, improvements = excluded.improvements,
         goals = excluded.goals, comment = excluded.comment
  returning id into v_id;

  insert into public.performance_review_scores (review_id, criterion_key, score)
  select v_id, k, (p_scores ->> k)::smallint from jsonb_object_keys(p_scores) k
  on conflict (review_id, criterion_key) do update set score = excluded.score;

  if v_new and p_reviewee <> v_me then
    perform public.notify(p_reviewee, 'perkembangan', 'Penilaian rekan baru',
      'Anda menerima peer review untuk ' || to_char(p_month, 'MM/YYYY') || '.',
      '/review/laporan?bulan=' || to_char(p_month, 'YYYY-MM'));
  end if;
  return v_id;
end;
$$;

-- Daftar yang perlu dinilai user saat ini pada bulan tsb (diri sendiri + rekan).
create or replace function public.my_review_tasks(p_month date)
returns table (user_id uuid, full_name text, team_name text, is_self boolean, done boolean, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, t.name, p.id = auth.uid(), r.id is not null, r.updated_at
    from public.profiles p
    left join public.teams t on t.id = p.team_id
    left join public.performance_reviews r
      on r.period_month = p_month and r.reviewer_id = auth.uid() and r.reviewee_id = p.id
   where (p.id = auth.uid() and public.is_review_participant(auth.uid()))
      or public.can_peer_review(p.id)
   order by p.id <> auth.uid(), p.full_name;
$$;

-- Laporan bulanan satu user. Pemilik laporan melihat peer review secara anonim.
create or replace function public.monthly_report(p_user uuid, p_month date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_full boolean := public.can_view_full_review(p_user);
  v_start date := p_month;
  v_end date := (p_month + interval '1 month')::date;
  v_result jsonb;
begin
  if p_user <> auth.uid() and not v_full then
    raise exception 'Anda tidak memiliki akses ke laporan ini.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'user', (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'team', t.name)
               from public.profiles p left join public.teams t on t.id = p.team_id where p.id = p_user),
    'full_access', v_full,
    'criteria', (select coalesce(jsonb_agg(jsonb_build_object('key', c.key, 'name', c.name, 'description', c.description) order by c.sort_order), '[]')
                   from public.review_criteria c where c.is_active),
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
                    and pt.completed_at >= v_start and pt.completed_at < v_end),
      'incidents_resolved', (select count(*) from public.incidents i
                  where i.assigned_to = p_user and i.resolved_at >= v_start and i.resolved_at < v_end),
      'leave_days', (select coalesce(sum(least(lr.end_date, v_end - 1) - greatest(lr.start_date, v_start) + 1), 0)
                  from public.leave_requests lr
                 where lr.user_id = p_user and lr.status = 'approved' and lr.leave_type in ('cuti', 'izin', 'sakit')
                   and lr.start_date < v_end and lr.end_date >= v_start)
    )
  ) into v_result;
  return v_result;
end;
$$;

-- Rekap tim untuk pemantau (review.manage: semua peserta; lead: anggota tim binaan).
create or replace function public.review_overview(p_month date)
returns table (user_id uuid, full_name text, team_name text, self_done boolean, peers_received int, peers_given int,
               self_avg numeric, peer_avg numeric)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, t.name,
         exists (select 1 from public.performance_reviews r where r.period_month = p_month and r.reviewer_id = p.id and r.is_self),
         (select count(*)::int from public.performance_reviews r where r.period_month = p_month and r.reviewee_id = p.id and not r.is_self),
         (select count(*)::int from public.performance_reviews r where r.period_month = p_month and r.reviewer_id = p.id and not r.is_self),
         (select round(avg(s.score), 2) from public.performance_reviews r join public.performance_review_scores s on s.review_id = r.id
           where r.period_month = p_month and r.reviewee_id = p.id and r.is_self),
         (select round(avg(s.score), 2) from public.performance_reviews r join public.performance_review_scores s on s.review_id = r.id
           where r.period_month = p_month and r.reviewee_id = p.id and not r.is_self)
    from public.profiles p
    left join public.teams t on t.id = p.team_id
   where public.is_review_participant(p.id) and public.can_view_full_review(p.id)
   order by t.name nulls last, p.full_name;
$$;

revoke all on function public.is_review_participant(uuid) from public, anon;
revoke all on function public.can_peer_review(uuid) from public, anon;
revoke all on function public.can_view_full_review(uuid) from public, anon;
revoke all on function public.review_month_open(date) from public, anon;
revoke all on function public.submit_review(date, uuid, jsonb, text, text, text, text) from public, anon;
revoke all on function public.my_review_tasks(date) from public, anon;
revoke all on function public.monthly_report(uuid, date) from public, anon;
revoke all on function public.review_overview(date) from public, anon;
grant execute on function public.is_review_participant(uuid) to authenticated;
grant execute on function public.can_peer_review(uuid) to authenticated;
grant execute on function public.can_view_full_review(uuid) to authenticated;
grant execute on function public.review_month_open(date) to authenticated;
grant execute on function public.submit_review(date, uuid, jsonb, text, text, text, text) to authenticated;
grant execute on function public.my_review_tasks(date) to authenticated;
grant execute on function public.monthly_report(uuid, date) to authenticated;
grant execute on function public.review_overview(date) to authenticated;
