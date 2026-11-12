import {
  knowledgeDocumentsFromCloud,
  knowledgeDocumentsToCloud,
  mergeKnowledgeDocuments,
  normalizeKnowledgeDocuments,
} from './knowledgeSync.ts';

Deno.test('normalizes legacy local documents without updatedAt', () => {
  const docs = normalizeKnowledgeDocuments([{
    id: 'legacy-1',
    name: 'notes.txt',
    content: 'hello',
    sizeBytes: 5,
    addedAt: '2026-11-01T00:00:00.000Z',
  }]);
  if (docs.length !== 1 || docs[0].updatedAt !== docs[0].addedAt) {
    throw new Error('Legacy document timestamps were not normalized');
  }
});

Deno.test('cloud rows map to the local knowledge document shape', () => {
  const docs = knowledgeDocumentsFromCloud([{
    id: 'cloud-1',
    name: 'guide.md',
    content: 'content',
    size_bytes: 7,
    added_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-02T00:00:00.000Z',
  }]);
  if (docs[0]?.id !== 'cloud-1' || docs[0]?.sizeBytes !== 7) {
    throw new Error('Cloud row mapping failed');
  }
});

Deno.test('merge keeps the newest copy and caps the library at eight documents', () => {
  const local = normalizeKnowledgeDocuments(Array.from({ length: 8 }, (_, index) => ({
    id: `doc-${index}`,
    name: `local-${index}.txt`,
    content: 'local',
    sizeBytes: 5,
    addedAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  })));
  const cloud = normalizeKnowledgeDocuments([{
    id: 'doc-0',
    name: 'cloud-newer.txt',
    content: 'cloud',
    sizeBytes: 5,
    addedAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-03T00:00:00.000Z',
  }, {
    id: 'doc-extra',
    name: 'extra.txt',
    content: 'extra',
    sizeBytes: 5,
    addedAt: '2026-11-04T00:00:00.000Z',
  }]);
  const merged = mergeKnowledgeDocuments(local, cloud);
  if (merged.length !== 8 || merged.find(item => item.id === 'doc-0')?.content !== 'cloud') {
    throw new Error('Knowledge merge did not preserve the latest version and eight-item limit');
  }
});

Deno.test('cloud payload always carries the authenticated owner id', () => {
  const docs = normalizeKnowledgeDocuments([{
    id: 'doc-1',
    name: 'a.txt',
    content: 'a',
    sizeBytes: 1,
    addedAt: '2026-11-01T00:00:00.000Z',
  }]);
  const rows = knowledgeDocumentsToCloud(docs, 'owner-123');
  if (rows[0]?.owner_id !== 'owner-123' || rows[0]?.updated_at !== docs[0]?.addedAt) {
    throw new Error('Cloud payload owner or timestamp mapping failed');
  }
});
