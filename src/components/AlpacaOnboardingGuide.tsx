"use client";

import { X, RefreshCw } from "lucide-react";

const steps = [
  {
    title: "Im Bot: „Verbinde deinen Alpaca Account“ öffnen",
    text: (
      <>
        Hier trägst du am Ende <strong className="text-text-primary">API Key</strong> und{" "}
        <strong className="text-text-primary">Secret Key</strong> ein. Wechsle oben auf den Tab{" "}
        <strong className="text-text-primary">Live Trading</strong>, falls du mit echtem Geld
        handeln willst — beide Werte brauchst du erst aus Alpaca (nächste Schritte).
      </>
    ),
    img: "/onboarding/inapp-screen.png",
    caption: "Trading-Bot-Dashboard → Alpaca verbinden",
    note: null as React.ReactNode | null,
  },
  {
    title: "Bei Alpaca ins Live-Konto wechseln",
    text: (
      <>
        Logge dich auf <strong className="text-text-primary">alpaca.markets</strong> ein und öffne
        oben links den Konto-Umschalter. Falls dort noch{" "}
        <strong className="text-text-primary">Paper Trading</strong> aktiv ist, wähle unter{" "}
        <strong className="text-text-primary">Live Account</strong> dein Brokerage-Konto
        (Individual Trading) aus.
      </>
    ),
    img: "/onboarding/switch-to-live-account.png",
    caption: "Alpaca Dashboard → Konto-Umschalter oben links",
    note: "Nur relevant, wenn du wirklich mit echtem Geld handeln willst. Für Paper Trading bleibst du im Paper-Konto und überspringst diesen Schritt.",
  },
  {
    title: "API Keys im Alpaca-Dashboard finden",
    text: (
      <>
        Auf der Übersichtsseite deines Kontos findest du unten rechts den Bereich{" "}
        <strong className="text-text-primary">API Keys</strong>.
      </>
    ),
    img: "/onboarding/overview-alpaca.png",
    caption: "Alpaca Dashboard → Übersicht, unten rechts",
    note: (
      <>
        Schon einmal einen Key erstellt und den Secret nicht mehr zur Hand? Klicke auf{" "}
        <code className="bg-bg-app border border-border rounded px-1 py-0.5 text-gold text-xs">
          Regenerate
        </code>{" "}
        — nur so wird der Secret Key erneut im Klartext angezeigt.
      </>
    ),
  },
  {
    title: "Key und Secret kopieren",
    text: (
      <>
        Nach dem Öffnen bzw. Regenerieren siehst du Key und Secret im Klartext. Kopiere beide
        Werte —{" "}
        <strong className="text-text-primary">
          der Secret verschwindet beim Neuladen der Seite und wird nicht erneut angezeigt.
        </strong>
      </>
    ),
    img: "/onboarding/api-keys-alpaca.png",
    caption: "Alpaca Dashboard → API Keys, aufgeklappt",
    note: (
      <>
        Zurück im Bot (Schritt 1): Key in das Feld{" "}
        <strong className="text-text-primary">API Key</strong>, Secret in das Feld{" "}
        <strong className="text-text-primary">Secret Key</strong> einfügen, Checkbox bestätigen
        (bei Live Trading) und auf <strong className="text-text-primary">Verbinden und testen</strong> klicken.
      </>
    ),
  },
];

export default function AlpacaOnboardingGuide({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/70 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] overflow-y-auto bg-bg-card border border-gold/40 rounded-card px-5 py-6 sm:px-8 sm:py-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <div className="text-lg font-semibold text-gold">Wo finde ich meinen API-Key?</div>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="shrink-0 text-text-muted hover:text-text-primary p-1 -m-1"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <p className="text-sm text-text-muted mb-8">
          Vier Schritte, um deinen Alpaca API-Schlüssel zu finden und hier einzutragen.
        </p>

        <div className="space-y-8 sm:space-y-10">
          {steps.map((step, i) => (
            <div key={i} className="relative pl-11 sm:pl-14">
              <div className="absolute left-0 top-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-gold/40 text-gold flex items-center justify-center text-sm font-semibold bg-bg-app">
                {i + 1}
              </div>
              <h3 className="text-sm font-medium text-text-primary mb-1.5">{step.title}</h3>
              <p className="text-sm text-text-muted mb-3 leading-relaxed">{step.text}</p>
              <div className="border border-border rounded-btn overflow-hidden bg-bg-app">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={step.img} alt={step.caption} className="block w-full h-auto" />
              </div>
              <div className="text-xs text-text-muted mt-2">{step.caption}</div>
              {step.note && (
                <div className="flex items-start gap-2 bg-bg-app border border-gold/30 rounded-btn px-3 py-2.5 mt-3 text-xs text-text-primary">
                  {i === 2 ? (
                    <RefreshCw size={13} strokeWidth={1.5} className="shrink-0 mt-0.5 text-gold" />
                  ) : (
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-gold mt-1.5" />
                  )}
                  <span>{step.note}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full bg-gold text-bg-app font-medium text-sm px-4 py-2.5 rounded-btn mt-8"
        >
          Verstanden, zurück zum Formular
        </button>
      </div>
    </div>
  );
}
