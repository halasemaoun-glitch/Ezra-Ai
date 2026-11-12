import type { KnowledgeDocumentRecord } from './knowledgeSync.ts';

export type KnowledgeCategory = 'all' | 'pdf' | 'word' | 'slides' | 'sheets' | 'text';
export type KnowledgeSort = 'newest' | 'oldest' | 'name';

export const KNOWLEDGE_CATEGORY_OPTIONS: { id: KnowledgeCategory; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'pdf', label: 'PDF' },
  { id: 'word', label: 'Word' },
  { id: 'slides', label: 'عروض' },
  { id: 'sheets', label: 'جداول' },
  { id: 'text', label: 'نصوص' },
];

export function getKnowledgeCategory(fileName: string): Exclude<KnowledgeCategory, 'all'> {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'pdf') return 'pdf';
  if (extension === 'docx') return 'word';
  if (extension === 'pptx') return 'slides';
  if (extension === 'xlsx' || extension === 'csv') return 'sheets';
  return 'text';
}

export function getKnowledgeCategoryLabel(fileName: string): string {
  const category = getKnowledgeCategory(fileName);
  return KNOWLEDGE_CATEGORY_OPTIONS.find(option => option.id === category)?.label ?? 'نصوص';
}

export function filterAndSortKnowledgeDocuments(
  documents: KnowledgeDocumentRecord[],
  query: string,
  category: KnowledgeCategory = 'all',
  sort: KnowledgeSort = 'newest',
): KnowledgeDocumentRecord[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = documents.filter(document => {
    if (document.deletedAt) return false;
    if (category !== 'all' && getKnowledgeCategory(document.name) !== category) return false;
    if (!normalizedQuery) return true;
    return document.name.toLocaleLowerCase().includes(normalizedQuery) ||
      document.content.toLocaleLowerCase().includes(normalizedQuery);
  });

  return filtered.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'ar', { sensitivity: 'base' });
    const dateDifference = Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
    return sort === 'oldest' ? dateDifference : -dateDifference;
  });
}
