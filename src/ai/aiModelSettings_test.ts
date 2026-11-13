import {
  AI_MODELS,
  DEFAULT_AI_MODELS,
  GROQ_VISION_MODEL,
  normalizeAiModel,
  normalizeAiProvider,
} from './aiModelSettings.ts';

Deno.test('normalizes only supported AI providers', () => {
  if (normalizeAiProvider('gemini') !== 'gemini') throw new Error('Gemini provider missing');
  if (normalizeAiProvider('openai') !== 'groq') throw new Error('unknown provider must safely fall back');
});

Deno.test('keeps selected models inside each provider allowlist', () => {
  if (normalizeAiModel('groq', 'openai/gpt-oss-20b') !== 'openai/gpt-oss-20b') throw new Error('Groq model selection failed');
  if (normalizeAiModel('groq', 'gemini-3.8-flash') !== DEFAULT_AI_MODELS.groq) throw new Error('cross-provider model was accepted');
  if (normalizeAiModel('gemini', 'gemini-3.1-flash-lite') !== 'gemini-3.1-flash-lite') throw new Error('Gemini model selection failed');
  if (normalizeAiModel('gemini', 'not-a-model') !== DEFAULT_AI_MODELS.gemini) throw new Error('unknown model was accepted');
});

Deno.test('exposes supported model capabilities and the Groq vision model', () => {
  if (!AI_MODELS.gemini.every(model => model.supportsImages)) throw new Error('Gemini image capability metadata missing');
  if (AI_MODELS.groq.some(model => model.supportsImages)) throw new Error('text-only Groq models marked as vision');
  if (GROQ_VISION_MODEL !== 'qwen/qwen3.8-27b') throw new Error('Groq vision model mismatch');
});
