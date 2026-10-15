-- =============================================================================
-- Status akun (undangan & login terakhir) untuk halaman kelola user.
-- Hanya untuk pemegang user.manage; data diambil dari auth.users.
-- =============================================================================
create or replace function public.user_auth_status()
returns table (user_id uuid, invited_at timestamptz, confirmed_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.invited_at, coalesce(u.email_confirmed_at, u.confirmed_at), u.last_sign_in_at
    from auth.users u
   where public.has_permission('user.manage');
$$;

revoke all on function public.user_auth_status() from public, anon;
grant execute on function public.user_auth_status() to authenticated;
