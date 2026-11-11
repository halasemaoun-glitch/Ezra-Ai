import { buildEzraSystemPrompt } from "./persona.ts";

export type GroqRequestOptions = {
  input: string;
  imageDataUrl: string;
  voiceMode: boolean;
  responseLanguage: "ar" | "en";
  approvedMemories: string[];
};

export function buildGroqChatPayload(options: GroqRequestOptions) {
  const { input, imageDataUrl, voiceMode, responseLanguage, approvedMemories } = options;
  return {
    model: imageDataUrl ? "qwen/qwen3.8-27b" : "openai/gpt-oss-120b",
    messages: [
      {
        role: "system" as const,
        content: buildEzraSystemPrompt({ responseLanguage, voiceMode, approvedMemories }),
      },
      {
        role: "user" as const,
        content: imageDataUrl
          ? [
              { type: "text" as const, text: input },
              { type: "image_url" as const, image_url: { url: imageDataUrl } },
            ]
          : input,
      },
    ],
    temperature: voiceMode ? 0.65 : 0.7,
    max_completion_tokens: voiceMode ? 420 : 1200,
  };
}

export function extractGroqReply(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const choices = (result as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;
  const message = choices[0]?.message;
  if (!message || typeof message.content !== "string") return null;
  const reply = message.content.trim();
  return reply.length > 0 ? reply : null;
}
