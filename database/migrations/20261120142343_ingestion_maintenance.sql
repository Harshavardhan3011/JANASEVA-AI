-- Preserve the existing scheduled cleanup without exposing account tables to the worker.
create or replace function janaseva_private.cleanup_abandoned_registrations(retention_days integer) returns integer
language plpgsql security definer set search_path=pg_catalog,public as $$
declare removed integer;
begin
 if retention_days is null or retention_days<1 or retention_days>365 then raise exception 'Invalid registration retention period';end if;
 delete from public.users u where registration_pending and email_verified_at is null and role='regular'
  and created_at<now()-interval '1 day'*retention_days
  and not exists(select 1 from public.citizen_scheme_watches where user_id=u.id)
  and not exists(select 1 from public.applications where user_id=u.id)
  and not exists(select 1 from public.uploaded_documents where user_id=u.id)
  and not exists(select 1 from public.citizen_form_drafts where user_id=u.id);
 get diagnostics removed=row_count;
 delete from public.auth_email_limits where window_start<now()-interval '2 days';
 return removed;
end $$;
revoke all on function janaseva_private.cleanup_abandoned_registrations(integer) from public;
grant usage on schema janaseva_private to janaseva_ingestor;
grant execute on function janaseva_private.cleanup_abandoned_registrations(integer) to janaseva_ingestor;
