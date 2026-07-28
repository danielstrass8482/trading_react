"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, Bot } from "lucide-react";
import {
  api, Overview, SaxoOverview, CombinedOpenPosition, fromAlpacaOpenTrade, fromSaxoOpenTrade,
} from "@/lib/api";
import KPICard from "@/components/ui/KPICard";
import { KPISkeletonRow, CardSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
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

// Grobe Sektor-Zuordnung fürs Übersichts-Balkendiagramm – rein für die
// Anzeige, hat keine Auswirkung auf die Bot-Logik (die kennt keine
// Sektor-Segmentierung, nur die VOLATILE_WATCHLIST-Unterscheidung).
const SECTOR_MAP: Record<string, string> = {
  AAPL: "Tech", MSFT: "Tech", GOOGL: "Tech", AMZN: "Tech", META: "Tech",
  NVDA: "Tech", AMD: "Tech", INTC: "Tech", QCOM: "Tech", ORCL: "Tech",
  CRM: "Tech", ADBE: "Tech", NOW: "Tech", SNOW: "Tech", TXN: "Tech", AMAT: "Tech",
  JPM: "Finanzen", V: "Finanzen", MA: "Finanzen", BAC: "Finanzen", GS: "Finanzen",
  MS: "Finanzen", BLK: "Finanzen", AXP: "Finanzen", WFC: "Finanzen", C: "Finanzen",
  UNH: "Gesundheit", ABT: "Gesundheit", MDT: "Gesundheit", SYK: "Gesundheit",
  KO: "Konsum", PEP: "Konsum", MCD: "Konsum", WMT: "Konsum", COST: "Konsum",
  SH: "Inverse ETF", PSQ: "Inverse ETF", SDS: "Inverse ETF", SQQQ: "Inverse ETF", SPXS: "Inverse ETF",
};

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
  const vixOk = data.vix > 0 && data.vix < 20;

  // Sektor-Chart bleibt bewusst Alpaca-only: SECTOR_MAP kennt keine
  // europäischen Ticker, und Saxo-Kapital (EUR/GBP) ungewandelt zu Alpacas
  // USD-Beträgen zu addieren würde die Prozentanteile verfälschen.
  const sectorTotals = data.open_trades.reduce<Record<string, number>>((acc, t) => {
    const sector = SECTOR_MAP[t.ticker] ?? "Sonstige";
    acc[sector] = (acc[sector] ?? 0) + t.capital_used;
    return acc;
  }, {});
  const totalCapital = Object.values(sectorTotals).reduce((a, b) => a + b, 0);

  const positions: CombinedOpenPosition[] = [
    ...data.open_trades.map(fromAlpacaOpenTrade),
    ...(saxo?.open_trades ?? []).map(fromSaxoOpenTrade),
  ];

  // Näherungsweise EUR-Gesamtsumme über zwei komplett getrennte Konten –
  // NIE als ein einziger, primärer Wert dargestellt (siehe KPI-Zeile unten:
  // Alpaca/Saxo bleiben eigene Karten, "Gesamt" ist explizit mit "≈"
  // markiert und zeigt den verwendeten Kurs).
  const usdToEur = saxo?.fx_rates_to_eur?.USD ?? null;
  const combinedValueEur = saxo && usdToEur ? data.portfolio_value * usdToEur + saxo.portfolio_value_eur : null;
  const combinedRealizedEur = saxo && usdToEur ? data.realized_pnl * usdToEur + saxo.realized_pnl_eur : null;
  const combinedUnrealizedEur =
    saxo && usdToEur
      ? positions.reduce((sum, p) => {
          const rate = p.currency === "EUR" ? 1 : saxo.fx_rates_to_eur[p.currency] ?? 1;
          return sum + p.unrealized_pnl * rate;
        }, 0)
      : null;
  const unrealizedPnlUsdOnly = data.open_trades.reduce((sum, t) => sum + t.unrealized_pnl, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 md:gap-4">
        <KPICard label="Alpaca-Konto" value={fmtUsd(data.portfolio_value, 2)} color="neutral" subtext="USD, eigenes Budget" />
        <KPICard
          label="Saxo-Konto"
          value={saxo ? fmtMoney(saxo.portfolio_value_eur, "EUR", 2) : saxoQuery.isError ? "n/a" : "…"}
          color="neutral"
          subtext="EUR, eigenes Budget"
        />
        <KPICard
          label="Gesamt ≈"
          value={combinedValueEur !== null ? fmtMoney(combinedValueEur, "EUR", 0) : "…"}
          color="gold"
          subtext={usdToEur ? `Näherung, USD/EUR ${usdToEur.toFixed(3)}` : "getrennte Konten"}
        />
        <KPICard
          label="Realisiert ≈"
          value={combinedRealizedEur !== null ? fmtMoneySigned(combinedRealizedEur, "EUR", 0) : fmtUsdSigned(data.realized_pnl, 0)}
          color={(combinedRealizedEur ?? data.realized_pnl) >= 0 ? "gain" : "loss"}
        />
        <KPICard
          label="Unrealisiert ≈"
          value={combinedUnrealizedEur !== null ? fmtMoneySigned(combinedUnrealizedEur, "EUR", 0) : fmtUsdSigned(unrealizedPnlUsdOnly, 0)}
          color={(combinedUnrealizedEur ?? unrealizedPnlUsdOnly) >= 0 ? "gain" : "loss"}
          subtext="nicht realisiert"
        />
        <KPICard
          label="VIX"
          value={data.vix > 0 ? data.vix.toFixed(1) : "–"}
          color={data.vix === 0 ? "neutral" : vixOk ? "gain" : "loss"}
          subtext={data.vix > 0 ? (vixOk ? "Handel aktiv" : "Erhöhte Vorsicht") : undefined}
        />
        <KPICard
          label="Offene Positionen"
          value={`${positions.length}/${data.max_open_positions + (saxo?.max_open_positions ?? 0)}`}
          color="gold"
          subtext={
            <span className="flex items-center gap-1.5 flex-wrap">
              <span>{data.open_trades.length} Alpaca · {saxo?.open_trades.length ?? 0} Saxo</span>
              <span>·</span>
              {regimeSubtext(data.market_regime)}
            </span>
          }
        />
      </div>

      {saxoQuery.isError && (
        <p className="text-xs text-loss">Saxo-Daten aktuell nicht verfügbar – Ansicht zeigt nur Alpaca.</p>
      )}

      {totalCapital > 0 && (
        <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5">
          <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted mb-3">
            Verteilung nach Sektor <span className="normal-case text-text-disabled">(nur Alpaca)</span>
          </div>
          <div className="space-y-2">
            {Object.entries(sectorTotals)
              .sort((a, b) => b[1] - a[1])
              .map(([sector, wert]) => {
                const pct = (wert / totalCapital) * 100;
                return (
                  <div key={sector} className="flex items-center gap-2 md:gap-3 text-sm">
                    <span className="w-16 md:w-32 shrink-0 text-text-muted truncate">{sector}</span>
                    <div className="flex-1 min-w-0 h-1.5 bg-bg-hover rounded-btn overflow-hidden">
                      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-figures w-16 md:w-24 shrink-0 text-right">{fmtUsd(wert, 0)}</span>
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
              return (
                <div key={`${t.broker}-${t.ticker}`}>
                  {/* Desktop: kompakte Zeile */}
                  <div className="hidden md:block bg-bg-card border border-border rounded-card px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium flex items-center gap-1.5">
                        {t.ticker}
                        <span className="flex items-center gap-1 text-gold text-xs">
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
                      {fmtMenge(t.quantity)} Stück · Score {t.rule_score}/100
                    </div>
                  </div>

                  {/* Mobile: großes Card-Format */}
                  <div className="md:hidden bg-bg-card border border-border rounded-card p-3">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base">{t.ticker}</span>
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
    </div>
  );
}
