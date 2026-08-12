"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, Eye, EyeOff, XCircle } from "lucide-react";
import { resetPassword } from "@/lib/auth";

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

export default function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const inputCls =
    "w-full bg-bg-app border border-border rounded-btn px-3 py-2 text-sm focus:border-gold focus:outline-none";
  const labelCls = "block text-xs uppercase tracking-wider text-text-muted mb-1.5";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (password !== passwordRepeat) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      // Bewusst dieselbe, nicht-spezifische Meldung wie beim fehlenden Token
      // unten (siehe Aufgabe: keine Details, die verraten könnten, ob ein
      // Token grundsätzlich existiert hat) - resetPassword() wirft ohnehin
      // "Link ungültig oder abgelaufen." als Default aus dem Backend-detail.
      setError(err instanceof Error ? err.message : "Link ungültig oder abgelaufen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-app px-4">
      <div className="w-full max-w-sm bg-bg-card border border-gold/40 rounded-card px-8 py-10">
        <div className="text-xl font-semibold text-gold mb-1 text-center">AI Trading Bot</div>
        <p className="text-sm text-text-muted text-center mb-6">Neues Passwort setzen</p>

        {!token ? (
          <div className="space-y-4">
            <div className="text-sm text-loss bg-loss/10 border border-loss/30 rounded-btn px-4 py-3 flex items-start gap-2">
              <XCircle size={16} strokeWidth={1.5} className="shrink-0 mt-0.5" />
              <span>Link ungültig oder abgelaufen. Fordere über die Login-Seite einen neuen an.</span>
            </div>
            <a
              href="/login"
              className="block w-full text-center bg-gold text-bg-app font-medium text-sm px-4 py-2.5 rounded-btn"
            >
              Zur Login-Seite
            </a>
          </div>
        ) : success ? (
          <div className="space-y-4">
            <div className="text-sm text-gain bg-gain/10 border border-gain/30 rounded-btn px-4 py-3 flex items-start gap-2">
              <CheckCircle size={16} strokeWidth={1.5} className="shrink-0 mt-0.5" />
              <span>Passwort erfolgreich geändert. Du kannst dich jetzt einloggen.</span>
            </div>
            <a
              href="/login"
              className="block w-full text-center bg-gold text-bg-app font-medium text-sm px-4 py-2.5 rounded-btn"
            >
              Zur Login-Seite
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={labelCls}>Neues Passwort (mind. 8 Zeichen)</label>
              <PasswordInput
                required
                minLength={8}
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Passwort wiederholen</label>
              <PasswordInput
                required
                value={passwordRepeat}
                onChange={(e) => setPasswordRepeat(e.target.value)}
                className={inputCls}
              />
            </div>

            {error && <div className="text-sm text-loss">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold text-bg-app font-medium text-sm px-4 py-2.5 rounded-btn disabled:opacity-40 mt-2"
            >
              {loading ? "Speichere…" : "Passwort setzen"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
