import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseIncompleteSmsCommand, parseSmsCommand } from "./smsCommandParser.ts";

Deno.test("parses Arabic direct SMS with joined ل contact prefix and preserves text", () => {
  assertEquals(parseSmsCommand("ابعث مسج لأختي قولي لها أنا بالطريق"), {
    contactName: "أختي",
    message: "أنا بالطريق",
  });
});

Deno.test("parses Arabic direct SMS with الى and preserves proper names", () => {
  assertEquals(parseSmsCommand("ارسل رسالة إلى أحمد تقول سأصل بعد قليل"), {
    contactName: "أحمد",
    message: "سأصل بعد قليل",
  });
});

Deno.test("parses English SMS command without lowercasing the message", () => {
  assertEquals(parseSmsCommand("send sms to Alex saying I am on my way"), {
    contactName: "Alex",
    message: "I am on my way",
  });
});

Deno.test("asks for message text when SMS command is incomplete", () => {
  assertEquals(parseIncompleteSmsCommand("ارسل رسالة لأختي"), "أختي");
});

Deno.test("does not classify unrelated text as an SMS command", () => {
  assertEquals(parseSmsCommand("افتح الرسائل"), null);
  assertEquals(parseIncompleteSmsCommand("مرحبا"), null);
});
