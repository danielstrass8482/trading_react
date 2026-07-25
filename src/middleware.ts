import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cookie-basierte Auth-Prüfung (siehe lib/auth.ts) – prüft nur ob das Cookie
// vorhanden ist (Redirect-UX), die eigentliche Gültigkeitsprüfung des JWT
// passiert serverseitig in api.py: get_current_user().
export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isPublic =
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname === "/favicon.ico" ||
    request.nextUrl.pathname.startsWith("/api/");

  if (isPublic) return NextResponse.next();

  if (!token && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (token && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
