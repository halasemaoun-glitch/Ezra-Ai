import { buildEzraSystemPrompt } from "./persona.ts";

export type GeminiRequestOptions = {
  input: string;
  imageDataUrl: string;
  voiceMode: boolean;
  responseLanguage: "ar" | "en";
  approvedMemories: string[];
};

export type GeminiGeneratePayload = {
  systemInstruction: { parts: [{ text: string }] };
  contents: Array<{ role: "user"; parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> }>;
  generationConfig: { temperature: number; maxOutputTokens: number };
};

export function buildGeminiPayload(options: GeminiRequestOptions): GeminiGeneratePayload {
  const parts: GeminiGeneratePayload["contents"][number]["parts"] = [{ text: options.input }];
  if (options.imageDataUrl) {
    const match = options.imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
    if (match) parts.push({ inlineData: { mimeType: match[1].toLowerCase(), data: match[2] } });
  }
  return {
    systemInstruction: {
      parts: [{
        text: buildEzraSystemPrompt({
          responseLanguage: options.responseLanguage,
          voiceMode: options.voiceMode,
          approvedMemories: options.approvedMemories,
        }),
      }],
    },
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: options.voiceMode ? 0.65 : 0.7,
      maxOutputTokens: options.voiceMode ? 280 : 1200,
    },
  };
}

export function extractGeminiReply(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const candidates = (result as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return null;
  const parts = candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const reply = parts
    .map((part: unknown) => part && typeof part === "object" &&
      (part as { thought?: unknown }).thought !== true &&
      typeof (part as { text?: unknown }).text === "string"
      ? (part as { text: string }).text
      : "")
    .join("")
    .trim();
  return reply || null;
}
