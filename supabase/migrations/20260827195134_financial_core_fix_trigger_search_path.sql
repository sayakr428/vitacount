create or replace function enforce_balanced_entry() returns trigger as $$
declare total_debit numeric; total_credit numeric;
begin
  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into total_debit, total_credit
    from journal_entry_lines where journal_entry_id = new.journal_entry_id;
  if total_debit <> total_credit then
    raise exception 'Journal entry % is unbalanced: debit % != credit %', new.journal_entry_id, total_debit, total_credit;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;
