// EZRA AI — Groq free-tier chat service
// Keep GROQ_API_KEY in Supabase Edge Function secrets. Never place it in the mobile app.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: jsonHeaders,
    });
  }

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

    const systemPrompt = [
      "You are EZRA, a premium personal AI companion.",
      "Speak naturally, warmly, intelligently, and respectfully. Be personable without pretending to be human.",
      "Reply in the same language as the user. When the user writes Arabic, use clear, natural Arabic and understand colloquial dialects; use a friendly Levantine/Jordanian style when appropriate.",
      "Be concise by default, but give detailed explanations when requested. Preserve relevant conversation context included in the input.",
      "Never claim to have performed actions on the user's device unless an available integration actually confirms it.",
      "For medical or dental topics, provide general educational information, avoid definitive diagnosis or treatment claims, and recommend a qualified clinician for individual care or urgent symptoms.",
    ].join("\n");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: input },
        ],
        temperature: 0.7,
        max_completion_tokens: 1200,
      }),
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

    const reply = result?.choices?.[0]?.message?.content?.trim();
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
