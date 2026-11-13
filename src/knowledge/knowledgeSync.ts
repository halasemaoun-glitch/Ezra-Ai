export type KnowledgeDocumentRecord = {
  id: string;
  name: string;
  content: string;
  sizeBytes: number;
  addedAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type KnowledgeCloudRow = {
  id: string;
  owner_id: string;
  name: string;
  content: string;
  size_bytes: number;
  added_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function normalizeKnowledgeDocuments(value: unknown): KnowledgeDocumentRecord[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((item): item is Record<string, unknown> =>
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.content === 'string' &&
      typeof item.sizeBytes === 'number' &&
      typeof item.addedAt === 'string'
    )
    .map(item => ({
      id: item.id as string,
      name: item.name as string,
      content: item.content as string,
      sizeBytes: item.sizeBytes as number,
      addedAt: item.addedAt as string,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : item.addedAt as string,
      deletedAt: typeof item.deletedAt === 'string' ? item.deletedAt : null,
    }))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const active = normalized.filter(item => item.deletedAt === null).slice(0, 100);
  const tombstones = normalized.filter(item => item.deletedAt !== null);
  return [...active, ...tombstones].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function knowledgeDocumentsFromCloud(rows: unknown): KnowledgeDocumentRecord[] {
  if (!Array.isArray(rows)) return [];
  return normalizeKnowledgeDocuments(rows.map(row => {
    if (!isRecord(row)) return null;
    return {
      id: row.id,
      name: row.name,
      content: row.content,
      sizeBytes: row.size_bytes,
      addedAt: row.added_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }));
}

export function mergeKnowledgeDocuments(
  localDocuments: KnowledgeDocumentRecord[],
  cloudDocuments: KnowledgeDocumentRecord[],
): KnowledgeDocumentRecord[] {
  const merged = new Map<string, KnowledgeDocumentRecord>();
  for (const document of [...localDocuments, ...cloudDocuments]) {
    const existing = merged.get(document.id);
    if (!existing || Date.parse(document.updatedAt) >= Date.parse(existing.updatedAt)) {
      merged.set(document.id, document);
    }
  }
  const sorted = [...merged.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const active = sorted.filter(item => item.deletedAt === null).slice(0, 100);
  const tombstones = sorted.filter(item => item.deletedAt !== null);
  return [...active, ...tombstones].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function knowledgeDocumentsToCloud(
  documents: KnowledgeDocumentRecord[],
  ownerId: string,
): KnowledgeCloudRow[] {
  return documents.map(document => ({
    id: document.id,
    owner_id: ownerId,
    name: document.name,
    content: document.content,
    size_bytes: document.sizeBytes,
    added_at: document.addedAt,
    updated_at: document.updatedAt || document.addedAt,
    deleted_at: document.deletedAt,
  }));
}
