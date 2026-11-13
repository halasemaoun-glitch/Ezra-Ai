export function parseCallContactName(commandText: string): string | null {
  const normalized = commandText.toLowerCase().replace(/[إأآ]/g, 'ا');
  const match = normalized.match(/(?:اتصل(?:ي)?|اتصلي|كلم(?:ي)?|دق(?:ي)?|رن(?:ي)?|call|phone)\s*(?:ب|على|ل|الى)?\s*(.+)$/i);
  if (!match) return null;

  const contactName = match[1]
    .replace(/\s*(?:الان|الحين|حالاً|حالا|من فضلك)$/i, '')
    .trim();

  if (!contactName || /^(?:بي|me|myself)$/.test(contactName)) return null;
  return contactName;
}
