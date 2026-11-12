-- EZRA account-owned study progress.
create table public.study_progress (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint study_progress_object_check check (jsonb_typeof(progress) = 'object')
);

alter table public.study_progress enable row level security;
revoke all on public.study_progress from anon, public;
grant select, insert, update, delete on public.study_progress to authenticated;

create policy "EZRA users can read own study progress"
  on public.study_progress for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "EZRA users can add own study progress"
  on public.study_progress for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "EZRA users can update own study progress"
  on public.study_progress for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "EZRA users can delete own study progress"
  on public.study_progress for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
