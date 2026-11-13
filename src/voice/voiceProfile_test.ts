import { detectEzraSpeechLanguage, DEFAULT_EZRA_VOICE } from "./voiceProfile.ts";

Deno.test("Arabic script is detected as Arabic", () => {
  if (detectEzraSpeechLanguage("مرحبا، كيف حالك؟") !== "ar") throw new Error("Arabic detection failed");
});

Deno.test("French and Spanish phrase signals are detected", () => {
  if (detectEzraSpeechLanguage("Bonjour, merci beaucoup") !== "fr") throw new Error("French detection failed");
  if (detectEzraSpeechLanguage("Hola, gracias por todo") !== "es") throw new Error("Spanish detection failed");
});

Deno.test("Unicode writing systems are detected before fallback", () => {
  const cases: [string, string][] = [["Привет", "ru"], ["γειά", "el"], ["שלום", "he"], ["नमस्ते", "hi"], ["สวัสดี", "th"], ["こんにちは", "ja"], ["你好", "zh"], ["안녕하세요", "ko"]];
  for (const [sample, expected] of cases) {
    if (detectEzraSpeechLanguage(sample) !== expected) throw new Error(`Expected ${expected} for ${sample}`);
  }
});

Deno.test("fallback locale is normalized and default voice supports Arabic and English", () => {
  if (detectEzraSpeechLanguage("Hello there", "fr-FR") !== "fr") throw new Error("Fallback locale was not normalized");
  if (!DEFAULT_EZRA_VOICE.languages.includes("ar") || !DEFAULT_EZRA_VOICE.languages.includes("en")) throw new Error("Voice language support is incomplete");
});

Deno.test("automatic speech language follows the reply text, not only the selected reply preference", () => {
  if (detectEzraSpeechLanguage("Hello, how are you?", "ar") !== "en") throw new Error("English reply was not detected when Arabic was the fallback");
  if (detectEzraSpeechLanguage("مرحباً، كيف حالك؟", "en") !== "ar") throw new Error("Arabic reply was not detected when English was the fallback");
  if (detectEzraSpeechLanguage("Bonjour, merci beaucoup", "ar") !== "fr") throw new Error("French phrase was not detected");
});
