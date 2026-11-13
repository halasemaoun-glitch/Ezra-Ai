import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isScreenCaptureCommand } from "./screenCaptureCommands.ts";

Deno.test("recognizes common Arabic screenshot requests", () => {
  for (const phrase of ["ازرا سوي سكرين", "خذ لقطة شاشة", "التقط الشاشة", "صور الشاشة"]) {
    assertEquals(isScreenCaptureCommand(phrase), true, phrase);
  }
});

Deno.test("recognizes English screenshot requests", () => {
  assertEquals(isScreenCaptureCommand("take a screenshot"), true);
  assertEquals(isScreenCaptureCommand("screen shot"), true);
});

Deno.test("does not treat unrelated requests as screenshot commands", () => {
  assertEquals(isScreenCaptureCommand("افتح الكاميرا"), false);
  assertEquals(isScreenCaptureCommand("ما هي لقطة الشاشة؟"), false);
});
