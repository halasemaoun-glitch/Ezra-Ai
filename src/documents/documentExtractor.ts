import {
  getDocumentExtension,
  htmlToPlainText,
  isSupportedDocumentExtension,
} from './documentTextUtils';

export const MAX_DOCUMENT_SOURCE_BYTES = 50 * 1024 * 1024;

const WINDOWS_1252_HIGH_BYTES = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

/**
 * Hermes does not consistently implement the Windows-1252 label. Ream's PDF
 * reader requests it while decoding legacy PDF strings. Keep the native
 * decoder for every other encoding and provide the missing single-byte map.
 */
function installWindows1252TextDecoderCompat(): void {
  const NativeDecoder = globalThis.TextDecoder;
  if ((NativeDecoder as any).__ezraWindows1252Compat) return;

  class CompatibleTextDecoder extends NativeDecoder {
    private readonly windows1252: boolean;

    constructor(label = 'utf-8', options?: TextDecoderOptions) {
      const normalized = label.toLowerCase().replace(/_/g, '-');
      const windows1252 = ['windows-1252', 'cp1252', 'x-cp1252', 'iso-8859-1', 'latin1'].includes(normalized);
      super(windows1252 ? 'utf-8' : label, options);
      this.windows1252 = windows1252;
    }

    decode(input?: AllowSharedBufferSource, options?: TextDecodeOptions): string {
      if (!this.windows1252) return super.decode(input, options);
      if (input == null) return '';
      const bytes = ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input as ArrayBuffer);
      let output = '';
      for (let offset = 0; offset < bytes.length; offset += 1) {
        const value = bytes[offset];
        const codePoint = value >= 0x80 && value <= 0x9f
          ? WINDOWS_1252_HIGH_BYTES[value - 0x80]
          : value;
        output += String.fromCharCode(codePoint);
      }
      return output;
    }
  }

  (CompatibleTextDecoder as any).__ezraWindows1252Compat = true;
  (globalThis as any).TextDecoder = CompatibleTextDecoder;
}
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
    throw new Error('حجم الملف فارغ أو يتجاوز الحد الأقصى البالغ 50 ميغابايت.');
  }

  let content = '';
  if (['txt', 'md', 'csv', 'json'].includes(extension)) {
    content = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '').trim();
  } else {
    try {
      // Load the office/PDF parser only when a document is actually opened.
      // Ream's legacy encoding detector requests windows-1252 TextDecoder,
      // which is not available in the current Hermes runtime at app startup.
      installWindows1252TextDecoderCompat();
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
        throw new Error('تعذّرت قراءة بنية الملف. تأكد أن امتداده يطابق محتواه وأنه غير تالف.');
      }
      if (/textdecoder|encoding|windows-1252|codec/i.test(message)) {
        throw new Error('تعذّر فك ترميز نص المستند على هذا الجهاز. أُضيف دعم الترميز المطلوب؛ إذا تكررت المشكلة نحتاج نسخة الملف لفحصها.');
      }
      const detail = message.trim().slice(0, 140);
      throw new Error(detail
        ? `تعذّر استخراج نص المستند: ${detail}`
        : 'تعذّر استخراج النص. إذا كان PDF عبارة عن صور ممسوحة ضوئياً، فهو يحتاج OCR.');

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
