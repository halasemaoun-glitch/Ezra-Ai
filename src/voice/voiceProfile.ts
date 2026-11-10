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
