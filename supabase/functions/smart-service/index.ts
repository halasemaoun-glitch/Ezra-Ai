// EZRA AI — Groq free-tier chat service
import { verifySupabaseUser } from "./auth.ts";
import { buildGroqChatPayload, extractGroqReply } from "./groq.ts";
// Keep GROQ_API_KEY in Supabase Edge Function secrets. Never place it in the mobile app.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function getSupabasePublishableKey(): string | null {
  const direct =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
  if (direct) return direct;

  const namedKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!namedKeys) return null;

  try {
    const parsed = JSON.parse(namedKeys);
    if (typeof parsed?.default === "string") return parsed.default;
    const firstKey = Object.values(parsed).find(
      (value): value is string => typeof value === "string",
    );
    return firstKey ?? null;
  } catch {
    return null;
  }
}


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: jsonHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabasePublicKey = getSupabasePublishableKey();
  if (!supabaseUrl || !supabasePublicKey || supabasePublicKey.startsWith("sb_secret_")) {
    return new Response(JSON.stringify({ error: "Authentication service is not configured." }), {
      status: 503, headers: jsonHeaders,
    });
  }
  const authorization = req.headers.get("Authorization") ?? "";
  const authResult = await verifySupabaseUser(
    authorization,
    supabaseUrl,
    supabasePublicKey,
  );
  if (!authResult.ok) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status, headers: jsonHeaders,
    });
  }
  const userId = authResult.userId;

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "EZRA AI is not configured yet. Add the GROQ_API_KEY Supabase secret." }),
      { status: 503, headers: jsonHeaders },
    );
  }

  try {
    const body = await req.json();
    const input = typeof body?.input === "string" ? body.input.trim() : "";
    const imageDataUrl = typeof body?.imageDataUrl === "string" ? body.imageDataUrl : "";
    const voiceMode = body?.voiceMode === true;
    const responseLanguage = body?.responseLanguage === "en" ? "en" : "ar";

    if (imageDataUrl && (!/^data:image\/(jpeg|png|webp);base64,/i.test(imageDataUrl) || imageDataUrl.length > 4 * 1024 * 1024)) {
      return new Response(JSON.stringify({ error: "The image format is unsupported or the image is too large." }), {
        status: 400, headers: jsonHeaders,
      });
    }

    if (!input) {
      return new Response(JSON.stringify({ error: "A non-empty input is required." }), {
        status: 400, headers: jsonHeaders,
      });
    }
    if (input.length > 16000) {
      return new Response(JSON.stringify({ error: "The message is too long. Please shorten it and try again." }), {
        status: 413, headers: jsonHeaders,
      });
    }

    // Load only the authenticated user's approved memories; RLS also applies to this JWT.
    let approvedMemories: string[] = [];
    try {
      const memoryUrl = new URL(`${supabaseUrl}/rest/v1/memories`);
      memoryUrl.searchParams.set("select", "content");
      memoryUrl.searchParams.set("owner_id", `eq.${userId}`);
      memoryUrl.searchParams.set("approval_status", "eq.approved");
      memoryUrl.searchParams.set("order", "created_at.desc");
      memoryUrl.searchParams.set("limit", "12");

      const memoryResponse = await fetch(memoryUrl, {
        headers: { apikey: supabasePublicKey, Authorization: authorization },
      });
      if (memoryResponse.ok) {
        const rows = await memoryResponse.json();
        approvedMemories = Array.isArray(rows)
          ? rows
              .filter((row: any) => typeof row?.content === "string")
              .map((row: any) => row.content.trim().slice(0, 700))
              .filter((content: string) => !!content)
          : [];
      } else {
        console.error("Could not load approved memories:", memoryResponse.status);
      }
    } catch (memoryError) {
      // Memory lookup is optional: a temporary database issue must not block chat.
      console.error("EZRA memory lookup failed:", memoryError);
    }


    const groqPayload = buildGroqChatPayload({ input, imageDataUrl, voiceMode, responseLanguage, approvedMemories });

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(groqPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("Groq API error:", response.status, result?.error?.message ?? "Unknown provider error");
      const status = response.status === 429 ? 429 : 502;
      const message = response.status === 429
        ? "The free AI usage limit has been reached for now. Please try again later."
        : "The AI service is temporarily unavailable. Please try again.";
      return new Response(JSON.stringify({ error: message }), { status, headers: jsonHeaders });
    }

    const reply = extractGroqReply(result);
    if (!reply) {
      return new Response(JSON.stringify({ error: "The AI returned an empty response. Please try again." }), {
        status: 502, headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({ reply }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    console.error("EZRA smart-service error:", error);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
