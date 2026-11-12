export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  'txt', 'md', 'csv', 'json', 'pdf', 'docx', 'pptx', 'xlsx',
] as const;

export type SupportedDocumentExtension = typeof SUPPORTED_DOCUMENT_EXTENSIONS[number];

const HTML_BLOCK_TAGS = /<(?:\/)?(?:address|article|aside|blockquote|br|dd|div|dl|dt|fieldset|figcaption|figure|footer|h[1-6]|header|hr|li|main|ol|p|pre|section|table|tbody|tfoot|thead|tr|ul)\b[^>]*>/gi;

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', quot: '"', nbsp: ' ',
    copy: '©', reg: '®', ndash: '–', mdash: '—', hellip: '…',
    bull: '•', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, code: string) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? entity;
    const numeric = code[1]?.toLowerCase() === 'x'
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(numeric);
    } catch {
      return entity;
    }
  });
}

export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<\s*(?:script|style|noscript)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, ' ')
      .replace(/<!--([\s\S]*?)-->/g, ' ')
      .replace(/<\s*br\b[^>]*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(?:td|th)\s*>/gi, ' | ')
      .replace(HTML_BLOCK_TAGS, '\n')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function getDocumentExtension(fileName: string): string {
  return fileName.split('.').pop()?.trim().toLowerCase() ?? '';
}

export function isSupportedDocumentExtension(value: string): value is SupportedDocumentExtension {
  return (SUPPORTED_DOCUMENT_EXTENSIONS as readonly string[]).includes(value.toLowerCase());
}

export function selectRelevantDocumentText(
  content: string,
  query: string,
  maxCharacters = 12000,
): string {
  if (content.length <= maxCharacters) return content;
  const terms = [...new Set(
    (query.toLowerCase().match(/[a-z0-9\u0600-\u06ff]{2,}/g) ?? [])
      .filter(term => !['the', 'and', 'for', 'with', 'this', 'that', 'from', 'what', 'how', 'من', 'عن', 'على', 'هذا', 'هذه', 'كيف', 'ماذا', 'هل'].includes(term)),
  )].slice(0, 30);

  const blocks = content
    .split(/\n{2,}/)
    .flatMap(block => {
      const clean = block.trim();
      if (!clean) return [];
      if (clean.length <= 1800) return [clean];
      const chunks: string[] = [];
      for (let offset = 0; offset < clean.length; offset += 1600) {
        chunks.push(clean.slice(offset, offset + 1600));
      }
      return chunks;
    });

  if (!terms.length) return content.slice(0, maxCharacters);
  const ranked = blocks.map((block, index) => {
    const normalized = block.toLowerCase();
    const score = terms.reduce((total, term) => total + (normalized.split(term).length - 1), 0);
    return { block, index, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);

  if (!ranked.length) return content.slice(0, maxCharacters);
  const selected: typeof ranked = [];
  let used = 0;
  for (const item of ranked) {
    const addition = item.block.length + (selected.length ? 2 : 0);
    if (used + addition > maxCharacters) continue;
    selected.push(item);
    used += addition;
  }
  return selected.sort((a, b) => a.index - b.index).map(item => item.block).join('\n\n');
}
