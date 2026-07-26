"use client";

import { useQuery } from "@tanstack/react-query";
import { Target, TrendingUp, TrendingDown, Minus, Bot } from "lucide-react";
import { api, Overview } from "@/lib/api";
import KPICard from "@/components/ui/KPICard";
import { KPISkeletonRow, CardSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
import { fmtUsd, fmtUsdSigned, fmtMenge, gainLossClass } from "@/lib/format";

const REGIME_LABEL: Record<string, { icon: typeof TrendingUp; label: string }> = {
  bullish: { icon: TrendingUp, label: "Bullish" },
  bearish: { icon: TrendingDown, label: "Bearish" },
  neutral: { icon: Minus, label: "Neutral" },
};

function brokerBadge(broker: string | null | undefined) {
  const b = (broker ?? "alpaca").toLowerCase();
  return (
    <span className={`text-[0.6rem] font-semibold px-1 py-0.5 rounded-btn ${b === "ibkr" ? "bg-paper/20 text-paper" : "bg-gold/20 text-gold"}`}>
      {b === "ibkr" ? "IBKR" : "ALPACA"}
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
    queryKey: ["overview"],
    queryFn: () => api.get<Overview>("/api/overview").then((r) => r.data),
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

  const vixOk = data.vix > 0 && data.vix < 20;

  const sectorTotals = data.open_trades.reduce<Record<string, number>>((acc, t) => {
    const sector = SECTOR_MAP[t.ticker] ?? "Sonstige";
    acc[sector] = (acc[sector] ?? 0) + t.capital_used;
    return acc;
  }, {});
  const totalCapital = Object.values(sectorTotals).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <KPICard label="Portfolio-Wert" value={fmtUsd(data.portfolio_value, 2)} color="neutral" />
        <KPICard
          label="Realisierter P&L"
          value={fmtUsdSigned(data.realized_pnl, 2)}
          color={data.realized_pnl >= 0 ? "gain" : "loss"}
        />
        <KPICard
          label="VIX"
          value={data.vix > 0 ? data.vix.toFixed(1) : "–"}
          color={data.vix === 0 ? "neutral" : vixOk ? "gain" : "loss"}
          subtext={data.vix > 0 ? (vixOk ? "Handel aktiv" : "Erhöhte Vorsicht") : undefined}
        />
        <KPICard
          label="Offene Positionen"
          value={`${data.open_trades.length}/${data.max_open_positions}`}
          color="gold"
          subtext={regimeSubtext(data.market_regime)}
        />
      </div>

      {totalCapital > 0 && (
        <div className="bg-bg-card border border-border rounded-card px-6 py-5">
          <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted mb-3">
            Verteilung nach Sektor
          </div>
          <div className="space-y-2">
            {Object.entries(sectorTotals)
              .sort((a, b) => b[1] - a[1])
              .map(([sector, wert]) => {
                const pct = (wert / totalCapital) * 100;
                return (
                  <div key={sector} className="flex items-center gap-3 text-sm">
                    <span className="w-32 text-text-muted">{sector}</span>
                    <div className="flex-1 h-1.5 bg-bg-hover rounded-btn overflow-hidden">
                      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-figures w-24 text-right">{fmtUsd(wert, 0)}</span>
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
        {data.open_trades.length === 0 ? (
          <p className="text-text-muted text-sm">Keine offenen Positionen.</p>
        ) : (
          <div className="space-y-2">
            {data.open_trades.map((t) => (
              <div key={t.ticker} className="bg-bg-card border border-border rounded-card px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium flex items-center gap-1.5">
                    {t.ticker}
                    <span className="flex items-center gap-1 text-gold text-xs">
                      <Bot size={14} strokeWidth={1.5} /> {t.mode}
                    </span>
                    {brokerBadge(t.broker)}
                  </div>
                  <div className={`font-figures text-sm ${gainLossClass(t.unrealized_pnl)}`}>
                    {fmtUsdSigned(t.unrealized_pnl)} ({t.unrealized_pnl_pct >= 0 ? "+" : ""}
                    {t.unrealized_pnl_pct.toFixed(1)}%)
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-figures text-text-muted">
                  <div>Entry: {fmtUsd(t.entry_price)}</div>
                  <div>Aktuell: {fmtUsd(t.current_price)}</div>
                  <div>SL: {fmtUsd(t.stop_loss)}</div>
                  <div>TP: {fmtUsd(t.take_profit)}</div>
                </div>
                <div className="text-xs text-text-muted mt-1.5">
                  {fmtMenge(t.quantity)} Stück · Score {t.rule_score}/100
                </div>
                {t.trailing_sl_active && (
                  <div className="flex items-center gap-1.5 text-xs text-gain mt-2">
                    <Target size={13} /> Trailing SL aktiv: {fmtUsd(t.trailing_sl_price)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
