import {
  filterAndSortKnowledgeDocuments,
  getKnowledgeCategory,
  getKnowledgeCategoryLabel,
} from './knowledgeLibraryTools.ts';
import type { KnowledgeDocumentRecord } from './knowledgeSync.ts';

const documents: KnowledgeDocumentRecord[] = [
  { id: '1', name: 'Dental-guide.pdf', content: 'Enamel and dentin anatomy', sizeBytes: 100, addedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z', deletedAt: null },
  { id: '2', name: 'Lecture.docx', content: 'Oral pathology notes', sizeBytes: 200, addedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', deletedAt: null },
  { id: '3', name: 'Slides.pptx', content: 'Dental materials', sizeBytes: 300, addedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-04T00:00:00Z', deletedAt: null },
  { id: '4', name: 'Budget.xlsx', content: 'Monthly expenses', sizeBytes: 400, addedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null },
  { id: '5', name: 'Notes.txt', content: 'Private archived enamel notes', sizeBytes: 50, addedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-05T00:00:00Z', deletedAt: '2026-01-06T00:00:00Z' },
];

Deno.test('classifies supported files into useful library groups', () => {
  const expected = [['x.pdf', 'pdf'], ['x.docx', 'word'], ['x.pptx', 'slides'], ['x.xlsx', 'sheets'], ['x.csv', 'sheets'], ['x.md', 'text']] as const;
  for (const [name, category] of expected) {
    if (getKnowledgeCategory(name) !== category) throw new Error(`Wrong category for ${name}`);
  }
  if (getKnowledgeCategoryLabel('x.docx') !== 'Word') throw new Error('Category label is incorrect');
});

Deno.test('search matches both file names and extracted document contents', () => {
  const byName = filterAndSortKnowledgeDocuments(documents, 'dental-guide');
  const byContent = filterAndSortKnowledgeDocuments(documents, 'pathology');
  if (byName.length !== 1 || byName[0].id !== '1' || byContent.length !== 1 || byContent[0].id !== '2') {
    throw new Error('Knowledge library search did not match both names and content');
  }
});

Deno.test('category filter excludes other formats and deleted records', () => {
  const pdfs = filterAndSortKnowledgeDocuments(documents, '', 'pdf');
  if (pdfs.length !== 1 || pdfs[0].id !== '1') throw new Error('PDF filter returned unexpected documents');
});

Deno.test('sort supports newest, oldest, and alphabetical order', () => {
  const newest = filterAndSortKnowledgeDocuments(documents, '', 'all', 'newest');
  const oldest = filterAndSortKnowledgeDocuments(documents, '', 'all', 'oldest');
  const alphabetical = filterAndSortKnowledgeDocuments(documents, '', 'all', 'name');
  if (newest[0].id !== '3' || oldest[0].id !== '4' || alphabetical[0].name !== 'Budget.xlsx') {
    throw new Error('Knowledge library sorting is incorrect');
  }
});
