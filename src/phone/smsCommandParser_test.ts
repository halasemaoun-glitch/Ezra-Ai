import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseIncompleteSmsCommand, parseSmsCommand } from "./smsCommandParser.ts";

Deno.test("parses Arabic direct SMS with joined ل contact prefix", () => {
  assertEquals(parseSmsCommand("ابعث مسج لاختي قولي لها أنا بالطريق"), {
    contactName: "اختي",
    message: "انا بالطريق",
  });
});

Deno.test("parses Arabic direct SMS with الى and message marker", () => {
  assertEquals(parseSmsCommand("ارسل رسالة الى أحمد تقول سأصل بعد قليل"), {
    contactName: "احمد",
    message: "ساصل بعد قليل",
  });
});

Deno.test("parses English SMS command", () => {
  assertEquals(parseSmsCommand("send sms to Alex saying I am on my way"), {
    contactName: "alex",
    message: "i am on my way",
  });
});

Deno.test("asks for message text when SMS command is incomplete", () => {
  assertEquals(parseIncompleteSmsCommand("ارسل رسالة لاختي"), "اختي");
});

Deno.test("does not classify unrelated text as an SMS command", () => {
  assertEquals(parseSmsCommand("افتح الرسائل"), null);
  assertEquals(parseIncompleteSmsCommand("مرحبا"), null);
});
