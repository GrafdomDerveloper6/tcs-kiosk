import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { expectedAuthToken, SITE_AUTH_COOKIE } from "@/lib/site-auth";

// Site-wide password gate — runs before every route except the login page
// itself, its API, and static assets (excluding those is what the matcher
// below is for; proxy runs on literally everything otherwise, including
// _next/static, and would otherwise block the login page's own JS/CSS).
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SITE_AUTH_COOKIE)?.value;
  if (token === expectedAuthToken()) return NextResponse.next();

  const url = new URL("/site-login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api/site-auth|site-login|_next/static|_next/image|favicon.ico).*)"],
};
