-- Same gap Session 2 hit and fixed (auth_foundation_lockdown_function_grants):
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, so every SECURITY DEFINER
-- function from the AR/AP posting-functions migrations was callable by the `anon`
-- role. Each function's own auth.uid()/auth.role() check already rejects an
-- unauthenticated caller functionally, but revoking at the grant level is the
-- established defense-in-depth pattern here — don't rely solely on the function
-- body when the fix is one line.

revoke execute on function public.post_invoice_issued(uuid) from public, anon;
revoke execute on function public.post_payment_received(uuid, uuid, date, numeric, text, text, text, jsonb) from public, anon;
revoke execute on function public.create_bill_received(uuid, uuid, text, date, date, jsonb) from public, anon;
revoke execute on function public.post_vendor_payment_made(uuid, uuid, date, numeric, text, date, jsonb) from public, anon;
revoke execute on function public.execute_scheduled_vendor_payment(uuid, jsonb) from public, anon;
