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

export const logout = async () => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("user");
  }
  window.location.href = "/login";
};

export const getUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;
  const u = sessionStorage.getItem("user");
  return u ? JSON.parse(u) : null;
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
