-- 1. Penilaian berbasis formulir: self review, peer review, dan penilaian atasan (supervisor → bawahan).
--    Setiap pertanyaan berisi pilihan dengan deskripsi perilaku yang bisa diamati (rubrik), sehingga
--    penilaian objektif. Hasil hanya bisa dilihat pemegang review.manage (admin & supervisor).
-- 2. Hapus user: kolom audit opsional dikosongkan otomatis; user yang masih punya riwayat wajib
--    (mis. pembuat handover) tidak bisa dihapus dan cukup dinonaktifkan.

-- ============================================================================
-- Permission
-- ============================================================================
insert into public.permissions (key, module, description) values
  ('review.evaluate', 'perkembangan', 'Menilai bawahan (penilaian atasan)')
on conflict (key) do nothing;
update public.permissions set description = 'Melihat hasil penilaian & mengelola formulir penilaian' where key = 'review.manage';

insert into public.role_permissions (role_id, permission_key)
select r.id, 'review.evaluate' from public.roles r where r.key = 'supervisor'
on conflict do nothing;

-- Hasil penilaian hanya untuk admin & supervisor: hak review.manage milik lead dicabut lewat
-- Portal → Role & Akses (bukan di migration ini).

-- ============================================================================
-- Tabel
-- ============================================================================
create type public.review_kind as enum ('self', 'peer', 'supervisor');

create table public.review_forms (
  id           uuid primary key default gen_random_uuid(),
  review_type  public.review_kind not null unique,
  name         text not null,
  description  text,
  weight       numeric not null default 0 check (weight >= 0),  -- bobot dalam nilai akhir
  is_active    boolean not null default true,
  updated_at   timestamptz not null default now()
);

create table public.review_questions (
  id             uuid primary key default gen_random_uuid(),
  form_id        uuid not null references public.review_forms(id) on delete cascade,
  section        text not null default 'Umum',
  prompt         text not null,
  help           text,
  kind           text not null check (kind in ('scale', 'choice', 'text')),
  is_required    boolean not null default true,
  weight         numeric not null default 1 check (weight > 0),
  division_id    uuid references public.divisions(id) on delete set null,  -- null = semua divisi
  evidence_rule  text not null default 'extreme' check (evidence_rule in ('none', 'extreme', 'always')),
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
create index on public.review_questions (form_id, sort_order);

create table public.review_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.review_questions(id) on delete cascade,
  label        text not null,
  description  text,
  score        numeric,
  sort_order   integer not null default 0
);
create index on public.review_options (question_id, sort_order);

create table public.review_submissions (
  id            uuid primary key default gen_random_uuid(),
  period_month  date not null check (extract(day from period_month) = 1),
  review_type   public.review_kind not null,
  reviewer_id   uuid not null references public.profiles(id) on delete cascade,
  reviewee_id   uuid not null references public.profiles(id) on delete cascade,
  score_pct     numeric(5, 2),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (period_month, review_type, reviewer_id, reviewee_id),
  check ((review_type = 'self') = (reviewer_id = reviewee_id))
);
create index on public.review_submissions (period_month, reviewee_id);

-- Label & skor disalin saat mengisi agar hasil lama tetap utuh walau rubrik diubah.
create table public.review_answers (
  submission_id  uuid not null references public.review_submissions(id) on delete cascade,
  question_id    uuid not null references public.review_questions(id),
  option_id      uuid references public.review_options(id) on delete set null,
  option_label   text,
  score          numeric,
  min_score      numeric,
  max_score      numeric,
  text_answer    text,
  evidence       text,
  primary key (submission_id, question_id)
);

alter table public.review_forms enable row level security;
alter table public.review_questions enable row level security;
alter table public.review_options enable row level security;
alter table public.review_submissions enable row level security;
alter table public.review_answers enable row level security;

create policy "read" on public.review_forms for select to authenticated using (true);
create policy "manage" on public.review_forms for all to authenticated
  using (public.has_permission('review.manage')) with check (public.has_permission('review.manage'));
create policy "read" on public.review_questions for select to authenticated using (true);
create policy "manage" on public.review_questions for all to authenticated
  using (public.has_permission('review.manage')) with check (public.has_permission('review.manage'));
create policy "read" on public.review_options for select to authenticated using (true);
create policy "manage" on public.review_options for all to authenticated
  using (public.has_permission('review.manage')) with check (public.has_permission('review.manage'));

-- Penilai hanya melihat isiannya sendiri; hasil lengkap hanya review.manage. Tulis lewat review_submit().
create policy "read" on public.review_submissions for select to authenticated
  using (reviewer_id = auth.uid() or public.has_permission('review.manage'));
create policy "read" on public.review_answers for select to authenticated
  using (exists (select 1 from public.review_submissions s where s.id = submission_id
                  and (s.reviewer_id = auth.uid() or public.has_permission('review.manage'))));

-- ============================================================================
-- Fungsi
-- ============================================================================
create or replace function public.user_max_rank(p_user uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(max(r.rank), 0) from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_user;
$$;

-- Atasan (review.evaluate) menilai peserta review yang rank-nya di bawah dirinya.
create or replace function public.can_supervise_review(p_reviewee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_reviewee <> auth.uid()
     and public.has_permission('review.evaluate')
     and public.is_review_participant(p_reviewee)
     and public.user_max_rank(p_reviewee) < public.my_max_rank();
$$;

create or replace function public.can_review(p_type public.review_kind, p_reviewee uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(case p_type
    when 'self' then p_reviewee = auth.uid() and public.is_review_participant(auth.uid())
    when 'peer' then public.can_peer_review(p_reviewee)
    when 'supervisor' then public.can_supervise_review(p_reviewee)
  end, false);
$$;

-- Daftar penilaian yang harus diisi user saat ini.
create or replace function public.review_tasks(p_month date)
returns table(reviewee_id uuid, full_name text, team_name text, review_type public.review_kind, done boolean, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with targets as (
    select p.id, 'self'::public.review_kind as t from public.profiles p
     where p.id = auth.uid() and public.is_review_participant(auth.uid())
    union all
    select p.id, 'peer'::public.review_kind from public.profiles p where p.is_active and public.can_peer_review(p.id)
    union all
    select p.id, 'supervisor'::public.review_kind from public.profiles p where p.is_active and public.can_supervise_review(p.id)
  )
  select x.id, p.full_name, tm.name, x.t, s.id is not null, s.updated_at
    from targets x
    join public.profiles p on p.id = x.id
    left join public.teams tm on tm.id = p.team_id
    left join public.review_submissions s
      on s.period_month = p_month and s.review_type = x.t and s.reviewer_id = auth.uid() and s.reviewee_id = x.id
   where exists (select 1 from public.review_forms f where f.review_type = x.t and f.is_active)
   order by x.t, p.full_name;
$$;

-- Formulir untuk satu penilaian + jawaban yang sudah pernah diisi penilai.
create or replace function public.review_form(p_month date, p_type public.review_kind, p_reviewee uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_form public.review_forms;
  v_div uuid;
begin
  if not public.can_review(p_type, p_reviewee) then
    raise exception 'Anda tidak berhak mengisi penilaian ini.' using errcode = '42501';
  end if;
  select * into v_form from public.review_forms where review_type = p_type and is_active;
  if not found then
    return null;
  end if;
  select t.division_id into v_div from public.profiles p left join public.teams t on t.id = p.team_id where p.id = p_reviewee;

  return jsonb_build_object(
    'form', jsonb_build_object('name', v_form.name, 'description', v_form.description),
    'reviewee', (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'team', t.name)
                   from public.profiles p left join public.teams t on t.id = p.team_id where p.id = p_reviewee),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object(
                     'id', q.id, 'section', q.section, 'prompt', q.prompt, 'help', q.help, 'kind', q.kind,
                     'is_required', q.is_required, 'evidence_rule', q.evidence_rule,
                     'options', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'description', o.description, 'score', o.score)
                                                           order by o.sort_order, o.score), '[]')
                                   from public.review_options o where o.question_id = q.id))
                   order by q.sort_order, q.created_at), '[]')
                    from public.review_questions q
                   where q.form_id = v_form.id and q.is_active and (q.division_id is null or q.division_id = v_div)),
    'answers', (select jsonb_object_agg(a.question_id, jsonb_build_object('option_id', a.option_id, 'text', a.text_answer, 'evidence', a.evidence))
                  from public.review_submissions s join public.review_answers a on a.submission_id = s.id
                 where s.period_month = p_month and s.review_type = p_type and s.reviewer_id = auth.uid() and s.reviewee_id = p_reviewee),
    'submitted_at', (select s.updated_at from public.review_submissions s
                      where s.period_month = p_month and s.review_type = p_type and s.reviewer_id = auth.uid() and s.reviewee_id = p_reviewee)
  );
end;
$$;

-- Simpan penilaian. p_answers: { "<question_id>": { "option_id": "...", "text": "...", "evidence": "..." } }
-- Nilai = rata-rata berbobot dari (skor - min) / (max - min) setiap pertanyaan skala, dalam persen.
create or replace function public.review_submit(p_month date, p_type public.review_kind, p_reviewee uuid, p_answers jsonb)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_form public.review_forms;
  v_div uuid;
  v_sub uuid;
  q record;
  a jsonb;
  v_opt public.review_options;
  v_min numeric;
  v_max numeric;
  v_text text;
  v_evid text;
  v_num numeric := 0;
  v_den numeric := 0;
  v_pct numeric;
begin
  if auth.uid() is null then
    raise exception 'Sesi berakhir, silakan login ulang.' using errcode = '42501';
  end if;
  if not public.review_month_open(p_month) then
    raise exception 'Periode penilaian % sudah ditutup.', to_char(p_month, 'MM/YYYY') using errcode = '22023';
  end if;
  if not public.can_review(p_type, p_reviewee) then
    raise exception 'Anda tidak berhak mengisi penilaian ini.' using errcode = '42501';
  end if;
  select * into v_form from public.review_forms where review_type = p_type and is_active;
  if not found then
    raise exception 'Formulir penilaian belum tersedia.' using errcode = '22023';
  end if;
  select t.division_id into v_div from public.profiles p left join public.teams t on t.id = p.team_id where p.id = p_reviewee;

  insert into public.review_submissions (period_month, review_type, reviewer_id, reviewee_id)
  values (p_month, p_type, auth.uid(), p_reviewee)
  on conflict (period_month, review_type, reviewer_id, reviewee_id) do update set updated_at = now()
  returning id into v_sub;

  for q in
    select * from public.review_questions
     where form_id = v_form.id and is_active and (division_id is null or division_id = v_div)
     order by sort_order, created_at
  loop
    a := coalesce(p_answers -> q.id::text, '{}'::jsonb);
    v_text := nullif(trim(coalesce(a ->> 'text', '')), '');
    v_evid := nullif(trim(coalesce(a ->> 'evidence', '')), '');
    v_opt := null;
    v_min := null;
    v_max := null;

    if q.kind in ('scale', 'choice') then
      if nullif(a ->> 'option_id', '') is not null then
        select * into v_opt from public.review_options o
         where o.id::text = a ->> 'option_id' and o.question_id = q.id;
        if not found then
          raise exception 'Pilihan tidak valid pada "%".', q.prompt using errcode = '22023';
        end if;
      end if;
      if v_opt.id is null and q.is_required then
        raise exception 'Pertanyaan "%" wajib dijawab.', q.prompt using errcode = '22023';
      end if;
      if q.kind = 'scale' then
        select min(o.score), max(o.score) into v_min, v_max from public.review_options o where o.question_id = q.id and o.score is not null;
      end if;
      if v_opt.id is not null and v_evid is null
         and (q.evidence_rule = 'always' or (q.evidence_rule = 'extreme' and q.kind = 'scale' and v_opt.score in (v_min, v_max))) then
        raise exception 'Tuliskan contoh kejadian/bukti untuk jawaban "%".', q.prompt using errcode = '22023';
      end if;
      v_text := null;
    else
      if v_text is null and q.is_required then
        raise exception 'Pertanyaan "%" wajib diisi.', q.prompt using errcode = '22023';
      end if;
      v_evid := null;
    end if;

    insert into public.review_answers (submission_id, question_id, option_id, option_label, score, min_score, max_score, text_answer, evidence)
    values (v_sub, q.id, v_opt.id, v_opt.label, case when q.kind = 'scale' then v_opt.score end, v_min, v_max, left(v_text, 4000), left(v_evid, 2000))
    on conflict (submission_id, question_id) do update
      set option_id = excluded.option_id, option_label = excluded.option_label, score = excluded.score,
          min_score = excluded.min_score, max_score = excluded.max_score,
          text_answer = excluded.text_answer, evidence = excluded.evidence;

    if q.kind = 'scale' and v_opt.score is not null and v_max > v_min then
      v_num := v_num + q.weight * (v_opt.score - v_min) / (v_max - v_min);
      v_den := v_den + q.weight;
    end if;
  end loop;

  v_pct := case when v_den > 0 then round(100 * v_num / v_den, 2) end;
  update public.review_submissions set score_pct = v_pct, updated_at = now() where id = v_sub;
  return v_pct;
end;
$$;

-- Rekap semua peserta (review.manage).
create or replace function public.review_summary(p_month date)
returns table(user_id uuid, full_name text, team_name text, division_code text,
              self_pct numeric, peer_pct numeric, peer_n integer, sup_pct numeric, sup_n integer,
              final_pct numeric, peers_given integer, self_done boolean)
language sql stable security definer set search_path = ''
as $$
  with ppl as (
    select p.id, p.full_name, t.name as team_name, d.code
      from public.profiles p
      left join public.teams t on t.id = p.team_id
      left join public.divisions d on d.id = t.division_id
     where p.is_active and public.is_review_participant(p.id) and public.has_permission('review.manage')
  ),
  agg as (
    select s.reviewee_id, s.review_type, round(avg(s.score_pct), 2) as pct, count(*)::int as n
      from public.review_submissions s where s.period_month = p_month group by 1, 2
  )
  select x.id, x.full_name, x.team_name, x.code,
         (select a.pct from agg a where a.reviewee_id = x.id and a.review_type = 'self'),
         (select a.pct from agg a where a.reviewee_id = x.id and a.review_type = 'peer'),
         coalesce((select a.n from agg a where a.reviewee_id = x.id and a.review_type = 'peer'), 0),
         (select a.pct from agg a where a.reviewee_id = x.id and a.review_type = 'supervisor'),
         coalesce((select a.n from agg a where a.reviewee_id = x.id and a.review_type = 'supervisor'), 0),
         (select round(sum(a.pct * f.weight) / nullif(sum(f.weight), 0), 2)
            from agg a join public.review_forms f on f.review_type = a.review_type and f.is_active and f.weight > 0
           where a.reviewee_id = x.id and a.pct is not null),
         (select count(*)::int from public.review_submissions s
           where s.period_month = p_month and s.reviewer_id = x.id and s.review_type = 'peer'),
         exists (select 1 from public.review_submissions s
                  where s.period_month = p_month and s.reviewee_id = x.id and s.review_type = 'self')
    from ppl x
   order by x.team_name nulls last, x.full_name;
$$;

-- Detail penilaian satu orang (review.manage): semua isian lengkap dengan nama penilai + data aktivitas.
create or replace function public.review_detail(p_user uuid, p_month date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_start date := p_month;
  v_end date := (p_month + interval '1 month')::date;
  v_start_ts timestamptz := (p_month::timestamp at time zone 'Asia/Jakarta');
  v_end_ts timestamptz := ((p_month + interval '1 month')::timestamp at time zone 'Asia/Jakarta');
begin
  if not public.has_permission('review.manage') then
    raise exception 'Hasil penilaian hanya untuk admin & supervisor.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'user', (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'team', t.name)
               from public.profiles p left join public.teams t on t.id = p.team_id where p.id = p_user),
    'weights', (select jsonb_object_agg(f.review_type, f.weight) from public.review_forms f where f.is_active),
    'submissions', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', s.id, 'type', s.review_type, 'reviewer', rv.full_name, 'score_pct', s.score_pct, 'updated_at', s.updated_at,
                       'answers', (select coalesce(jsonb_agg(jsonb_build_object(
                                      'question_id', a.question_id, 'section', q.section, 'prompt', q.prompt, 'kind', q.kind,
                                      'option', a.option_label, 'score', a.score, 'min', a.min_score, 'max', a.max_score,
                                      'text', a.text_answer, 'evidence', a.evidence)
                                    order by q.sort_order, q.created_at), '[]')
                                     from public.review_answers a join public.review_questions q on q.id = a.question_id
                                    where a.submission_id = s.id))
                     order by s.review_type, rv.full_name), '[]')
                      from public.review_submissions s join public.profiles rv on rv.id = s.reviewer_id
                     where s.reviewee_id = p_user and s.period_month = p_month),
    'activity', jsonb_build_object(
      'shifts', (select count(*) from public.shift_schedules ss
                   join public.schedule_periods sp on sp.id = ss.period_id and sp.status = 'published'
                   join public.shifts sh on sh.id = ss.shift_id and sh.is_working
                  where ss.user_id = p_user and ss.work_date >= v_start and ss.work_date < v_end),
      'handovers_sent', (select count(*) from public.handovers h
                  where h.outgoing_by = p_user and h.status <> 'draft' and h.shift_date >= v_start and h.shift_date < v_end),
      'handovers_received', (select count(*) from public.handovers h
                  where h.incoming_by = p_user and h.status = 'acknowledged' and h.shift_date >= v_start and h.shift_date < v_end),
      'tasks_done', (select count(*) from public.project_tasks pt
                  where pt.assignee_id = p_user and pt.status = 'done' and pt.completed_at >= v_start_ts and pt.completed_at < v_end_ts),
      'incidents_resolved', (select count(*) from public.incidents i
                  where i.assigned_to = p_user and i.resolved_at >= v_start_ts and i.resolved_at < v_end_ts),
      'leave_days', (select coalesce(sum(least(lr.end_date, v_end - 1) - greatest(lr.start_date, v_start) + 1), 0)
                  from public.leave_requests lr
                 where lr.user_id = p_user and lr.status = 'approved' and lr.leave_type in ('cuti', 'izin', 'sakit')
                   and lr.start_date < v_end and lr.end_date >= v_start)
    )
  );
end;
$$;

-- Review versi lama (skor 1–5) tidak dipakai lagi.
revoke execute on function public.submit_review(date, uuid, jsonb, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.my_review_tasks(date) from public, anon, authenticated;
revoke execute on function public.monthly_report(uuid, date) from public, anon, authenticated;
revoke execute on function public.review_overview(date) from public, anon, authenticated;

-- ============================================================================
-- Formulir bawaan
-- ============================================================================
create function pg_temp.add_q(p_form uuid, p_section text, p_prompt text, p_kind text, p_div text,
                              p_required boolean, p_sort integer, p_options text[], p_help text default null)
returns void language plpgsql as $$
declare
  v_q uuid;
  i integer;
begin
  insert into public.review_questions (form_id, section, prompt, help, kind, is_required, division_id, evidence_rule, sort_order)
  values (p_form, p_section, p_prompt, p_help, p_kind, p_required,
          (select id from public.divisions where code = p_div),
          case when p_kind = 'scale' then 'extreme' else 'none' end, p_sort)
  returning id into v_q;
  if p_options is not null then
    for i in 1 .. array_length(p_options, 1) loop
      insert into public.review_options (question_id, label, score, sort_order)
      values (v_q, p_options[i], case when p_kind = 'scale' then i end, i);
    end loop;
  end if;
end $$;

do $$
declare
  f_self uuid;
  f_peer uuid;
  f_sup uuid;
  f uuid;
  s integer;
  -- Kompetensi bersama: {bagian, pertanyaan, divisi, sertakan_di_peer, pilihan 1..5}
  comp jsonb := $j$[
    ["Disiplin & Kehadiran", "Ketepatan waktu hadir di shift", null, true,
      ["Lebih dari 3 kali terlambat atau pernah absen tanpa kabar", "Terlambat 2–3 kali dalam sebulan", "Terlambat 1 kali dan sudah memberi kabar", "Selalu tepat waktu", "Selalu tepat waktu dan sudah membaca handover sebelum shift dimulai"]],
    ["Disiplin & Kehadiran", "Kepatuhan pada SOP & checklist shift", null, true,
      ["Sering melewatkan checklist/SOP hingga berdampak ke layanan", "Beberapa kali checklist tidak lengkap", "Checklist lengkap, sesekali perlu diingatkan", "Checklist selalu lengkap tanpa diingatkan", "Selalu lengkap dan aktif mengusulkan perbaikan SOP"]],
    ["Disiplin & Kehadiran", "Penyelesaian tugas yang diberikan", null, true,
      ["Banyak tugas tidak selesai tanpa penjelasan", "Sebagian tugas terlambat dan tidak dikomunikasikan", "Tugas selesai, sesekali terlambat namun dikomunikasikan", "Semua tugas selesai tepat waktu", "Tugas selesai lebih cepat dan ikut membantu tugas lain"]],
    ["Komunikasi & Handover", "Kualitas catatan handover", null, true,
      ["Sering tidak membuat handover atau isinya kosong", "Handover dibuat, tapi informasi penting sering terlewat", "Cukup jelas, sesekali penerima perlu bertanya ulang", "Jelas & lengkap: status, tiket, dan tindak lanjut", "Lengkap, terstruktur, dan bisa langsung ditindaklanjuti tanpa bertanya"]],
    ["Komunikasi & Handover", "Eskalasi gangguan/insiden", null, true,
      ["Pernah tidak eskalasi sehingga gangguan berlarut", "Eskalasi melewati batas waktu SOP", "Eskalasi sesuai SOP setelah diingatkan", "Eskalasi tepat waktu ke pihak yang benar", "Eskalasi tepat waktu disertai data pendukung lengkap"]],
    ["Komunikasi & Handover", "Respons di kanal komunikasi tim saat shift", null, true,
      ["Sering tidak merespons", "Respons lebih dari 30 menit", "Respons dalam 15–30 menit", "Respons kurang dari 15 menit", "Respons cepat dan proaktif membagikan update"]],
    ["Kerja Sama", "Membantu rekan saat beban kerja tinggi", null, true,
      ["Menolak membantu meski tidak sibuk", "Membantu hanya bila diperintah atasan", "Membantu bila diminta", "Menawarkan bantuan tanpa diminta", "Selalu sigap membantu dan membagikan cara penyelesaiannya"]],
    ["Kerja Sama", "Berbagi pengetahuan & temuan", null, true,
      ["Tidak pernah berbagi informasi/temuan", "Berbagi hanya bila ditanya, penjelasan minim", "Berbagi bila ditanya dengan penjelasan jelas", "Rutin berbagi temuan di kanal tim", "Membuat dokumentasi/knowledge base yang dipakai tim"]],
    ["Kerja Sama", "Sikap & etika kerja", null, true,
      ["Ada keluhan serius soal sikap", "Sesekali bersikap kurang profesional", "Bersikap profesional", "Profesional dan menjaga suasana kerja positif", "Menjadi teladan dalam sikap & etika"]],
    ["Inisiatif & Pengembangan", "Inisiatif menyelesaikan masalah", null, true,
      ["Menunggu instruksi untuk semua hal", "Bertindak hanya pada masalah rutin", "Mencoba menyelesaikan masalah sebelum eskalasi", "Mencari akar masalah, bukan hanya gejala", "Mengusulkan & menjalankan perbaikan agar masalah tidak berulang"]],
    ["Inisiatif & Pengembangan", "Pengembangan diri", null, false,
      ["Tidak ada usaha belajar hal baru", "Belajar hanya bila diwajibkan", "Mengikuti pelatihan/materi yang disediakan", "Aktif belajar mandiri dan hasilnya diterapkan", "Menyelesaikan sertifikasi/kursus dan membagikannya ke tim"]],
    ["Kompetensi Teknis NOC", "Monitoring jaringan & perangkat", "NOC", true,
      ["Sering melewatkan alarm/gangguan", "Beberapa alarm terlambat ditangani", "Alarm ditangani, sesekali terlambat", "Alarm ditangani tepat waktu sesuai prioritas", "Mendeteksi potensi gangguan sebelum alarm muncul"]],
    ["Kompetensi Teknis NOC", "Troubleshooting gangguan", "NOC", true,
      ["Belum mampu troubleshooting dasar", "Mampu troubleshooting dasar dengan bimbingan", "Mampu troubleshooting dasar secara mandiri", "Mampu menangani gangguan kompleks", "Menjadi rujukan tim untuk gangguan kompleks"]],
    ["Kompetensi Teknis NOC", "Dokumentasi tiket & laporan gangguan", "NOC", true,
      ["Tiket sering tidak dibuat/ditutup", "Tiket dibuat, tapi kronologi tidak lengkap", "Tiket lengkap, sesekali terlambat diperbarui", "Tiket lengkap dan selalu diperbarui", "Tiket lengkap disertai RCA yang jelas"]],
    ["Kompetensi Teknis SOC", "Triase alert keamanan (SIEM/EDR)", "SOC", true,
      ["Sering melewatkan alert atau salah klasifikasi", "Triase lambat, beberapa kali salah klasifikasi", "Triase sesuai playbook, sesekali perlu koreksi", "Triase cepat dan tepat sesuai prioritas", "Triase cepat & tepat, serta mengusulkan tuning rule untuk mengurangi false positive"]],
    ["Kompetensi Teknis SOC", "Investigasi & analisa insiden", "SOC", true,
      ["Belum mampu investigasi dasar", "Investigasi dangkal, perlu banyak bimbingan", "Mampu korelasi log & IOC dasar secara mandiri", "Investigasi mendalam hingga akar masalah", "Investigasi mendalam ditambah threat hunting proaktif"]],
    ["Kompetensi Teknis SOC", "Pelaporan insiden keamanan", "SOC", true,
      ["Laporan sering tidak dibuat", "Laporan tidak lengkap (tanpa IOC/timeline)", "Laporan lengkap, sesekali terlambat", "Lengkap dengan IOC, timeline, dan rekomendasi", "Siap dikirim ke klien/manajemen tanpa revisi"]]
  ]$j$;
  c jsonb;
begin
  insert into public.review_forms (review_type, name, description, weight) values
    ('self', 'Self Review', 'Nilai diri sendiri secara jujur berdasarkan kejadian nyata selama sebulan.', 20),
    ('peer', 'Penilaian Rekan', 'Nilai rekan setim berdasarkan perilaku yang Anda lihat langsung. Identitas Anda tidak diketahui rekan yang dinilai.', 30),
    ('supervisor', 'Penilaian Atasan', 'Penilaian supervisor terhadap bawahan berdasarkan data dan pengamatan selama sebulan.', 50);
  select id into f_self from public.review_forms where review_type = 'self';
  select id into f_peer from public.review_forms where review_type = 'peer';
  select id into f_sup from public.review_forms where review_type = 'supervisor';

  foreach f in array array[f_sup, f_self, f_peer] loop
    s := case when f = f_sup then 100 else 0 end;
    for c in select * from jsonb_array_elements(comp) loop
      continue when f = f_peer and not (c ->> 3)::boolean;
      s := s + 10;
      perform pg_temp.add_q(f, c ->> 0, c ->> 1, 'scale', c ->> 2, true, s,
                            array(select jsonb_array_elements_text(c -> 4)));
    end loop;
  end loop;

  -- Atasan: kinerja & hasil (paling atas), rekomendasi, dan catatan.
  perform pg_temp.add_q(f_sup, 'Kinerja & Hasil', 'Pencapaian target/KPI bulan ini', 'scale', null, true, 10,
    array['Kurang dari 50% target', '50–69% target', '70–89% target', '90–100% target', 'Melebihi target']);
  perform pg_temp.add_q(f_sup, 'Kinerja & Hasil', 'Kualitas hasil kerja', 'scale', null, true, 20,
    array['Sering harus dikerjakan ulang', 'Beberapa kali perlu revisi besar', 'Perlu revisi kecil', 'Jarang perlu revisi', 'Tanpa revisi dan layak dijadikan contoh']);
  perform pg_temp.add_q(f_sup, 'Kesimpulan', 'Rekomendasi tindak lanjut', 'choice', null, true, 900,
    array['Pertahankan kinerja', 'Perlu coaching', 'Perlu pelatihan teknis', 'Perlu pembinaan/teguran', 'Layak diapresiasi/dipromosikan']);
  perform pg_temp.add_q(f_sup, 'Kesimpulan', 'Catatan atasan', 'text', null, true, 910, null,
    'Ringkas kekuatan dan area perbaikan utama, sertakan contoh kejadian.');
  perform pg_temp.add_q(f_sup, 'Kesimpulan', 'Rencana pengembangan bulan depan', 'text', null, false, 920, null);

  perform pg_temp.add_q(f_self, 'Refleksi', 'Pencapaian utama bulan ini', 'text', null, true, 900, null,
    'Mis. gangguan yang berhasil ditangani, pekerjaan selesai, hal baru yang dipelajari.');
  perform pg_temp.add_q(f_self, 'Refleksi', 'Kendala yang dihadapi', 'text', null, false, 910, null);
  perform pg_temp.add_q(f_self, 'Refleksi', 'Target bulan depan', 'text', null, true, 920, null);

  perform pg_temp.add_q(f_peer, 'Masukan', 'Hal yang sudah baik dari rekan ini', 'text', null, true, 900, null);
  perform pg_temp.add_q(f_peer, 'Masukan', 'Saran perbaikan untuk rekan ini', 'text', null, true, 910, null);
end $$;

-- ============================================================================
-- Hapus user
-- ============================================================================
-- Kolom referensi opsional (penerima, approver, PIC, dsb.) dikosongkan saat user dihapus.
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
       and c.confdeltype = 'a' and array_length(c.conkey, 1) = 1 and not a.attnotnull
  loop
    execute format('alter table %s drop constraint %I, add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
                   r.tbl, r.conname, r.conname, r.attname);
  end loop;
end $$;

-- Riwayat wajib yang menghalangi penghapusan: { "tabel.kolom": jumlah }.
create or replace function public.user_delete_blockers(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record;
  n bigint;
  v jsonb := '{}'::jsonb;
begin
  if not public.has_permission('user.manage') then
    raise exception 'Anda tidak memiliki izin.' using errcode = '42501';
  end if;
  for r in
    select c.conrelid::regclass as tbl, c.conrelid::regclass::text as tname, a.attname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and c.confdeltype in ('a', 'r')
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.attname) into n using p_user;
    if n > 0 then
      v := v || jsonb_build_object(replace(r.tname, 'public.', '') || '.' || r.attname, n);
    end if;
  end loop;
  return v;
end;
$$;
