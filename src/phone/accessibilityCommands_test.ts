import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isSensitiveAccessibilityTarget, parseAccessibilityCommand } from "./accessibilityCommands.ts";

Deno.test("parses Arabic and English semantic button actions", () => {
  assertEquals(parseAccessibilityCommand("يا إزرا اضغط على إرسال"), { kind: "click", target: "ارسال" });
  assertEquals(parseAccessibilityCommand("انقر زر البحث"), { kind: "click", target: "البحث" });
  assertEquals(parseAccessibilityCommand("tap Search"), { kind: "click", target: "search" });
});

Deno.test("parses scrolling and Android global actions", () => {
  assertEquals(parseAccessibilityCommand("انزل للأسفل"), { kind: "scroll", direction: "down" });
  assertEquals(parseAccessibilityCommand("مرر للأعلى"), { kind: "scroll", direction: "up" });
  assertEquals(parseAccessibilityCommand("ارجع"), { kind: "global", action: "back" });
  assertEquals(parseAccessibilityCommand("افتح الإشعارات"), { kind: "global", action: "notifications" });
});

Deno.test("does not parse ordinary conversation as a device action", () => {
  assertEquals(parseAccessibilityCommand("ما رأيك بزر البحث؟"), null);
  assertEquals(parseAccessibilityCommand("افتح واتساب"), null);
});

Deno.test("marks high-impact actions for a separate confirmation", () => {
  assertEquals(isSensitiveAccessibilityTarget("حذف"), true);
  assertEquals(isSensitiveAccessibilityTarget("إرسال"), true);
  assertEquals(isSensitiveAccessibilityTarget("بحث"), false);
});
