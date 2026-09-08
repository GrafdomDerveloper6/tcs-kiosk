import { NextResponse } from "next/server";

// LiveAvatar's own ASR/session pipeline runs against a specific language
// model — it defaults to "en" if we never say otherwise. Forced to "hi" for
// every session regardless of which UI language the customer picked: same
// voice, same accent, but her speech recognition and pronunciation handling
// always run in Hindi mode now. (LiveAvatar has no native "ur" code — its
// /v1/languages list doesn't carry one — and Urdu/Hindi are the same spoken
// language for this purpose: same phonology and grammar, different script.)
const SESSION_LANGUAGE = "hi";

// A moderate ~15% slowdown (1.0 is normal pace) — the customer specifically
// asked to slow her down "a bit", not a lot, and 0.85 is comfortably inside
// ElevenLabs' accepted 0.8-1.2 range with headroom to go lower later if it's
// still too fast. The provider itself is a considered guess, not something
// LiveAvatar exposes for inspection (checked: neither the avatar's own nor
// the voice's own detail endpoint reports which TTS backend it runs on) —
// elevenLabs is the field tested clean through an actual session start, not
// just schema validation, so it's a safe bet even if it turns out to be
// switching the engine rather than only tuning an existing one.
const VOICE_SETTINGS = { provider: "elevenLabs" as const, speed: 0.85 };

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
            avatar_persona: {
              context_id: contextId,
              language: SESSION_LANGUAGE,
              voice_settings: VOICE_SETTINGS,
            },
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
