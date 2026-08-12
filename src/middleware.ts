import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cookie-basierte Auth-Prüfung (siehe lib/auth.ts) – prüft nur ob das Cookie
// vorhanden ist (Redirect-UX), die eigentliche Gültigkeitsprüfung des JWT
// passiert serverseitig in api.py: get_current_user().
export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const isLoginPage = request.nextUrl.pathname === "/login";
  // Passwort-vergessen-Link kommt per E-Mail an einen ausgeloggten Nutzer -
  // muss erreichbar sein, ohne dass die Redirect-Logik unten sie wie eine
  // normale geschützte Seite behandelt (kein Cookie -> Redirect zu /login,
  // Ziel-Token in der URL wäre dabei verloren gegangen). Bewusst NICHT wie
  // isLoginPage von "token vorhanden -> weg von hier"-Redirect betroffen
  // (siehe unten) - ein bereits eingeloggter Nutzer darf sein Passwort
  // trotzdem zurücksetzen (z.B. bei Verdacht auf ein kompromittiertes Konto).
  const isResetPasswordPage = request.nextUrl.pathname === "/reset-password";
  const isPublic =
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname === "/favicon.ico" ||
    request.nextUrl.pathname.startsWith("/api/") ||
    isResetPasswordPage;

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
