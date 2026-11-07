-- EZRA private data foundation
-- Every row belongs to the authenticated owner. Never expose service-role keys in the app.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  attachment_name text,
  attachment_type text,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_owner_conversation_created_idx
  on public.chat_messages (owner_id, conversation_id, created_at);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  category text not null default 'general',
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memories_owner_status_idx
  on public.memories (owner_id, approval_status, created_at desc);

alter table public.chat_messages enable row level security;
alter table public.memories enable row level security;

drop policy if exists "Owner can read own chat messages" on public.chat_messages;
create policy "Owner can read own chat messages"
  on public.chat_messages for select
  using (auth.uid() = owner_id);

drop policy if exists "Owner can add own chat messages" on public.chat_messages;
create policy "Owner can add own chat messages"
  on public.chat_messages for insert
  with check (auth.uid() = owner_id);

drop policy if exists "Owner can update own chat messages" on public.chat_messages;
create policy "Owner can update own chat messages"
  on public.chat_messages for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Owner can delete own chat messages" on public.chat_messages;
create policy "Owner can delete own chat messages"
  on public.chat_messages for delete
  using (auth.uid() = owner_id);

drop policy if exists "Owner can read own memories" on public.memories;
create policy "Owner can read own memories"
  on public.memories for select
  using (auth.uid() = owner_id);

drop policy if exists "Owner can propose own memories" on public.memories;
create policy "Owner can propose own memories"
  on public.memories for insert
  with check (auth.uid() = owner_id and approval_status = 'pending');

drop policy if exists "Owner can approve or edit own memories" on public.memories;
create policy "Owner can approve or edit own memories"
  on public.memories for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Owner can delete own memories" on public.memories;
create policy "Owner can delete own memories"
  on public.memories for delete
  using (auth.uid() = owner_id);
