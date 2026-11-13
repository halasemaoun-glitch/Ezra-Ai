import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifySupabaseUser } from "./auth.ts";

Deno.test("rejects requests without a bearer token", async () => {
  let fetchCalled = false;
  const result = await verifySupabaseUser("", "https://example.supabase.co", "sb_publishable_test", async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
  });
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 401);
  assertEquals(fetchCalled, false);
});

Deno.test("rejects an invalid or expired session", async () => {
  const result = await verifySupabaseUser(
    "Bearer invalid-token",
    "https://example.supabase.co",
    "sb_publishable_test",
    async () => new Response(JSON.stringify({ message: "invalid token" }), { status: 401 }),
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 401);
});

Deno.test("accepts a valid session and returns the verified user ID", async () => {
  let requestedUrl = "";
  const result = await verifySupabaseUser(
    "Bearer valid-test-token",
    "https://example.supabase.co",
    "sb_publishable_test",
    async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ id: "verified-user-123" }), { status: 200 });
    },
  );
  assertEquals(requestedUrl, "https://example.supabase.co/auth/v1/user");
  assertEquals(result, { ok: true, userId: "verified-user-123" });
});

Deno.test("does not accept a secret key as the publishable API key", async () => {
  const result = await verifySupabaseUser(
    "Bearer valid-test-token",
    "https://example.supabase.co",
    "sb_secret_do_not_use",
    async () => new Response(JSON.stringify({ id: "user-1" }), { status: 200 }),
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 503);
});

Deno.test("fails closed when Supabase Auth is unavailable", async () => {
  const result = await verifySupabaseUser(
    "Bearer valid-test-token",
    "https://example.supabase.co",
    "sb_publishable_test",
    async () => new Response("unavailable", { status: 503 }),
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 503);
});

Deno.test("rejects a forbidden session", async () => {
  const result = await verifySupabaseUser(
    "Bearer revoked-token",
    "https://example.supabase.co",
    "sb_publishable_test",
    async () => new Response(JSON.stringify({ message: "forbidden" }), { status: 403 }),
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 401);
});

Deno.test("rejects an Auth response without a user ID", async () => {
  const result = await verifySupabaseUser(
    "Bearer malformed-session",
    "https://example.supabase.co",
    "sb_publishable_test",
    async () => new Response(JSON.stringify({}), { status: 200 }),
  );
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.status, 401);
});
