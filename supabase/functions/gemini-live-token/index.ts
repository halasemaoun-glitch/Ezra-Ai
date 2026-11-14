// EZRA AI — isolated Gemini Live session-token endpoint.
// This function does not change the existing smart-service (Groq/Gemini text chat).
import { verifySupabaseUser } from "../smart-service/auth.ts";
import { buildEzraSystemPrompt } from "../smart-service/persona.ts";

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
    return Object.values(parsed).find(
      (value): value is string => typeof value === "string",
    ) ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabasePublicKey = getSupabasePublishableKey();
  const authorization = req.headers.get("Authorization") ?? "";
  const authResult = await verifySupabaseUser(
    authorization,
    supabaseUrl,
    supabasePublicKey,
  );
  if (!authResult.ok) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status,
      headers: jsonHeaders,
    });
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: "Gemini Live is not configured. Add GEMINI_API_KEY to Supabase Edge Function secrets.",
    }), { status: 503, headers: jsonHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const responseLanguage = body?.responseLanguage === "en" ? "en" : "ar";
    const systemInstruction = buildEzraSystemPrompt({
      responseLanguage,
      voiceMode: true,
      approvedMemories: [],
    });
    const now = Date.now();
    const payload = {
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
      liveConnectConstraints: {
        model: "gemini-3.8-live",
        config: {
          responseModalities: ["AUDIO"],
          sessionResumption: {},
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      },
    };

    const tokenResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1alpha/authTokens",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12000),
      },
    );
    const tokenData = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || typeof tokenData?.name !== "string") {
      console.error("Gemini Live token provisioning failed:", tokenResponse.status);
      return new Response(JSON.stringify({
        error: "Could not start a Gemini Live session. Check the server-side Gemini key and Live API access.",
      }), { status: 502, headers: jsonHeaders });
    }

    // The long-lived Google API key never leaves this server function.
    return new Response(JSON.stringify({
      token: tokenData.name,
      model: "gemini-3.8-live",
      expiresAt: payload.expireTime,
    }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    console.error("EZRA Gemini Live token endpoint failed:", error);
    return new Response(JSON.stringify({
      error: "Gemini Live could not be initialized. Please try again.",
    }), { status: 500, headers: jsonHeaders });
  }
});
