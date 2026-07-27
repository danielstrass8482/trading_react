"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api, Performance as PerformanceData, Benchmark, Overview, TradeHistoryEntry } from "@/lib/api";
import KPICard from "@/components/ui/KPICard";
import { KPISkeletonRow, CardSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
import { fmtUsd, fmtUsdSigned, fmtPct, fmtMenge, gainLossClass } from "@/lib/format";

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

const EXIT_GRUND_BADGE: Record<string, string> = {
  "Stop Loss": "bg-loss/15 text-loss",
  "Take Profit": "bg-gain/15 text-gain",
  "Trailing Stop": "bg-gold/15 text-gold",
  "Time Exit (5 Tage)": "bg-text-muted/15 text-text-muted",
};

function exitGrundBadge(grund: string) {
  const cls = EXIT_GRUND_BADGE[grund] ?? "bg-text-muted/15 text-text-muted";
  return <span className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded-btn whitespace-nowrap ${cls}`}>{grund}</span>;
}

function formatDatum(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function TradeHistorySection() {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["trade-history"],
    queryFn: () => api.get<TradeHistoryEntry[]>("/api/trades/history", { params: { limit: 50 } }).then((r) => r.data),
  });

  const closed = history.filter((t) => t.pnl_usd !== null);
  const gewinner = closed.filter((t) => (t.pnl_usd ?? 0) > 0).length;
  const verlierer = closed.filter((t) => (t.pnl_usd ?? 0) <= 0).length;
  const gesamtPnl = closed.reduce((sum, t) => sum + (t.pnl_usd ?? 0), 0);

  return (
    <div className="bg-bg-card border border-border rounded-card px-6 py-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted">
          Handelshistorie
        </div>
        {!isLoading && closed.length > 0 && (
          <div className="text-xs text-text-muted font-figures">
            Abgeschlossene Trades: {closed.length} · Gewinner: {gewinner} · Verlierer: {verlierer} · Gesamt P&L:{" "}
            <span className={gainLossClass(gesamtPnl)}>{fmtUsdSigned(gesamtPnl)}</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : history.length === 0 ? (
        <p className="text-text-muted text-sm py-4 text-center">Noch keine abgeschlossenen Trades.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-xs uppercase tracking-wider border-b border-border">
                <th className="text-left py-2 font-semibold">Datum</th>
                <th className="text-left py-2 font-semibold">Ticker</th>
                <th className="text-right py-2 font-semibold">Entry</th>
                <th className="text-right py-2 font-semibold">Exit</th>
                <th className="text-right py-2 font-semibold">Menge</th>
                <th className="text-right py-2 font-semibold">P&L</th>
                <th className="text-left py-2 font-semibold">Grund</th>
                <th className="text-right py-2 font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {history.map((t, i) => (
                <tr key={`${t.ticker}-${t.closed_at}-${i}`} className="border-b border-border/50 last:border-0">
                  <td className="py-2 text-text-muted font-figures">{formatDatum(t.closed_at ?? t.created_at)}</td>
                  <td className="py-2 font-medium">{t.ticker}</td>
                  <td className="py-2 text-right font-figures text-text-muted">{fmtUsd(t.entry_price)}</td>
                  <td className="py-2 text-right font-figures text-text-muted">
                    {t.exit_price != null ? fmtUsd(t.exit_price) : "–"}
                  </td>
                  <td className="py-2 text-right font-figures text-text-muted">{fmtMenge(t.quantity)}</td>
                  <td className={`py-2 text-right font-figures ${gainLossClass(t.pnl_usd ?? 0)}`}>
                    {t.pnl_usd != null ? (
                      <>
                        {fmtUsdSigned(t.pnl_usd)}
                        {t.pnl_pct != null && ` (${t.pnl_pct >= 0 ? "+" : ""}${t.pnl_pct.toFixed(1)}%)`}
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="py-2">{exitGrundBadge(t.exit_grund)}</td>
                  <td className="py-2 text-right font-figures text-text-muted">{t.rule_score}</td>
                </tr>
              ))}
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
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 text-text-muted">{label}</span>
      <span className="font-figures w-16" style={{ color }}>
        {fmtPct(pct)}
      </span>
      <div className="flex-1 h-2 bg-bg-hover rounded-btn overflow-hidden">
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
      <div className="grid grid-cols-7 gap-4">
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

      <div className="bg-bg-card border border-border rounded-card px-6 py-5">
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
          <ResponsiveContainer width="100%" height={280}>
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
        )}
      </div>

      <TradeHistorySection />

      <div className="bg-bg-card border border-border rounded-card px-6 py-5">
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
