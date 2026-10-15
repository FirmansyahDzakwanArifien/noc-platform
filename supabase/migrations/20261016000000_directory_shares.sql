-- =============================================================================
-- Direktori tim: link publik (tanpa login) berisi daftar anggota aktif.
-- Default hanya nama, tim, dan role; email/telepon hanya tampil bila dicentang.
-- =============================================================================
create table public.directory_shares (
  id             uuid primary key default gen_random_uuid(),
  token          uuid not null unique default gen_random_uuid(),
  title          text not null,
  team_id        uuid references public.teams(id) on delete set null,
  show_email     boolean not null default false,
  show_phone     boolean not null default false,
  expires_at     timestamptz,
  revoked_at     timestamptz,
  view_count     integer not null default 0,
  last_viewed_at timestamptz,
  created_by     uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.directory_shares (created_at desc);

create trigger set_updated_at before update on public.directory_shares
  for each row execute function public.tg_set_updated_at();

alter table public.directory_shares enable row level security;

create policy "read" on public.directory_shares for select to authenticated
  using (public.has_permission('user.manage'));
create policy "insert" on public.directory_shares for insert to authenticated
  with check (public.has_permission('user.manage') and created_by = auth.uid());
create policy "update" on public.directory_shares for update to authenticated
  using (public.has_permission('user.manage')) with check (public.has_permission('user.manage'));
create policy "delete" on public.directory_shares for delete to authenticated
  using (public.has_permission('user.manage'));

-- Dipanggil halaman publik /d/<token> (anon). Null jika token tidak valid / dicabut / kedaluwarsa.
create or replace function public.get_shared_directory(p_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_share public.directory_shares%rowtype;
  v_team  text;
  v_members jsonb;
begin
  select * into v_share from public.directory_shares
   where token = p_token and revoked_at is null and (expires_at is null or expires_at > now());
  if not found then
    return null;
  end if;

  update public.directory_shares set view_count = view_count + 1, last_viewed_at = now() where id = v_share.id;
  select name into v_team from public.teams where id = v_share.team_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', md5(p.id::text || v_share.token::text),
           'full_name', p.full_name,
           'team', t.name,
           'roles', (select coalesce(jsonb_agg(r.name order by r.rank desc), '[]'::jsonb)
                       from public.user_roles ur join public.roles r on r.id = ur.role_id
                      where ur.user_id = p.id and r.key <> 'viewer'),
           'top_rank', (select max(r.rank) from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p.id),
           'email', case when v_share.show_email then p.email end,
           'phone', case when v_share.show_phone then p.phone end
         ) order by t.name nulls last, p.full_name), '[]'::jsonb)
    into v_members
    from public.profiles p
    left join public.teams t on t.id = p.team_id
   where p.is_active and p.vendor_id is null
     and (v_share.team_id is null or p.team_id = v_share.team_id);

  return jsonb_build_object(
    'title', v_share.title,
    'team_name', v_team,
    'expires_at', v_share.expires_at,
    'members', v_members
  );
end $$;

revoke execute on function public.get_shared_directory(uuid) from public;
grant execute on function public.get_shared_directory(uuid) to anon, authenticated;
