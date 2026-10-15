-- =============================================================================
-- Divisi (NOC, SOC, …): platform dipakai lebih dari satu divisi.
-- - teams.division_id menentukan divisi anggota.
-- - Data operasional ditandai division_id (null = umum / semua divisi).
-- - app_settings.division_isolation: false = data digabung (semua melihat semua),
--   true = user hanya melihat data divisinya + data umum. Pemegang division.all tetap melihat semua.
-- =============================================================================

create table public.divisions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code = upper(code)),
  name        text not null,
  description text,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger set_updated_at before update on public.divisions
  for each row execute function public.tg_set_updated_at();

insert into public.divisions (code, name, description, sort_order) values
  ('NOC', 'Network Operations Center', 'Monitoring & operasional jaringan', 1),
  ('SOC', 'Security Operations Center', 'Monitoring & respon insiden keamanan', 2);

alter table public.teams add column division_id uuid references public.divisions(id) on delete set null;
update public.teams set division_id = (select id from public.divisions where code = 'NOC') where name like 'NOC%';

create table public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values ('division_isolation', 'false'::jsonb);

insert into public.permissions (key, module, description) values
  ('division.all',    'portal', 'Melihat data semua divisi walau data antar divisi dipisah'),
  ('settings.manage', 'portal', 'Mengubah pengaturan platform & divisi')
on conflict (key) do nothing;

-- Lead saat ini mengontrol semuanya (lintas tim & divisi).
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r
  join (values ('admin', 'division.all'), ('supervisor', 'division.all'), ('lead', 'division.all'),
               ('admin', 'settings.manage'),
               ('lead', 'schedule.manage_all'), ('lead', 'review.manage')) as p(role_key, key)
    on p.role_key = r.key
on conflict do nothing;

alter table public.divisions enable row level security;
alter table public.app_settings enable row level security;
create policy "read" on public.divisions for select to authenticated using (true);
create policy "manage" on public.divisions for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));
create policy "read" on public.app_settings for select to authenticated using (true);
create policy "manage" on public.app_settings for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

create or replace function public.my_division()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select t.division_id from public.profiles p join public.teams t on t.id = p.team_id where p.id = auth.uid();
$$;

create or replace function public.division_isolation()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select (value)::text::boolean from public.app_settings where key = 'division_isolation'), false);
$$;

-- Bolehkah user saat ini melihat data milik divisi p_div?
create or replace function public.can_see_division(p_div uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_div is null
      or not public.division_isolation()
      or public.has_permission('division.all')
      or p_div = public.my_division();
$$;

revoke all on function public.my_division() from public, anon;
revoke all on function public.division_isolation() from public, anon;
revoke all on function public.can_see_division(uuid) from public, anon;
grant execute on function public.my_division() to authenticated;
grant execute on function public.division_isolation() to authenticated;
grant execute on function public.can_see_division(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Penandaan divisi pada data operasional
-- ---------------------------------------------------------------------------
alter table public.handovers add column division_id uuid references public.divisions(id) on delete set null;
alter table public.incidents add column division_id uuid references public.divisions(id) on delete set null;
alter table public.announcements add column division_id uuid references public.divisions(id) on delete set null;
alter table public.checklist_templates add column division_id uuid references public.divisions(id) on delete set null;
create index on public.handovers (division_id);
create index on public.incidents (division_id);

-- Isi otomatis divisi dari divisi pembuat bila tidak dipilih.
create or replace function public.tg_default_division()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.division_id is null then
    new.division_id := public.my_division();
  end if;
  return new;
end;
$$;
revoke all on function public.tg_default_division() from public, anon, authenticated;

create trigger default_division before insert on public.handovers
  for each row execute function public.tg_default_division();
create trigger default_division before insert on public.incidents
  for each row execute function public.tg_default_division();

alter policy "read" on public.handovers
  using (public.has_permission('handover.view') and public.can_see_division(division_id));
alter policy "read" on public.handover_items
  using (public.has_permission('handover.view')
         and exists (select 1 from public.handovers h where h.id = handover_id and public.can_see_division(h.division_id)));
alter policy "read" on public.incidents
  using (public.has_permission('incident.view') and public.can_see_division(division_id));
alter policy "read" on public.incident_updates
  using (public.has_permission('incident.view')
         and exists (select 1 from public.incidents i where i.id = incident_id and public.can_see_division(i.division_id)));
alter policy "read" on public.announcements
  using (public.has_permission('portal.access') and public.can_see_division(division_id));
alter policy "read" on public.checklist_templates
  using (public.can_see_division(division_id));

-- Jadwal yang sudah published: ikut aturan divisi tim periode.
alter policy "read" on public.schedule_periods
  using (public.can_manage_schedule(team_id)
         or (status = 'published' and public.has_permission('schedule.view')
             and public.can_see_division((select t.division_id from public.teams t where t.id = team_id))));

-- ---------------------------------------------------------------------------
-- Incident keamanan (SOC)
-- ---------------------------------------------------------------------------
alter table public.incidents
  add column category text not null default 'jaringan'
    check (category in ('jaringan', 'perangkat', 'listrik', 'aplikasi', 'keamanan', 'lainnya')),
  add column security_type text
    check (security_type in ('malware', 'phishing', 'intrusion', 'ddos', 'data_leak', 'unauthorized_access',
                             'vulnerability', 'policy_violation', 'lainnya')),
  add column mitre_technique text,     -- mis. T1566 Phishing
  add column iocs text,                -- IP / domain / hash, satu per baris
  add column affected_assets text;     -- host / user / sistem terdampak

-- ---------------------------------------------------------------------------
-- Kriteria review per divisi (null = berlaku untuk semua divisi)
-- ---------------------------------------------------------------------------
alter table public.review_criteria add column division_id uuid references public.divisions(id) on delete cascade;
update public.review_criteria set division_id = (select id from public.divisions where code = 'NOC') where key = 'kualitas';
insert into public.review_criteria (key, name, description, sort_order, division_id)
select v.key, v.name, v.description, v.sort_order, d.id
  from (values
    ('soc_deteksi',     'Deteksi & triase alert',   'Kecepatan dan ketepatan memilah alert SIEM/EDR, minim false negative', 1),
    ('soc_investigasi', 'Investigasi & analisa',     'Kedalaman analisa log, korelasi IOC, dan identifikasi akar masalah', 1)
  ) as v(key, name, description, sort_order)
  cross join public.divisions d where d.code = 'SOC';

-- Kriteria yang berlaku untuk user tertentu (sesuai divisi timnya).
create or replace function public.review_criteria_for(p_user uuid)
returns setof public.review_criteria
language sql stable security definer set search_path = ''
as $$
  select c.* from public.review_criteria c
   where c.is_active
     and (c.division_id is null
          or c.division_id = (select t.division_id from public.profiles p join public.teams t on t.id = p.team_id where p.id = p_user))
   order by c.sort_order, c.name;
$$;
revoke all on function public.review_criteria_for(uuid) from public, anon;
grant execute on function public.review_criteria_for(uuid) to authenticated;

-- Validasi & laporan memakai kriteria sesuai divisi yang dinilai.
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

  select count(*) into v_missing from public.review_criteria_for(p_reviewee) c
   where not (coalesce(p_scores, '{}'::jsonb) ? c.key);
  if v_missing > 0 then
    raise exception 'Semua aspek penilaian wajib diberi nilai.';
  end if;
  for v_key in select jsonb_object_keys(p_scores) loop
    if not exists (select 1 from public.review_criteria_for(p_reviewee) c where c.key = v_key) then
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

-- Laporan lengkap: tidak untuk diri sendiri (peer review tetap anonim bagi yang dinilai).
create or replace function public.can_view_full_review(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user <> auth.uid()
     and (public.has_permission('review.manage')
          or (exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                       where ur.user_id = auth.uid() and r.key = 'lead')
              and exists (select 1 from public.profiles them join public.teams t on t.id = them.team_id
                            join public.profiles me on me.id = auth.uid()
                           where them.id = p_user and t.managed_by_team_id = me.team_id)));
$$;

-- ---------------------------------------------------------------------------
-- Template checklist bawaan
-- ---------------------------------------------------------------------------
with tpl as (
  insert into public.checklist_templates (name, division_id)
  select 'Checklist Shift SOC', id from public.divisions where code = 'SOC'
  returning id
)
insert into public.checklist_template_items (template_id, section, label, input_type, unit, options, min_value, max_value, is_required, sort_order)
select tpl.id, v.section, v.label, v.input_type::public.checklist_input, v.unit, v.options::jsonb, v.min_value, v.max_value, v.is_required, v.sort_order
  from tpl, (values
    ('SIEM',          'Ingestion log SIEM berjalan normal',            'boolean', null,  null,                                    null::numeric, null::numeric, true,  1),
    ('SIEM',          'Alert belum ditriase di antrean',               'number',  'alert', null,                                  0,    20,   true,  2),
    ('SIEM',          'Alert critical/high shift ini sudah ditangani', 'boolean', null,  null,                                    null, null, true,  3),
    ('Endpoint',      'Agen EDR online',                               'number',  '%',   null,                                    95,   100,  true,  4),
    ('Endpoint',      'Status antivirus/EDR definisi terbaru',         'select',  null,  '["Normal", "Tertunda", "Gagal"]',       null, null, true,  5),
    ('Perimeter',     'Firewall & IPS/IDS aktif',                      'boolean', null,  null,                                    null, null, true,  6),
    ('Perimeter',     'Status proteksi DDoS / WAF',                    'select',  null,  '["Normal", "Warning", "Down"]',         null, null, true,  7),
    ('Threat Intel',  'Feed threat intelligence ter-update',           'boolean', null,  null,                                    null, null, true,  8),
    ('Threat Intel',  'Laporan phishing pengguna sudah ditinjau',      'boolean', null,  null,                                    null, null, false, 9),
    ('Kerentanan',    'Hasil scan kerentanan terbaru sudah dicek',     'boolean', null,  null,                                    null, null, false, 10),
    ('Eskalasi',      'Insiden terbuka sudah dieskalasi/diserahterimakan', 'boolean', null, null,                                 null, null, true,  11),
    ('Catatan',       'Aktivitas mencurigakan yang perlu dipantau',    'text',    null,  null,                                    null, null, false, 12)
  ) as v(section, label, input_type, unit, options, min_value, max_value, is_required, sort_order);

with tpl as (
  insert into public.checklist_templates (name, division_id)
  select 'Checklist Shift NOC', id from public.divisions where code = 'NOC'
  returning id
)
insert into public.checklist_template_items (template_id, section, label, input_type, unit, options, min_value, max_value, is_required, sort_order)
select tpl.id, v.section, v.label, v.input_type::public.checklist_input, v.unit, v.options::jsonb, v.min_value, v.max_value, v.is_required, v.sort_order
  from tpl, (values
    ('Ruang',    'Suhu ruang perangkat',                 'number',  '°C',  null,                              18::numeric, 27::numeric, true,  1),
    ('Power',    'UPS normal (tidak on-battery)',        'boolean', null,  null,                              null, null, true,  2),
    ('Power',    'Genset siap (standby)',                'boolean', null,  null,                              null, null, false, 3),
    ('Network',  'Link utama / backbone up',             'boolean', null,  null,                              null, null, true,  4),
    ('Network',  'Status monitoring (NMS)',              'select',  null,  '["Normal", "Warning", "Down"]',   null, null, true,  5),
    ('Network',  'Perangkat down saat serah terima',     'number',  'unit', null,                             0,    0,    true,  6),
    ('Catatan',  'Gangguan yang masih dipantau',         'text',    null,  null,                              null, null, false, 7)
  ) as v(section, label, input_type, unit, options, min_value, max_value, is_required, sort_order);
