-- Ensure authenticated EZRA users can access their own private memory rows.
-- Row-level security policies remain the ownership boundary.
revoke all on public.memories from anon, public;
grant select, insert, update, delete on public.memories to authenticated;
