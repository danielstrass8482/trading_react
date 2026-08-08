"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle, AlertTriangle, HelpCircle } from "lucide-react";
import { api, AlpacaConnectResponse } from "@/lib/api";
import AlpacaOnboardingGuide from "./AlpacaOnboardingGuide";

type Mode = "paper" | "live";
type DialogContext = "onboarding" | "manage";

const inputCls = "w-full bg-bg-app border border-border rounded-btn px-3 py-2 text-sm focus:border-gold focus:outline-none";
const labelCls = "block text-xs uppercase tracking-wider text-text-muted mb-1.5";

// Ruft NICHT queryClient.invalidateQueries(["alpaca-status"]) im onSuccess auf:
// das würde den Elterndialog sofort schließen, bevor der Nutzer die
// Erfolgsmeldung ("✅ Verbunden! Kontostand: $X") überhaupt lesen konnte.
// Stattdessen schließt erst der explizite Klick auf den CTA-Button
// (onConnected) den Dialog; der jeweilige Aufrufer (AlpacaOnboarding.tsx /
// Einstellungen.tsx) invalidiert den Status danach selbst.
function ConnectForm({
  mode, onConnected, successCtaLabel,
}: { mode: Mode; onConnected: () => void; successCtaLabel: string }) {
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AlpacaConnectResponse["account"] | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const connectMutation = useMutation({
    mutationFn: () =>
      api.post<AlpacaConnectResponse>("/api/user/alpaca-connect", {
        api_key: apiKey, secret_key: secretKey, mode,
      }).then((r) => r.data),
    onSuccess: (data) => {
      setError(null);
      setResult(data.account);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "Verbindung fehlgeschlagen");
    },
  });

  const canSubmit = apiKey.trim() && secretKey.trim() && (mode === "paper" || confirmed);

  if (result) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-gain bg-gain/10 border border-gain/30 rounded-btn px-4 py-3 flex items-center gap-2">
          <CheckCircle size={16} strokeWidth={1.5} className="shrink-0" />
          Verbindung erfolgreich getestet. Kontostand: ${result.cash.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
        </div>
        <div className="text-sm text-gain bg-gain/10 border border-gain/30 rounded-btn px-4 py-3 flex items-start gap-2">
          <CheckCircle size={16} strokeWidth={1.5} className="shrink-0 mt-0.5" />
          <span>
            Ab dem nächsten Entry-Zyklus handelt der Bot automatisch auf diesem Konto — dein
            tatsächlich verfügbares Kapital ist dabei die harte Obergrenze pro Trade.
          </span>
        </div>
        <button
          onClick={onConnected}
          className="w-full bg-gold text-bg-app font-medium text-sm px-4 py-2.5 rounded-btn"
        >
          {successCtaLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mode === "paper" ? (
        <p className="text-xs text-text-muted bg-bg-app border border-border rounded-btn px-3 py-2">
          Empfohlen zum Testen – kein echtes Geld.
        </p>
      ) : (
        <p className="text-xs text-loss bg-loss/10 border border-loss/30 rounded-btn px-3 py-2 flex items-center gap-1.5">
          <AlertTriangle size={14} strokeWidth={1.5} className="shrink-0" /> Echtes Geld – nur für erfahrene Anleger.
        </p>
      )}

      <div>
        <label className={labelCls}>API Key</label>
        <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Secret Key</label>
        <input
          type="password"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          className={inputCls}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="flex items-center gap-1.5 text-xs text-gold hover:underline"
      >
        <HelpCircle size={13} strokeWidth={1.5} />
        Wo finde ich meinen API-Key?
      </button>

      {mode === "live" && (
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          Ich verstehe dass ich echtes Geld riskiere
        </label>
      )}

      {error && <div className="text-sm text-loss">{error}</div>}

      <button
        onClick={() => connectMutation.mutate()}
        disabled={!canSubmit || connectMutation.isPending}
        className="w-full bg-gold text-bg-app font-medium text-sm px-4 py-2.5 rounded-btn disabled:opacity-40"
      >
        {connectMutation.isPending ? "Verbinde…" : "Verbinden und testen"}
      </button>

      {showGuide && <AlpacaOnboardingGuide onClose={() => setShowGuide(false)} />}
    </div>
  );
}

export default function AlpacaConnectDialog({
  onClose, context = "onboarding", initialMode = "paper",
}: { onClose: () => void; context?: DialogContext; initialMode?: Mode }) {
  const [tab, setTab] = useState<Mode>(initialMode);

  const title = context === "manage" ? "Alpaca-Verbindung verwalten" : "Verbinde deinen Alpaca Account";
  const subtitle = context === "manage"
    ? "Aktualisiere deine Zugangsdaten oder wechsle zwischen Paper und Live Trading."
    : "Ohne Verbindung kann der Bot keine Trades für dich platzieren.";
  const dismissLabel = context === "manage" ? "Schließen" : "Später einrichten";
  const successCtaLabel = context === "manage" ? "Fertig" : "Weiter zum Dashboard";

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 px-4 py-8">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-bg-card border border-gold/40 rounded-card px-5 py-6 sm:px-8 sm:py-8">
        <div className="text-lg font-semibold text-gold mb-1 text-center">{title}</div>
        <p className="text-sm text-text-muted text-center mb-6">{subtitle}</p>

        <div className="flex border-b border-border mb-6">
          <button
            onClick={() => setTab("paper")}
            className={`flex-1 pb-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "paper" ? "border-gold text-gold" : "border-transparent text-text-muted"
            }`}
          >
            Paper Trading
          </button>
          <button
            onClick={() => setTab("live")}
            className={`flex-1 pb-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "live" ? "border-gold text-gold" : "border-transparent text-text-muted"
            }`}
          >
            Live Trading
          </button>
        </div>

        <ConnectForm key={tab} mode={tab} onConnected={onClose} successCtaLabel={successCtaLabel} />

        <button
          onClick={onClose}
          className="w-full text-center text-xs text-text-muted hover:underline mt-4"
        >
          {dismissLabel}
        </button>
      </div>
    </div>
  );
}
