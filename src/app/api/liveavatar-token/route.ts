import { NextResponse } from "next/server";

// English keeps using LiveAvatar's own FULL-mode pipeline (our context +
// llm_configuration_id + voice_settings below) — this is the path that was
// actually tuned and tested (speed, the context prompt, the confirmation
// behavior). Two earlier attempts to make THIS SAME path also speak Urdu —
// first forcing language:"hi" for every session, then only when Urdu was
// picked — were both live-tested and rejected for sounding worse, not
// better. Leave it English-only unless someone has a real, live-tested
// reason to touch it again.
const SESSION_LANGUAGE = "en";

// Went from 0.85 to 0.8 (1.0 is normal pace) after a second "still a bit
// fast" report — 0.8 is ElevenLabs' documented floor, so this is as slow as
// this setting alone can go. This only applies to the English path above:
// LiveAvatar rejects voice_settings entirely for the Urdu voice_agent path
// below (400 — "not accepted for an elevenlabs_agent"), since that agent's
// speed/voice is whatever was configured on ElevenLabs' own side.
const VOICE_SETTINGS = { provider: "elevenLabs" as const, speed: 0.8 };

// Mints a short-lived LiveAvatar session token server-side. LIVEAVATAR_API_KEY
// is a secret that must never reach the browser — this route is the only
// place it's read, and only a session_token (already scoped to one session)
// is returned to the client.
export async function POST(req: Request) {
  const apiKey = process.env.LIVEAVATAR_API_KEY;
  const avatarId = process.env.LIVEAVATAR_AVATAR_ID;
  const llmConfigId = process.env.LIVEAVATAR_LLM_CONFIG_ID;
  const contextId = process.env.LIVEAVATAR_CONTEXT_ID;
  const urduVoiceAgentId = process.env.LIVEAVATAR_URDU_VOICE_AGENT_ID;

  if (!apiKey || !avatarId) {
    return NextResponse.json(
      { error: "LiveAvatar is not configured on the server." },
      { status: 500 }
    );
  }

  let uiLang = "en";
  try {
    const body = await req.json();
    if (typeof body?.lang === "string") uiLang = body.lang;
  } catch {
    /* no body sent — keep the English default */
  }

  /* Urdu gets a genuinely different backend, not a language flag on the
   * same setup: a separate voice_agent (an ElevenLabs-hosted Conversational
   * Agent, configured — voice, language, its own system prompt — entirely
   * on ElevenLabs' side, referenced here only by id) bolted onto the same
   * Katya avatar. `mode` must be omitted for this shape — LiveAvatar
   * derives FULL/LITE from the referenced agent's own type and rejects an
   * explicit "FULL" for an elevenlabs_agent (400). */
  const useUrduVoiceAgent = uiLang === "ur" && !!urduVoiceAgentId;

  // FULL mode (LiveAvatar's own LLM config + context) lets the English
  // avatar hold an open-ended, natural conversation instead of just
  // repeating text we feed it. Falls back to the original LITE/repeat()
  // mode if those aren't configured.
  const useFullMode = !!llmConfigId && !!contextId;

  const body = useUrduVoiceAgent
    ? {
        avatar_id: avatarId,
        voice_agent: { id: urduVoiceAgentId },
      }
    : useFullMode
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
        };

  const res = await fetch("https://api.liveavatar.com/v1/sessions/token", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: "Failed to create LiveAvatar session token", detail },
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

  return NextResponse.json({
    sessionToken,
    mode: useUrduVoiceAgent ? "URDU_VOICE_AGENT" : useFullMode ? "FULL" : "LITE",
  });
}
