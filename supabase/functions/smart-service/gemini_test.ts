import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildGeminiPayload, extractGeminiReply } from "./gemini.ts";

const base = { input: "مرحبا يا EZRA", imageDataUrl: "", voiceMode: false, responseLanguage: "ar" as const, approvedMemories: [] as string[] };

Deno.test("Gemini payload carries the EZRA persona and Arabic instruction", () => {
  const payload = buildGeminiPayload(base);
  assertStringIncludes(payload.systemInstruction.parts[0].text, "CORE PERSONALITY");
  assertStringIncludes(payload.systemInstruction.parts[0].text, "selected ARABIC");
  assertEquals(payload.contents[0].parts[0], { text: "مرحبا يا EZRA" });
  assertEquals(payload.generationConfig.maxOutputTokens, 1200);
});

Deno.test("Gemini image payload converts a supported data URL to inlineData", () => {
  const payload = buildGeminiPayload({ ...base, imageDataUrl: "data:image/png;base64,AAAA" });
  assertEquals(payload.contents[0].parts[1], { inlineData: { mimeType: "image/png", data: "AAAA" } });
});

Deno.test("Gemini voice payload uses concise speech limits", () => {
  const payload = buildGeminiPayload({ ...base, voiceMode: true, responseLanguage: "en" });
  assertEquals(payload.generationConfig.maxOutputTokens, 280);
  assertStringIncludes(payload.systemInstruction.parts[0].text, "selected ENGLISH");
});

Deno.test("extracts Gemini text across response parts and rejects malformed replies", () => {
  assertEquals(extractGeminiReply({ candidates: [{ content: { parts: [{ text: "internal reasoning", thought: true }, { text: "  Hello" }, { text: " EZRA! " }] } }] }), "Hello EZRA!");
  assertEquals(extractGeminiReply(null), null);
  assertEquals(extractGeminiReply({ candidates: [] }), null);
  assertEquals(extractGeminiReply({ candidates: [{ content: { parts: [{ text: " " }] } }] }), null);
});
