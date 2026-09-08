import { NextResponse } from "next/server";

// Mints a short-lived LiveAvatar session token server-side. LIVEAVATAR_API_KEY
// is a secret that must never reach the browser — this route is the only
// place it's read, and only a session_token (already scoped to one session)
// is returned to the client.
export async function POST() {
  const apiKey = process.env.LIVEAVATAR_API_KEY;
  const avatarId = process.env.LIVEAVATAR_AVATAR_ID;
  const llmConfigId = process.env.LIVEAVATAR_LLM_CONFIG_ID;
  const contextId = process.env.LIVEAVATAR_CONTEXT_ID;

  if (!apiKey || !avatarId) {
    return NextResponse.json(
      { error: "LiveAvatar is not configured on the server." },
      { status: 500 }
    );
  }

  // FULL mode (with an LLM config + context) lets the avatar hold an
  // open-ended, natural conversation instead of just repeating text we feed
  // it. Falls back to the original LITE/repeat() mode if those aren't set.
  const useFullMode = !!llmConfigId && !!contextId;

  const res = await fetch("https://api.liveavatar.com/v1/sessions/token", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      useFullMode
        ? {
            avatar_id: avatarId,
            mode: "FULL",
            llm_configuration_id: llmConfigId,
            avatar_persona: { context_id: contextId },
          }
        : {
            avatar_id: avatarId,
            mode: "LITE",
          }
    ),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json(
      { error: "Failed to create LiveAvatar session token", detail: body },
      { status: 502 }
    );
  }

  const json = await res.json();
  const sessionToken = json?.data?.session_token;

  if (!sessionToken) {
    return NextResponse.json(
      { error: "LiveAvatar response did not include a session token" },
      { status: 502 }
    );
  }

  return NextResponse.json({ sessionToken, mode: useFullMode ? "FULL" : "LITE" });
}
