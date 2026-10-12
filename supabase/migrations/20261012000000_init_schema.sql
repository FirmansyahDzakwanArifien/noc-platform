-- =============================================================================
-- NOC Platform — Initial Schema
-- Modules: Core + RBAC, Jadwal, Handover, Perizinan, Perkembangan, Shared
-- Target : Supabase (PostgreSQL 15+)
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- 0. ENUMS
-- =============================================================================
create type public.priority_level    as enum ('low', 'medium', 'high', 'critical');

-- Jadwal
create type public.schedule_status   as enum ('draft', 'published', 'archived');

-- Handover
create type public.handover_status   as enum ('draft', 'submitted', 'acknowledged', 'returned');
create type public.handover_category as enum ('incident', 'pending_task', 'maintenance', 'monitoring', 'info', 'equipment');
create type public.item_status       as enum ('open', 'in_progress', 'resolved', 'closed');
create type public.checklist_input   as enum ('boolean', 'number', 'text', 'select');

-- Perizinan
create type public.permit_type       as enum ('akses_site', 'pekerjaan', 'maintenance', 'change_request', 'keluar_masuk_barang');
create type public.permit_status     as enum ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'active', 'completed', 'cancelled', 'expired');
create type public.approval_decision as enum ('pending', 'approved', 'rejected');
create type public.item_direction    as enum ('masuk', 'keluar');
create type public.leave_type        as enum ('cuti', 'izin', 'sakit', 'tukar_shift', 'dinas');
create type public.request_status    as enum ('pending', 'approved', 'rejected', 'cancelled');

-- Perkembangan
create type public.project_status    as enum ('planning', 'on_going', 'on_hold', 'done', 'cancelled');
create type public.task_status       as enum ('todo', 'in_progress', 'review', 'done', 'blocked');

-- Shared
create type public.incident_status   as enum ('open', 'investigating', 'mitigated', 'resolved', 'closed');

-- =============================================================================
-- 1. UTILITIES
-- =============================================================================

-- updated_at otomatis
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Penomoran dokumen: PREFIX-YYYYMM-0001 (reset per bulan per prefix)
create table public.doc_counters (
  prefix     text    not null,
  period     text    not null,           -- 'YYYYMM'
  last_value integer not null default 0,
  primary key (prefix, period)
);

create or replace function public.next_doc_no(p_prefix text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_period text := to_char(now() at time zone 'Asia/Jakarta', 'YYYYMM');
  v_val    integer;
begin
  insert into public.doc_counters as c (prefix, period, last_value)
  values (p_prefix, v_period, 1)
  on conflict (prefix, period) do update set last_value = c.last_value + 1
  returning last_value into v_val;
  return p_prefix || '-' || v_period || '-' || lpad(v_val::text, 4, '0');
end $$;

-- Trigger generik: isi kolom nomor (TG_ARGV[0] = nama kolom, TG_ARGV[1] = prefix)
create or replace function public.tg_set_doc_no()
returns trigger language plpgsql as $$
declare
  v_col    text := tg_argv[0];
  v_prefix text := tg_argv[1];
begin
  if (to_jsonb(new) ->> v_col) is null then
    new := jsonb_populate_record(new, jsonb_build_object(v_col, public.next_doc_no(v_prefix)));
  end if;
  return new;
end $$;

-- =============================================================================
-- 2. CORE: sites, teams, vendors, profiles
-- =============================================================================
create table public.sites (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                 -- ex: JKT-DC01, POP-SBY
  name        text not null,
  site_type   text not null default 'pop',          -- dc | pop | office | noc_room
  address     text,
  region      text,
  latitude    numeric(9,6),
  longitude   numeric(9,6),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,                 -- ex: NOC L1, NOC L2, Field Ops
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.vendors (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  npwp          text,
  pic_name      text,
  pic_phone     text,
  pic_email     text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 1:1 dengan auth.users. Role TIDAK disimpan di sini → lihat user_roles.
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  employee_no   text unique,                        -- NIK karyawan
  email         text,
  phone         text,
  team_id       uuid references public.teams(id) on delete set null,
  vendor_id     uuid references public.vendors(id) on delete set null,  -- akun vendor
  avatar_url    text,
  is_active     boolean not null default true,      -- false = akun dinonaktifkan, semua permission hilang
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- =============================================================================
-- 3. RBAC: roles, permissions, role_permissions, user_roles
-- =============================================================================
create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,                -- admin | supervisor | lead | staff | viewer | vendor
  name         text not null,
  description  text,
  rank         smallint not null,                   -- user hanya bisa assign role dgn rank <= rank miliknya
  is_system    boolean not null default false,      -- role bawaan, tidak boleh dihapus
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.permissions (
  key          text primary key,                    -- <modul>.<aksi>, ex: schedule.manage
  module       text not null,
  description  text not null
);

create table public.role_permissions (
  role_id         uuid not null references public.roles(id) on delete cascade,
  permission_key  text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- Satu user boleh punya lebih dari satu role (permission = gabungan semuanya)
create table public.user_roles (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role_id      uuid not null references public.roles(id) on delete cascade,
  assigned_by  uuid references public.profiles(id),
  assigned_at  timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index on public.user_roles (role_id);

-- =============================================================================
-- 4. SIGN-UP ALLOWLIST (hanya email/domain tertentu yang boleh membuat akun)
-- =============================================================================
create table public.allowed_signup_emails (
  email         text primary key check (email = lower(email)),
  default_role  text not null default 'viewer' references public.roles(key) on update cascade,
  note          text,
  created_at    timestamptz not null default now()
);

create table public.allowed_signup_domains (
  domain        text primary key check (domain = lower(domain) and domain !~ '@'),
  default_role  text not null default 'viewer' references public.roles(key) on update cascade,
  note          text,
  created_at    timestamptz not null default now()
);

-- =============================================================================
-- 5. MODULE: JADWAL (shift roster)
-- =============================================================================
create table public.shifts (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,                 -- P / S / M / OFF
  name        text not null,                        -- Pagi / Siang / Malam / Libur
  start_time  time,
  end_time    time,                                 -- boleh < start_time (lintas hari)
  is_working  boolean not null default true,        -- false utk OFF / libur
  color       text,                                 -- warna di kalender, ex: #3b82f6
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  check (not is_working or (start_time is not null and end_time is not null))
);

-- Periode jadwal (mis. "Roster November 2026 - NOC L1"). Dibuat admin/supervisor/lead,
-- user biasa hanya bisa melihat setelah status = published.
create table public.schedule_periods (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  site_id       uuid references public.sites(id),
  team_id       uuid references public.teams(id),
  start_date    date not null,
  end_date      date not null,
  status        public.schedule_status not null default 'draft',
  notes         text,
  created_by    uuid not null references public.profiles(id),
  published_by  uuid references public.profiles(id),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date)
);
create index on public.schedule_periods (start_date, end_date);

create table public.shift_schedules (
  id          uuid primary key default gen_random_uuid(),
  period_id   uuid not null references public.schedule_periods(id) on delete cascade,
  work_date   date not null,
  shift_id    uuid not null references public.shifts(id),
  site_id     uuid references public.sites(id),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  is_leader   boolean not null default false,       -- leader shift
  note        text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (work_date, shift_id, user_id)
);
create index on public.shift_schedules (period_id);
create index on public.shift_schedules (user_id, work_date);
create index on public.shift_schedules (work_date, shift_id);

-- =============================================================================
-- 6. MODULE: HANDOVER (serah terima shift)
-- =============================================================================
create table public.handovers (
  id               uuid primary key default gen_random_uuid(),
  handover_no      text unique,                     -- HO-202610-0001 (auto)
  site_id          uuid references public.sites(id),
  shift_date       date not null,
  from_shift_id    uuid not null references public.shifts(id),
  to_shift_id      uuid not null references public.shifts(id),
  outgoing_by      uuid not null references public.profiles(id),   -- yang menyerahkan
  incoming_by      uuid references public.profiles(id),            -- yang menerima
  status           public.handover_status not null default 'draft',
  summary          text,                            -- ringkasan kondisi shift
  notes            text,
  submitted_at     timestamptz,
  acknowledged_at  timestamptz,
  ack_note         text,                            -- catatan penerima / alasan dikembalikan
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.handovers (shift_date desc);
create index on public.handovers (status);

-- Anggota tim yang bertugas di shift tsb (bisa diisi otomatis dari shift_schedules)
create table public.handover_members (
  handover_id uuid not null references public.handovers(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  side        text not null check (side in ('outgoing', 'incoming')),
  primary key (handover_id, user_id, side)
);

-- Butir serah terima (pending task, incident berjalan, info, dll)
create table public.handover_items (
  id            uuid primary key default gen_random_uuid(),
  handover_id   uuid not null references public.handovers(id) on delete cascade,
  category      public.handover_category not null,
  title         text not null,
  description   text,
  priority      public.priority_level not null default 'medium',
  status        public.item_status not null default 'open',
  incident_id   uuid,                               -- FK ditambahkan setelah tabel incidents
  ref_ticket    text,                               -- no tiket eksternal (ISP/vendor)
  carried_from  uuid references public.handover_items(id),  -- item turunan dari handover sebelumnya
  due_at        timestamptz,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.handover_items (handover_id);
create index on public.handover_items (status) where status in ('open', 'in_progress');

-- Template checklist (cek suhu, UPS, genset, link utama, dll)
create table public.checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  site_id     uuid references public.sites(id),     -- null = berlaku umum
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.checklist_template_items (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.checklist_templates(id) on delete cascade,
  section      text,                                -- ex: "Power", "Cooling", "Network"
  label        text not null,                       -- ex: "Suhu ruang server"
  input_type   public.checklist_input not null default 'boolean',
  unit         text,                                -- ex: °C, %, V
  options      jsonb,                               -- untuk input select
  min_value    numeric,
  max_value    numeric,                             -- di luar range → is_ok = false
  is_required  boolean not null default true,
  sort_order   smallint not null default 0
);

create table public.handover_checklist_results (
  id                uuid primary key default gen_random_uuid(),
  handover_id       uuid not null references public.handovers(id) on delete cascade,
  template_item_id  uuid not null references public.checklist_template_items(id),
  value             jsonb,                          -- true / 23.5 / "OK" / "Normal"
  is_ok             boolean,
  note              text,
  checked_by        uuid references public.profiles(id),
  checked_at        timestamptz not null default now(),
  unique (handover_id, template_item_id)
);

-- =============================================================================
-- 7. MODULE: PERIZINAN
--    7a. Izin kerja / akses site (internal & vendor)
--    7b. Izin personel (cuti, izin, sakit, tukar shift)
-- =============================================================================
create table public.permits (
  id              uuid primary key default gen_random_uuid(),
  permit_no       text unique,                      -- PRM-202610-0001 (auto)
  permit_type     public.permit_type not null,
  title           text not null,
  purpose         text not null,                    -- tujuan / lingkup pekerjaan
  site_id         uuid not null references public.sites(id),
  requested_by    uuid not null references public.profiles(id),
  vendor_id       uuid references public.vendors(id),
  pic_internal    uuid references public.profiles(id),  -- pendamping dari NOC
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  risk_level      public.priority_level not null default 'low',
  impact          text,                             -- dampak ke layanan
  rollback_plan   text,                             -- wajib utk change_request
  status          public.permit_status not null default 'draft',
  submitted_at    timestamptz,
  approved_at     timestamptz,
  closed_at       timestamptz,
  closing_note    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_at > start_at)
);
create index on public.permits (status);
create index on public.permits (site_id, start_at);

-- Personel yang masuk (termasuk orang luar yang tidak punya akun)
create table public.permit_personnel (
  id           uuid primary key default gen_random_uuid(),
  permit_id    uuid not null references public.permits(id) on delete cascade,
  full_name    text not null,
  id_number    text,                                -- KTP / ID card
  company      text,
  phone        text,
  role         text                                 -- teknisi, supervisor, dll
);

-- Barang / perangkat yang dibawa masuk / keluar
create table public.permit_items (
  id            uuid primary key default gen_random_uuid(),
  permit_id     uuid not null references public.permits(id) on delete cascade,
  direction     public.item_direction not null,
  name          text not null,
  brand_model   text,
  serial_number text,
  qty           integer not null default 1 check (qty > 0),
  note          text
);

-- Approval berjenjang (step 1 = lead/supervisor, step 2 = manager, dst)
create table public.permit_approvals (
  id           uuid primary key default gen_random_uuid(),
  permit_id    uuid not null references public.permits(id) on delete cascade,
  step         smallint not null,
  approver_id  uuid not null references public.profiles(id),
  decision     public.approval_decision not null default 'pending',
  comment      text,
  decided_at   timestamptz,
  unique (permit_id, step)
);
create index on public.permit_approvals (approver_id) where decision = 'pending';

-- Log check-in / check-out di lokasi
create table public.permit_visits (
  id              uuid primary key default gen_random_uuid(),
  permit_id       uuid not null references public.permits(id) on delete cascade,
  personnel_id    uuid references public.permit_personnel(id) on delete set null,
  check_in_at     timestamptz not null default now(),
  check_out_at    timestamptz,
  checked_in_by   uuid references public.profiles(id),
  checked_out_by  uuid references public.profiles(id),
  note            text
);

-- Izin personel NOC (terhubung ke modul Jadwal untuk tukar shift)
create table public.leave_requests (
  id                uuid primary key default gen_random_uuid(),
  request_no        text unique,                    -- LV-202610-0001 (auto)
  user_id           uuid not null references public.profiles(id) on delete cascade,
  leave_type        public.leave_type not null,
  start_date        date not null,
  end_date          date not null,
  swap_with         uuid references public.profiles(id),          -- tukar_shift: rekan pengganti
  swap_schedule_id  uuid references public.shift_schedules(id),   -- tukar_shift: jadwal yang ditukar
  swap_accepted_at  timestamptz,                    -- rekan sudah setuju (via accept_shift_swap)
  reason            text not null,
  status            public.request_status not null default 'pending',
  approver_id       uuid references public.profiles(id),
  decided_at        timestamptz,
  decision_note     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_date >= start_date),
  check (leave_type <> 'tukar_shift' or (swap_with is not null and swap_schedule_id is not null))
);
create index on public.leave_requests (user_id, start_date);
create index on public.leave_requests (status) where status = 'pending';

-- =============================================================================
-- 8. MODULE: PERKEMBANGAN (project & progress tracking)
-- =============================================================================
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,                        -- PRJ-202610-0001 (auto)
  name          text not null,
  description   text,
  category      text,                               -- ex: upgrade, deployment, migrasi, improvement
  site_id       uuid references public.sites(id),
  owner_id      uuid not null references public.profiles(id),
  status        public.project_status not null default 'planning',
  priority      public.priority_level not null default 'medium',
  start_date    date,
  target_date   date,
  finished_date date,
  progress_pct  numeric(5,2) not null default 0 check (progress_pct between 0 and 100),  -- dihitung dari task
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null default 'member' check (role in ('lead', 'member', 'reviewer')),
  primary key (project_id, user_id)
);

create table public.project_milestones (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  name          text not null,
  due_date      date,
  completed_at  timestamptz,
  sort_order    smallint not null default 0
);

create table public.project_tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  milestone_id  uuid references public.project_milestones(id) on delete set null,
  parent_id     uuid references public.project_tasks(id) on delete cascade,
  title         text not null,
  description   text,
  assignee_id   uuid references public.profiles(id),
  status        public.task_status not null default 'todo',
  priority      public.priority_level not null default 'medium',
  weight        numeric(6,2) not null default 1 check (weight > 0),   -- bobot untuk % proyek
  progress_pct  numeric(5,2) not null default 0 check (progress_pct between 0 and 100),
  start_date    date,
  due_date      date,
  completed_at  timestamptz,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.project_tasks (project_id);
create index on public.project_tasks (assignee_id) where status <> 'done';

-- Laporan perkembangan (harian / mingguan) — timeline
create table public.progress_updates (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  task_id       uuid references public.project_tasks(id) on delete cascade,
  reported_by   uuid not null references public.profiles(id),
  report_date   date not null default current_date,
  progress_pct  numeric(5,2) check (progress_pct between 0 and 100),  -- jika diisi → update task
  content       text not null,                      -- apa yang dikerjakan
  blockers      text,                               -- kendala
  next_plan     text,                               -- rencana berikutnya
  created_at    timestamptz not null default now()
);
create index on public.progress_updates (project_id, report_date desc);

-- =============================================================================
-- 9. SHARED: incidents, attachments, comments, notifications, announcements, audit
-- =============================================================================
create table public.incidents (
  id               uuid primary key default gen_random_uuid(),
  ticket_no        text unique,                     -- INC-202610-0001 (auto)
  title            text not null,
  description      text,
  site_id          uuid references public.sites(id),
  severity         public.priority_level not null default 'medium',
  status           public.incident_status not null default 'open',
  affected_service text,
  started_at       timestamptz not null default now(),
  detected_at      timestamptz not null default now(),
  resolved_at      timestamptz,
  reported_by      uuid references public.profiles(id),
  assigned_to      uuid references public.profiles(id),
  root_cause       text,
  resolution       text,
  external_ticket  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.incidents (status);
create index on public.incidents (started_at desc);

alter table public.handover_items
  add constraint handover_items_incident_fk
  foreign key (incident_id) references public.incidents(id) on delete set null;

create table public.incident_updates (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references public.incidents(id) on delete cascade,
  status       public.incident_status,
  content      text not null,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

-- Lampiran polimorfik (file di Supabase Storage bucket "attachments")
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,                      -- handover | handover_item | permit | project | progress_update | incident | leave_request
  entity_id     uuid not null,
  storage_path  text not null,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);
create index on public.attachments (entity_type, entity_id);

-- Komentar polimorfik
create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,
  entity_id    uuid not null,
  body         text not null,
  author_id    uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.comments (entity_type, entity_id);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  app          text not null,                       -- jadwal | handover | perizinan | perkembangan | core
  title        text not null,
  body         text,
  link         text,                                -- deep link ke halaman terkait
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc) where read_at is null;

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  priority     public.priority_level not null default 'low',
  publish_at   timestamptz not null default now(),
  expire_at    timestamptz,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

create table public.audit_logs (
  id           bigint generated always as identity primary key,
  table_name   text not null,
  record_id    text,
  action       text not null,                       -- INSERT | UPDATE | DELETE
  old_data     jsonb,
  new_data     jsonb,
  actor_id     uuid,
  created_at   timestamptz not null default now()
);
create index on public.audit_logs (table_name, record_id);

-- =============================================================================
-- 10. RBAC & AUTH FUNCTIONS
-- =============================================================================

-- Cek permission user yang sedang login (dipakai di semua RLS policy)
create or replace function public.has_permission(p_perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.profiles p          on p.id = ur.user_id
     where ur.user_id = auth.uid()
       and p.is_active
       and rp.permission_key = p_perm
  )
$$;

create or replace function public.has_role(p_role text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
     where ur.user_id = auth.uid() and r.key = p_role
  )
$$;

-- Rank tertinggi user (untuk mencegah eskalasi: tidak bisa assign role di atas dirinya)
create or replace function public.my_max_rank()
returns smallint language sql stable security definer set search_path = '' as $$
  select coalesce(max(r.rank), 0)::smallint
    from public.user_roles ur join public.roles r on r.id = ur.role_id
   where ur.user_id = auth.uid()
$$;

-- Dipanggil frontend sekali setelah login untuk menampilkan/menyembunyikan menu
create or replace function public.my_permissions()
returns setof text language sql stable security definer set search_path = '' as $$
  select distinct rp.permission_key
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.profiles p          on p.id = ur.user_id
   where ur.user_id = auth.uid() and p.is_active
$$;

-- Allowlist email sign-up
create or replace function public.is_email_allowed(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_email is not null and (
       exists (select 1 from public.allowed_signup_emails  where email  = lower(trim(p_email)))
    or exists (select 1 from public.allowed_signup_domains where domain = lower(split_part(trim(p_email), '@', 2)))
  )
$$;

-- Supabase Auth Hook "Before User Created": menolak sign-up (email/password, magic link, OAuth)
-- dengan pesan yang jelas. Aktifkan di Dashboard → Authentication → Hooks.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_email_allowed(event -> 'user' ->> 'email') then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message',   'Email tidak diizinkan. Gunakan email @corp.jarvis.biz.id atau @jarvis.biz.id.'
    ));
  end if;
  return '{}'::jsonb;
end $$;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;

-- Lapis kedua (tetap berlaku walau hook belum diaktifkan): blokir di level tabel auth.users
create or replace function public.tg_enforce_signup_allowlist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_email_allowed(new.email) then
    raise exception 'Email % tidak diizinkan untuk membuat akun', new.email
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger enforce_signup_allowlist
  before insert or update of email on auth.users
  for each row execute function public.tg_enforce_signup_allowlist();

-- Profil + role default otomatis saat user dibuat
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(new.email);
  v_role  text;
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(v_email, '@', 1)),
    v_email
  );

  select coalesce(
    (select default_role from public.allowed_signup_emails  where email  = v_email),
    (select default_role from public.allowed_signup_domains where domain = split_part(v_email, '@', 2)),
    'viewer'
  ) into v_role;

  insert into public.user_roles (user_id, role_id)
  select new.id, r.id from public.roles r where r.key = v_role;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 11. DOMAIN FUNCTIONS & TRIGGERS
-- =============================================================================

-- updated_at
do $$
declare t text;
begin
  foreach t in array array[
    'sites','teams','vendors','profiles','roles','schedule_periods','shift_schedules',
    'handovers','handover_items','checklist_templates','permits','leave_requests',
    'projects','project_tasks','incidents','comments'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.tg_set_updated_at()', t);
  end loop;
end $$;

-- Nomor dokumen otomatis
create trigger set_doc_no before insert on public.handovers
  for each row execute function public.tg_set_doc_no('handover_no', 'HO');
create trigger set_doc_no before insert on public.permits
  for each row execute function public.tg_set_doc_no('permit_no', 'PRM');
create trigger set_doc_no before insert on public.leave_requests
  for each row execute function public.tg_set_doc_no('request_no', 'LV');
create trigger set_doc_no before insert on public.projects
  for each row execute function public.tg_set_doc_no('code', 'PRJ');
create trigger set_doc_no before insert on public.incidents
  for each row execute function public.tg_set_doc_no('ticket_no', 'INC');

-- ---------- Jadwal ----------

-- Tanggal jadwal harus di dalam rentang periode
create or replace function public.tg_check_schedule_in_period()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.schedule_periods
     where id = new.period_id and new.work_date between start_date and end_date
  ) then
    raise exception 'Tanggal % di luar rentang periode jadwal', new.work_date;
  end if;
  return new;
end $$;

create trigger check_schedule_in_period
  before insert or update of work_date, period_id on public.shift_schedules
  for each row execute function public.tg_check_schedule_in_period();

-- Publish → catat siapa & kapan, lalu kirim notifikasi ke semua yang terjadwal
create or replace function public.tg_schedule_period_publish()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.status = 'published' and old.status <> 'published' then
    new.published_at := now();
    new.published_by := auth.uid();
  end if;
  return new;
end $$;

create trigger schedule_period_publish
  before update of status on public.schedule_periods
  for each row execute function public.tg_schedule_period_publish();

create or replace function public.tg_schedule_period_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and old.status <> 'published' then
    insert into public.notifications (user_id, app, title, body, link)
    select distinct s.user_id, 'jadwal', 'Jadwal baru dipublikasikan', new.name, '/kalender?period=' || new.id
      from public.shift_schedules s
     where s.period_id = new.id;
  end if;
  return null;
end $$;

create trigger schedule_period_notify
  after update of status on public.schedule_periods
  for each row execute function public.tg_schedule_period_notify();

-- Rekan menyetujui permintaan tukar shift (RPC: supabase.rpc('accept_shift_swap', {p_request_id}))
create or replace function public.accept_shift_swap(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.leave_requests
     set swap_accepted_at = now()
   where id = p_request_id
     and leave_type = 'tukar_shift'
     and status = 'pending'
     and swap_with = auth.uid();
  if not found then
    raise exception 'Permintaan tukar shift tidak ditemukan atau bukan untuk Anda';
  end if;
end $$;

-- Tukar shift disetujui → pindahkan jadwal ke rekan
create or replace function public.tg_apply_shift_swap()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.leave_type = 'tukar_shift' and new.status = 'approved' and old.status <> 'approved' then
    if new.swap_accepted_at is null then
      raise exception 'Rekan belum menyetujui tukar shift';
    end if;
    update public.shift_schedules
       set user_id = new.swap_with,
           note    = concat_ws(' | ', note, 'Tukar shift ' || new.request_no)
     where id = new.swap_schedule_id and user_id = new.user_id;
    if not found then
      raise exception 'Jadwal yang ditukar tidak valid';
    end if;
  end if;
  return new;
end $$;

create trigger apply_shift_swap
  before update of status on public.leave_requests
  for each row execute function public.tg_apply_shift_swap();

-- Pengaman: persetujuan rekan hanya boleh diisi oleh rekan itu sendiri; approver & waktu keputusan diisi otomatis
create or replace function public.tg_guard_leave_request()
returns trigger language plpgsql as $$
begin
  if new.swap_accepted_at is distinct from old.swap_accepted_at
     and auth.uid() is distinct from new.swap_with then
    raise exception 'Hanya rekan tukar shift yang bisa menyetujui';
  end if;
  if new.status in ('approved', 'rejected') and old.status = 'pending' then
    new.approver_id := auth.uid();
    new.decided_at  := now();
  end if;
  return new;
end $$;

create trigger guard_leave_request
  before update on public.leave_requests
  for each row execute function public.tg_guard_leave_request();

-- ---------- Perizinan ----------

-- Keputusan approval → status permit (berlaku walau approver tidak punya permit.manage)
create or replace function public.tg_permit_approval_decided()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.decision = 'rejected' then
    update public.permits set status = 'rejected'
     where id = new.permit_id and status in ('submitted', 'in_review');
  elsif new.decision = 'approved' and not exists (
    select 1 from public.permit_approvals
     where permit_id = new.permit_id and decision <> 'approved'
  ) then
    update public.permits set status = 'approved', approved_at = now()
     where id = new.permit_id and status in ('submitted', 'in_review');
  end if;
  return null;
end $$;

create trigger permit_approval_decided
  after update of decision on public.permit_approvals
  for each row when (new.decision is distinct from old.decision)
  execute function public.tg_permit_approval_decided();

-- Check-in pertama → permit approved menjadi active (staff hanya punya permit.checkin)
create or replace function public.tg_permit_first_checkin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.permits set status = 'active'
   where id = new.permit_id and status = 'approved';
  return null;
end $$;

create trigger permit_first_checkin
  after insert on public.permit_visits
  for each row execute function public.tg_permit_first_checkin();

-- ---------- Perkembangan ----------

-- Progress update → update progress task
create or replace function public.tg_apply_progress_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.task_id is not null and new.progress_pct is not null then
    update public.project_tasks
       set progress_pct = new.progress_pct,
           status       = case when new.progress_pct >= 100 then 'done'::public.task_status
                               when status = 'todo'         then 'in_progress'::public.task_status
                               else status end,
           completed_at = case when new.progress_pct >= 100 then now() else null end
     where id = new.task_id;
  end if;
  return new;
end $$;

create trigger apply_progress_update after insert on public.progress_updates
  for each row execute function public.tg_apply_progress_update();

-- Task berubah → hitung ulang % proyek (rata-rata tertimbang, top-level task saja)
create or replace function public.tg_recalc_project_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_project uuid := coalesce(new.project_id, old.project_id);
begin
  update public.projects p
     set progress_pct = coalesce((
           select round(sum(t.progress_pct * t.weight) / nullif(sum(t.weight), 0), 2)
             from public.project_tasks t
            where t.project_id = v_project and t.parent_id is null
         ), 0)
   where p.id = v_project;
  return null;
end $$;

create trigger recalc_project_progress
  after insert or update of progress_pct, weight, parent_id or delete on public.project_tasks
  for each row execute function public.tg_recalc_project_progress();

-- ---------- Audit log ----------
create or replace function public.tg_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := coalesce(to_jsonb(new), to_jsonb(old));
begin
  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, actor_id)
  values (
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_roles','role_permissions','allowed_signup_emails','allowed_signup_domains',
    'schedule_periods','shift_schedules',
    'handovers','handover_items','permits','permit_approvals','leave_requests',
    'projects','project_tasks','incidents'
  ] loop
    execute format(
      'create trigger audit after insert or update or delete on public.%I
         for each row execute function public.tg_audit()', t);
  end loop;
end $$;

-- =============================================================================
-- 12. ROW LEVEL SECURITY
-- =============================================================================

create or replace function public.can_access_permit(p_permit uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('permit.view') or exists (
    select 1 from public.permits pm
      join public.profiles pr on pr.id = auth.uid()
     where pm.id = p_permit
       and (pm.requested_by = auth.uid() or (pr.vendor_id is not null and pm.vendor_id = pr.vendor_id))
  ) or exists (
    select 1 from public.permit_approvals pa where pa.permit_id = p_permit and pa.approver_id = auth.uid()
  )
$$;

create or replace function public.can_edit_project(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('project.manage') or exists (
    select 1 from public.projects where id = p_project and owner_id = auth.uid()
  ) or exists (
    select 1 from public.project_members
     where project_id = p_project and user_id = auth.uid() and role = 'lead'
  )
$$;

create or replace function public.is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members where project_id = p_project and user_id = auth.uid())
$$;

-- Aktifkan RLS di semua tabel public
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 12a. Pola standar: [tabel, permission baca, permission tulis, permission hapus]
do $$
declare r text[];
begin
  foreach r slice 1 in array array[
    ['handovers',                  'handover.view', 'handover.create', 'handover.delete'],
    ['handover_members',           'handover.view', 'handover.create', 'handover.create'],
    ['handover_items',             'handover.view', 'handover.create', 'handover.create'],
    ['handover_checklist_results', 'handover.view', 'handover.create', 'handover.create'],
    ['incidents',                  'incident.view', 'incident.manage', 'incident.delete'],
    ['incident_updates',           'incident.view', 'incident.manage', 'incident.delete'],
    ['attachments',                'portal.access', 'portal.access',   'master.manage'],
    ['comments',                   'portal.access', 'portal.access',   'master.manage']
  ] loop
    execute format('create policy "read"   on public.%I for select to authenticated using (public.has_permission(%L))', r[1], r[2]);
    execute format('create policy "insert" on public.%I for insert to authenticated with check (public.has_permission(%L))', r[1], r[3]);
    execute format('create policy "update" on public.%I for update to authenticated using (public.has_permission(%L)) with check (public.has_permission(%L))', r[1], r[3], r[3]);
    execute format('create policy "delete" on public.%I for delete to authenticated using (public.has_permission(%L))', r[1], r[4]);
  end loop;
end $$;

-- 12b. Master data: semua user login boleh baca, master.manage kelola
do $$
declare t text;
begin
  foreach t in array array['sites', 'teams', 'shifts', 'checklist_templates', 'checklist_template_items'] loop
    execute format('create policy "read"  on public.%I for select to authenticated using (true)', t);
    execute format('create policy "write" on public.%I for all    to authenticated using (public.has_permission(''master.manage'')) with check (public.has_permission(''master.manage''))', t);
  end loop;
end $$;

create policy "read"  on public.vendors for select to authenticated
  using (public.has_permission('portal.access') or id = (select vendor_id from public.profiles where id = auth.uid()));
create policy "write" on public.vendors for all to authenticated
  using (public.has_permission('master.manage')) with check (public.has_permission('master.manage'));

create policy "read"  on public.announcements for select to authenticated
  using (public.has_permission('portal.access'));
create policy "write" on public.announcements for all to authenticated
  using (public.has_permission('announcement.manage')) with check (public.has_permission('announcement.manage'));

-- 12c. RBAC & profil
create policy "read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_permission('portal.access'));
create policy "self update" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and is_active);       -- tidak bisa mengaktifkan diri sendiri
create policy "manage" on public.profiles for all to authenticated
  using (public.has_permission('user.manage')) with check (public.has_permission('user.manage'));

create policy "read"   on public.roles            for select to authenticated using (true);
create policy "manage" on public.roles            for all    to authenticated
  using (public.has_permission('role.manage') and not is_system)
  with check (public.has_permission('role.manage') and rank < public.my_max_rank());
create policy "read"   on public.permissions      for select to authenticated using (true);
create policy "read"   on public.role_permissions for select to authenticated using (true);
create policy "manage" on public.role_permissions for all    to authenticated
  using (public.has_permission('role.manage')) with check (public.has_permission('role.manage'));

create policy "read" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_permission('user.manage'));
create policy "assign" on public.user_roles for insert to authenticated
  with check (
    public.has_permission('user.manage')
    and (select rank from public.roles where id = role_id) <= public.my_max_rank()
  );
create policy "revoke" on public.user_roles for delete to authenticated
  using (
    public.has_permission('user.manage')
    and (select rank from public.roles where id = role_id) <= public.my_max_rank()
  );

create policy "manage" on public.allowed_signup_emails  for all to authenticated
  using (public.has_permission('user.manage')) with check (public.has_permission('user.manage'));
create policy "manage" on public.allowed_signup_domains for all to authenticated
  using (public.has_permission('user.manage')) with check (public.has_permission('user.manage'));

-- 12d. Jadwal: admin/supervisor/lead (schedule.manage) kelola semua termasuk draft;
--      user biasa (schedule.view) hanya melihat periode yang sudah published.
create policy "read" on public.schedule_periods for select to authenticated
  using (
    public.has_permission('schedule.manage')
    or (status = 'published' and public.has_permission('schedule.view'))
  );
create policy "manage" on public.schedule_periods for all to authenticated
  using (public.has_permission('schedule.manage'))
  with check (public.has_permission('schedule.manage'));

create policy "read" on public.shift_schedules for select to authenticated
  using (
    public.has_permission('schedule.manage')
    or (
      public.has_permission('schedule.view')
      and exists (select 1 from public.schedule_periods p where p.id = period_id and p.status = 'published')
    )
  );
create policy "manage" on public.shift_schedules for all to authenticated
  using (public.has_permission('schedule.manage'))
  with check (public.has_permission('schedule.manage'));

-- 12e. Perizinan
create policy "read"   on public.permits for select to authenticated using (public.can_access_permit(id));
create policy "create" on public.permits for insert to authenticated
  with check (
    public.has_permission('permit.create')
    and requested_by = auth.uid()
    and status in ('draft', 'submitted')
  );
create policy "update" on public.permits for update to authenticated
  using ((requested_by = auth.uid() and status in ('draft', 'submitted')) or public.has_permission('permit.manage'))
  with check ((requested_by = auth.uid() and status in ('draft', 'submitted', 'cancelled')) or public.has_permission('permit.manage'));
create policy "delete" on public.permits for delete to authenticated
  using ((requested_by = auth.uid() and status = 'draft') or public.has_permission('permit.delete'));

do $$
declare t text;
begin
  foreach t in array array['permit_personnel', 'permit_items'] loop
    execute format('create policy "read"  on public.%I for select to authenticated using (public.can_access_permit(permit_id))', t);
    execute format('create policy "write" on public.%I for all    to authenticated using (public.can_access_permit(permit_id)) with check (public.can_access_permit(permit_id))', t);
  end loop;
end $$;

create policy "read"   on public.permit_approvals for select to authenticated using (public.can_access_permit(permit_id));
create policy "create" on public.permit_approvals for insert to authenticated with check (public.has_permission('permit.manage'));
create policy "decide" on public.permit_approvals for update to authenticated
  using (approver_id = auth.uid() and public.has_permission('permit.approve'))
  with check (approver_id = auth.uid() and public.has_permission('permit.approve'));
create policy "delete pending" on public.permit_approvals for delete to authenticated
  using (decision = 'pending' and public.has_permission('permit.manage'));

create policy "read"  on public.permit_visits for select to authenticated using (public.can_access_permit(permit_id));
create policy "write" on public.permit_visits for all to authenticated
  using (public.has_permission('permit.checkin')) with check (public.has_permission('permit.checkin'));

create policy "read" on public.leave_requests for select to authenticated
  using (user_id = auth.uid() or swap_with = auth.uid() or public.has_permission('leave.approve'));
create policy "self create" on public.leave_requests for insert to authenticated
  with check (
    public.has_permission('leave.request')
    and user_id = auth.uid()
    and status = 'pending'
    and swap_accepted_at is null
  );
create policy "self cancel" on public.leave_requests for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status in ('pending', 'cancelled'));
create policy "approve" on public.leave_requests for update to authenticated
  using (public.has_permission('leave.approve') and user_id <> auth.uid())   -- tidak approve diri sendiri
  with check (public.has_permission('leave.approve') and user_id <> auth.uid());

-- 12f. Perkembangan
create policy "read"   on public.projects for select to authenticated using (public.has_permission('project.view'));
create policy "create" on public.projects for insert to authenticated
  with check (public.has_permission('project.create') and owner_id = auth.uid());
create policy "update" on public.projects for update to authenticated
  using (public.can_edit_project(id)) with check (public.can_edit_project(id));
create policy "delete" on public.projects for delete to authenticated
  using (public.has_permission('project.manage'));

do $$
declare t text;
begin
  foreach t in array array['project_members', 'project_milestones'] loop
    execute format('create policy "read"  on public.%I for select to authenticated using (public.has_permission(''project.view''))', t);
    execute format('create policy "write" on public.%I for all    to authenticated using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id))', t);
  end loop;
end $$;

create policy "read"   on public.project_tasks for select to authenticated using (public.has_permission('project.view'));
create policy "create" on public.project_tasks for insert to authenticated with check (public.can_edit_project(project_id));
create policy "update" on public.project_tasks for update to authenticated
  using (public.can_edit_project(project_id) or assignee_id = auth.uid())
  with check (public.can_edit_project(project_id) or assignee_id = auth.uid());
create policy "delete" on public.project_tasks for delete to authenticated using (public.can_edit_project(project_id));

create policy "read"   on public.progress_updates for select to authenticated using (public.has_permission('project.view'));
create policy "create" on public.progress_updates for insert to authenticated
  with check (
    public.has_permission('progress.report')
    and reported_by = auth.uid()
    and (public.is_project_member(project_id) or public.can_edit_project(project_id))
  );
create policy "update" on public.progress_updates for update to authenticated
  using (reported_by = auth.uid()) with check (reported_by = auth.uid());
create policy "delete" on public.progress_updates for delete to authenticated
  using (reported_by = auth.uid() or public.has_permission('project.manage'));

-- 12g. Notifikasi & audit
create policy "own read"   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "own update" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read" on public.audit_logs for select to authenticated using (public.has_permission('audit.view'));

-- doc_counters: tanpa policy → hanya diakses lewat next_doc_no() (security definer)

-- =============================================================================
-- 13. VIEWS (security_invoker → tetap mengikuti RLS user)
-- =============================================================================
create view public.v_my_schedule with (security_invoker = true) as
select s.id, s.work_date, s.is_leader, s.note,
       sh.code as shift_code, sh.name as shift_name, sh.start_time, sh.end_time, sh.color, sh.is_working,
       si.code as site_code, si.name as site_name,
       p.id as period_id, p.name as period_name
  from public.shift_schedules s
  join public.shifts sh           on sh.id = s.shift_id
  join public.schedule_periods p  on p.id = s.period_id
  left join public.sites si       on si.id = s.site_id
 where s.user_id = auth.uid();

-- Kalender tim: siapa jaga shift apa per tanggal
create view public.v_schedule_calendar with (security_invoker = true) as
select s.id, s.period_id, s.work_date, s.is_leader,
       sh.code as shift_code, sh.name as shift_name, sh.color, sh.sort_order as shift_order,
       s.user_id, pr.full_name, s.site_id
  from public.shift_schedules s
  join public.shifts sh   on sh.id = s.shift_id
  left join public.profiles pr on pr.id = s.user_id;

create view public.v_open_handover_items with (security_invoker = true) as
select i.*, h.handover_no, h.shift_date, h.site_id
  from public.handover_items i
  join public.handovers h on h.id = i.handover_id
 where i.status in ('open', 'in_progress');

create view public.v_active_permits with (security_invoker = true) as
select p.*, s.code as site_code, s.name as site_name, v.name as vendor_name
  from public.permits p
  join public.sites s on s.id = p.site_id
  left join public.vendors v on v.id = p.vendor_id
 where p.status in ('approved', 'active')
   and now() between p.start_at - interval '1 day' and p.end_at;

create view public.v_project_overview with (security_invoker = true) as
select p.id, p.code, p.name, p.status, p.priority, p.progress_pct, p.target_date,
       pr.full_name as owner_name,
       count(t.id)                                        as total_tasks,
       count(t.id) filter (where t.status = 'done')       as done_tasks,
       count(t.id) filter (where t.status = 'blocked')    as blocked_tasks,
       (p.target_date < current_date and p.status not in ('done', 'cancelled')) as is_overdue
  from public.projects p
  left join public.profiles pr on pr.id = p.owner_id
  left join public.project_tasks t on t.project_id = p.id
 group by p.id, pr.full_name;

-- =============================================================================
-- 14. STORAGE
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "internal read attachments" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.has_permission('portal.access'));
create policy "internal upload attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.has_permission('portal.access'));

-- =============================================================================
-- 15. SEED
-- =============================================================================

-- Roles
insert into public.roles (key, name, description, rank, is_system) values
  ('admin',      'Administrator', 'Akses penuh, kelola user, role & audit',            100, true),
  ('supervisor', 'Supervisor',    'Approver, kelola jadwal & semua modul operasional',  80, true),
  ('lead',       'Team Lead',     'Kelola jadwal tim, approve izin personel, project',   60, true),
  ('staff',      'Staff NOC',     'Petugas shift: handover, incident, ajukan izin',     40, true),
  ('viewer',     'Viewer',        'Hanya melihat (default user baru)',                  20, true),
  ('vendor',     'Vendor',        'Pihak luar: hanya mengajukan & melihat izin sendiri', 10, true);

-- Permissions
insert into public.permissions (key, module, description) values
  ('portal.access',       'core',         'Akses portal internal (direktori, komentar, lampiran, pengumuman)'),
  ('user.manage',         'core',         'Kelola user, aktif/nonaktif, assign role, allowlist email'),
  ('role.manage',         'core',         'Kelola role & permission'),
  ('master.manage',       'core',         'Kelola master data: site, tim, vendor, shift, template checklist'),
  ('announcement.manage', 'core',         'Buat & ubah pengumuman'),
  ('audit.view',          'core',         'Lihat audit log'),
  ('schedule.view',       'jadwal',       'Lihat jadwal yang sudah dipublikasikan'),
  ('schedule.manage',     'jadwal',       'Buat, ubah, publish jadwal (termasuk draft)'),
  ('handover.view',       'handover',     'Lihat handover'),
  ('handover.create',     'handover',     'Buat, ubah, terima handover'),
  ('handover.delete',     'handover',     'Hapus handover'),
  ('permit.view',         'perizinan',    'Lihat semua izin kerja/akses'),
  ('permit.create',       'perizinan',    'Ajukan izin kerja/akses'),
  ('permit.manage',       'perizinan',    'Ubah izin siapa pun, atur alur approval'),
  ('permit.approve',      'perizinan',    'Menyetujui izin kerja/akses'),
  ('permit.checkin',      'perizinan',    'Catat check-in / check-out di lokasi'),
  ('permit.delete',       'perizinan',    'Hapus izin'),
  ('leave.request',       'perizinan',    'Ajukan cuti / izin / tukar shift'),
  ('leave.approve',       'perizinan',    'Setujui cuti / izin / tukar shift'),
  ('project.view',        'perkembangan', 'Lihat project & progress'),
  ('project.create',      'perkembangan', 'Buat project'),
  ('project.manage',      'perkembangan', 'Ubah/hapus project siapa pun'),
  ('progress.report',     'perkembangan', 'Kirim laporan progress'),
  ('incident.view',       'incident',     'Lihat incident'),
  ('incident.manage',     'incident',     'Buat & update incident'),
  ('incident.delete',     'incident',     'Hapus incident');

-- Mapping role → permission
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r cross join public.permissions p
 where r.key = 'admin'
union all
select r.id, p.key
  from public.roles r cross join public.permissions p
 where r.key = 'supervisor'
   and p.key not in ('role.manage', 'user.manage', 'audit.view')
union all
select r.id, x.perm
  from public.roles r
  join (values
    ('lead',   'portal.access'), ('lead', 'announcement.manage'),
    ('lead',   'schedule.view'), ('lead', 'schedule.manage'),
    ('lead',   'handover.view'), ('lead', 'handover.create'),
    ('lead',   'permit.view'),   ('lead', 'permit.create'), ('lead', 'permit.manage'), ('lead', 'permit.checkin'),
    ('lead',   'leave.request'), ('lead', 'leave.approve'),
    ('lead',   'project.view'),  ('lead', 'project.create'), ('lead', 'project.manage'), ('lead', 'progress.report'),
    ('lead',   'incident.view'), ('lead', 'incident.manage'),

    ('staff',  'portal.access'),
    ('staff',  'schedule.view'),
    ('staff',  'handover.view'), ('staff', 'handover.create'),
    ('staff',  'permit.view'),   ('staff', 'permit.create'), ('staff', 'permit.checkin'),
    ('staff',  'leave.request'),
    ('staff',  'project.view'),  ('staff', 'project.create'), ('staff', 'progress.report'),
    ('staff',  'incident.view'), ('staff', 'incident.manage'),

    ('viewer', 'portal.access'),
    ('viewer', 'schedule.view'),
    ('viewer', 'handover.view'),
    ('viewer', 'permit.view'),
    ('viewer', 'project.view'),
    ('viewer', 'incident.view'),

    ('vendor', 'permit.create')
  ) as x(role_key, perm) on x.role_key = r.key;

-- Allowlist sign-up
insert into public.allowed_signup_emails (email, default_role, note) values
  ('dzakwan.corp@gmail.com', 'admin', 'Owner / admin awal');

insert into public.allowed_signup_domains (domain, default_role, note) values
  ('corp.jarvis.biz.id', 'viewer', 'Domain korporat'),
  ('jarvis.biz.id',      'viewer', 'Domain korporat');

-- Shift
insert into public.shifts (code, name, start_time, end_time, is_working, color, sort_order) values
  ('P',   'Pagi',  '07:00', '15:00', true,  '#f59e0b', 1),
  ('S',   'Siang', '15:00', '23:00', true,  '#3b82f6', 2),
  ('M',   'Malam', '23:00', '07:00', true,  '#6366f1', 3),
  ('OFF', 'Libur', null,    null,    false, '#9ca3af', 9);
