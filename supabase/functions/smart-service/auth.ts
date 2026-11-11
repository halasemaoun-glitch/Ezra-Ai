type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 503; error: string };

export async function verifySupabaseUser(
  authorization: string,
  supabaseUrl: string | undefined,
  supabasePublicKey: string | null,
  fetcher: typeof fetch = fetch,
): Promise<AuthResult> {
  const bearerToken = authorization.match(/^Bearer\\s+(.+)$/i)?.[1];
  if (!bearerToken) {
    return { ok: false, status: 401, error: "Sign in to use EZRA." };
  }
  if (!supabaseUrl || !supabasePublicKey || supabasePublicKey.startsWith("sb_secret_")) {
    return { ok: false, status: 503, error: "Authentication service is not configured." };
  }

  try {
    const response = await fetcher(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabasePublicKey, Authorization: authorization },
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: 401, error: "Your session is invalid or expired. Please sign in again." };
    }
    if (!response.ok) {
      return { ok: false, status: 503, error: "Could not verify your session. Please try again." };
    }
    const user = await response.json();
    if (typeof user?.id !== "string") {
      return { ok: false, status: 401, error: "A valid signed-in account is required." };
    }
    return { ok: true, userId: user.id };
  } catch {
    return { ok: false, status: 503, error: "Could not verify your session. Please try again." };
  }
}

