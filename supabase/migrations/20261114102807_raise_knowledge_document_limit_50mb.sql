-- Raise the knowledge-library text limit from 8 MiB to 50 MiB.
-- Keep soft-deleted rows empty, matching the existing table invariant.

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_content_size_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_content_size_check
  check (
    (deleted_at is null and octet_length(content) between 1 and 52428800)
    or (deleted_at is not null and octet_length(content) = 0)
  );

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_size_bytes_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_size_bytes_check
  check (size_bytes between 0 and 52428800);
