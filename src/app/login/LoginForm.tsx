"use client";

import { useState } from "react";
import { CheckCircle, Eye, EyeOff } from "lucide-react";
import { login, register } from "@/lib/auth";

type Tab = "anmelden" | "registrieren";

function PasswordInput({
  value,
  onChange,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-gold"
      >
        {visible ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
      </button>
    </div>
  );
}

export default function LoginForm() {
  const [tab, setTab] = useState<Tab>("anmelden");

  // Anmelden
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Registrieren
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPasswordRepeat, setRegPasswordRepeat] = useState("");
  const [regReason, setRegReason] = useState("");
  const [regError, setRegError] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "E-Mail oder Passwort falsch.");
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError(null);

    if (regPassword.length < 8) {
      setRegError("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (regPassword !== regPasswordRepeat) {
      setRegError("Passwörter stimmen nicht überein.");
      return;
    }

    setRegLoading(true);
    try {
      await register(regName, regEmail, regPassword, regReason);
      setRegSuccess(true);
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Registrierung fehlgeschlagen.");
    } finally {
      setRegLoading(false);
    }
  }

  const inputCls =
    "w-full bg-bg-app border border-border rounded-btn px-3 py-2 text-sm focus:border-gold focus:outline-none";
  const labelCls = "block text-xs uppercase tracking-wider text-text-muted mb-1.5";

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-app px-4">
      <div className="w-full max-w-sm bg-bg-card border border-gold/40 rounded-card px-8 py-10">
        <div className="text-xl font-semibold text-gold mb-1 text-center">AI Trading Bot</div>
        <p className="text-sm text-text-muted text-center mb-6">
          {tab === "anmelden" ? "Anmelden, um fortzufahren" : "Neuen Zugang beantragen"}
        </p>

        <div className="flex border-b border-border mb-6">
          <button
            onClick={() => setTab("anmelden")}
            className={`flex-1 pb-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "anmelden" ? "border-gold text-gold" : "border-transparent text-text-muted"
            }`}
          >
            Anmelden
          </button>
          <button
            onClick={() => setTab("registrieren")}
            className={`flex-1 pb-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "registrieren" ? "border-gold text-gold" : "border-transparent text-text-muted"
            }`}
          >
            Registrieren
          </button>
        </div>

        {tab === "anmelden" ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>E-Mail</label>
              <input
                type="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Passwort</label>
              <PasswordInput
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
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
        ) : regSuccess ? (
          <div className="text-sm text-gain bg-gain/10 border border-gain/30 rounded-btn px-4 py-3 flex items-start gap-2">
            <CheckCircle size={16} strokeWidth={1.5} className="shrink-0 mt-0.5" />
            <span>
              Registrierung erfolgreich!<br />
              Du wirst per E-Mail benachrichtigt sobald dein Zugang freigeschaltet wurde.
            </span>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className={labelCls}>Name</label>
              <input
                type="text"
                required
                autoFocus
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>E-Mail</label>
              <input
                type="email"
                required
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Passwort (mind. 8 Zeichen)</label>
              <PasswordInput
                required
                minLength={8}
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Passwort wiederholen</label>
              <PasswordInput
                required
                value={regPasswordRepeat}
                onChange={(e) => setRegPasswordRepeat(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Warum möchtest du den Bot nutzen? (optional)</label>
              <textarea
                value={regReason}
                onChange={(e) => setRegReason(e.target.value)}
                rows={3}
                className={inputCls}
              />
            </div>

            {regError && <div className="text-sm text-loss">{regError}</div>}

            <button
              type="submit"
              disabled={regLoading}
              className="w-full bg-gold text-bg-app font-medium text-sm px-4 py-2.5 rounded-btn disabled:opacity-40 mt-2"
            >
              {regLoading ? "Registriere…" : "Registrieren"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
