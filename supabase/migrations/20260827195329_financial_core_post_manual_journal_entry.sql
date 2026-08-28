-- Runs as the caller (not security definer), so the existing RLS policies on
-- journal_entries/journal_entry_lines are the real authorization check — this
-- function's only job is making the header + lines insert one transaction,
-- so the deferred balanced-entry trigger rolls back the whole entry, not
-- just the lines, if it fails.
create or replace function public.post_manual_journal_entry(
  p_tenant_id uuid,
  p_entry_date date,
  p_memo text,
  p_lines jsonb
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_entry_id uuid;
  line jsonb;
begin
  insert into journal_entries (tenant_id, entry_date, memo, source_type, status, posted_at, created_by)
  values (p_tenant_id, p_entry_date, p_memo, 'manual', 'posted', now(), auth.uid())
  returning id into new_entry_id;

  for line in select * from jsonb_array_elements(p_lines)
  loop
    insert into journal_entry_lines (journal_entry_id, account_id, debit, credit, memo)
    values (
      new_entry_id,
      (line->>'accountId')::uuid,
      coalesce((line->>'debit')::numeric, 0),
      coalesce((line->>'credit')::numeric, 0),
      line->>'memo'
    );
  end loop;

  return new_entry_id;
end;
$$;

grant execute on function public.post_manual_journal_entry(uuid, date, text, jsonb) to authenticated;
revoke execute on function public.post_manual_journal_entry(uuid, date, text, jsonb) from public, anon;
