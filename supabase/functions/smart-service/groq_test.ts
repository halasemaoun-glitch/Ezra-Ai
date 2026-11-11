import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildGroqChatPayload, extractGroqReply } from "./groq.ts";

const base = { input: "مرحبا يا EZRA", imageDataUrl: "", voiceMode: false, responseLanguage: "ar" as const, approvedMemories: [] as string[] };

Deno.test("normal Arabic chat sends the full EZRA persona to the text model", () => {
  const payload = buildGroqChatPayload(base);
  assertEquals(payload.model, "openai/gpt-oss-120b");
  assertEquals(payload.temperature, 0.7);
  assertEquals(payload.max_completion_tokens, 1200);
  assertEquals(payload.messages[1].content, "مرحبا يا EZRA");
  assertStringIncludes(payload.messages[0].content, "Algerian Darija");
  assertStringIncludes(payload.messages[0].content, "CORE PERSONALITY");
});

Deno.test("English selection is passed into the actual provider system message", () => {
  const payload = buildGroqChatPayload({ ...base, responseLanguage: "en" });
  assertStringIncludes(payload.messages[0].content, "selected ENGLISH");
  assert(!payload.messages[0].content.includes("selected ARABIC"));
});

Deno.test("voice mode uses concise speech limits while retaining EZRA persona", () => {
  const payload = buildGroqChatPayload({ ...base, voiceMode: true });
  assertEquals(payload.temperature, 0.65);
  assertEquals(payload.max_completion_tokens, 420);
  assertStringIncludes(payload.messages[0].content, "VOICE CONVERSATION MODE");
  assertStringIncludes(payload.messages[0].content, "CORE PERSONALITY");
});

Deno.test("image input routes to vision model with both text and image content", () => {
  const image = "data:image/png;base64,AAAA";
  const payload = buildGroqChatPayload({ ...base, imageDataUrl: image, input: "اشرح هذه الصورة" });
  assertEquals(payload.model, "qwen/qwen3.8-27b");
  assert(Array.isArray(payload.messages[1].content));
  if (Array.isArray(payload.messages[1].content)) {
    assertEquals(payload.messages[1].content[0], { type: "text", text: "اشرح هذه الصورة" });
    assertEquals(payload.messages[1].content[1], { type: "image_url", image_url: { url: image } });
  }
});

Deno.test("only supplied approved memories are included in the prompt", () => {
  const payload = buildGroqChatPayload({ ...base, approvedMemories: ["prefers concise answers"] });
  assertStringIncludes(payload.messages[0].content, "prefers concise answers");
});

Deno.test("extracts and trims a valid provider reply", () => {
  assertEquals(extractGroqReply({ choices: [{ message: { content: "  أهلاً!  " } }] }), "أهلاً!");
});

Deno.test("rejects malformed or empty provider replies safely", () => {
  assertEquals(extractGroqReply(null), null);
  assertEquals(extractGroqReply({ choices: [] }), null);
  assertEquals(extractGroqReply({ choices: [{ message: { content: "  " } }] }), null);
  assertEquals(extractGroqReply({ choices: [{ message: {} }] }), null);
});
