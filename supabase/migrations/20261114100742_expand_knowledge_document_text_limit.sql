-- Keep the local schema in sync with the hosted EZRA AI database.
-- Allow larger extracted documents while retaining the existing soft-delete invariant.

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_content_size_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_content_size_check
  check (
    (deleted_at is null and octet_length(content) between 1 and 8388608)
    or (deleted_at is not null and octet_length(content) = 0)
  );

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_size_bytes_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_size_bytes_check
  check (size_bytes between 0 and 8388608);
