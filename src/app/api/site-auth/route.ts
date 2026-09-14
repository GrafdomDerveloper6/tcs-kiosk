import { NextResponse } from "next/server";
import { expectedAuthToken, isCorrectPassword, SITE_AUTH_COOKIE } from "@/lib/site-auth";

export async function POST(req: Request) {
  let password: unknown;
  try {
    ({ password } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!isCorrectPassword(password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SITE_AUTH_COOKIE, expectedAuthToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — a shared demo password isn't worth re-typing every session
  });
  return res;
}
