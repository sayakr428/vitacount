-- Lets an owner/admin resolve an existing auth user by email, so the invite
-- flow can add an already-registered person to a second tenant without
-- Supabase's inviteUserByEmail erroring on a duplicate account.
create or replace function public.lookup_user_id_by_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found_id uuid;
begin
  if not exists (
    select 1 from memberships
    where user_id = auth.uid() and status = 'active' and role in ('owner','admin')
  ) then
    raise exception 'not authorized';
  end if;

  select id into found_id from auth.users where email = p_email;
  return found_id;
end;
$$;

revoke execute on function public.lookup_user_id_by_email(text) from public, anon;
grant execute on function public.lookup_user_id_by_email(text) to authenticated;
