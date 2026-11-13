export type AiProvider = 'groq' | 'gemini';

export type AiModelOption = {
  id: string;
  label: string;
  description: string;
  supportsImages: boolean;
};

export const AI_PROVIDER_OPTIONS: { id: AiProvider; label: string; description: string; secretName: string }[] = [
  { id: 'groq', label: 'Groq', description: 'المزوّد الحالي السريع · يعمل بمفتاح الخادم الموجود', secretName: 'GROQ_API_KEY' },
  { id: 'gemini', label: 'Google Gemini', description: 'خيار مجاني إضافي · يحتاج مفتاح AI Studio على الخادم؛ بيانات الخطة المجانية قد تُستخدم لتحسين منتجات Google', secretName: 'GEMINI_API_KEY' },
];

export const AI_MODELS: Record<AiProvider, AiModelOption[]> = {
  groq: [
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', description: 'الأقوى للشرح والتحليل والمهام المعقدة', supportsImages: false },
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', description: 'أخف وأسرع للمحادثات اليومية', supportsImages: false },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'متوازن للشرح والتحليل ويدعم الصور', supportsImages: true },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', description: 'خفيف وسريع ويدعم الصور', supportsImages: true },
  ],
};

export const DEFAULT_AI_PROVIDER: AiProvider = 'groq';
export const DEFAULT_AI_MODELS: Record<AiProvider, string> = {
  groq: 'openai/gpt-oss-120b',
  gemini: 'gemini-2.5-flash',
};
export const GROQ_VISION_MODEL = 'qwen/qwen3.8-27b';

export function normalizeAiProvider(value: unknown): AiProvider {
  return value === 'gemini' ? 'gemini' : 'groq';
}

export function normalizeAiModel(providerValue: unknown, modelValue: unknown): string {
  const provider = normalizeAiProvider(providerValue);
  const models = AI_MODELS[provider];
  return typeof modelValue === 'string' && models.some(model => model.id === modelValue)
    ? modelValue
    : DEFAULT_AI_MODELS[provider];
}

export function getAiModelLabel(providerValue: unknown, modelValue: unknown): string {
  const provider = normalizeAiProvider(providerValue);
  const modelId = normalizeAiModel(provider, modelValue);
  return AI_MODELS[provider].find(model => model.id === modelId)?.label ?? modelId;
}
