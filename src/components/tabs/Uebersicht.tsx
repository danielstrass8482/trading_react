"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, Bot } from "lucide-react";
import {
  api, Overview, SaxoOverview, CombinedOpenPosition, fromAlpacaOpenTrade, fromSaxoOpenTrade, ManualTrade, ActiveBudget,
} from "@/lib/api";
import KPICard from "@/components/ui/KPICard";
import { KPISkeletonRow, CardSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
import TickerLabel from "@/components/ui/TickerLabel";
import { fmtUsd, fmtUsdSigned, fmtMoney, fmtMoneySigned, fmtMenge, gainLossClass } from "@/lib/format";

const REGIME_LABEL: Record<string, { icon: typeof TrendingUp; label: string }> = {
  bullish: { icon: TrendingUp, label: "Bullish" },
  bearish: { icon: TrendingDown, label: "Bearish" },
  neutral: { icon: Minus, label: "Neutral" },
};

function brokerBadge(broker: string | null | undefined) {
  const b = (broker ?? "alpaca").toLowerCase();
  return (
    <span className={`text-[0.6rem] font-semibold px-1 py-0.5 rounded-btn ${b === "alpaca" ? "bg-gold/20 text-gold" : "bg-paper/20 text-paper"}`}>
      {b.toUpperCase()}
    </span>
  );
}

// Direkthandel-Kennzeichnung (Aufgabe "Direkthandel in Übersicht/Performance
// einbinden", 2026-08-14) - dieselbe visuelle Sprache wie das "DIREKT"-Badge
// in Performance.tsx (dort lokal definiert, hier bewusst dupliziert statt
// geteilt - beide Dateien pflegen ihre Badge-Helfer bereits jeweils lokal,
// siehe brokerBadge hier vs. brokerBadgeSmall dort).
function directBadge() {
  return (
    <span className="text-[0.6rem] font-semibold px-1 py-0.5 rounded-btn border border-text-muted/40 text-text-primary">
      DIREKT
    </span>
  );
}

// Time-Exit-Zustand (seit der Time-Exit-Familie für Saxo bei beiden Brokern
// gesetzt, siehe CombinedOpenPosition/trading_api.get_overview bzw.
// trading_api_saxo.get_overview). Drei klar unterscheidbare Zustände statt
// nur normal/überfällig: eine Position in laufender, gültiger Schutzfrist
// (time_exit_grace_active) ist NICHT überfällig, auch wenn sie die
// ursprüngliche MAX_HOLDING_DAYS-Grenze bereits überschritten hat – siehe
// broker.monitor_open_positions bzw. broker_saxo._check_time_exit
// Schutzfrist-Zweig. Bei Saxo von Anfang an grace-aware gebaut (bei Alpaca
// war das ein nachträglicher Fix, 2026-08-05, UPS-Befund).
type TimeExitState = "normal" | "grace" | "overdue" | null;

function timeExitState(t: CombinedOpenPosition): TimeExitState {
  if (t.time_exit_days_remaining === null) return null;
  if (t.time_exit_grace_active) return "grace";
  return t.time_exit_days_remaining < 0 ? "overdue" : "normal";
}

function timeExitLabel(t: CombinedOpenPosition): string | null {
  const state = timeExitState(t);
  if (state === null) return null;
  const days = t.time_exit_days_remaining!;
  if (state === "overdue") return "Time-Exit überfällig";
  if (state === "grace") {
    const deadline = t.time_exit_grace_deadline
      ? new Date(t.time_exit_grace_deadline).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "?";
    return `Schutzfrist bis ${deadline} (noch ${days} Handelstag${days === 1 ? "" : "e"})`;
  }
  const suffix = t.trailing_sl_active ? " (Trailing aktiv)" : "";
  return `Time-Exit in ${days} Handelstag${days === 1 ? "" : "en"}${suffix}`;
}

// Gold statt Rot/Grau für die Schutzfrist – dieselbe Signalfarbe wie bei
// "Trailing aktiv" (SL-Feld weiter unten): ein aktiver, adaptiver Schutz,
// kein Alarmzustand.
function timeExitColorClass(t: CombinedOpenPosition): string {
  const state = timeExitState(t);
  if (state === "overdue") return "text-loss font-medium";
  if (state === "grace") return "text-gold font-medium";
  return "text-text-muted";
}

// Zusätzliche Info-Anzeige des exakten Entry-Datums für Saxo-Positionen,
// ergänzend zum Time-Exit-Countdown oben (der zeigt nur die verbleibenden
// Handelstage, kein Datum).
function holdingDurationLabel(t: CombinedOpenPosition): string | null {
  if (t.broker !== "saxo") return null;
  const entryDate = new Date(t.created_at);
  const days = Math.floor((Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
  const dateStr = entryDate.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const durationStr = days <= 0 ? "heute" : `seit ${days} Tag${days === 1 ? "" : "en"}`;
  return `Gehalten ${durationStr} (Entry: ${dateStr})`;
}

function regimeSubtext(regime: string) {
  const entry = REGIME_LABEL[regime];
  if (!entry) return regime;
  const Icon = entry.icon;
  return (
    <span className="flex items-center gap-1">
      <Icon size={14} strokeWidth={1.5} /> {entry.label}
    </span>
  );
}

export default function Uebersicht() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["overview", "alpaca"],
    queryFn: () => api.get<Overview>("/api/overview").then((r) => r.data),
    refetchInterval: 60_000,
  });

  // Saxo ist bewusst NICHT Teil des Lade-/Fehler-Gates oben – fällt die
  // Saxo-API aus, degradiert die Ansicht auf die Alpaca-Daten (mit Hinweis)
  // statt komplett zu brechen, siehe saxoQuery.isError unten.
  const saxoQuery = useQuery({
    queryKey: ["overview", "saxo"],
    queryFn: () => api.get<SaxoOverview>("/api/saxo/overview").then((r) => r.data),
    refetchInterval: 60_000,
  });

  // Direkthandel (Aufgabe "Direkthandel in Übersicht/Performance einbinden",
  // 2026-08-14) - eigene, bewusst NICHT ins Lade-/Fehler-Gate oben
  // eingebundene Query, gleiches Degradations-Prinzip wie bei Saxo: fällt
  // dieser Endpoint aus, zeigt nur der eigene Direkthandel-Bereich unten
  // n/a statt die ganze Seite zu blockieren.
  const manualQuery = useQuery({
    queryKey: ["manual-trades"],
    queryFn: () => api.get<ManualTrade[]>("/api/active/manual-trades", { params: { limit: 50 } }).then((r) => r.data),
    refetchInterval: 60_000,
  });

  // Gleiche Degradations-Logik wie saxoQuery/manualQuery oben - "Verfügbares
  // Kapital" zeigt bei Fehler "n/a" statt die ganze Direkthandel-Zeile zu
  // blockieren. Liest /api/active/budget, das dieselbe Formel zurückgibt,
  // gegen die active_trading.buy() bereits vor jeder Order prüft (siehe
  // broker.get_active_trading_remaining_budget) - keine eigene Neuberechnung.
  const budgetQuery = useQuery({
    queryKey: ["active-budget"],
    queryFn: () => api.get<ActiveBudget>("/api/active/budget").then((r) => r.data),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <KPISkeletonRow />
        <CardSkeleton />
        <CardSkeleton className="h-40" />
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState message="Übersicht konnte nicht geladen werden." onRetry={() => refetch()} />;
  }

  const saxo = saxoQuery.data;

  // Sektor-Chart bleibt bewusst Alpaca-only: Saxo-Kapital (EUR/GBP)
  // ungewandelt zu Alpacas USD-Beträgen zu addieren würde die Prozentanteile
  // verfälschen. Sektor kommt direkt vom Backend (t.sector, yfinance-Wert
  // zum Entry-Zeitpunkt, siehe trading_api.get_overview) – dieselbe Quelle
  // wie in der Handelshistorie, "Sonstige" nur noch als echter Fallback für
  // Trades ohne ermittelten Sektor (z.B. yfinance ohne "sector"-Feld).
  const sectorTotals = data.open_trades.reduce<Record<string, number>>((acc, t) => {
    const sector = t.sector ?? "Sonstige";
    acc[sector] = (acc[sector] ?? 0) + t.capital_used;
    return acc;
  }, {});
  const totalCapital = Object.values(sectorTotals).reduce((a, b) => a + b, 0);

  const positions: CombinedOpenPosition[] = [
    ...data.open_trades.map(fromAlpacaOpenTrade),
    ...(saxo?.open_trades ?? []).map(fromSaxoOpenTrade),
  ];
  const saxoPositions = positions.filter((p) => p.broker === "saxo");

  // Broker-Wahrheit (data.unrealized_pnl, direkt von Alpaca summiert) statt
  // der eigenen yfinance-Näherung – Fallback nur falls Alpaca gerade nicht
  // erreichbar war (siehe trading_api.get_overview).
  const unrealizedPnlUsdOnly = data.unrealized_pnl ?? data.open_trades.reduce((sum, t) => sum + t.unrealized_pnl, 0);

  // "Verfügbares Kapital" kommt jetzt direkt von Saxo (cash_available_eur,
  // CashAvailableForTrading aus port/v1/balances) statt aus einer im
  // Frontend abgeleiteten Restrechnung (Gesamt minus Positionswert) – letztere
  // driftete über Zeit auseinander, sobald DB-Werte (entry_price/
  // capital_used_eur) nicht exakt dem echten Saxo-Fill entsprachen (siehe
  // PHIA.AS-Sanity-Check 2026-07-29, ~0,90 EUR Abweichung). "Gebunden in
  // Positionen" bleibt als aktueller Marktwert (Einsatz + unrealisiertes P&L,
  // in EUR umgerechnet) aus den einzelnen offenen Positionen abgeleitet, da
  // Saxo dafür keinen direkten Einzelwert liefert.
  const saxoUnrealizedEur = saxo
    ? saxoPositions.reduce((sum, p) => sum + p.unrealized_pnl * (p.currency === "EUR" ? 1 : saxo.fx_rates_to_eur[p.currency] ?? 1), 0)
    : null;
  const saxoBoundEur = saxo ? saxoPositions.reduce((sum, p) => sum + p.capital_used, 0) + (saxoUnrealizedEur ?? 0) : null;
  const saxoAvailableEur = saxo?.cash_available_eur ?? null;

  // Direkthandel-Aggregate (Alpaca-only, USD) - rein clientseitig aus /api/
  // active/manual-trades berechnet, siehe Aufgaben-Vorgabe "Frontend
  // berechnet (Bot-P&L aus dem bestehenden Endpoint + Direkthandel-P&L
  // addiert), nicht im Backend zusammengeführt". get_total_pnl()/
  // get_daily_pnl() bleiben unangetastet - diese Summen fließen NUR in die
  // Anzeige hier, nirgends zurück ins Backend.
  const manualTrades = manualQuery.data ?? [];
  const manualOpenPositions = manualTrades.filter((t) => t.status === "OPEN");
  const manualCapitalUsedUsd = manualOpenPositions.reduce((sum, t) => sum + t.capital_used, 0);
  const manualUnrealizedUsd = manualOpenPositions.reduce((sum, t) => sum + (t.unrealized_pnl ?? 0), 0);
  const manualRealizedUsd = manualTrades
    .filter((t) => t.pnl_usd !== null)
    .reduce((sum, t) => sum + (t.pnl_usd ?? 0), 0);
  // Gebühren-Kachel Direkthandel (Kommissionslücke-Diagnose 2026-08-19) -
  // bleibt 0 (Alpaca-Broker, siehe api.ts ManualTrade-Kommentar), gleiches
  // clientseitiges Summierungsprinzip wie manualRealizedUsd/manualUnrealizedUsd
  // oben - über ALLE Trades (auch offene), analog fees_usd/fees_eur-Scope.
  const manualFeesUsd = manualTrades.reduce(
    (sum, t) => sum + (t.entry_commission_usd ?? 0) + (t.exit_commission_usd ?? 0),
    0,
  );

  // Näherungsweise EUR-Gesamtsumme über zwei komplett getrennte Konten –
  // NIE als ein einziger, primärer Wert dargestellt (siehe Gesamt-Zeile
  // unten: jede Geldbetrag-Kachel ist explizit mit "≈" markiert und zeigt
  // den verwendeten Kurs im Subtext).
  const usdToEur = saxo?.fx_rates_to_eur?.USD ?? null;
  const combinedAvailableEur =
    saxo && usdToEur && data.cash !== null && saxoAvailableEur !== null ? data.cash * usdToEur + saxoAvailableEur : null;
  // Direkthandel-Kapital ist bereits Teil von data.cash (zieht vom selben
  // Alpaca-Cash-Pool) - hier deshalb NUR bei "Gebunden"/"Unrealisiert"/
  // "Realisiert" separat addiert (eigene, in data.long_market_value/
  // realized_pnl/unrealized_pnl NICHT enthaltene Positionen), nicht bei
  // "Verfügbares Kapital" (sonst würde es doppelt gezählt).
  //
  // Fix (Folgeauftrag "combined-Werte ohne Saxo", 2026-08-18): Alpaca +
  // Direkthandel MÜSSEN unabhängig davon summiert werden, ob Saxo verbunden
  // ist bzw. ein USD/EUR-Kurs geladen ist - vorher hingen ALLE combined*-
  // Werte an `saxo && usdToEur`, wodurch Direkthandel bei fehlendem Saxo
  // komplett aus GESAMT verschwand (nicht nur der Saxo-Anteil). Jetzt: die
  // Alpaca+Direkthandel-Summe (USD) wird IMMER gebildet, der Saxo-Anteil
  // (bereits EUR) kommt nur additiv dazu wenn vorhanden. Die EUR-Umrechnung
  // selbst braucht weiterhin einen Kurs (kommt aktuell nur von Saxo) - ohne
  // Kurs zeigt die Kachel die reine USD-Summe (siehe fmtUsdSigned-Fallback
  // unten), NICHT mehr nur den Alpaca-Anteil ohne Direkthandel.
  const alpacaPlusManualBoundUsd = (data.long_market_value ?? 0) + manualCapitalUsedUsd;
  const alpacaPlusManualRealizedUsd = data.realized_pnl + manualRealizedUsd;
  const alpacaPlusManualUnrealizedUsd = unrealizedPnlUsdOnly + manualUnrealizedUsd;
  const combinedBoundEur =
    usdToEur !== null && data.long_market_value !== null
      ? alpacaPlusManualBoundUsd * usdToEur + (saxoBoundEur ?? 0)
      : null;
  const combinedRealizedEur =
    usdToEur !== null ? alpacaPlusManualRealizedUsd * usdToEur + (saxo?.realized_pnl_eur ?? 0) : null;
  const combinedUnrealizedEur =
    usdToEur !== null
      ? positions.reduce(
          (sum, p) => sum + p.unrealized_pnl * (p.currency === "EUR" ? 1 : saxo?.fx_rates_to_eur[p.currency] ?? 1),
          0,
        ) +
        manualUnrealizedUsd * usdToEur
      : null;
  // Gebühren ≈ (Gesamt-Zeile) - gleiche Näherungs-Logik wie die anderen
  // combined*-Werte oben: Alpaca+Direkthandel (USD) immer summiert, Saxo-
  // Anteil (bereits EUR) nur additiv wenn vorhanden und ein Kurs geladen ist.
  const alpacaPlusManualFeesUsd = data.fees_usd + manualFeesUsd;
  const combinedFeesEur = usdToEur !== null ? alpacaPlusManualFeesUsd * usdToEur + (saxo?.fees_eur ?? 0) : null;
  const fxSubtext = usdToEur ? `Näherung, USD/EUR ${usdToEur.toFixed(3)}` : "getrennte Konten";
  const totalMaxOpenPositions = data.max_open_positions + (saxo?.max_open_positions ?? 0);

  const tileGrid = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-4";
  const rowHeading = "text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted mb-3";

  return (
    <div className="space-y-6">
      {/* Drei Kachel-Reihen (Alpaca / Saxo / Gesamt) mit jeweils denselben
          sechs Kennzahlen (Kapital/Gebunden/Realisiert/Unrealisiert/Gebühren/
          Offene Positionen) – siehe Modul-Auftrag "Drei-Zeilen-Layout",
          Gebühren-Kachel ergänzt (Kommissionslücke-Diagnose 2026-08-19).
          Gesamt ist durchgängig mit "≈" markiert (Näherung über zwei
          Währungsräume), Offene Positionen dort als reine Summe ohne "≈"
          (echte Zahl). */}
      <div>
        <div className={rowHeading}>Alpaca</div>
        <div className={tileGrid}>
          <KPICard
            compact
            label="Verfügbares Kapital"
            value={data.cash !== null ? fmtUsd(data.cash, 2) : "–"}
            color="gold"
            subtext="Cash, für neue Trades frei"
          />
          <KPICard
            compact
            label="Gebunden in Positionen"
            value={data.long_market_value !== null ? fmtUsd(data.long_market_value, 2) : "–"}
            color="neutral"
          />
          <KPICard
            compact
            label="Realisiert"
            value={fmtUsdSigned(data.realized_pnl, 0)}
            color={data.realized_pnl >= 0 ? "gain" : "loss"}
          />
          <KPICard
            compact
            label="Unrealisiert"
            value={fmtUsdSigned(unrealizedPnlUsdOnly, 0)}
            color={unrealizedPnlUsdOnly >= 0 ? "gain" : "loss"}
          />
          <KPICard
            compact
            label="Gebühren"
            value={fmtUsd(data.fees_usd, 2)}
            color="neutral"
            subtext="0 USD, Alpaca berechnet aktuell keine Kommission"
          />
          <KPICard
            compact
            label="Offene Positionen"
            value={`${data.open_trades.length}/${data.max_open_positions}`}
            color="gold"
            subtext={regimeSubtext(data.market_regime)}
          />
        </div>
      </div>

      <div>
        <div className={rowHeading}>Saxo</div>
        <div className={tileGrid}>
          <KPICard
            compact
            label="Verfügbares Kapital"
            value={saxoAvailableEur !== null ? fmtMoney(saxoAvailableEur, "EUR", 2) : saxoQuery.isError ? "n/a" : "…"}
            color="gold"
            subtext="EUR, für neue Trades frei"
          />
          <KPICard
            compact
            label="Gebunden in Positionen"
            value={saxoBoundEur !== null ? fmtMoney(saxoBoundEur, "EUR", 2) : saxoQuery.isError ? "n/a" : "…"}
            color="neutral"
          />
          <KPICard
            compact
            label="Realisiert"
            value={saxo ? fmtMoneySigned(saxo.realized_pnl_eur, "EUR", 0) : saxoQuery.isError ? "n/a" : "…"}
            color={saxo && saxo.realized_pnl_eur >= 0 ? "gain" : "loss"}
          />
          <KPICard
            compact
            label="Unrealisiert"
            value={saxoUnrealizedEur !== null ? fmtMoneySigned(saxoUnrealizedEur, "EUR", 0) : saxoQuery.isError ? "n/a" : "…"}
            color={saxoUnrealizedEur !== null && saxoUnrealizedEur >= 0 ? "gain" : "loss"}
          />
          <KPICard
            compact
            label="Gebühren"
            value={
              saxo
                ? `${saxo.fees_exit_unknown ? "≥ " : ""}${fmtMoney(saxo.fees_eur, "EUR", 2)}`
                : saxoQuery.isError
                  ? "n/a"
                  : "…"
            }
            color="neutral"
            subtext={
              saxo?.fees_exit_unknown
                ? "Mindestbetrag: Exit-Gebühr für ältere Trades unbekannt (Saxo-Retention-Fenster abgelaufen)"
                : undefined
            }
          />
          <KPICard
            compact
            label="Offene Positionen"
            value={saxo ? `${saxo.open_trades.length}/${saxo.max_open_positions}` : saxoQuery.isError ? "n/a" : "…"}
            color="gold"
          />
        </div>
      </div>

      <div>
        <div className={rowHeading}>Gesamt</div>
        <div className={tileGrid}>
          <KPICard
            compact
            label="Verfügbares Kapital ≈"
            value={combinedAvailableEur !== null ? fmtMoney(combinedAvailableEur, "EUR", 0) : "…"}
            color="gold"
            subtext={fxSubtext}
          />
          <KPICard
            compact
            label="Gebunden in Positionen ≈"
            value={
              combinedBoundEur !== null
                ? fmtMoney(combinedBoundEur, "EUR", 0)
                : data.long_market_value !== null
                  ? fmtUsd(alpacaPlusManualBoundUsd, 0)
                  : "…"
            }
            color="neutral"
            subtext={fxSubtext}
          />
          <KPICard
            compact
            label="Realisiert ≈"
            value={
              combinedRealizedEur !== null
                ? fmtMoneySigned(combinedRealizedEur, "EUR", 0)
                : fmtUsdSigned(alpacaPlusManualRealizedUsd, 0)
            }
            color={(combinedRealizedEur ?? alpacaPlusManualRealizedUsd) >= 0 ? "gain" : "loss"}
            subtext={fxSubtext}
          />
          <KPICard
            compact
            label="Unrealisiert ≈"
            value={
              combinedUnrealizedEur !== null
                ? fmtMoneySigned(combinedUnrealizedEur, "EUR", 0)
                : fmtUsdSigned(alpacaPlusManualUnrealizedUsd, 0)
            }
            color={(combinedUnrealizedEur ?? alpacaPlusManualUnrealizedUsd) >= 0 ? "gain" : "loss"}
            subtext={fxSubtext}
          />
          <KPICard
            compact
            label="Gebühren ≈"
            value={`${saxo?.fees_exit_unknown ? "≥ " : ""}${
              combinedFeesEur !== null ? fmtMoney(combinedFeesEur, "EUR", 2) : fmtUsd(alpacaPlusManualFeesUsd, 2)
            }`}
            color="neutral"
            subtext={saxo?.fees_exit_unknown ? `Mindestbetrag, ${fxSubtext}` : fxSubtext}
          />
          <KPICard
            compact
            label="Offene Positionen"
            value={`${positions.length}/${totalMaxOpenPositions}`}
            color="gold"
            subtext={
              <span className="flex items-center gap-1.5 flex-wrap">
                <span>
                  {data.open_trades.length} Alpaca · {saxo?.open_trades.length ?? 0} Saxo
                  {manualOpenPositions.length > 0 ? ` · ${manualOpenPositions.length} Direkthandel` : ""}
                </span>
              </span>
            }
          />
        </div>
      </div>

      {/* Direkthandel-Kennzahlen (eigene Zeile analog Alpaca/Saxo oben) -
          Aufgabe "Direkthandel in Übersicht/Performance einbinden",
          2026-08-14, Feld-Parität-Fix 2026-08-19: jetzt dieselben sechs
          Kacheln wie Alpaca/Saxo (Verfügbares Kapital, Gebunden in
          Positionen, Realisiert, Unrealisiert, Gebühren, Offene Positionen),
          damit alle drei Zeilen auf einen Blick vergleichbar sind.
          "Verfügbares Kapital" ist das gemeinsame Active-Trading-Restbudget (EIN Topf mit
          dem Bot, kein separates Direkthandel-Budget) - kommt direkt von
          /api/active/budget, das dieselbe Formel liefert, gegen die
          active_trading.buy() bereits vor jeder Order prüft. */}
      <div>
        <div className={rowHeading}>Direkthandel</div>
        <div className={tileGrid}>
          <KPICard
            compact
            label="Verfügbares Kapital"
            value={budgetQuery.data ? fmtUsd(budgetQuery.data.remaining_budget, 2) : budgetQuery.isError ? "n/a" : "…"}
            color="gold"
            subtext="USD, gemeinsamer Topf mit dem Bot"
          />
          <KPICard
            compact
            label="Gebunden in Positionen"
            value={manualQuery.data ? fmtUsd(manualCapitalUsedUsd, 2) : manualQuery.isError ? "n/a" : "…"}
            color="neutral"
          />
          <KPICard
            compact
            label="Realisiert"
            value={manualQuery.data ? fmtUsdSigned(manualRealizedUsd, 0) : manualQuery.isError ? "n/a" : "…"}
            color={manualRealizedUsd >= 0 ? "gain" : "loss"}
          />
          <KPICard
            compact
            label="Unrealisiert"
            value={manualQuery.data ? fmtUsdSigned(manualUnrealizedUsd, 0) : manualQuery.isError ? "n/a" : "…"}
            color={manualUnrealizedUsd >= 0 ? "gain" : "loss"}
          />
          <KPICard
            compact
            label="Gebühren"
            value={manualQuery.data ? fmtUsd(manualFeesUsd, 2) : manualQuery.isError ? "n/a" : "…"}
            color="neutral"
            subtext="0 USD, gleicher Alpaca-Broker wie der Bot"
          />
          <KPICard
            compact
            label="Offene Positionen"
            value={manualQuery.data ? String(manualOpenPositions.length) : manualQuery.isError ? "n/a" : "…"}
            color="gold"
          />
        </div>
      </div>

      {saxoQuery.isError && (
        <p className="text-xs text-loss">Saxo-Daten aktuell nicht verfügbar – Zeilen &bdquo;Saxo&ldquo;/&bdquo;Gesamt&ldquo; zeigen n/a.</p>
      )}
      {manualQuery.isError && (
        <p className="text-xs text-loss">Direkthandel-Daten aktuell nicht verfügbar.</p>
      )}
      {budgetQuery.isError && (
        <p className="text-xs text-loss">Direkthandel-Restbudget aktuell nicht verfügbar.</p>
      )}

      {totalCapital > 0 && (
        <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5">
          <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted mb-3">
            Verteilung nach Sektor <span className="normal-case text-text-disabled">(nur Alpaca)</span>
          </div>
          {/* Mobile (Fix 2026-08-14, Fortsetzung der Serie 2958b58/4a4bc18/
              48b03c6): Sektor-Name bekam bei w-16 truncate abgeschnittenen
              Text ("Consum...") - "Consumer Cyclical" und "Consumer
              Defensive" wurden dadurch ununterscheidbar, echter
              Informationsverlust statt nur Kosmetik. Name jetzt in einer
              eigenen Zeile OBERHALB von Balken+Betrag (voller Text, kein
              Tooltip), Desktop unverändert einzeilig (dort genug Platz,
              siehe Playwright-Screenshot bei 1280px). Etwas größerer
              Mobile-Abstand zwischen Einträgen (space-y-3 statt 2), damit
              bei der jetzt zweizeiligen Darstellung klar bleibt, welcher
              Name zu welchem Balken gehört - gleiches Card-Grouping-Prinzip
              wie in der Handelshistorie (48b03c6). */}
          <div className="space-y-3 md:space-y-2">
            {Object.entries(sectorTotals)
              .sort((a, b) => b[1] - a[1])
              .map(([sector, wert]) => {
                const pct = (wert / totalCapital) * 100;
                return (
                  <div key={sector}>
                    <span className="md:hidden block text-text-muted text-xs mb-1">{sector}</span>
                    <div className="flex items-center gap-2 md:gap-3 text-sm">
                      <span className="hidden md:block md:w-32 shrink-0 text-text-muted truncate">{sector}</span>
                      <div className="flex-1 min-w-0 h-1.5 bg-bg-hover rounded-btn overflow-hidden">
                        <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-figures w-16 md:w-24 shrink-0 text-right">{fmtUsd(wert, 0)}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div>
        <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted border-b border-border pb-2 mb-3">
          Offene Positionen
        </div>
        {positions.length === 0 ? (
          <p className="text-text-muted text-sm">Keine offenen Positionen.</p>
        ) : (
          <div className="space-y-2">
            {positions.map((t) => {
              const slLabel = t.trailing_sl_active ? "TSL" : "SL";
              const slValue = fmtMoney(t.trailing_sl_active && t.trailing_sl_price != null ? t.trailing_sl_price : t.stop_loss, t.currency);
              const scorePct = Math.min(100, Math.max(0, t.rule_score));
              // Aktueller Wert aus Eingesetzt + unrealisiertem P&L (bereits
              // vom Backend berechnet, siehe unrealized_pnl oben) – KEINE neue
              // Berechnung (quantity * current_price würde bei fractional
              // shares wegen Rundung leicht abweichen), nur eine zweite
              // Darstellung derselben Zahl, damit sie neben "Eingesetzt"
              // nachvollziehbar ist.
              const currentValue = t.capital_used + t.unrealized_pnl;
              return (
                <div key={`${t.broker}-${t.ticker}`}>
                  {/* Desktop: kompakte Zeile */}
                  <div className="hidden md:block bg-bg-card border border-border rounded-card px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium flex items-center gap-1.5 min-w-0">
                        <TickerLabel ticker={t.ticker} companyName={t.company_name} className="max-w-[220px]" />
                        <span className="flex items-center gap-1 text-gold text-xs shrink-0">
                          <Bot size={14} strokeWidth={1.5} /> {t.mode}
                        </span>
                        {brokerBadge(t.broker)}
                      </div>
                      <div className={`font-figures text-sm ${gainLossClass(t.unrealized_pnl)}`}>
                        {fmtMoneySigned(t.unrealized_pnl, t.currency)} ({t.unrealized_pnl_pct >= 0 ? "+" : ""}
                        {t.unrealized_pnl_pct.toFixed(1)}%)
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-figures text-text-muted">
                      <div>Entry: {fmtMoney(t.entry_price, t.currency)}</div>
                      <div>Aktuell: {fmtMoney(t.current_price, t.currency)}</div>
                      <div className={t.trailing_sl_active ? "text-gold font-semibold" : undefined}>
                        {slLabel}: {slValue}
                      </div>
                      <div>TP: {fmtMoney(t.take_profit, t.currency)}</div>
                    </div>
                    <div className="text-xs text-text-muted mt-1.5">
                      Eingesetzt: {fmtMoney(t.capital_used, t.currency)} → Aktueller Wert: {fmtMoney(currentValue, t.currency)}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {fmtMenge(t.quantity, 4)} Stück · Score {t.rule_score}/100
                    </div>
                    {timeExitLabel(t) && (
                      <div className={`text-xs mt-1 ${timeExitColorClass(t)}`}>
                        {timeExitLabel(t)}
                      </div>
                    )}
                    {holdingDurationLabel(t) && (
                      <div className="text-xs mt-1 text-text-muted">
                        {holdingDurationLabel(t)}
                      </div>
                    )}
                  </div>

                  {/* Mobile: großes Card-Format */}
                  <div className="md:hidden bg-bg-card border border-border rounded-card p-3">
                    {/* Ticker/Firmenname in eigener Zeile (Redesign 2026-08-15): darf
                        umbrechen, ohne die Badges/den P&L daneben zu zerdrücken. */}
                    <TickerLabel ticker={t.ticker} companyName={t.company_name} className="font-semibold text-base block mb-1.5" />
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] border border-live text-live rounded px-1.5 py-0.5">{t.mode}</span>
                        {brokerBadge(t.broker)}
                      </div>
                      <span className={`text-sm font-semibold font-figures ${gainLossClass(t.unrealized_pnl)}`}>
                        {fmtMoneySigned(t.unrealized_pnl, t.currency)} ({t.unrealized_pnl_pct >= 0 ? "+" : ""}
                        {t.unrealized_pnl_pct.toFixed(1)}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-xs font-figures mb-2">
                      <div>
                        <span className="text-text-muted">Entry </span>
                        <span>{fmtMoney(t.entry_price, t.currency)}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Aktuell </span>
                        <span>{fmtMoney(t.current_price, t.currency)}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">{slLabel} </span>
                        <span className={t.trailing_sl_active ? "text-gold" : "text-loss"}>{slValue}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">TP </span>
                        <span className="text-gain">{fmtMoney(t.take_profit, t.currency)}</span>
                      </div>
                    </div>

                    <div className="text-[10px] text-text-muted mb-1">
                      Eingesetzt: {fmtMoney(t.capital_used, t.currency)} → Aktueller Wert: {fmtMoney(currentValue, t.currency)}
                    </div>
                    <div className="text-[10px] text-text-muted mb-2">
                      {fmtMenge(t.quantity, 4)} Stück
                    </div>
                    {timeExitLabel(t) && (
                      <div className={`text-[10px] mb-2 ${timeExitColorClass(t)}`}>
                        {timeExitLabel(t)}
                      </div>
                    )}
                    {holdingDurationLabel(t) && (
                      <div className="text-[10px] mb-2 text-text-muted">
                        {holdingDurationLabel(t)}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      <span className="text-[10px] text-text-muted shrink-0">Score</span>
                      <div className="flex-1 min-w-0 h-[3px] bg-border rounded-full overflow-hidden">
                        <div className="h-[3px] bg-gold rounded-full" style={{ width: `${scorePct}%` }} />
                      </div>
                      <span className="text-xs text-gold font-semibold font-figures shrink-0">{t.rule_score}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Eigener, klar abgetrennter Bucket für Direkthandel-Positionen -
          Aufgabe "Direkthandel in Übersicht/Performance einbinden",
          2026-08-14: bewusst NICHT in obige "Offene Positionen"-Liste
          gemischt (andere Datenquelle/Feldform, siehe ManualTrade vs.
          CombinedOpenPosition in api.ts - kein trailing_sl/time_exit/mode).
          Gleiches Desktop-Zeile/Mobile-Card-Muster wie oben, nur ohne die
          bot-spezifischen Zusatzzeilen. */}
      <div>
        <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted border-b border-border pb-2 mb-3">
          Direkthandel
        </div>
        {manualOpenPositions.length === 0 ? (
          <p className="text-text-muted text-sm">Keine offenen Direkthandel-Positionen.</p>
        ) : (
          <div className="space-y-2">
            {manualOpenPositions.map((t) => {
              const currentValue = t.capital_used + (t.unrealized_pnl ?? 0);
              return (
                <div key={`manual-${t.id}`}>
                  {/* Desktop: kompakte Zeile */}
                  <div className="hidden md:block bg-bg-card border border-border rounded-card px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium flex items-center gap-1.5 min-w-0">
                        <TickerLabel ticker={t.ticker} companyName={t.company_name} className="max-w-[220px]" />
                        {directBadge()}
                      </div>
                      <div className={`font-figures text-sm ${gainLossClass(t.unrealized_pnl)}`}>
                        {t.unrealized_pnl != null ? fmtMoneySigned(t.unrealized_pnl, "USD") : "–"}
                        {t.unrealized_pnl_pct != null &&
                          ` (${t.unrealized_pnl_pct >= 0 ? "+" : ""}${t.unrealized_pnl_pct.toFixed(1)}%)`}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-figures text-text-muted">
                      <div>Entry: {fmtMoney(t.entry_price, "USD")}</div>
                      <div>Aktuell: {fmtMoney(t.current_price, "USD")}</div>
                      <div>SL: {fmtMoney(t.stop_loss_price, "USD")}</div>
                      <div>TP: {fmtMoney(t.take_profit_price, "USD")}</div>
                    </div>
                    <div className="text-xs text-text-muted mt-1.5">
                      Eingesetzt: {fmtMoney(t.capital_used, "USD")} → Aktueller Wert: {fmtMoney(currentValue, "USD")}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {fmtMenge(t.quantity, 4)} Stück
                      {t.rule_score_at_purchase != null && ` · Score ${t.rule_score_at_purchase}/100`}
                    </div>
                  </div>

                  {/* Mobile: großes Card-Format */}
                  <div className="md:hidden bg-bg-card border border-border rounded-card p-3">
                    <TickerLabel ticker={t.ticker} companyName={t.company_name} className="font-semibold text-base block mb-1.5" />
                    <div className="flex justify-between items-center mb-2">
                      {directBadge()}
                      <span className={`text-sm font-semibold font-figures ${gainLossClass(t.unrealized_pnl)}`}>
                        {t.unrealized_pnl != null ? fmtMoneySigned(t.unrealized_pnl, "USD") : "–"}
                        {t.unrealized_pnl_pct != null &&
                          ` (${t.unrealized_pnl_pct >= 0 ? "+" : ""}${t.unrealized_pnl_pct.toFixed(1)}%)`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-xs font-figures mb-2">
                      <div>
                        <span className="text-text-muted">Entry </span>
                        <span>{fmtMoney(t.entry_price, "USD")}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Aktuell </span>
                        <span>{fmtMoney(t.current_price, "USD")}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">SL </span>
                        <span className="text-loss">{fmtMoney(t.stop_loss_price, "USD")}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">TP </span>
                        <span className="text-gain">{fmtMoney(t.take_profit_price, "USD")}</span>
                      </div>
                    </div>

                    <div className="text-[10px] text-text-muted mb-1">
                      Eingesetzt: {fmtMoney(t.capital_used, "USD")} → Aktueller Wert: {fmtMoney(currentValue, "USD")}
                    </div>
                    <div className="text-[10px] text-text-muted">
                      {fmtMenge(t.quantity, 4)} Stück
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
