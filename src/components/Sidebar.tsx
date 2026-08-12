"use client";

import { useState } from "react";
import { BarChart2, TrendingUp, Search, Settings, BookOpen, LogOut, Menu, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api, Overview, SaxoOverview, BotConfigEntry, PauseStatus, PauseReason } from "@/lib/api";
import { logout, useAuthUser } from "@/lib/auth";
import MarketStatus from "@/components/MarketStatus";

export type TabKey = "uebersicht" | "performance" | "scanhistorie" | "bestaetigungen" | "einstellungen" | "dokumentation";

const NAV_ITEMS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { key: "uebersicht", label: "Übersicht", icon: BarChart2 },
  { key: "performance", label: "Performance", icon: TrendingUp },
  { key: "scanhistorie", label: "Scan-Historie", icon: Search },
  // Confirm-Tier Chunk 2b (2026-08-11): Dashboard-Queue für EXECUTION_MODE=
  // 'confirm'-Nutzer, siehe Bestaetigungen.tsx.
  { key: "bestaetigungen", label: "Bestätigungen", icon: Clock },
  { key: "einstellungen", label: "Einstellungen", icon: Settings },
  { key: "dokumentation", label: "Dokumentation", icon: BookOpen },
];

// Bottom-Nav zeigt nur die 4 Kernbereiche direkt; Dokumentation + Logout
// landen im "Mehr"-Sheet, damit auf schmalen Screens nur 5 Items nötig sind.
const BOTTOM_NAV_ITEMS: { key: TabKey | "mehr"; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }[] = [
  { key: "uebersicht", label: "Übersicht", icon: BarChart2 },
  { key: "performance", label: "Performance", icon: TrendingUp },
  { key: "scanhistorie", label: "Scan", icon: Search },
  { key: "einstellungen", label: "Einstellungen", icon: Settings },
  { key: "mehr", label: "Mehr", icon: Menu },
];

// Gemeinsames Badge fuer den Trading-Modus (LIVE/PAPER), genutzt in der
// Broker-Zeile unten (bg-live/text-live fuer LIVE, bg-paper/text-paper fuer
// PAPER) – seit 2026-08-06 die EINZIGE Live/Paper-Anzeige in der Desktop-
// Sidebar (die zuvor redundante "Bot-Status"-Karte mit eigenem Badge wurde
// entfernt, siehe unten). Auf Mobile zeigt MobileTopbar.tsx unabhängig
// davon denselben Status.
function ModeBadge({ mode }: { mode: string }) {
  const isLive = mode === "LIVE";
  return (
    <span className={`text-[0.65rem] font-semibold px-1.5 py-0.5 rounded-btn ${isLive ? "bg-live/20 text-live" : "bg-paper/20 text-paper"}`}>
      {mode}
    </span>
  );
}

// Punkt + Broker-Name in identischer Darstellung fuer beide Broker (vorher:
// Farbe haengte am ACTIVE_BROKER-Config-Wert, wodurch der jeweils NICHT
// aktive Broker gedimmt/grau wirkte – obwohl beide inzwischen parallel live
// handeln, siehe [[trading-bot-deployment]]).
function BrokerLabel({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-1.5 font-medium text-gold">
      <span className="text-gold">●</span> {name}
    </span>
  );
}

// Pause-Sichtbarkeit (2026-08-06, Alpaca+Saxo identisch, siehe
// broker.get_pause_status/broker_saxo.get_pause_status): deckt sowohl das
// bereits bestehende Tagesverlustlimit als auch den neuen Verlustserie-
// Cooldown ab – vorher gab es dafür in der UI überhaupt keine Anzeige, ein
// pausierter Bot wirkte identisch zu einem Bot ohne passende Kandidaten.
function pauseReasonText(r: PauseReason): string {
  if (r.reason === "daily_loss_limit") {
    return "Tagesverlust-Limit erreicht – pausiert bis manueller Reset";
  }
  const until = r.until
    ? new Date(r.until).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "?";
  return `${r.consecutive_losses ?? "?"} Verluste in Folge – pausiert bis ${until} Uhr`;
}

function PauseBadge({ status }: { status?: PauseStatus }) {
  if (!status?.paused) return null;
  return (
    <span className="text-[0.65rem] font-semibold px-1.5 py-0.5 rounded-btn bg-loss/20 text-loss">
      Pausiert
    </span>
  );
}

function PauseDetail({ status }: { status?: PauseStatus }) {
  if (!status?.paused) return null;
  return (
    <div className="mt-0.5 space-y-0.5">
      {status.reasons.map((r, i) => (
        <div key={i} className="text-loss text-[0.68rem]">{pauseReasonText(r)}</div>
      ))}
    </div>
  );
}

function BrokerStatus({
  overview, saxoOverview, cfg, saxoCfg,
}: {
  overview?: Overview; saxoOverview?: SaxoOverview; cfg: Record<string, string>; saxoCfg: Record<string, string>;
}) {
  const drainMode = (cfg.ALPACA_DRAIN_MODE ?? "false").toLowerCase() === "true";
  const saxoDrainMode = (saxoCfg.SAXO_DRAIN_MODE ?? "false").toLowerCase() === "true";
  const alpacaOpen = (overview?.open_trades ?? []).filter((t) => (t.broker ?? "alpaca") === "alpaca").length;

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="px-2 mb-2 text-xs uppercase tracking-wider text-text-muted">Broker</div>
      <div className="px-2 space-y-2.5 text-xs">
        <div>
          <div className="flex items-center justify-between">
            <BrokerLabel name="ALPACA" />
            <div className="flex items-center gap-1">
              {drainMode && (
                <span className="text-[0.65rem] font-semibold px-1.5 py-0.5 rounded-btn bg-orange-500/20 text-orange-400">
                  Drain
                </span>
              )}
              <PauseBadge status={overview?.pause_status} />
              {overview?.trading_mode && <ModeBadge mode={overview.trading_mode} />}
            </div>
          </div>
          <div className="text-text-muted font-figures mt-0.5">
            Konto: {overview ? `$${overview.portfolio_value.toLocaleString("de-DE", { maximumFractionDigits: 0 })}` : "…"} · Offene Pos: {alpacaOpen}
          </div>
          <PauseDetail status={overview?.pause_status} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <BrokerLabel name="SAXO" />
            <div className="flex items-center gap-1">
              {saxoDrainMode && (
                <span className="text-[0.65rem] font-semibold px-1.5 py-0.5 rounded-btn bg-orange-500/20 text-orange-400">
                  Drain
                </span>
              )}
              <PauseBadge status={saxoOverview?.pause_status} />
              {/* Saxo-Bot kennt bewusst nur LIVE (kein Paper-Modus, siehe
                  SaxoOverview/fromSaxoOpenTrade in api.ts). */}
              <ModeBadge mode="LIVE" />
            </div>
          </div>
          <div className="text-text-muted font-figures mt-0.5">
            Konto: {saxoOverview ? `€${saxoOverview.portfolio_value_eur.toLocaleString("de-DE", { maximumFractionDigits: 0 })}` : "…"} · Offene Pos: {saxoOverview?.open_trades.length ?? "…"}
          </div>
          <PauseDetail status={saxoOverview?.pause_status} />
        </div>
      </div>
    </div>
  );
}

// Sichtbar machen, welcher Account gerade eingeloggt ist – vorher stand das
// nirgends im UI, man konnte beim bloßen Blick aufs Dashboard nicht erkennen
// in welchem Account man unterwegs ist (relevant seit mehrere Nutzer eigene
// Accounts haben, siehe Multi-Tenant-Feature). Name/E-Mail kommen bereits aus
// sessionStorage (login() speichert sie dort, siehe auth.ts) – kein
// zusätzlicher API-Call nötig.
function UserBadge({ className = "" }: { className?: string }) {
  const user = useAuthUser();
  if (!user) return null;
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-text-primary text-sm font-medium truncate">{user.name}</div>
      {user.email && <div className="text-text-muted text-xs truncate">{user.email}</div>}
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

  // Bewusst nicht Teil eines gemeinsamen Error-Gates mit dem Alpaca-Overview
  // (analog Uebersicht.tsx/Performance.tsx) – fällt die Saxo-API aus, zeigt
  // die Broker-Zeile einfach "…" statt die ganze Sidebar zu brechen.
  const { data: saxoOverview } = useQuery({
    queryKey: ["overview", "saxo"],
    queryFn: () => api.get<SaxoOverview>("/api/saxo/overview").then((r) => r.data),
    refetchInterval: 60_000,
  });

  const { data: config } = useQuery({
    queryKey: ["bot-config"],
    queryFn: () => api.get<BotConfigEntry[]>("/api/bot-config").then((r) => r.data),
  });
  const { data: saxoConfig } = useQuery({
    queryKey: ["bot-config", "saxo"],
    queryFn: () => api.get<BotConfigEntry[]>("/api/saxo/bot-config").then((r) => r.data),
  });

  const cfg = Object.fromEntries((config ?? []).map((c) => [c.key, c.value]));
  const saxoCfg = Object.fromEntries((saxoConfig ?? []).map((c) => [c.key, c.value]));
  const [sheetOpen, setSheetOpen] = useState(false);

  // Bug-Fix (2026-08-12): "Bestätigungen" landet strukturell nie einen
  // Eintrag für EXECUTION_MODE='auto'-Nutzer (siehe database.
  // DEFAULT_USER_CONFIG/get_user_live_config - PENDING-Zeilen entstehen nur
  // im Confirm-Modus). cfg kommt bereits pro-Nutzer aufgelöst aus /api/
  // bot-config (Owner: global bot_config, sonst user_bot_config/DEFAULT_
  // USER_CONFIG), kein zusätzlicher Call nötig.
  const isConfirmMode = cfg.EXECUTION_MODE === "confirm";
  const navItems = NAV_ITEMS.filter((item) => item.key !== "bestaetigungen" || isConfirmMode);

  return (
    <>
    {/* FIX 2026-08-06: aside war vorher min-h-screen (wächst mit dem Inhalt
        über den Viewport hinaus) statt h-screen+sticky (fixe Höhe) - bei viel
        Sidebar-Inhalt (z.B. mehrere Pause-Hinweise in BrokerStatus) wurde
        dadurch der Logout-Button unten aus dem sichtbaren Bereich gedrängt.
        Jetzt: aside hat immer exakt Viewport-Höhe, NUR der mittlere Bereich
        (Nav+Marktzeiten+Broker) scrollt bei Bedarf intern - Logo oben und
        Logout unten bleiben immer sichtbar, unabhängig vom Inhalt dazwischen. */}
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 bg-bg-sidebar border-r border-border h-screen sticky top-0 px-4 py-6">
      <div className="mb-8 px-2 shrink-0">
        <div className="text-xl font-semibold text-gold">AI Trading Bot</div>
        <div className="text-xs text-text-muted mt-0.5">by Portfolio-OS</div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <nav className="flex flex-col gap-1">
          {navItems.map(({ key, label, icon: Icon }) => {
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

        <div className="mt-6 pt-6 border-t border-border">
          <div className="px-2 mb-2 text-xs uppercase tracking-wider text-text-muted">Marktzeiten</div>
          <MarketStatus />

          <BrokerStatus overview={overview} saxoOverview={saxoOverview} cfg={cfg} saxoCfg={saxoCfg} />
        </div>
      </div>

      <div className="shrink-0 pt-4 border-t border-border">
        <UserBadge className="px-2 mb-3" />
        <button
          onClick={logout}
          className="flex items-center gap-2 text-text-muted hover:text-loss transition-colors text-sm px-2"
        >
          <LogOut size={14} /> Abmelden
        </button>
      </div>
    </aside>

    <div className="fixed bottom-0 left-0 right-0 z-[9999] md:hidden">
      <nav
        style={{ height: "64px" }}
        className="bg-bg-sidebar border-t border-border flex justify-around items-center"
      >
        {BOTTOM_NAV_ITEMS.map(({ key, label, icon: Icon }) => {
          const isActive = key === "mehr" ? active === "dokumentation" || active === "bestaetigungen" : key === active;
          return (
            <button
              key={key}
              onClick={() => (key === "mehr" ? setSheetOpen(true) : onSelect(key))}
              className="flex flex-col items-center gap-1 py-2 px-3"
            >
              <Icon size={22} strokeWidth={1.5} className={isActive ? "text-gold" : "text-text-muted"} />
              <span className={`text-[9px] ${isActive ? "text-gold" : "text-text-muted"}`}>{label}</span>
              {isActive && <div className="w-1 h-1 rounded-full bg-gold" />}
            </button>
          );
        })}
      </nav>
      {/* Eigener Streifen statt Padding im Nav-Element, damit die Nav-Höhe
          immer exakt 64px bleibt (FIX 2: nie schrumpfen/wachsen beim Scrollen). */}
      <div style={{ height: "env(safe-area-inset-bottom)" }} className="bg-bg-sidebar" />
    </div>

    {sheetOpen && (
      <div
        className="fixed inset-0 z-[10000] md:hidden"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={() => setSheetOpen(false)}
      >
        <div
          className="absolute bottom-0 left-0 right-0 bg-bg-sidebar rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4 shrink-0" />

          {/* FIX 2026-08-06: analog zur Desktop-Sidebar intern scrollbar
              (max-h-[85vh] oben + overflow-y-auto hier) statt unbegrenzt zu
              wachsen - Dokumentation/Abmelden unten bleiben dadurch auch bei
              künftig mehr Inhalt hier (z.B. Broker-Status) immer erreichbar. */}
          <div className="flex-1 min-h-0 overflow-y-auto mb-3 pb-3 border-b border-border">
            <div className="px-3 mb-2 text-xs uppercase tracking-wider text-text-muted">Marktzeiten</div>
            <MarketStatus />
          </div>

          <div className="shrink-0">
            {isConfirmMode && (
              <button
                onClick={() => {
                  onSelect("bestaetigungen");
                  setSheetOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-primary hover:bg-bg-hover rounded-nav"
              >
                <Clock size={18} strokeWidth={1.5} /> Bestätigungen
              </button>
            )}
            <button
              onClick={() => {
                onSelect("dokumentation");
                setSheetOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-3 text-sm text-text-primary hover:bg-bg-hover rounded-nav"
            >
              <BookOpen size={18} strokeWidth={1.5} /> Dokumentation
            </button>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-3 text-sm text-loss hover:bg-bg-hover rounded-nav"
            >
              <LogOut size={18} strokeWidth={1.5} /> Abmelden
            </button>
            <UserBadge className="px-3 pt-2 pb-1 border-t border-border mt-1" />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
