import { useSyncExternalStore } from "react";

export type AuthUser = { id: number; name: string; email: string | null; rolle: string };

// Der JWT liegt seit Security Schritt 2 NUR noch in einem HttpOnly-Cookie, das
// der Server (api.py: /api/auth/login) setzt – JavaScript kann darauf nicht
// zugreifen (XSS-Schutz), der Browser schickt es bei credentials:'include'
// automatisch mit. sessionStorage hält lediglich die (nicht-sensitive)
// User-Anzeige (Name/Rolle) fürs sofortige Rendern, kein Token mehr.
export const login = async (email: string, password: string): Promise<AuthUser> => {
  const formData = new FormData();
  formData.append("username", email);
  formData.append("password", password);

  const res = await fetch("/api/auth/login", {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Login fehlgeschlagen");
  }
  const data = await res.json();
  if (typeof window !== "undefined") {
    sessionStorage.setItem("user", JSON.stringify(data.user));
  }
  return data.user;
};

export const register = async (
  name: string, email: string, password: string, reason: string
): Promise<void> => {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Registrierung fehlgeschlagen");
  }
};

export const logout = async () => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("user");
  }
  window.location.href = "/login";
};

// Cached auf den rohen sessionStorage-String: useAuthUser() (unten) übergibt
// getUser() direkt als useSyncExternalStore-getSnapshot – die muss bei
// unverändertem Zustand dieselbe Objekt-Referenz liefern, sonst hält React
// jeden Aufruf für eine neue Änderung ("getSnapshot should be cached",
// Endlosschleife). JSON.parse() bei jedem Aufruf hätte das verletzt.
let cachedUserRaw: string | null = null;
let cachedUser: AuthUser | null = null;

export const getUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("user");
  if (raw !== cachedUserRaw) {
    cachedUserRaw = raw;
    cachedUser = raw ? JSON.parse(raw) : null;
  }
  return cachedUser;
};

// Hydration-sicherer Ersatz für `getUser()?.rolle === "admin"` (identisches
// Pattern wie portfolio_react/src/lib/auth.ts – gleicher rolle-Claim, gleiche
// portfolio_os-Quelle). Owner-only-Backend-Endpoints (require_owner() in
// trading_api.py, siehe z.B. /api/capital-allocations, /api/bot-config/preset)
// gelten nur für Daniel (DEFAULT_USER_ID) – dessen Account hat "admin" als
// rolle. Wird genutzt, um Trading-Bot-Kontrollen, die für andere eingeloggte
// Nutzer ohnehin serverseitig mit 403 abgelehnt werden, im UI gar nicht erst
// als (scheinbar funktionierende) Editier-Oberfläche anzuzeigen.
const noopSubscribe = () => () => {};
export const useIsAdmin = (): boolean =>
  useSyncExternalStore(
    noopSubscribe,
    () => getUser()?.rolle === "admin",
    () => false
  );

// Zeigt an, welcher Account gerade eingeloggt ist (Sidebar, in der Nähe von
// "Abmelden") – gleiches hydration-sicheres useSyncExternalStore-Pattern wie
// useIsAdmin, da sessionStorage erst nach der Hydration verfügbar ist.
export const useAuthUser = (): AuthUser | null =>
  useSyncExternalStore(
    noopSubscribe,
    getUser,
    () => null
  );

// Fragt den Server statt ein (mittlerweile nicht mehr existentes) lokales
// Token zu prüfen – das Cookie ist für JS ohnehin unsichtbar (HttpOnly).
export const isLoggedIn = async (): Promise<boolean> => {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
};
