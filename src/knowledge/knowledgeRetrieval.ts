import type { KnowledgeDocumentRecord } from './knowledgeSync.ts';

export type KnowledgeRetrievalOptions = {
  maxDocuments?: number;
  maxChunksPerDocument?: number;
  maxChunkCharacters?: number;
  maxTotalCharacters?: number;
};

export type KnowledgeRetrievalChunk = {
  document: KnowledgeDocumentRecord;
  text: string;
  score: number;
};

const STOP_WORDS = new Set([
  'the','and','for','with','this','that','from','what','when','where','which','how','are','was','were','have','has',
  'كيف','ماذا','هذا','هذه','على','الى','إلى','من','عن','هل','ما','لماذا','متى','اين','أين','انا','أنا','انت','أنت',
  'هو','هي','في','ثم','او','أو','مع','قد','كل','كان','كانت','يكون','تكون','بين','بعد','قبل','ضمن',
]);

export function normalizeKnowledgeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/ة/g, 'ه');
}

export function tokenizeKnowledgeText(value: string): string[] {
  return (normalizeKnowledgeText(value).match(/[\p{L}\p{N}]{2,}/gu) ?? [])
    .filter(token => !STOP_WORDS.has(token));
}

function splitIntoChunks(content: string, maxCharacters: number): string[] {
  const paragraphs = content.split(/\n+/).map(part => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  const overlap = Math.min(180, Math.floor(maxCharacters / 5));
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxCharacters) {
      chunks.push(paragraph);
      continue;
    }
    let offset = 0;
    while (offset < paragraph.length) {
      const end = Math.min(paragraph.length, offset + maxCharacters);
      const chunk = paragraph.slice(offset, end).trim();
      if (chunk) chunks.push(chunk);
      if (end >= paragraph.length) break;
      offset = Math.max(offset + 1, end - overlap);
    }
  }
  return chunks;
}

function scoreChunk(chunk: string, title: string, queryTerms: string[], phrase: string): number {
  if (!queryTerms.length) return 0;
  const tokens = tokenizeKnowledgeText(chunk);
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const titleTerms = new Set(tokenizeKnowledgeText(title));
  let score = 0;
  for (const term of queryTerms) {
    const count = counts.get(term) ?? 0;
    if (count) score += (1 + Math.log(count)) * (titleTerms.has(term) ? 2.5 : 1);
  }
  const normalizedChunk = normalizeKnowledgeText(chunk);
  if (phrase.length > 3 && normalizedChunk.includes(phrase)) score += 2;
  return score / Math.sqrt(Math.max(tokens.length, 1));
}

export function retrieveKnowledgeChunks(
  documents: KnowledgeDocumentRecord[],
  query: string,
  options: KnowledgeRetrievalOptions = {},
): KnowledgeRetrievalChunk[] {
  const maxDocuments = Math.max(1, options.maxDocuments ?? 5);
  const maxChunksPerDocument = Math.max(1, options.maxChunksPerDocument ?? 2);
  const maxChunkCharacters = Math.max(300, options.maxChunkCharacters ?? 1400);
  const maxTotalCharacters = Math.max(500, options.maxTotalCharacters ?? 12000);
  const queryTerms = [...new Set(tokenizeKnowledgeText(query))].slice(0, 40);
  if (!queryTerms.length) return [];

  const phrase = normalizeKnowledgeText(query).trim();
  const ranked: KnowledgeRetrievalChunk[] = [];
  for (const document of documents) {
    if (document.deletedAt || !document.content.trim()) continue;
    const chunks = splitIntoChunks(document.content, maxChunkCharacters);
    const scored = chunks.map(text => ({
      document,
      text,
      score: scoreChunk(text, document.name, queryTerms, phrase),
    })).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
    ranked.push(...scored.slice(0, maxChunksPerDocument));
  }

  ranked.sort((a, b) => b.score - a.score || Date.parse(b.document.updatedAt) - Date.parse(a.document.updatedAt));
  const selected: KnowledgeRetrievalChunk[] = [];
  const selectedDocumentIds = new Set<string>();
  let usedCharacters = 0;
  for (const item of ranked) {
    if (!selectedDocumentIds.has(item.document.id) && selectedDocumentIds.size >= maxDocuments) continue;
    const addition = item.text.length + item.document.name.length + 24;
    if (usedCharacters + addition > maxTotalCharacters) continue;
    selected.push(item);
    selectedDocumentIds.add(item.document.id);
    usedCharacters += addition;
  }
  return selected;
}
