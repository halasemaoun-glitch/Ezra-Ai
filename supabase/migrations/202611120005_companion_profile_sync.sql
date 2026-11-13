-- EZRA companion profile synchronization.
-- One row per authenticated owner; RLS prevents cross-account access.

create table if not exists public.companion_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint companion_profiles_profile_is_object check (jsonb_typeof(profile) = 'object')
);

alter table public.companion_profiles enable row level security;

revoke all on public.companion_profiles from anon, public;
grant select, insert, update, delete on public.companion_profiles to authenticated;

drop policy if exists "Owners can read their companion profile" on public.companion_profiles;
create policy "Owners can read their companion profile"
  on public.companion_profiles for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can insert their companion profile" on public.companion_profiles;
create policy "Owners can insert their companion profile"
  on public.companion_profiles for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update their companion profile" on public.companion_profiles;
create policy "Owners can update their companion profile"
  on public.companion_profiles for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete their companion profile" on public.companion_profiles;
create policy "Owners can delete their companion profile"
  on public.companion_profiles for delete to authenticated
  using ((select auth.uid()) = owner_id);
