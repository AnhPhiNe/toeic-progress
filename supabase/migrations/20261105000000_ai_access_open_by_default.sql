-- Signing in with Google now grants AI right away, within the account's monthly cap.
-- Admins keep control: set status='blocked' to stop an account, or change monthly_limit.
-- Accounts still waiting for approval are opened; blocked accounts and custom caps are kept.
begin;

alter table public.ai_access_grants alter column status set default 'active';

update public.ai_access_grants set status = 'active' where status = 'pending';

comment on table public.ai_access_grants is
  'AI access per account. New accounts start active with the default monthly cap; set blocked in the Supabase Table Editor to stop one.';

commit;
