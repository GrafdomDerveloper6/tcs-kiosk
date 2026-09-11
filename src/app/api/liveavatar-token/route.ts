import { NextResponse } from "next/server";

// Both languages now run on their own ElevenLabs-hosted Conversational
// Agent (voice, language, system prompt — all configured on ElevenLabs'
// own side), bolted onto the same Katya avatar. LiveAvatar's own FULL-mode
// pipeline (context_id + llm_configuration_id + voice_settings) — what
// English used to run on — is kept below only as a fallback for if either
// agent id is ever unset; the two rejected Hindi-language-flag attempts on
// that path are why it's not used for Urdu, and it's no longer used for
// English either now that English has its own dedicated agent too.
const SESSION_LANGUAGE = "en";
const VOICE_SETTINGS = { provider: "elevenLabs" as const, speed: 0.8 };

const VOICE_AGENT_ID_BY_UI_LANG: Record<string, string | undefined> = {
  en: process.env.LIVEAVATAR_ENGLISH_VOICE_AGENT_ID,
  ur: process.env.LIVEAVATAR_URDU_VOICE_AGENT_ID,
};

// Mints a short-lived LiveAvatar session token server-side. LIVEAVATAR_API_KEY
// is a secret that must never reach the browser — this route is the only
// place it's read, and only a session_token (already scoped to one session)
// is returned to the client.
export async function POST(req: Request) {
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

  let uiLang = "en";
  try {
    const body = await req.json();
    if (typeof body?.lang === "string") uiLang = body.lang;
  } catch {
    /* no body sent — keep the English default */
  }

  /* `mode` must be omitted for a voice_agent reference — LiveAvatar derives
   * FULL/LITE from the referenced agent's own type and rejects an explicit
   * "FULL" for an elevenlabs_agent (400). avatar_persona and voice_agent
   * are mutually exclusive on this schema. */
  const voiceAgentId = VOICE_AGENT_ID_BY_UI_LANG[uiLang];
  const useVoiceAgent = !!voiceAgentId;
  const useFullMode = !useVoiceAgent && !!llmConfigId && !!contextId;

  const body = useVoiceAgent
    ? {
        avatar_id: avatarId,
        voice_agent: { id: voiceAgentId },
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
    mode: useVoiceAgent ? "VOICE_AGENT" : useFullMode ? "FULL" : "LITE",
  });
}
