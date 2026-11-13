export type ParsedSmsCommand = {
  contactName: string;
  message: string;
};

const COMPLETE_SMS_COMMAND = /^(?:ارسل|أرسل|ابعث|ابعت|اكتب|send)\s+(?:لي\s+)?(?:رسالة|مسج|sms|message)\s+(?:الى|إلى|ل)\s*(.+?)\s+(?:تقول|قولي\s+لها|قل\s+له|محتواها|نصها|saying|that says)\s+(.+)$/iu;
const INCOMPLETE_SMS_COMMAND = /^(?:ارسل|أرسل|ابعث|ابعت|اكتب|send)\s+(?:لي\s+)?(?:رسالة|مسج|sms|message)\s+(?:الى|إلى|ل)\s*(.+)$/iu;
const ENGLISH_SMS_COMMAND = /^(?:send)\s+(?:sms|message)\s+to\s+(.+?)\s+(?:saying|that says)\s+(.+)$/iu;
const INCOMPLETE_ENGLISH_SMS_COMMAND = /^(?:send)\s+(?:sms|message)\s+to\s+(.+)$/iu;

export function parseSmsCommand(value: string): ParsedSmsCommand | null {
  const match = COMPLETE_SMS_COMMAND.exec(value.trim()) ?? ENGLISH_SMS_COMMAND.exec(value.trim());
  if (!match) return null;
  const contactName = match[1].trim();
  const message = match[2].trim();
  if (!contactName || !message) return null;
  return { contactName, message };
}

export function parseIncompleteSmsCommand(value: string): string | null {
  const match = INCOMPLETE_SMS_COMMAND.exec(value.trim()) ?? INCOMPLETE_ENGLISH_SMS_COMMAND.exec(value.trim());
  const contactName = match?.[1]?.trim();
  return contactName || null;
}
