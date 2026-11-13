-- EZRA private chat attachment storage
-- Files are private and scoped to the authenticated user's first path segment.

alter table public.chat_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size_bytes bigint;

alter table public.chat_messages
  drop constraint if exists chat_messages_attachment_size_bytes_check;

alter table public.chat_messages
  add constraint chat_messages_attachment_size_bytes_check
  check (
    attachment_size_bytes is null
    or attachment_size_bytes between 0 and 5242880
  );

create index if not exists chat_messages_attachment_path_idx
  on public.chat_messages (attachment_path)
  where attachment_path is not null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ezra-chat-attachments',
  'ezra-chat-attachments',
  false,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "EZRA users can read own chat attachments" on storage.objects;
create policy "EZRA users can read own chat attachments"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'ezra-chat-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "EZRA users can upload own chat attachments" on storage.objects;
create policy "EZRA users can upload own chat attachments"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'ezra-chat-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "EZRA users can delete own chat attachments" on storage.objects;
create policy "EZRA users can delete own chat attachments"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'ezra-chat-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
