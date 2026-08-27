-- Functions default to PUBLIC-executable; lock these down to authenticated only
-- (handle_new_user is trigger-only and needs no explicit grant at all).

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.current_tenant_ids() from public, anon;
revoke execute on function public.current_admin_tenant_ids() from public, anon;
revoke execute on function public.current_member_tenant_ids() from public, anon;
revoke execute on function public.create_tenant(text) from public, anon;
revoke execute on function public.accept_invite(uuid) from public, anon;
