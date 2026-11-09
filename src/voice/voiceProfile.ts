/**
 * EZRA's agreed voice profile.
 *
 * Habibi-TTS remains the intended primary engine. Until its complete Android
 * inference pipeline is available, App.tsx deliberately retains expo-speech
 * as a temporary device fallback instead of pretending that Habibi is running.
 */
export const DEFAULT_EZRA_VOICE = {
  engine: 'habibi-tts' as const,
  style: 'male-warm-deep' as const,
  rate: 0.92,
  pitch: 0.82,
  languages: ['ar', 'en'] as const,
  dialects: ['Levantine Arabic', 'Algerian Arabic', 'Saudi Arabic'] as const,
  automaticOutputLanguage: true,
};

export type EzraSpeechLanguage = 'ar' | 'en';

/** Detect the output language from the assistant's actual reply text. */
export function detectEzraSpeechLanguage(text: string): EzraSpeechLanguage {
  return /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en';
}
