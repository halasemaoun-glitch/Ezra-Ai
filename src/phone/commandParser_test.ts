import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseCallContactName } from "./commandParser.ts";

Deno.test("parses common Arabic call commands", () => {
  assertEquals(parseCallContactName("اتصل بأمي"), "امي");
  assertEquals(parseCallContactName("اتصل على أمي الآن"), "امي");
  assertEquals(parseCallContactName("كلم سارة من فضلك"), "سارة");
});

Deno.test("parses English call commands", () => {
  assertEquals(parseCallContactName("call mom"), "mom");
  assertEquals(parseCallContactName("phone Sarah"), "sarah");
});

Deno.test("ignores incomplete or self-directed call commands", () => {
  assertEquals(parseCallContactName("اتصل"), null);
  assertEquals(parseCallContactName("call myself"), null);
  assertEquals(parseCallContactName("مرحبا"), null);
});


Deno.test("Arabic feminine direct-call commands resolve contact names", () => {
  if (parseCallContactName("إزرا اتصلي بأمي") !== "بأمي") {
    throw new Error("Expected feminine Arabic call command to be recognized");
  }
});
