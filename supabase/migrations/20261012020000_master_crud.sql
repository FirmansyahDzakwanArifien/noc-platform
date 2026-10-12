-- =============================================================================
-- Master data: hapus dipisah ke permission sendiri, anggota tim diatur lewat RPC
-- =============================================================================

insert into public.permissions (key, module, description) values
  ('master.delete', 'core', 'Hapus master data: site, tim, vendor, shift')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_key)
select id, 'master.delete' from public.roles where key = 'admin'
on conflict do nothing;

-- Policy "write" (for all) dipecah: insert/update = master.manage, delete = master.delete
do $$
declare t text;
begin
  foreach t in array array['sites', 'teams', 'shifts', 'vendors'] loop
    execute format('drop policy if exists "write" on public.%I', t);
    execute format('create policy "insert" on public.%I for insert to authenticated with check (public.has_permission(''master.manage''))', t);
    execute format('create policy "update" on public.%I for update to authenticated using (public.has_permission(''master.manage'')) with check (public.has_permission(''master.manage''))', t);
    execute format('create policy "delete" on public.%I for delete to authenticated using (public.has_permission(''master.delete''))', t);
  end loop;
end $$;

-- Pindahkan user ke/dari tim. Boleh untuk master.manage (supervisor) tanpa perlu user.manage.
create or replace function public.set_profile_team(p_user uuid, p_team uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (public.has_permission('master.manage') or public.has_permission('user.manage')) then
    raise exception 'Anda tidak memiliki izin untuk mengatur anggota tim' using errcode = '42501';
  end if;
  update public.profiles set team_id = p_team where id = p_user;
  if not found then
    raise exception 'User tidak ditemukan';
  end if;
end $$;

revoke execute on function public.set_profile_team(uuid, uuid) from public, anon;
grant execute on function public.set_profile_team(uuid, uuid) to authenticated;
