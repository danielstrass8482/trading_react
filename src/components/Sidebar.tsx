"use client";

import { BarChart2, TrendingUp, TrendingDown, Minus, Search, Settings, BookOpen, LogOut } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, Overview, BotConfigEntry, fmtGuardrailValue } from "@/lib/api";
import { logout } from "@/lib/auth";

export type TabKey = "uebersicht" | "performance" | "scanhistorie" | "einstellungen" | "dokumentation";

const NAV_ITEMS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { key: "uebersicht", label: "Übersicht", icon: BarChart2 },
  { key: "performance", label: "Performance", icon: TrendingUp },
  { key: "scanhistorie", label: "Scan-Historie", icon: Search },
  { key: "einstellungen", label: "Einstellungen", icon: Settings },
  { key: "dokumentation", label: "Dokumentation", icon: BookOpen },
];

const REGIME_LABEL: Record<string, { icon: typeof TrendingUp; label: string }> = {
  bullish: { icon: TrendingUp, label: "BULLISH" },
  bearish: { icon: TrendingDown, label: "BEARISH" },
  neutral: { icon: Minus, label: "NEUTRAL" },
};

function BrokerStatus({ overview, cfg }: { overview?: Overview; cfg: Record<string, string> }) {
  const activeBroker = cfg.ACTIVE_BROKER ?? "alpaca";
  const drainMode = (cfg.ALPACA_DRAIN_MODE ?? "false").toLowerCase() === "true";
  const alpacaOpen = (overview?.open_trades ?? []).filter((t) => (t.broker ?? "alpaca") === "alpaca").length;

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="px-2 mb-2 text-xs uppercase tracking-wider text-text-muted">Broker</div>
      <div className="px-2 space-y-2.5 text-xs">
        <div>
          <div className="flex items-center justify-between">
            <span className={`flex items-center gap-1.5 font-medium ${activeBroker === "alpaca" ? "text-gold" : "text-text-muted"}`}>
              <span className={activeBroker === "alpaca" ? "text-gold" : "text-text-disabled"}>●</span> ALPACA
              {overview?.trading_mode && <span className="text-text-muted font-normal">{overview.trading_mode}</span>}
            </span>
            {activeBroker === "alpaca" && drainMode && (
              <span className="text-[0.65rem] font-semibold px-1.5 py-0.5 rounded-btn bg-orange-500/20 text-orange-400">
                Drain
              </span>
            )}
          </div>
          <div className="text-text-muted font-figures mt-0.5">
            Konto: {overview ? `$${overview.portfolio_value.toLocaleString("de-DE", { maximumFractionDigits: 0 })}` : "…"} · Offene Pos: {alpacaOpen}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-medium text-text-muted">
              <span className="text-text-disabled">●</span> SAXO
            </span>
            <span className="text-[0.65rem] font-semibold px-1.5 py-0.5 rounded-btn bg-text-muted/20 text-text-muted">
              Demnächst
            </span>
          </div>
          <div className="text-text-muted mt-0.5">In Kürze verfügbar</div>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({
  active,
  onSelect,
}: {
  active: TabKey;
  onSelect: (key: TabKey) => void;
}) {
  const { data: overview } = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.get<Overview>("/api/overview").then((r) => r.data),
    refetchInterval: 60_000,
  });

  const { data: config } = useQuery({
    queryKey: ["bot-config"],
    queryFn: () => api.get<BotConfigEntry[]>("/api/bot-config").then((r) => r.data),
  });

  const cfg = Object.fromEntries((config ?? []).map((c) => [c.key, c.value]));
  const isLive = overview?.trading_mode === "LIVE";

  return (
    <aside className="w-64 shrink-0 bg-bg-sidebar border-r border-border min-h-screen flex flex-col px-4 py-6">
      <div className="mb-8 px-2">
        <div className="text-xl font-semibold text-gold">AI Trading Bot</div>
        <div className="text-xs text-text-muted mt-0.5">by Portfolio-OS</div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`flex items-center gap-3 px-3 py-2 rounded-nav text-sm text-left transition-colors border-l-2 ${
                isActive
                  ? "border-l-gold text-gold bg-bg-hover"
                  : "border-l-transparent text-text-muted hover:text-text-primary hover:bg-bg-hover"
              }`}
            >
              <Icon size={18} strokeWidth={1.5} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pt-6 border-t border-border">
        <div className="flex items-center justify-between px-2 mb-3">
          <span className="text-xs uppercase tracking-wider text-text-muted">Bot-Status</span>
          <span
            className={`text-[0.7rem] font-semibold px-2 py-0.5 rounded-btn flex items-center gap-1 ${
              isLive ? "bg-live/20 text-live" : "bg-paper/20 text-paper"
            }`}
          >
            ● {overview?.trading_mode ?? "…"}
          </span>
        </div>

        {overview && config && (
          <div className="px-2 space-y-1 text-xs text-text-muted font-figures">
            <div>
              Max/Trade: {fmtGuardrailValue("MAX_CAPITAL_PER_TRADE", cfg.MAX_CAPITAL_PER_TRADE ?? "0")} | Offene:{" "}
              {overview.open_trades.length}/{overview.max_open_positions}
            </div>
            <div>
              SL: ~{fmtGuardrailValue("STOP_LOSS_PCT", cfg.STOP_LOSS_PCT ?? "0")} | TP: ~
              {fmtGuardrailValue("TAKE_PROFIT_PCT", cfg.TAKE_PROFIT_PCT ?? "0")}
            </div>
            <div className="flex items-center gap-1">
              Regime:
              {(() => {
                const entry = REGIME_LABEL[overview.market_regime];
                if (!entry) return overview.market_regime;
                const Icon = entry.icon;
                return (
                  <span className="flex items-center gap-1">
                    <Icon size={12} strokeWidth={1.5} /> {entry.label}
                  </span>
                );
              })()}
            </div>
          </div>
        )}

        <BrokerStatus overview={overview} cfg={cfg} />

        <button
          onClick={logout}
          className="flex items-center gap-2 text-text-muted hover:text-loss transition-colors text-sm mt-4 px-2"
        >
          <LogOut size={14} /> Abmelden
        </button>
      </div>
    </aside>
  );
}
