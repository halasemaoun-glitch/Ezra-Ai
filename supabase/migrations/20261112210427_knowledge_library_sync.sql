-- EZRA private, owner-scoped knowledge library synchronization.
-- The app continues to keep a local cache; this table stores the account copy.

create table public.knowledge_documents (
  id text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 255),
  content text not null check (octet_length(content) between 1 and 262144),
  size_bytes integer not null check (size_bytes between 0 and 262144),
  added_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create index knowledge_documents_owner_updated_idx
  on public.knowledge_documents (owner_id, updated_at desc);

alter table public.knowledge_documents enable row level security;

-- New public tables are not automatically exposed on current Supabase projects.
-- Grant only authenticated CRUD; no anonymous access.
revoke all on public.knowledge_documents from anon, public;
grant select, insert, update, delete on public.knowledge_documents to authenticated;

create policy "EZRA users can read own knowledge documents"
  on public.knowledge_documents for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "EZRA users can add own knowledge documents"
  on public.knowledge_documents for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "EZRA users can update own knowledge documents"
  on public.knowledge_documents for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "EZRA users can delete own knowledge documents"
  on public.knowledge_documents for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
