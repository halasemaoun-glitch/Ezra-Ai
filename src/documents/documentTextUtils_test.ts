import {
  getDocumentExtension,
  htmlToPlainText,
  isSupportedDocumentExtension,
  selectRelevantDocumentText,
} from './documentTextUtils.ts';

Deno.test('HTML extraction preserves text, paragraphs, and table cell boundaries', () => {
  const text = htmlToPlainText('<h1>Dental guide</h1><p>Tooth &amp; gum health</p><table><tr><td>Enamel</td><td>Hard tissue</td></tr></table>');
  if (!text.includes('Dental guide') || !text.includes('Tooth & gum health') || !text.includes('Enamel | Hard tissue')) {
    throw new Error(`HTML text extraction lost document content: ${text}`);
  }
});

Deno.test('HTML extraction removes styles and scripts and decodes numeric entities', () => {
  const text = htmlToPlainText('<style>.secret{display:none}</style><script>alert(1)</script><p>Arabic &#x627;&#x644;&#x633;&#x646;</p>');
  if (text.includes('secret') || text.includes('alert') || !text.includes('السن')) {
    throw new Error('HTML sanitization or entity decoding failed');
  }
});

Deno.test('recognizes the four requested document formats and existing text formats', () => {
  for (const extension of ['pdf', 'docx', 'pptx', 'xlsx', 'txt', 'md', 'csv', 'json']) {
    if (!isSupportedDocumentExtension(extension)) throw new Error(`Missing support for .${extension}`);
  }
  if (isSupportedDocumentExtension('doc') || getDocumentExtension('Dental.PDF') !== 'pdf') {
    throw new Error('Document extension validation is incorrect');
  }
});

Deno.test('document context selects matching sections and respects the context budget', () => {
  const content = [
    'Section one: anatomy and general introduction.',
    'Section two: enamel is the hard outer covering of the tooth. Dentin lies beneath enamel.',
    'Section three: unrelated notes about office administration.',
  ].join('\n\n');
  const selected = selectRelevantDocumentText(content, 'enamel dentin', 110);
  if (!selected.includes('enamel') || selected.length > 110) {
    throw new Error('Relevant document excerpt selection failed');
  }
});

Deno.test('document context falls back to the beginning when no terms match', () => {
  const content = 'A'.repeat(200);
  if (selectRelevantDocumentText(content, 'unmatched', 40) !== 'A'.repeat(40)) {
    throw new Error('Document context fallback exceeded or missed its character budget');
  }
});
