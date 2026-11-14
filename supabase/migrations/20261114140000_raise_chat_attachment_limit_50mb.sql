-- Align chat metadata and the private attachment bucket with the app's 50 MiB file limit.
alter table public.chat_messages
  drop constraint if exists chat_messages_attachment_size_bytes_check;

alter table public.chat_messages
  add constraint chat_messages_attachment_size_bytes_check
  check (
    attachment_size_bytes is null
    or (attachment_size_bytes >= 0 and attachment_size_bytes <= 52428800)
  );

update storage.buckets
set file_size_limit = 52428800
where id = 'ezra-chat-attachments';
