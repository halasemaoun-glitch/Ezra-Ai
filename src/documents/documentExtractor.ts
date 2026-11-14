import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
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
/**
 * Hermes may reject legacy encodings requested by Ream's PDF parser.
 * Supply Windows-1252 and UTF-16LE/BE decoders while delegating all other
 * labels to the platform implementation.
 */
function installDocumentTextDecoderCompat(): void {
  const NativeDecoder = globalThis.TextDecoder;
  if ((NativeDecoder as any).__ezraDocumentCompat) return;

  class CompatibleTextDecoder extends NativeDecoder {
    private readonly mode: 'native' | 'windows1252' | 'utf16le' | 'utf16be';
    private pendingByte: number | null = null;
    private firstDecode = true;

    constructor(label = 'utf-8', options?: TextDecoderOptions) {
      const normalized = label.toLowerCase().replace(/_/g, '-').replace(/\s+/g, '');
      const mode = ['windows-1252', 'cp1252', 'x-cp1252', 'iso-8859-1', 'latin1'].includes(normalized)
        ? 'windows1252'
        : ['utf-16le', 'utf-16'].includes(normalized)
          ? 'utf16le'
          : ['utf-16be'].includes(normalized)
            ? 'utf16be'
            : 'native';
      super(mode === 'native' ? label : 'utf-8', options);
      this.mode = mode;
    }

    decode(input?: AllowSharedBufferSource, options?: TextDecodeOptions): string {
      if (this.mode === 'native') return super.decode(input, options);
      if (input == null) {
        if (this.mode === 'windows1252') return '';
        const hadPending = this.pendingByte !== null;
        this.pendingByte = null;
        return hadPending ? '\\uFFFD' : '';
      }
      const bytes = ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input as ArrayBuffer);
      if (this.mode === 'windows1252') {
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

      const littleEndian = this.mode === 'utf16le';
      const startWithPending = this.pendingByte !== null;
      const units: number[] = [];
      let offset = 0;
      if (startWithPending && bytes.length) {
        units.push(littleEndian
          ? this.pendingByte! | (bytes[0] << 8)
          : (this.pendingByte! << 8) | bytes[0]);
        this.pendingByte = null;
        offset = 1;
      }
      for (; offset + 1 < bytes.length; offset += 2) {
        units.push(littleEndian
          ? bytes[offset] | (bytes[offset + 1] << 8)
          : (bytes[offset] << 8) | bytes[offset + 1]);
      }
      if (offset < bytes.length) {
        if (options?.stream) this.pendingByte = bytes[offset];
        else units.push(0xfffd);
      }
      let output = '';
      for (let i = 0; i < units.length; i += 8192) {
        output += String.fromCharCode(...units.slice(i, i + 8192));
      }
      if (this.firstDecode && output.charCodeAt(0) === 0xfeff) output = output.slice(1);
      this.firstDecode = false;
      return output;
    }
  }

  (CompatibleTextDecoder as any).__ezraDocumentCompat = true;
  (globalThis as any).TextDecoder = CompatibleTextDecoder;
}
export const MAX_EXTRACTED_DOCUMENT_BYTES = 50 * 1024 * 1024;

type EzraDocumentOcrNative = {
  extractPdfText: (uri: string, maxPages: number, maxOutputChars: number) => Promise<{
    text: string;
    pagesProcessed: number;
    totalPages: number;
    truncated: boolean;
  }>;
};

const EzraDocumentOcr = Platform.OS === 'android'
  ? requireNativeModule<EzraDocumentOcrNative>('EzraDocumentOcr')
  : null;

async function extractScannedPdfText(uri?: string): Promise<string> {
  if (Platform.OS !== 'android' || !EzraDocumentOcr || !uri) {
    throw new Error('هذا PDF لا يحتوي على نص رقمي. قراءة الصفحات المصوّرة تحتاج OCR على Android.');
  }
  const result = await EzraDocumentOcr.extractPdfText(uri, 250, 16_000_000);
  const text = result.text.trim();
  if (!text) throw new Error('لم يتمكن OCR من العثور على نص واضح في صفحات PDF.');
  const pageNotice = result.truncated
    ? `\n\n[ملاحظة: تمت معالجة ${result.pagesProcessed} من أصل ${result.totalPages} صفحة بسبب حدود المعالجة.]`
    : '';
  return `${text}${pageNotice}`;
}

export type ExtractedDocument = {
  content: string;
  extension: string;
  extractedBytes: number;
};

export async function extractDocumentText(
  fileName: string,
  bytes: Uint8Array,
  maxExtractedBytes = MAX_EXTRACTED_DOCUMENT_BYTES,
  sourceUri?: string,
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
      installDocumentTextDecoderCompat();
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
      if (extension === 'pdf') {
        // Ream extracts embedded text from digital PDFs. If parsing fails or the
        // PDF is image-only, use the Android on-device Arabic/English OCR engine.
        content = await extractScannedPdfText(sourceUri);
      } else if (/format|unsupported|sniff|invalid|corrupt/i.test(message)) {
        throw new Error('تعذّرت قراءة بنية الملف. تأكد أن امتداده يطابق محتواه وأنه غير تالف.');
      } else if (/textdecoder|encoding|windows-1252|codec/i.test(message)) {
        throw new Error('تعذّر فك ترميز نص المستند على هذا الجهاز. أُضيف دعم الترميز المطلوب؛ إذا تكررت المشكلة نحتاج نسخة الملف لفحصها.');
      } else {
        const detail = message.trim().slice(0, 140);
        throw new Error(detail
          ? `تعذّر استخراج نص المستند: ${detail}`
          : 'تعذّر استخراج النص.');
      }
    }
  }

  if (!content.trim() && extension === 'pdf') {
    content = await extractScannedPdfText(sourceUri);
  }
  if (!content.trim()) {
    throw new Error('الملف فارغ أو لا يحتوي على نص قابل للاستخراج.');
  }
  const extractedBytes = new TextEncoder().encode(content).byteLength;
  if (extractedBytes > maxExtractedBytes) {
    throw new Error('النص المستخرج أكبر من الحد المسموح (50 ميغابايت). قسّم المستند إلى ملفات أصغر.');
  }
  return { content, extension, extractedBytes };
}
