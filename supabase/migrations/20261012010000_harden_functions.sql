-- =============================================================================
-- Hardening fungsi (dari Supabase security advisor)
-- =============================================================================

-- search_path tetap untuk fungsi trigger biasa
alter function public.tg_set_updated_at()           set search_path = '';
alter function public.tg_check_schedule_in_period() set search_path = '';
alter function public.tg_guard_leave_request()      set search_path = '';

-- tg_set_doc_no memanggil next_doc_no → jadikan security definer agar next_doc_no
-- tidak perlu bisa dipanggil langsung oleh user
alter function public.tg_set_doc_no() security definer set search_path = '';

-- Tidak ada fungsi yang boleh dipanggil tanpa login
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;

-- Fungsi internal (trigger, auth hook, penomoran) tidak boleh dipanggil lewat /rpc
revoke execute on function public.next_doc_no(text)               from authenticated;
revoke execute on function public.is_email_allowed(text)          from authenticated;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated;
revoke execute on function public.handle_new_user()               from authenticated;
revoke execute on function public.tg_enforce_signup_allowlist()   from authenticated;
revoke execute on function public.tg_set_doc_no()                 from authenticated;
revoke execute on function public.tg_schedule_period_publish()    from authenticated;
revoke execute on function public.tg_schedule_period_notify()     from authenticated;
revoke execute on function public.tg_apply_shift_swap()           from authenticated;
revoke execute on function public.tg_permit_approval_decided()    from authenticated;
revoke execute on function public.tg_permit_first_checkin()       from authenticated;
revoke execute on function public.tg_apply_progress_update()      from authenticated;
revoke execute on function public.tg_recalc_project_progress()    from authenticated;
revoke execute on function public.tg_audit()                      from authenticated;

-- Tetap untuk authenticated (dipakai RLS policy / RPC aplikasi):
-- has_permission, has_role, my_max_rank, my_permissions, can_access_permit,
-- can_edit_project, is_project_member, accept_shift_swap
