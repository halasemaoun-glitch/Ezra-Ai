export type ParsedSmsCommand = {
  contactName: string;
  message: string;
};

const normalizeSmsCommand = (value: string) => value
  .toLocaleLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
  .replace(/[إأآ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/\s+/g, " ")
  .trim();

const SMS_COMMAND_START = /^(?:ارسل|ابعث|ابعت|اكتب|send)\s+(?:لي\s+)?(?:رسالة|مسج|sms|message)\s+(?:الى\s*|ل\s*|to\s+)/i;

export function parseSmsCommand(value: string): ParsedSmsCommand | null {
  const normalized = normalizeSmsCommand(value);
  const start = SMS_COMMAND_START.exec(normalized);
  if (!start) return null;
  const remainder = normalized.slice(start[0].length);
  const marker = /\s+(?:تقول|قولي\s+لها|قل\s+له|محتواها|نصها|saying|that says)\s+/i.exec(remainder);
  if (!marker) return null;
  const contactName = remainder.slice(0, marker.index).trim();
  const message = remainder.slice(marker.index + marker[0].length).trim();
  if (!contactName || !message) return null;
  return { contactName, message };
}

export function parseIncompleteSmsCommand(value: string): string | null {
  const normalized = normalizeSmsCommand(value);
  const start = SMS_COMMAND_START.exec(normalized);
  if (!start) return null;
  const contactName = normalized.slice(start[0].length).trim();
  return contactName || null;
}
