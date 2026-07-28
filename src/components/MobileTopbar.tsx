"use client";

import { useQuery } from "@tanstack/react-query";
import { api, Overview, BotConfigEntry } from "@/lib/api";

export default function MobileTopbar() {
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
  const activeBroker = cfg.ACTIVE_BROKER ?? "alpaca";
  const isLive = overview?.trading_mode === "LIVE";

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-bg-sidebar border-b border-border flex justify-between items-center h-14 px-4 md:hidden">
      <span className="text-gold font-semibold text-base">AI Trading Bot</span>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-bg-card border border-border rounded-full px-3 py-1">
          <div className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-live" : "bg-paper"}`} />
          <span className={`text-xs ${isLive ? "text-live" : "text-paper"}`}>{overview?.trading_mode ?? "…"}</span>
          <span className="text-text-disabled text-xs">· {activeBroker.toUpperCase()}</span>
        </div>
      </div>
    </header>
  );
}
