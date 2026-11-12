-- Extend EZRA's private knowledge library and chat attachment bucket for PDF and Office Open XML.
-- Raw chat files remain private, owner-scoped, and limited to 5 MiB.
-- The knowledge table stores extracted UTF-8 text, not the original binary document.

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_content_size_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_content_size_check
  check (
    (deleted_at is null and octet_length(content) between 1 and 1048576)
    or (deleted_at is not null and octet_length(content) = 0)
  );

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_size_bytes_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_size_bytes_check
  check (size_bytes between 0 and 1048576);

update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
where id = 'ezra-chat-attachments';
