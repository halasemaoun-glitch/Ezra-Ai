import {
  getDocumentExtension,
  htmlToPlainText,
  isSupportedDocumentExtension,
} from './documentTextUtils';

export const MAX_DOCUMENT_SOURCE_BYTES = 50 * 1024 * 1024;
export const MAX_EXTRACTED_DOCUMENT_BYTES = 1024 * 1024;

export type ExtractedDocument = {
  content: string;
  extension: string;
  extractedBytes: number;
};

export async function extractDocumentText(
  fileName: string,
  bytes: Uint8Array,
  maxExtractedBytes = MAX_EXTRACTED_DOCUMENT_BYTES,
): Promise<ExtractedDocument> {
  const extension = getDocumentExtension(fileName);
  if (!isSupportedDocumentExtension(extension)) {
    throw new Error('صيغة الملف غير مدعومة. اختر TXT أو MD أو CSV أو JSON أو PDF أو DOCX أو PPTX أو XLSX.');
  }
  if (!bytes.byteLength || bytes.byteLength > MAX_DOCUMENT_SOURCE_BYTES) {
    throw new Error('حجم الملف فارغ أو يتجاوز الحد الأقصى البالغ 5 ميغابايت.');
  }

  let content = '';
  if (['txt', 'md', 'csv', 'json'].includes(extension)) {
    content = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '').trim();
  } else {
    try {
      // Load the office/PDF parser only when a document is actually opened.
      // Ream's legacy encoding detector requests windows-1252 TextDecoder,
      // which is not available in the current Hermes runtime at app startup.
      const { Ream } = await import('reamkit');
      const parsed = Ream.parse(bytes);
      if (parsed.format !== extension) {
        throw new Error('امتداد الملف لا يطابق محتواه الفعلي.');
      }
      const htmlBytes = await parsed.convert('html');
      content = htmlToPlainText(new TextDecoder('utf-8').decode(htmlBytes));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/password|encrypt/i.test(message)) {
        throw new Error('هذا المستند محمي بكلمة مرور أو مشفّر. أزل الحماية ثم أعد اختياره.');
      }
      if (/format|unsupported|sniff|invalid|corrupt/i.test(message)) {
        throw new Error('تعذّرت قراءة المستند. تأكد أنه ملف PDF أو DOCX أو PPTX أو XLSX سليم.');
      }
      throw new Error('تعذّر استخراج النص من المستند. قد يكون تالفاً أو يحتوي على صفحات ممسوحة ضوئياً بلا نص قابل للاستخراج.');
    }
  }

  if (!content.trim()) {
    throw new Error(extension === 'pdf'
      ? 'لم يُعثر على نص داخل PDF. إذا كان ممسوحاً ضوئياً كصور، فلن يمكن قراءته دون OCR.'
      : 'الملف فارغ أو لا يحتوي على نص قابل للاستخراج.');
  }
  const extractedBytes = new TextEncoder().encode(content).byteLength;
  if (extractedBytes > maxExtractedBytes) {
    throw new Error('النص المستخرج أكبر من الحد المسموح (1 ميغابايت). قسّم المستند إلى ملفات أصغر.');
  }
  return { content, extension, extractedBytes };
}
