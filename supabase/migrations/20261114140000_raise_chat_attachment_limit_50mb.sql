-- Raise the private chat attachment bucket to the documented 50 MiB cap.
-- The bucket remains private; existing RLS policies are unchanged.
update storage.buckets
set file_size_limit = 52428800
where id = 'ezra-chat-attachments';
