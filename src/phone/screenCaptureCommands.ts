export function isScreenCaptureCommand(value: string): boolean {
  const normalized = value
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();

  const arabicCommand = /(?:^|\s)(?:يا\s*)?(?:ازرا\s*)?(?:سوي|اعمل|اعملي|خذ|خدي|التقط|صور|صوري|التقاط|تصوير)\s+(?:لي\s+)?(?:سكرين(?:\s*شوت)?|لقطه(?:\s*(?:ال)?شاشه)?|صوره\s*(?:ال)?شاشه|الشاشه)(?:$|\s)/i;
  const englishCommand = /(?:^|\s)(?:screenshot|screen\s*shot|take\s+(?:a\s+)?screenshot)(?:$|\s)/i;
  return normalized === "سكرين" || arabicCommand.test(normalized) || englishCommand.test(normalized);
}
