import { createHash } from "crypto";

// A single shared password gates the whole site — not a per-user account
// system, just "anyone who has the password can get in." Kept in an env
// var (with this literal as the fallback default) rather than only in
// source, so it can be rotated in Vercel without a code change.
const SITE_PASSWORD = process.env.SITE_PASSWORD ?? "testdialogpay";

export const SITE_AUTH_COOKIE = "site_auth";

export function isCorrectPassword(candidate: unknown): boolean {
  return typeof candidate === "string" && candidate === SITE_PASSWORD;
}

/** The cookie never stores the password itself — just a hash of it, so a
 *  visitor who never actually knew the password can't just invent a
 *  plausible-looking cookie value (e.g. "authenticated=true") in devtools
 *  and skip the gate entirely. Deterministic (no per-session secret) is
 *  fine here: the threat this defends against is "never entered the
 *  password at all," not "entered it once and is now remembered." */
export function expectedAuthToken(): string {
  return createHash("sha256").update(`dialogpay-site-gate:${SITE_PASSWORD}`).digest("hex");
}
