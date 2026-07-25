"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api, Performance as PerformanceData, Benchmark } from "@/lib/api";
import KPICard from "@/components/ui/KPICard";
import { KPISkeletonRow, CardSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
import { fmtUsd, fmtUsdSigned, fmtPct } from "@/lib/format";

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
        <KPISkeletonRow count={5} />
        <CardSkeleton className="h-64" />
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState message="Performance-Daten konnten nicht geladen werden." onRetry={() => refetch()} />;
  }

  const { stats } = data;
  const winRate = stats.total_trades ? ((stats.wins ?? 0) / stats.total_trades) * 100 : null;

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
      <div className="grid grid-cols-5 gap-4">
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
