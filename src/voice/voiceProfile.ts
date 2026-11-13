/**
 * EZRA's agreed voice profile.
 *
 * Habibi-TTS remains the intended primary engine. Its Android bridge compiles in
 * CI; until inference and playback are verified on the target phone, App.tsx
 * retains expo-speech as a safe fallback.
 */
export const DEFAULT_EZRA_VOICE = {
  engine: 'habibi-tts' as const,
  style: 'male-warm-deep' as const,
  // Slightly slower pacing and a lower fallback pitch create a calmer,
  // warmer masculine presentation on Android system TTS voices.
  // Habibi-TTS timbre itself is conditioned by the selected male WAV reference.
  rate: 0.88,
  pitch: 0.78,
  languages: ['ar', 'en'] as const,
  // The installed mobile checkpoint is ALG; other dialects are not yet verified.
  dialects: ['Algerian Arabic'] as const,
  automaticOutputLanguage: true,
};

export type EzraSpeechLanguage = string;

/** Infer a TTS locale from the reply's writing system and common words. */
export function detectEzraSpeechLanguage(text: string, fallbackLocale = 'en'): EzraSpeechLanguage {
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[\u0400-\u04FF]/.test(text)) return 'ru';
  if (/[\u0370-\u03FF]/.test(text)) return 'el';
  if (/[\u0590-\u05FF]/.test(text)) return 'he';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th';
  if (/[\u3040-\u30FF]/.test(text)) return 'ja';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  const sample = text.toLocaleLowerCase();
  const signals: Record<string, string[]> = {
    fr: ['bonjour', 'merci', 'avec', 'pour', 'vous', 'je suis', 'est-ce', 'mais', 'dans', 'une'],
    es: ['hola', 'gracias', 'para', 'porque', 'usted', 'estoy', 'buenos', 'como', 'pero', 'muy'],
    de: ['hallo', 'danke', 'und', 'ich', 'nicht', 'bitte', 'ist', 'für', 'mit', 'das'],
    pt: ['olá', 'obrigado', 'você', 'não', 'para', 'uma', 'estou', 'muito', 'como'],
    it: ['ciao', 'grazie', 'sono', 'che', 'per', 'non', 'come', 'buongiorno'],
    tr: ['merhaba', 'teşekkür', 'için', 'değil', 'nasıl', 'evet', 'hayır'],
    nl: ['hallo', 'dank je', 'niet', 'voor', 'met', 'een', 'het', 'goedemorgen'],
    id: ['halo', 'terima kasih', 'saya', 'tidak', 'untuk', 'dengan', 'selamat'],
    vi: ['xin chào', 'cảm ơn', 'không', 'và', 'được', 'tôi', 'bạn'],
  };
  let best = '';
  let bestScore = 0;
  for (const [locale, words] of Object.entries(signals)) {
    const score = words.reduce((total, word) => total + (sample.includes(word) ? 1 : 0), 0);
    if (score > bestScore) { best = locale; bestScore = score; }
  }
  if (bestScore > 0) return best;
  // A Latin-script reply with no stronger language signal is treated as English,
  // even when the assistant's preferred response language is Arabic.
  if (/[A-Za-z]/.test(text)) return 'en';
  return fallbackLocale.split(/[-_]/)[0] || 'en';
}
