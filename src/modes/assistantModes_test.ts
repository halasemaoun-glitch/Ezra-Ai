import { ASSISTANT_MODE_OPTIONS, getAssistantModeGuidance, getAssistantModeSuggestions } from "./assistantModes.ts";

Deno.test("all three assistant modes have unique IDs and usable suggestions", () => {
  const ids = ASSISTANT_MODE_OPTIONS.map((item) => item.id);
  if (ids.join(",") !== "companion,dentist,study") throw new Error("Unexpected assistant mode IDs");
  if (new Set(ids).size !== ids.length) throw new Error("Assistant mode IDs must be unique");
  for (const id of ids) {
    if (!getAssistantModeGuidance(id).trim()) throw new Error(`Missing guidance for ${id}`);
    if (getAssistantModeSuggestions(id).length < 2) throw new Error(`Insufficient suggestions for ${id}`);
  }
});

Deno.test("dentist guidance preserves clinical safety boundaries", () => {
  const guidance = getAssistantModeGuidance("dentist").toLowerCase();
  for (const phrase of ["never present a remote impression as a confirmed diagnosis", "do not prescribe medication", "difficulty breathing or swallowing", "emergency medical care now"]) {
    if (!guidance.includes(phrase)) throw new Error(`Missing dental safety rule: ${phrase}`);
  }
});

Deno.test("study guidance supports learning and protects private reasoning", () => {
  const guidance = getAssistantModeGuidance("study").toLowerCase();
  if (!guidance.includes("understanding and retention")) throw new Error("Study teaching objective missing");
  if (!guidance.includes("never reveal private chain-of-thought")) throw new Error("Reasoning privacy rule missing");
});
