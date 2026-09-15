import { NextResponse } from "next/server";

type TranscriptTurn = { role: "user" | "avatar"; text: string };

// Kept in sync with the "CITIES" instruction both voice agents' own
// prompts were given (see feedback_liveavatar_language memory) — this demo
// is scoped to these eight, so a code-level snap-to-nearest is a cheap,
// deterministic safety net under whatever the model does with the same
// instruction, not a replacement for it.
const KNOWN_CITIES = [
  "Karachi",
  "Lahore",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Multan",
  "Peshawar",
  "Quetta",
];

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Snaps a spoken city to the closest of the eight this demo expects,
 *  within a small edit-distance budget — insurance against STT mishearing
 *  "Faisalabad" as something close-but-not-quite. A value that isn't
 *  actually close to any of them (a genuinely different word, or noise) is
 *  left exactly as extracted rather than forced into the wrong city. */
function normalizeCity(raw: string | null): string | null {
  if (!raw?.trim()) return raw;
  const lower = raw.trim().toLowerCase();
  let best = KNOWN_CITIES[0];
  let bestDist = Infinity;
  for (const city of KNOWN_CITIES) {
    const dist = levenshtein(lower, city.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      best = city;
    }
  }
  // Roughly one forgiven edit per 3 characters, so "Multan" isn't as
  // forgiving as "Rawalpindi" — both scale with how much can go wrong.
  const budget = Math.max(1, Math.round(best.length / 3));
  return bestDist <= budget ? best : raw;
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    deliveryType: { type: ["string", "null"], enum: ["document", "parcel", null] },
    pickupName: { type: ["string", "null"] },
    pickupPhone: { type: ["string", "null"] },
    pickupStreet: { type: ["string", "null"] },
    pickupCity: { type: ["string", "null"] },
    dropoffName: { type: ["string", "null"] },
    dropoffPhone: { type: ["string", "null"] },
    dropoffStreet: { type: ["string", "null"] },
    dropoffCity: { type: ["string", "null"] },
    speed: { type: ["string", "null"], enum: ["standard", "express", null] },
  },
  required: [
    "deliveryType",
    "pickupName",
    "pickupPhone",
    "pickupStreet",
    "pickupCity",
    "dropoffName",
    "dropoffPhone",
    "dropoffStreet",
    "dropoffCity",
    "speed",
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are a data-extraction assistant. You'll be given the transcript of a spoken conversation between "Sana", a TCS courier voice assistant, and a customer who is booking a new delivery.

Extract whatever booking fields they've mentioned so far: deliveryType (document or parcel), pickupName, pickupPhone, pickupStreet, pickupCity, dropoffName, dropoffPhone, dropoffStreet, dropoffCity, speed (standard or express).

deliveryType and speed are chosen by tapping the screen on later steps rather than by voice, so Sana won't ask about them — only fill them in on the off-chance the customer volunteers them unprompted.

Leave any field not yet mentioned as null. Never guess or invent values that weren't actually said. There's no "is this all done and confirmed" judgment call to make here — the app itself decides when to move on based on which fields are filled in, not on anything you return.

CRITICAL — every text field (pickupName, pickupStreet, pickupCity, dropoffName, dropoffStreet, dropoffCity) must always be written in English/Roman script, no matter what language the conversation is in. The conversation may well be in Urdu — the customer might say their name, street or city in Urdu script or speech. Transliterate it into English regardless: "احمد خان" becomes "Ahmed Khan", "لاہور" becomes "Lahore", "گلبرگ" becomes "Gulberg", and so on. Never output Urdu script (or any non-Latin script) into a field — the on-screen form is English-labelled and must display Latin characters only. Phone numbers are just digits either way.

CRITICAL — SENDER VS RECIPIENT: pickup fields (pickupName, pickupPhone, pickupStreet, pickupCity) belong to whoever is SENDING the item; dropoff fields (dropoffName, ...) belong to whoever is RECEIVING it. Sana always asks for pickup's four details FIRST, in full, before ever asking about dropoff — so the FIRST name/phone/street/city given in the conversation are always pickup's, and only a name/phone/street/city that comes after all four pickup fields are already known (or that Sana's own question explicitly frames as "recipient" / "delivery" / "who is this going to") belongs to dropoff. Speech-to-text can occasionally merge two consecutive answers into one transcript line (e.g. a city and the start of the next answer running together) — when a line looks like it contains two different pieces of information, use which pickup/dropoff fields are already filled and what Sana's own preceding question was asking for to decide the split, rather than guessing from word order alone. Once a field already has a confident value from earlier in the transcript, do not silently swap it for a different value found later unless the customer clearly restates or corrects that exact field themselves (e.g. "actually, my name is X, not Y") — a second, different-looking name appearing later in the transcript almost always means a NEW field (the other side's name) was just given, not that the first one was wrong.

For this demo, pickupCity and dropoffCity will only ever be one of: Karachi, Lahore, Islamabad, Rawalpindi, Faisalabad, Multan, Peshawar, or Quetta. If what was said is a close phonetic match to one of these (a likely mishearing rather than a genuinely different word), output the correct spelling from this list rather than whatever exact fragment the transcript shows.`;

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI is not configured on the server." }, { status: 500 });
  }

  let transcript: TranscriptTurn[];
  try {
    const body = await req.json();
    transcript = body.transcript;
    if (!Array.isArray(transcript)) throw new Error("transcript must be an array");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const transcriptText = transcript
    .map((t) => `${t.role === "user" ? "Customer" : "Sana"}: ${t.text}`)
    .join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcriptText || "(no conversation yet)" },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "booking_extraction", strict: true, schema: EXTRACTION_SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: "Extraction failed", detail }, { status: 502 });
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: "No extraction result returned" }, { status: 502 });
  }

  try {
    const extraction = JSON.parse(content);
    extraction.pickupCity = normalizeCity(extraction.pickupCity);
    extraction.dropoffCity = normalizeCity(extraction.dropoffCity);
    return NextResponse.json(extraction);
  } catch {
    return NextResponse.json({ error: "Extraction result was not valid JSON" }, { status: 502 });
  }
}
