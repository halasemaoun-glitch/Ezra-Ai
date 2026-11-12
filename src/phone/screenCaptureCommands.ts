export function isScreenCaptureCommand(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();

  return /(?:سكرين(?:\s*شوت)?|لقطه\s*(?:الشاشه|شاشه)|صوره\s*الشاشه|تصوير\s*الشاشه|صور\s*الشاشه|خذ\s*لقطه|التقط\s*الشاشه|screenshot|screen\s*shot|take\s+(?:a\s+)?screenshot)/i.test(normalized);
}
