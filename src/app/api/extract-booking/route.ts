import { NextResponse } from "next/server";

type TranscriptTurn = { role: "user" | "avatar"; text: string };

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

Leave any field not yet mentioned as null. Never guess or invent values that weren't actually said. There's no "is this all done and confirmed" judgment call to make here — the app itself decides when to move on based on which fields are filled in, not on anything you return.`;

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
    return NextResponse.json(JSON.parse(content));
  } catch {
    return NextResponse.json({ error: "Extraction result was not valid JSON" }, { status: 502 });
  }
}
