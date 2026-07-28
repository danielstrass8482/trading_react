"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  api, Performance as PerformanceData, Benchmark, Overview, TradeHistoryEntry,
  SaxoTradeEntry, SaxoOverview, CombinedTradeEntry, fromAlpacaTrade, fromSaxoTrade,
} from "@/lib/api";
import KPICard from "@/components/ui/KPICard";
import { KPISkeletonRow, CardSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
import { fmtUsd, fmtUsdSigned, fmtMoney, fmtMoneySigned, fmtPct, fmtMenge, gainLossClass } from "@/lib/format";

const PERIODS = [
  { key: "1w", label: "1W", days: 7 },
  { key: "1m", label: "1M", days: 30 },
  { key: "3m", label: "3M", days: 90 },
  { key: "all", label: "Alles", days: null },
] as const;

const BENCHMARK_COLORS: Record<string, string> = {
  "S&P 500": "var(--color-paper)",
  "Nasdaq": "#a679e0",
};

const STATUS_BADGE: Record<string, string> = {
  "Offen": "bg-paper/15 text-paper",
  "Stop Loss": "bg-loss/15 text-loss",
  "Take Profit": "bg-gain/15 text-gain",
  "Trailing Stop": "bg-gold/15 text-gold",
  "Time Exit (5 Tage)": "bg-text-muted/15 text-text-muted",
};

function statusBadge(grund: string) {
  const cls = STATUS_BADGE[grund] ?? "bg-text-muted/15 text-text-muted";
  return (
    <span className={`inline-block text-[0.65rem] font-semibold px-2 py-0.5 rounded-btn leading-tight md:whitespace-nowrap ${cls}`}>
      {grund}
    </span>
  );
}

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

const BROKER_FILTERS = [
  { key: "alle", label: "Alle" },
  { key: "alpaca", label: "Alpaca" },
  { key: "saxo", label: "Saxo" },
] as const;

function brokerBadgeSmall(broker: "alpaca" | "saxo") {
  return (
    <span className={`text-[0.6rem] font-semibold px-1 py-0.5 rounded-btn ${broker === "alpaca" ? "bg-gold/20 text-gold" : "bg-paper/20 text-paper"}`}>
      {broker.toUpperCase()}
    </span>
  );
}

function TradeHistorySection() {
  const [brokerFilter, setBrokerFilter] = useState<(typeof BROKER_FILTERS)[number]["key"]>("alle");

  const { data: alpacaHistory = [], isLoading: alpacaLoading } = useQuery({
    queryKey: ["trade-history", "alpaca"],
    queryFn: () => api.get<TradeHistoryEntry[]>("/api/trades/history", { params: { limit: 50 } }).then((r) => r.data),
  });

  // Saxo bewusst nicht Teil des Loading-Gates – fällt die Saxo-API aus,
  // zeigt die Tabelle einfach nur die Alpaca-Historie (siehe saxoError unten).
  const { data: saxoHistory = [], isLoading: saxoLoading, isError: saxoError } = useQuery({
    queryKey: ["trade-history", "saxo"],
    queryFn: () => api.get<SaxoTradeEntry[]>("/api/saxo/trades/history", { params: { limit: 50 } }).then((r) => r.data),
  });

  // fx_rates_to_eur fürs Umrechnen des kombinierten P&L in der Kopfzeile
  // (siehe Uebersicht.tsx – gleiches Prinzip: Alpaca USD + Saxo EUR/GBP
  // lassen sich nicht ungewandelt addieren).
  const { data: saxoOverview } = useQuery({
    queryKey: ["overview", "saxo"],
    queryFn: () => api.get<SaxoOverview>("/api/saxo/overview").then((r) => r.data),
  });

  const isLoading = alpacaLoading || saxoLoading;

  const merged = useMemo(() => {
    const combined: CombinedTradeEntry[] = [
      ...alpacaHistory.map(fromAlpacaTrade),
      ...saxoHistory.map(fromSaxoTrade),
    ];
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return combined;
  }, [alpacaHistory, saxoHistory]);

  const history = brokerFilter === "alle" ? merged : merged.filter((t) => t.broker === brokerFilter);

  // Zusammenfassung bleibt bewusst auf geschlossene Trades beschränkt (pnl ist
  // für OPEN-Trades unverändert NULL, siehe trading_api(_saxo).py) – das ist
  // weiterhin der realisierte P&L, keine Änderung an dieser Definition. Die
  // Summe wird als EUR-Näherung angezeigt sobald mehr als eine Währung
  // vorkommt (Alpaca=USD, Saxo=EUR/GBP je nach Börse).
  const closed = history.filter((t) => t.pnl !== null);
  const offen = history.filter((t) => t.status === "OPEN");
  const gewinner = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const verlierer = closed.filter((t) => (t.pnl ?? 0) <= 0).length;

  const fxRates = saxoOverview?.fx_rates_to_eur;
  const gesamtPnlEur = fxRates
    ? closed.reduce((sum, t) => sum + (t.pnl ?? 0) * (fxRates[t.currency] ?? 1), 0)
    : null;
  const singleCurrency = closed.length > 0 && closed.every((t) => t.currency === closed[0].currency) ? closed[0].currency : null;
  const gesamtPnlNative = singleCurrency ? closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0) : null;

  return (
    <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted">
          Handelshistorie
        </div>
        <div className="flex gap-1">
          {BROKER_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setBrokerFilter(f.key)}
              className={`text-xs px-2.5 py-1 rounded-btn transition-colors ${
                brokerFilter === f.key ? "bg-gold text-bg-app font-medium" : "text-text-muted hover:text-text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {saxoError && (
        <p className="text-xs text-loss mb-2">Saxo-Historie aktuell nicht verfügbar – zeigt nur Alpaca.</p>
      )}

      {!isLoading && history.length > 0 && (
        <div className="text-xs text-text-muted font-figures flex flex-wrap gap-x-3 gap-y-1 mb-4">
          {offen.length > 0 && <span className="text-paper">Offen: {offen.length}</span>}
          <span>Geschlossen: {closed.length}</span>
          <span className="text-gain">Gewinner: {gewinner}</span>
          <span className="text-loss">Verlierer: {verlierer}</span>
          <span className={gainLossClass(gesamtPnlNative ?? gesamtPnlEur)}>
            P&L{singleCurrency ? "" : " (≈ EUR)"}:{" "}
            {singleCurrency
              ? fmtMoneySigned(gesamtPnlNative, singleCurrency)
              : gesamtPnlEur !== null
                ? fmtMoneySigned(gesamtPnlEur, "EUR")
                : "–"}
          </span>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : history.length === 0 ? (
        <p className="text-text-muted text-sm py-4 text-center">Noch keine Trades.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <table className="w-full table-fixed text-xs md:text-sm">
            <colgroup>
              <col className="w-12 md:w-14" />
              <col className="w-16 md:w-20" />
              <col className="hidden md:table-column md:w-20" />
              <col className="hidden md:table-column md:w-20" />
              <col className="hidden md:table-column md:w-16" />
              <col />
              <col className="w-20 md:w-28" />
              <col className="hidden md:table-column md:w-14" />
              <col className="hidden md:table-column md:w-14" />
            </colgroup>
            <thead>
              <tr className="text-text-muted text-xs uppercase tracking-wider border-b border-border">
                <th className="text-left py-2 font-semibold">Datum</th>
                <th className="text-left py-2 font-semibold">Ticker</th>
                <th className="text-right py-2 font-semibold hidden md:table-cell">Entry</th>
                <th className="text-right py-2 font-semibold hidden md:table-cell">Kurs</th>
                <th className="text-right py-2 font-semibold hidden md:table-cell">Menge</th>
                <th className="text-right py-2 font-semibold">P&L</th>
                <th className="text-left py-2 font-semibold">Status</th>
                <th className="text-left py-2 font-semibold hidden md:table-cell">Broker</th>
                <th className="text-right py-2 font-semibold hidden md:table-cell">Score</th>
              </tr>
            </thead>
            <tbody>
              {history.map((t, i) => {
                const isOpen = t.status === "OPEN";
                // "Kurs"-Spalte: bei offenen Positionen der Live-Kurs statt des
                // (noch nicht existierenden) Exit-Preises; "P&L"-Spalte: bei
                // offenen Positionen der unrealisierte statt realisierte P&L.
                const kurs = isOpen ? t.current_price : t.exit_price;
                const pnl = isOpen ? t.unrealized_pnl : t.pnl;
                const pnlPct = isOpen ? t.unrealized_pnl_pct : t.pnl_pct;
                return (
                  <tr key={`${t.broker}-${t.ticker}-${t.closed_at ?? t.created_at}-${i}`} className="border-b border-border/50 last:border-0">
                    <td className="py-2 text-text-muted font-figures">{formatDatum(t.closed_at ?? t.created_at)}</td>
                    <td className="py-2 font-medium truncate">{t.ticker}</td>
                    <td className="py-2 text-right font-figures text-text-muted hidden md:table-cell">{fmtMoney(t.entry_price, t.currency)}</td>
                    <td className="py-2 text-right font-figures text-text-muted hidden md:table-cell">
                      {kurs != null ? fmtMoney(kurs, t.currency) : "–"}
                    </td>
                    <td className="py-2 text-right font-figures text-text-muted hidden md:table-cell">{fmtMenge(t.quantity)}</td>
                    <td className="py-2 text-right">
                      {pnl != null ? (
                        <>
                          <div className={`md:hidden font-figures font-semibold text-sm ${gainLossClass(pnl)}`}>
                            {fmtMoneySigned(pnl, t.currency)}
                          </div>
                          {pnlPct != null && (
                            <div className="md:hidden text-[11px] text-text-muted font-figures">
                              ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                            </div>
                          )}
                          <div className={`hidden md:block font-figures whitespace-nowrap ${gainLossClass(pnl)}`}>
                            {fmtMoneySigned(pnl, t.currency)}
                            {pnlPct != null && ` (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)`}
                          </div>
                        </>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="py-2">{statusBadge(t.exit_grund)}</td>
                    <td className="py-2 hidden md:table-cell">{brokerBadgeSmall(t.broker)}</td>
                    <td className="py-2 text-right font-figures text-text-muted hidden md:table-cell">{t.rule_score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BenchmarkBar({ label, pct, color, maxAbs }: { label: string; pct: number | null; color: string; maxAbs: number }) {
  if (pct === null) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="w-24 text-text-muted">{label}</span>
        <span className="text-text-muted">N/A</span>
      </div>
    );
  }
  const width = maxAbs > 0 ? Math.max(4, (Math.abs(pct) / maxAbs) * 100) : 0;
  return (
    <div className="flex items-center gap-2 md:gap-3 text-sm">
      <span className="w-16 md:w-24 text-text-muted truncate">{label}</span>
      <span className="font-figures w-14 md:w-16 shrink-0" style={{ color }}>
        {fmtPct(pct)}
      </span>
      <div className="flex-1 min-w-0 h-2 bg-bg-hover rounded-btn overflow-hidden">
        <div className="h-full rounded-btn" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  );
}

export default function Performance() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["key"]>("1m");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["performance"],
    queryFn: () => api.get<PerformanceData>("/api/performance").then((r) => r.data),
  });

  const { data: benchmark } = useQuery({
    queryKey: ["benchmark"],
    queryFn: () => api.get<Benchmark>("/api/benchmark", { params: { days: 30 } }).then((r) => r.data),
  });

  const { data: overview } = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.get<Overview>("/api/overview").then((r) => r.data),
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    const periodDef = PERIODS.find((p) => p.key === period);
    const snapshots = periodDef?.days
      ? data.snapshots.slice(-periodDef.days)
      : data.snapshots;
    return snapshots.map((s) => ({
      date: new Date(s.log_date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
      wert: s.portfolio_value,
    }));
  }, [data, period]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <KPISkeletonRow count={7} />
        <CardSkeleton className="h-64" />
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState message="Performance-Daten konnten nicht geladen werden." onRetry={() => refetch()} />;
  }

  const { stats } = data;
  const winRate = stats.total_trades ? ((stats.wins ?? 0) / stats.total_trades) * 100 : null;
  const unrealizedPnl = overview?.open_trades?.reduce((sum, t) => sum + t.unrealized_pnl, 0) ?? 0;

  const benchmarkRows = benchmark
    ? [
        { label: "Dein Bot", pct: benchmark.bot, color: "var(--color-gold)" },
        ...Object.entries(benchmark.benchmarks).map(([name, pct]) => ({
          label: name,
          pct,
          color: BENCHMARK_COLORS[name] ?? "var(--color-paper)",
        })),
      ]
    : [];
  const maxAbs = Math.max(1, ...benchmarkRows.map((r) => Math.abs(r.pct ?? 0)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2 md:gap-4">
        <KPICard label="Trades gesamt" value={String(stats.total_trades ?? 0)} color="neutral" />
        <KPICard
          label="Trefferquote"
          value={winRate !== null ? `${winRate.toFixed(0)}%` : "–"}
          color={winRate !== null && winRate >= 50 ? "gain" : "neutral"}
        />
        <KPICard
          label="Ø P&L"
          value={fmtUsdSigned(stats.avg_pnl)}
          color={stats.avg_pnl !== null && stats.avg_pnl >= 0 ? "gain" : "loss"}
        />
        <KPICard label="Bester Trade" value={fmtUsdSigned(stats.best_trade)} color="gain" />
        <KPICard label="Schlechtester Trade" value={fmtUsdSigned(stats.worst_trade)} color="loss" />
        <KPICard
          label="Realisierter P&L"
          value={overview ? fmtUsdSigned(overview.realized_pnl) : "…"}
          color={overview && overview.realized_pnl >= 0 ? "gain" : "loss"}
        />
        <KPICard
          label="Unrealisierter P&L"
          value={overview ? fmtUsdSigned(unrealizedPnl) : "…"}
          color={unrealizedPnl >= 0 ? "gain" : "loss"}
          subtext="nicht realisiert"
        />
      </div>

      <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted">
            Portfolio-Wert
          </div>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`text-xs px-2.5 py-1 rounded-btn transition-colors ${
                  period === p.key ? "bg-gold text-bg-app font-medium" : "text-text-muted hover:text-text-primary"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {chartData.length === 0 ? (
          <p className="text-text-muted text-sm py-8 text-center">Noch keine Performance-Daten.</p>
        ) : (
          <div className="h-48 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={11} />
                <YAxis
                  stroke="var(--color-text-muted)"
                  fontSize={11}
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  contentStyle={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: 3 }}
                  labelStyle={{ color: "var(--color-text-muted)" }}
                  formatter={(value) => [fmtUsd(Number(value)), "Portfolio"]}
                />
                <Line type="monotone" dataKey="wert" stroke="var(--color-gold)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <TradeHistorySection />

      <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5">
        <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted mb-4">
          Performance-Vergleich (30 Tage)
        </div>
        {benchmark?.bot === null || benchmark?.bot === undefined ? (
          <p className="text-text-muted text-sm">Noch nicht genug Historie für einen 30-Tage-Vergleich.</p>
        ) : (
          <div className="space-y-3">
            {benchmarkRows.map((row) => (
              <BenchmarkBar key={row.label} label={row.label} pct={row.pct} color={row.color} maxAbs={maxAbs} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
