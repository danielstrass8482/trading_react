import { useEffect, useSyncExternalStore } from "react";

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

// Kleines Pub/Sub, damit useIsAdmin()/useAuthUser() (unten) nach dem asynchronen
// /api/auth/me-Fallback einen Re-Render auslösen kann – ein reiner
// sessionStorage-Read wie bei useIsAdmin meldet sich sonst nie von selbst.
const userSubscribers = new Set<() => void>();
const subscribeUser = (cb: () => void) => {
  userSubscribers.add(cb);
  return () => userSubscribers.delete(cb);
};
const notifyUser = () => userSubscribers.forEach((cb) => cb());

// Fallback für frische Tabs: das HttpOnly-Cookie gilt weiter (wird automatisch
// mitgeschickt, Login bleibt gültig), aber sessionStorage ist PRO TAB isoliert
// – öffnet man die App in einem komplett neuen Tab (URL direkt eingetippt
// oder Lesezeichen, nicht per Link/window.open aus einem bereits eingeloggten
// Tab), ist es dort leer und die Namens-/E-Mail-Anzeige hätte sonst nichts zu
// zeigen. Holt die Nutzerdaten dann einmalig über denselben /api/auth/me-
// Endpoint nach, den auch isLoggedIn() schon nutzt, und cached sie wie ein
// normaler Login-Vorgang in sessionStorage – kein wiederholter Call bei
// künftigen Re-Renders/Navigationen in diesem Tab, da getUser() danach den
// gecachten Wert liefert.
let fetchInFlight: Promise<void> | null = null;
const ensureUserLoaded = () => {
  if (typeof window === "undefined" || getUser() || fetchInFlight) return;
  fetchInFlight = fetch("/api/auth/me", { credentials: "include" })
    .then((res) => (res.ok ? res.json() : null))
    .then((user: AuthUser | null) => {
      if (user) {
        sessionStorage.setItem("user", JSON.stringify(user));
        notifyUser();
      }
    })
    .catch(() => {})
    .finally(() => {
      fetchInFlight = null;
    });
};

// Hydration-sicherer Ersatz für `getUser()?.rolle === "admin"` (identisches
// Pattern wie portfolio_react/src/lib/auth.ts – gleicher rolle-Claim, gleiche
// portfolio_os-Quelle). Owner-only-Backend-Endpoints (require_owner() in
// trading_api.py, siehe z.B. /api/capital-allocations, /api/bot-config/preset)
// gelten nur für Daniel (DEFAULT_USER_ID) – dessen Account hat "admin" als
// rolle. Wird genutzt, um Trading-Bot-Kontrollen, die für andere eingeloggte
// Nutzer ohnehin serverseitig mit 403 abgelehnt werden, im UI gar nicht erst
// als (scheinbar funktionierende) Editier-Oberfläche anzuzeigen – reine
// UI-Sichtbarkeit, keine Autorisierungsgrenze (siehe require_owner() serverseitig).
// Gleicher Subscribe + einmaliger Nachlade-Fallback wie useAuthUser (unten):
// in einem frischen Tab (URL eingetippt/Lesezeichen) ist die Rolle sonst bis
// zum nächsten vollen Login unbekannt und admin-gated UI würde kurzzeitig
// fälschlich als "nicht-admin" gerendert (reines UX-Problem, siehe Audit
// oben – kein Fall, in dem ein Nicht-Admin dadurch Admin-UI zu sehen bekäme,
// da der Default hier ohnehin false ist).
export const useIsAdmin = (): boolean => {
  const isAdmin = useSyncExternalStore(subscribeUser, () => getUser()?.rolle === "admin", () => false);
  useEffect(() => {
    ensureUserLoaded();
  }, []);
  return isAdmin;
};

// Zeigt an, welcher Account gerade eingeloggt ist (Sidebar, in der Nähe von
// "Abmelden") – hydration-sicheres useSyncExternalStore-Pattern wie
// useIsAdmin (sessionStorage erst nach der Hydration verfügbar), zusätzlich
// mit echtem Subscribe + einmaligem Nachlade-Fallback für frische Tabs.
export const useAuthUser = (): AuthUser | null => {
  const user = useSyncExternalStore(subscribeUser, getUser, () => null);
  useEffect(() => {
    ensureUserLoaded();
  }, []);
  return user;
};

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
