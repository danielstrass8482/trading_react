"use client";

import { useState } from "react";
import { login } from "@/lib/auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      window.location.href = "/";
    } catch {
      setError("E-Mail oder Passwort falsch.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-app px-4">
      <div className="w-full max-w-sm bg-bg-card border border-gold/40 rounded-card px-8 py-10">
        <div className="text-xl font-semibold text-gold mb-1 text-center">AI Trading Bot</div>
        <p className="text-sm text-text-muted text-center mb-8">Anmelden, um fortzufahren</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
              E-Mail
            </label>
            <input
              type="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-bg-app border border-border rounded-btn px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-text-muted mb-1.5">
              Passwort
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-bg-app border border-border rounded-btn px-3 py-2 text-sm focus:border-gold focus:outline-none"
            />
          </div>

          {error && <div className="text-sm text-loss">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold text-bg-app font-medium text-sm px-4 py-2.5 rounded-btn disabled:opacity-40 mt-2"
          >
            {loading ? "Anmelden…" : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  );
}
