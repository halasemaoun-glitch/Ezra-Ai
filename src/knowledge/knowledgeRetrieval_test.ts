import {
  normalizeKnowledgeText,
  retrieveKnowledgeChunks,
  tokenizeKnowledgeText,
} from './knowledgeRetrieval.ts';
import type { KnowledgeDocumentRecord } from './knowledgeSync.ts';

const document = (id: string, name: string, content: string): KnowledgeDocumentRecord => ({
  id, name, content, sizeBytes: content.length,
  addedAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
  deletedAt: null,
});

Deno.test('Arabic normalization matches alef variants, diacritics, and ta marbuta', () => {
  const normalized = normalizeKnowledgeText('إِنْتِفاخ اللثّة وآلام');
  if (normalized !== 'انتفاخ اللثه والام') throw new Error(`Unexpected Arabic normalization: ${normalized}`);
  const tokens = tokenizeKnowledgeText('ما هو التهاب اللثة؟');
  if (!tokens.includes('التهاب') || !tokens.includes('اللثه')) throw new Error('Arabic tokenization lost key terms');
});

Deno.test('retrieval ranks matching titles and relevant content above unrelated documents', () => {
  const docs = [
    document('a', 'دليل التهاب اللثة.pdf', 'تتضمن العلامات نزف اللثة واحمرارها وتراكم اللويحة الجرثومية.'),
    document('b', 'إدارة الملفات.docx', 'خطوات تنظيم المجلدات والنسخ الاحتياطي.'),
  ];
  const result = retrieveKnowledgeChunks(docs, 'ما علاج التهاب اللثه والنزف؟');
  if (result.length === 0 || result[0].document.id !== 'a') throw new Error('Relevant dental source was not ranked first');
});

Deno.test('retrieval selects matching chunks from long books within a strict context budget', () => {
  const filler = 'مقدمة عامة ومعلومات تاريخية لا ترتبط بالسؤال. '.repeat(45);
  const relevant = 'التهاب اللب غير العكوس يسبب ألماً عفوياً وقد يستمر بعد زوال المنبه. ';
  const content = [filler, relevant.repeat(12), filler].join('\n');
  const result = retrieveKnowledgeChunks([document('book', 'كتاب علاج الجذور.pdf', content)], 'التهاب اللب غير العكوس', {
    maxChunkCharacters: 500, maxTotalCharacters: 650,
  });
  if (!result.length || !result.some(item => item.text.includes('غير العكوس'))) throw new Error('Relevant long-book section was not retrieved');
  if (result.reduce((sum, item) => sum + item.text.length + item.document.name.length + 24, 0) > 650) {
    throw new Error('Retrieved context exceeded the configured character budget');
  }
});

Deno.test('deleted documents are never retrieved and empty queries return no chunks', () => {
  const deleted = { ...document('gone', 'Old.pdf', 'enamel anatomy'), deletedAt: '2026-11-03T00:00:00.000Z' };
  if (retrieveKnowledgeChunks([deleted], 'enamel').length !== 0) throw new Error('Deleted source was retrieved');
  if (retrieveKnowledgeChunks([document('x', 'x.txt', 'enamel anatomy')], 'من في هل').length !== 0) {
    throw new Error('Stop-word-only query should not retrieve content');
  }
});
