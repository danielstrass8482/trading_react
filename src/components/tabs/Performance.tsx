"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ChevronDown, ChevronRight, ChevronUp, ArrowUpDown } from "lucide-react";
import {
  api, Performance as PerformanceData, Benchmark, SaxoBenchmark, TradeHistoryEntry,
  SaxoTradeEntry, SaxoOverview, SaxoPerformance, CombinedTradeEntry, ScoreBreakdown, fromAlpacaTrade, fromSaxoTrade,
} from "@/lib/api";
import KPICard from "@/components/ui/KPICard";
import { KPISkeletonRow, CardSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
import TickerLabel from "@/components/ui/TickerLabel";
import { fmtMoney, fmtMoneySigned, fmtPct, fmtMenge, gainLossClass } from "@/lib/format";

// Deutsche Labels für score_breakdown-Keys (siehe rule_engine.calculate_score
// in trading_bot bzw. trading_bot_saxo – identische Keys auf beiden Seiten).
const SCORE_FACTOR_LABELS: Record<string, string> = {
  rsi: "RSI",
  sma_trend: "SMA-Trend",
  volume: "Volumen",
  pe_ratio: "KGV (P/E)",
  debt_equity: "Verschuldung (D/E)",
  revenue_growth: "Umsatzwachstum",
};

// "value" ist bei den meisten Faktoren ein Skalar, bei "sma_trend" aber ein
// {sma50, sma200}-Objekt (siehe rule_engine.calculate_score) - das lässt sich
// nicht direkt als React-Kind rendern, daher hier explizit formatiert.
function formatScoreValue(value: ScoreBreakdown[string]["value"]): string | null {
  if (value == null) return null;
  if (typeof value === "object") {
    const { sma50, sma200 } = value;
    if (sma50 == null && sma200 == null) return null;
    return `SMA50 ${sma50 ?? "–"} / SMA200 ${sma200 ?? "–"}`;
  }
  return String(value);
}

const PERIODS = [
  { key: "1w", label: "1W", days: 7 },
  { key: "1m", label: "1M", days: 30 },
  { key: "3m", label: "3M", days: 90 },
  { key: "all", label: "Alles", days: null },
] as const;

// Sentinel für den Benchmark-Request bei period="all": die Backends
// (broker.get_bot_performance / broker_saxo.get_bot_performance_eur)
// kennen kein explizites "seit Anfang", sondern nutzen einfach den
// ältesten daily_log/saxo_daily_position_snapshot-Eintrag INNERHALB der
// letzten `days` Tage als Baseline. Ein Cutoff, der weit vor jedem real
// existierenden Snapshot liegt, wählt dadurch automatisch den allerersten
// Snapshot – kein Sonderfall-Handling in den Bots nötig (Fix 2026-08-07,
// siehe Diagnose "Performance-Vergleich (30 Tage)").
const ALL_TIME_DAYS = 3650;

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

const STATUS_FILTERS = [
  { key: "alle", label: "Alle" },
  { key: "offen", label: "Offen" },
  { key: "geschlossen", label: "Geschlossen" },
] as const;

// Currency-aware Aggregation für Kennzahlen über eine gemischte Trade-Menge
// (Alpaca=USD, Saxo=EUR/GBP je nach Börse) – EINZIGE Quelle sowohl für die
// Kennzahlen-Kacheln oben als auch die Zusammenfassungs-Zeile unter der
// Handelshistorie-Tabelle (Fix: vorher zogen die Kacheln ihre Zahlen separat
// aus /api/performance.stats, einer reinen Alpaca-SQL-Aggregation im
// Backend, die weder den Broker-Filter noch Saxo überhaupt kannte). Ist die
// gefilterte Menge einwährig (z.B. Broker-Filter=Alpaca, oder zufällig nur
// eine Börse betroffen), wird nativ summiert; bei Mischwährungen (Broker-
// Filter=Alle) auf eine EUR-Näherung umgerechnet (identisches Prinzip wie
// die "≈ EUR"-Werte in Uebersicht.tsx).
type PnlAggregate = {
  count: number;
  currency: string | null;
  nativeTotal: number | null;
  eurTotal: number | null;
};

function aggregatePnl(
  trades: CombinedTradeEntry[],
  getPnl: (t: CombinedTradeEntry) => number | null,
  fxRates: Record<string, number> | undefined,
): PnlAggregate {
  const withPnl = trades.filter((t) => getPnl(t) != null);
  const currency = withPnl.length > 0 && withPnl.every((t) => t.currency === withPnl[0].currency)
    ? withPnl[0].currency
    : null;
  const nativeTotal = currency ? withPnl.reduce((sum, t) => sum + (getPnl(t) ?? 0), 0) : null;
  const eurTotal = fxRates
    ? withPnl.reduce((sum, t) => sum + (getPnl(t) ?? 0) * (fxRates[t.currency] ?? 1), 0)
    : null;
  return { count: withPnl.length, currency, nativeTotal, eurTotal };
}

function fmtAggregate(agg: PnlAggregate): string {
  if (agg.currency && agg.nativeTotal != null) return fmtMoneySigned(agg.nativeTotal, agg.currency);
  if (agg.eurTotal != null) return fmtMoneySigned(agg.eurTotal, "EUR");
  return "–";
}

// Rekonstruiert den Portfolio-Startwert eines Brokers aus dessen aktuellem
// (Näherungs-)Wert und der vom jeweiligen Backend gelieferten %-Performance
// (algebraische Umkehrung von pct = (current-start)/start*100). Nötig, um
// Alpaca (USD) und Saxo (EUR) im "Performance-Vergleich" zu einer EINZIGEN,
// wertgewichteten %-Zahl zu kombinieren, OHNE dass die Backends selbst
// Rohwerte für Fremdwährungs-Kombination liefern müssten – dieselbe Art
// Näherung wie beim Portfolio-Wert-Chart oben (aktueller FX-Kurs statt
// historischer Kurse je Snapshot-Tag).
// Clamp (Kapitalfluss-Verzerrungs-Bugfix Chunk 2, 2026-08-11): algebraisch
// korrekt, aber numerisch instabil nahe pct=-100% - der Divisor geht gegen 0,
// der rekonstruierte Startwert explodiert (z.B. pct=-99.9% -> Divisor=0.001
// -> Startwert = 1000x der aktuelle Wert). Ein einzelner Broker mit einem
// solchen Extremwert würde die wertgewichtete Kombination komplett dominieren
// und eine sinnlose "Dein Bot"-Zahl erzeugen, statt sauber auf den anderen
// Broker zurückzufallen. Schwelle 5% Divisor (= pct <= -95%) statt exakt 0,
// da der Wert schon deutlich vor der echten Singularität unbrauchbar wird.
const RECONSTRUCT_MIN_ABS_DIVISOR = 0.05;

function reconstructStartValue(currentValue: number | null, pct: number | null): number | null {
  if (currentValue == null || pct == null) return null;
  const divisor = 1 + pct / 100;
  if (Math.abs(divisor) < RECONSTRUCT_MIN_ABS_DIVISOR) return null; // pct nahe -100%, numerisch instabil
  return currentValue / divisor;
}

// Bester/schlechtester Trade: bei Mischwährungen wird zum RANKING auf EUR
// umgerechnet (sonst vergleicht man USD- mit EUR-Beträgen direkt), die
// ANZEIGE bleibt aber der native Wert/Währung des jeweiligen Einzeltrades –
// aussagekräftiger als ein umgerechneter Näherungswert für einen einzelnen,
// konkreten Trade.
function extremeTrade(
  trades: CombinedTradeEntry[],
  getPnl: (t: CombinedTradeEntry) => number | null,
  mode: "max" | "min",
  fxRates: Record<string, number> | undefined,
): CombinedTradeEntry | null {
  const withPnl = trades.filter((t) => getPnl(t) != null);
  if (withPnl.length === 0) return null;
  const rank = (t: CombinedTradeEntry) => (fxRates ? (getPnl(t) ?? 0) * (fxRates[t.currency] ?? 1) : (getPnl(t) ?? 0));
  return withPnl.reduce((best, t) => {
    const better = mode === "max" ? rank(t) > rank(best) : rank(t) < rank(best);
    return better ? t : best;
  });
}

// Sortier-Spalten der Handelshistorie – "Kurs" und "P&L" folgen bewusst
// derselben isOpen-Verzweigung wie die Anzeige (offene Positionen: Live-
// Kurs/unrealisierter P&L statt Exit-Preis/realisierter P&L), damit Sortierung
// und angezeigter Wert nie auseinanderlaufen. Status ist bewusst NICHT
// sortierbar (kein Feld in der Spalten-Liste der Aufgabe).
const SORT_COLUMNS = {
  date: (t: CombinedTradeEntry) => new Date(t.closed_at ?? t.created_at).getTime(),
  ticker: (t: CombinedTradeEntry) => t.ticker,
  sector: (t: CombinedTradeEntry) => t.sector,
  entry: (t: CombinedTradeEntry) => t.entry_price,
  price: (t: CombinedTradeEntry) => (t.status === "OPEN" ? t.current_price : t.exit_price),
  quantity: (t: CombinedTradeEntry) => t.quantity,
  pnl: (t: CombinedTradeEntry) => (t.status === "OPEN" ? t.unrealized_pnl : t.pnl),
  broker: (t: CombinedTradeEntry) => t.broker,
  score: (t: CombinedTradeEntry) => t.rule_score,
} as const satisfies Record<string, (t: CombinedTradeEntry) => string | number | null>;

type SortKey = keyof typeof SORT_COLUMNS;
type SortDir = "asc" | "desc";

// Klickbarer Spaltenkopf mit Sortier-Pfeil – zeigt den Pfeil nur an der
// aktuell aktiven Spalte, sonst ein neutrales (schwach eingeblendetes)
// Auf/Ab-Icon als Hinweis, dass die Spalte klickbar ist.
function SortableTh({
  label, sortKey: key, align = "left", hideOnMobile, activeKey, dir, onSort,
}: {
  label: string;
  sortKey: SortKey;
  align?: "left" | "right";
  hideOnMobile?: boolean;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = activeKey === key;
  return (
    <th
      onClick={() => onSort(key)}
      className={`py-2 font-semibold cursor-pointer select-none hover:text-text-primary transition-colors ${align === "right" ? "text-right" : "text-left"} ${hideOnMobile ? "hidden md:table-cell" : ""} ${isActive ? "text-text-primary" : ""}`}
    >
      <span className={`inline-flex items-center gap-0.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        {isActive ? (
          dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ArrowUpDown size={11} className="text-text-disabled" />
        )}
      </span>
    </th>
  );
}

function TradeHistorySection({
  trades, isLoading, saxoError, realized, gewinner, verlierer, offenCount, closedCount,
}: {
  // Bereits vom Broker-Filter (siehe Performance()) eingeschränkte, über
  // beide Broker gemergte Liste – EINZIGE Quelle, dieselbe wie für die
  // Kennzahlen-Kacheln oben (Fix, siehe aggregatePnl-Docstring). Der
  // Status-Filter hier unten ist eine reine Tabellen-Einschränkung und bleibt
  // bewusst außerhalb der Zusammenfassung (sonst würde z.B. bei Status=
  // "Offen" die Zeile "Geschlossen: 0" zeigen, obwohl geschlossene Trades für
  // diesen Broker durchaus existieren) – realized/gewinner/verlierer/
  // offenCount/closedCount kommen deshalb als fertige Werte vom Parent.
  trades: CombinedTradeEntry[];
  isLoading: boolean;
  saxoError: boolean;
  realized: PnlAggregate;
  gewinner: number;
  verlierer: number;
  offenCount: number;
  closedCount: number;
}) {
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["key"]>("alle");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const history = statusFilter === "alle"
    ? trades
    : trades.filter((t) => (statusFilter === "offen" ? t.status === "OPEN" : t.status !== "OPEN"));

  // Sortierung wirkt auf die bereits Broker-/Status-gefilterte Liste – rein
  // clientseitig, die history ist mit limit=50 pro Broker klein genug.
  // Nullwerte (z.B. Kurs/P&L bei offenen Positionen ohne current_price)
  // landen unabhängig von der Richtung immer am Tabellenende statt die
  // Sortierreihenfolge zu verfälschen.
  const sortedHistory = useMemo(() => {
    const getValue = SORT_COLUMNS[sortKey];
    const arr = [...history];
    arr.sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [history, sortKey, sortDir]);

  return (
    <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted">
          Handelshistorie
        </div>
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`text-xs px-2.5 py-1 rounded-btn transition-colors ${
                statusFilter === f.key ? "bg-gold text-bg-app font-medium" : "text-text-muted hover:text-text-primary"
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
          {offenCount > 0 && <span className="text-paper">Offen: {offenCount}</span>}
          <span>Geschlossen: {closedCount}</span>
          <span className="text-gain">Gewinner: {gewinner}</span>
          <span className="text-loss">Verlierer: {verlierer}</span>
          <span className={gainLossClass(realized.nativeTotal ?? realized.eurTotal)}>
            P&L{realized.currency ? "" : " (≈ EUR)"}: {fmtAggregate(realized)}
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
              <col className="w-20 md:w-[9%]" />
              <col className="w-16 md:w-[9%]" />
              <col className="hidden md:table-column md:w-[10%]" />
              <col className="hidden md:table-column md:w-[11%]" />
              <col className="hidden md:table-column md:w-[11%]" />
              <col className="hidden md:table-column md:w-[8%]" />
              <col className="md:w-[15%]" />
              <col className="w-20 md:w-[13%]" />
              <col className="hidden md:table-column md:w-[8%]" />
              <col className="hidden md:table-column md:w-[6%]" />
            </colgroup>
            <thead>
              <tr className="text-text-muted text-xs uppercase tracking-wider border-b border-border">
                <SortableTh label="Datum" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Ticker" sortKey="ticker" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Sektor" sortKey="sector" hideOnMobile activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Entry" sortKey="entry" align="right" hideOnMobile activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Kurs" sortKey="price" align="right" hideOnMobile activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Menge" sortKey="quantity" align="right" hideOnMobile activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="P&L" sortKey="pnl" align="right" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="text-left py-2 pl-2 font-semibold">Status</th>
                <SortableTh label="Broker" sortKey="broker" hideOnMobile activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Score" sortKey="score" align="right" hideOnMobile activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedHistory.map((t, i) => {
                const isOpen = t.status === "OPEN";
                // "Kurs"-Spalte: bei offenen Positionen der Live-Kurs statt des
                // (noch nicht existierenden) Exit-Preises; "P&L"-Spalte: bei
                // offenen Positionen der unrealisierte statt realisierte P&L.
                const kurs = isOpen ? t.current_price : t.exit_price;
                const pnl = isOpen ? t.unrealized_pnl : t.pnl;
                const pnlPct = isOpen ? t.unrealized_pnl_pct : t.pnl_pct;
                const rowKey = `${t.broker}-${t.ticker}-${t.closed_at ?? t.created_at}-${i}`;
                const scoreFactors = Object.entries(t.score_breakdown);
                const hasDetails = !!t.llm_summary || t.llm_risks.length > 0 || scoreFactors.length > 0;
                const isExpanded = expandedKey === rowKey;
                return (
                  <Fragment key={rowKey}>
                  <tr
                    onClick={hasDetails ? () => setExpandedKey(isExpanded ? null : rowKey) : undefined}
                    className={`border-b border-border/50 last:border-0 ${hasDetails ? "cursor-pointer hover:bg-bg-hover" : ""}`}
                  >
                    <td className="py-2 text-text-muted font-figures">{formatDatum(t.closed_at ?? t.created_at)}</td>
                    <td className="py-2 font-medium truncate">
                      <span className="flex items-center gap-1 min-w-0">
                        {hasDetails && (
                          isExpanded
                            ? <ChevronDown size={13} className="text-text-muted shrink-0" />
                            : <ChevronRight size={13} className="text-text-muted shrink-0" />
                        )}
                        <TickerLabel ticker={t.ticker} companyName={t.company_name} className="max-w-[200px]" />
                      </span>
                    </td>
                    <td className="py-2 text-text-muted truncate hidden md:table-cell">{t.sector ?? "–"}</td>
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
                  {isExpanded && hasDetails && (
                    <tr className="border-b border-border/50 last:border-0 bg-bg-hover/40">
                      <td colSpan={10} className="px-2 py-3">
                        <div className="space-y-2 text-xs max-w-2xl">
                          {t.llm_summary && <p className="text-text-primary leading-relaxed">{t.llm_summary}</p>}
                          {t.llm_risks.length > 0 && (
                            <ul className="list-disc list-inside text-text-muted space-y-0.5">
                              {t.llm_risks.map((risk, idx) => <li key={idx}>{risk}</li>)}
                            </ul>
                          )}
                          {t.llm_sentiment != null && (
                            <div className="text-text-muted">LLM-Sentiment: <span className="font-figures text-text-primary">{t.llm_sentiment}/10</span></div>
                          )}
                          {scoreFactors.length > 0 && (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 font-figures text-text-muted pt-1 border-t border-border">
                              {scoreFactors.map(([key, v]) => {
                                const formattedValue = formatScoreValue(v.value);
                                return (
                                  <span key={key}>
                                    {SCORE_FACTOR_LABELS[key] ?? key}: <span className="text-text-primary">{v.score}/{v.max}</span>
                                    {formattedValue != null && <span className="text-text-disabled"> ({formattedValue})</span>}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
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
  // Globaler Broker-Filter (ersetzt den vormals lokalen Filter in der
  // Handelshistorie) – wirkt auf Portfolio-Wert-Chart, Handelshistorie-
  // Tabelle UND deren Zusammenfassungs-Zeile.
  const [brokerFilter, setBrokerFilter] = useState<(typeof BROKER_FILTERS)[number]["key"]>("alle");

  // Einmal berechnet, von chartData UND dem Benchmark-Request geteilt (Fix
  // 2026-08-07: der Benchmark-Request war vorher hart auf days=30
  // verdrahtet und ignorierte diesen Schalter komplett).
  const periodDef = PERIODS.find((p) => p.key === period)!;
  const benchmarkDays = periodDef.days ?? ALL_TIME_DAYS;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["performance"],
    queryFn: () => api.get<PerformanceData>("/api/performance").then((r) => r.data),
  });

  // Saxo-Portfolio-Historie (seit Kurzem verfügbar, siehe
  // trading_api_saxo.get_performance) – bewusst nicht Teil des Loading-Gates,
  // die Saxo-Ansicht des Charts zeigt bei Fehler/leer einfach den
  // Leer-Zustand statt die ganze Seite zu blockieren.
  const { data: saxoPerf } = useQuery({
    queryKey: ["saxo-performance"],
    queryFn: () => api.get<SaxoPerformance>("/api/saxo/performance").then((r) => r.data),
  });

  // Gleicher Query-Key wie in TradeHistorySection – react-query dedupt das
  // automatisch, hier nur für den USD/EUR-Kurs der "Alle"-Chart-Kombination
  // benötigt (siehe fxSubtext-Logik in Uebersicht.tsx).
  const { data: saxoOverview } = useQuery({
    queryKey: ["overview", "saxo"],
    queryFn: () => api.get<SaxoOverview>("/api/saxo/overview").then((r) => r.data),
  });

  // Feature-Paritäts-Fix 2026-08-07: vorher gab es nur den Alpaca-Aufruf
  // (hart auf days=30), Saxo hatte gar keinen /api/benchmark-Endpoint – die
  // Karte zeigte deshalb IMMER nur Alpacas Bot-Performance, egal welcher
  // Broker-Filter oben aktiv war. Beide Aufrufe folgen jetzt außerdem dem
  // 1W/1M/3M/Alle-Periodenschalter (benchmarkDays) statt einem festen Wert.
  const { data: benchmark } = useQuery({
    queryKey: ["benchmark", "alpaca", benchmarkDays],
    queryFn: () => api.get<Benchmark>("/api/benchmark", { params: { days: benchmarkDays } }).then((r) => r.data),
  });
  const { data: saxoBenchmark } = useQuery({
    queryKey: ["benchmark", "saxo", benchmarkDays],
    queryFn: () => api.get<SaxoBenchmark>("/api/saxo/benchmark", { params: { days: benchmarkDays } }).then((r) => r.data),
  });

  // Handelshistorie (offen+geschlossen, beide Broker) – EINZIGE Quelle für
  // sowohl die Kennzahlen-Kacheln oben als auch die Zusammenfassungs-Zeile
  // unter der Tabelle (siehe aggregatePnl-Docstring oben für die Begründung).
  const { data: alpacaHistory = [], isLoading: alpacaHistLoading } = useQuery({
    queryKey: ["trade-history", "alpaca"],
    queryFn: () => api.get<TradeHistoryEntry[]>("/api/trades/history", { params: { limit: 50 } }).then((r) => r.data),
  });
  // Saxo bewusst nicht Teil des Loading-Gates – fällt die Saxo-API aus,
  // zeigt die Tabelle/Kacheln einfach nur die Alpaca-Historie.
  const { data: saxoHistory = [], isLoading: saxoHistLoading, isError: saxoHistError } = useQuery({
    queryKey: ["trade-history", "saxo"],
    queryFn: () => api.get<SaxoTradeEntry[]>("/api/saxo/trades/history", { params: { limit: 50 } }).then((r) => r.data),
  });
  const historyLoading = alpacaHistLoading || saxoHistLoading;

  const merged = useMemo(() => {
    const combined: CombinedTradeEntry[] = [
      ...alpacaHistory.map(fromAlpacaTrade),
      ...saxoHistory.map(fromSaxoTrade),
    ];
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return combined;
  }, [alpacaHistory, saxoHistory]);

  const brokerFiltered = brokerFilter === "alle" ? merged : merged.filter((t) => t.broker === brokerFilter);
  const closed = brokerFiltered.filter((t) => t.pnl !== null);
  const offen = brokerFiltered.filter((t) => t.status === "OPEN");
  const gewinner = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const verlierer = closed.length - gewinner;
  const winRate = closed.length ? (gewinner / closed.length) * 100 : null;

  const fxRates = saxoOverview?.fx_rates_to_eur;
  const realized = useMemo(() => aggregatePnl(closed, (t) => t.pnl, fxRates), [closed, fxRates]);
  const unrealized = useMemo(() => aggregatePnl(offen, (t) => t.unrealized_pnl, fxRates), [offen, fxRates]);
  const realizedTotal = realized.count > 0
    ? (realized.currency && realized.nativeTotal != null ? realized.nativeTotal : realized.eurTotal) ?? null
    : null;
  const avgPnlPerTrade = realizedTotal != null ? realizedTotal / realized.count : null;
  const avgPnlCurrency = realized.currency ?? "EUR";
  const bestTrade = useMemo(() => extremeTrade(closed, (t) => t.pnl, "max", fxRates), [closed, fxRates]);
  const worstTrade = useMemo(() => extremeTrade(closed, (t) => t.pnl, "min", fxRates), [closed, fxRates]);

  const usdToEur = fxRates?.USD ?? null;
  // "Alle" kombiniert Alpaca+Saxo NUR, wenn ein aktueller USD/EUR-Kurs
  // vorliegt (siehe chartData unten) – ohne den fällt die Ansicht auf reine
  // Alpaca-Werte in USD zurück. chartCurrency folgt dieser Unterscheidung,
  // damit Achse/Tooltip nie € anzeigen, während tatsächlich rohe USD-Werte
  // im Chart stecken (vorheriger Bug: Fallback blieb immer auf "EUR" gelabelt).
  const canMergeAll = brokerFilter === "alle" && usdToEur != null;
  const chartCurrency = brokerFilter === "saxo" ? "EUR" : brokerFilter === "alpaca" ? "USD" : (canMergeAll ? "EUR" : "USD");

  // "Performance-Vergleich"-Karte (Fix 2026-08-07): kombiniert Alpacas und
  // Saxos %-Performance broker-filter-abhängig zu EINER "Dein Bot"-Zahl.
  // Bei "Alle" ist das eine wertgewichtete Kombination über EUR-Näherungs-
  // werte (siehe reconstructStartValue), NICHT einfach der Mittelwert der
  // beiden Prozentsätze – ein kleines Saxo-Depot darf ein großes Alpaca-
  // Ergebnis nicht 1:1 gleich stark verwässern/verstärken.
  const alpacaPct = benchmark?.bot ?? null;
  const saxoPct = saxoBenchmark?.bot ?? null;
  const alpacaCurrentUsd = data && data.snapshots.length > 0 ? data.snapshots[data.snapshots.length - 1].portfolio_value : null;
  const saxoCurrentEur = saxoPerf && saxoPerf.snapshots.length > 0 ? saxoPerf.snapshots[saxoPerf.snapshots.length - 1].portfolio_value_eur : null;
  const alpacaCurrentEur = alpacaCurrentUsd != null && usdToEur != null ? alpacaCurrentUsd * usdToEur : null;

  const combinedBenchmark = useMemo(() => {
    if (brokerFilter === "alpaca") return { pct: alpacaPct, isApprox: false };
    if (brokerFilter === "saxo") return { pct: saxoPct, isApprox: false };

    const alpacaStartEur = reconstructStartValue(alpacaCurrentEur, alpacaPct);
    const saxoStartEur = reconstructStartValue(saxoCurrentEur, saxoPct);
    if (alpacaStartEur != null && saxoStartEur != null && alpacaCurrentEur != null && saxoCurrentEur != null) {
      const startSum = alpacaStartEur + saxoStartEur;
      const currentSum = alpacaCurrentEur + saxoCurrentEur;
      if (startSum <= 0) return { pct: null, isApprox: false };
      return { pct: Math.round(((currentSum - startSum) / startSum) * 100 * 100) / 100, isApprox: true };
    }
    // Nur EIN Broker hat einen brauchbaren Startwert (z.B. Saxo-Historie
    // noch zu kurz, kein aktueller FX-Kurs verfügbar, ODER der Clamp oben
    // hat eine der beiden Rekonstruktionen wegen Instabilität nahe -100%
    // verworfen) -> Fallback auf diesen einen statt komplett auf null zu
    // fallen.
    if (alpacaStartEur != null && saxoStartEur == null) return { pct: alpacaPct, isApprox: false };
    if (saxoStartEur != null && alpacaStartEur == null) return { pct: saxoPct, isApprox: false };
    return { pct: null, isApprox: false };
  }, [brokerFilter, alpacaPct, saxoPct, alpacaCurrentEur, saxoCurrentEur]);

  const brokerLabel = brokerFilter === "alpaca" ? "Alpaca" : brokerFilter === "saxo" ? "Saxo" : "Alpaca + Saxo";
  const periodLabel = periodDef.days ? `${periodDef.days} Tage` : "Alles";

  // Kapitalfluss-Verzerrungs-Bugfix Chunk 2 (2026-08-11): "Dein Bot" wird
  // IMMER frisch mit der korrigierten TWR-Formel berechnet (Backend hat
  // keinen historisch gespeicherten %-Wert, siehe trading_shared.
  // performance-Docstring) - der Prozentwert selbst ist also für JEDES
  // Zeitfenster bereits korrekt, auch wenn es vor dem Fix-Datum beginnt
  // (Chunk 1 hat die komplette Kapitalfluss-Historie synchronisiert). Damit
  // das nicht wie ein unerklärter Bruch wirkt, falls das gewählte
  // Zeitfenster den Umstellungszeitpunkt überspannt, zeigt dieser Hinweis
  // dezent an WANN umgestellt wurde und dass ältere Rohwerte unangetastet
  // blieben - keine Warnung vor einer tatsächlichen Inkonsistenz.
  const formulaDeployAt = benchmark?.formula_deploy_at ?? saxoBenchmark?.formula_deploy_at ?? null;
  const periodSpansFormulaChange = useMemo(() => {
    if (!formulaDeployAt) return false;
    const deployDateStr = formulaDeployAt.slice(0, 10);
    const relevant = brokerFilter === "saxo" ? (saxoPerf?.snapshots ?? []) : (data?.snapshots ?? []);
    const sliced = periodDef.days ? relevant.slice(-periodDef.days) : relevant;
    return sliced.length > 0 && sliced[0].log_date < deployDateStr;
  }, [formulaDeployAt, periodDef.days, brokerFilter, data, saxoPerf]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const slice = <T,>(arr: T[]) => (periodDef.days ? arr.slice(-periodDef.days) : arr);

    if (brokerFilter === "alpaca") {
      return slice(data.snapshots).map((s) => ({ date: formatDatum(s.log_date), wert: s.portfolio_value }));
    }
    if (brokerFilter === "saxo") {
      return slice(saxoPerf?.snapshots ?? []).map((s) => ({ date: formatDatum(s.log_date), wert: s.portfolio_value_eur }));
    }
    // "Alle": kombinierter Tageswert über Datums-Union. Solange Saxo für ein
    // Datum noch keinen Snapshot hat (Account existierte damals schlicht
    // noch nicht/Snapshot-Tracking lief noch nicht), trägt es dort
    // korrekterweise 0 zum Total bei – das ist keine Näherung, sondern der
    // tatsächliche historische Gesamtwert. Näherung ist NUR die Umrechnung:
    // mangels historischer FX-Kurse wird der heutige USD/EUR-Kurs
    // rückwirkend auf alle Alpaca-Tage angewendet (identisches Prinzip wie
    // die "≈"-Kacheln in Uebersicht.tsx).
    if (!canMergeAll) {
      return slice(data.snapshots).map((s) => ({ date: formatDatum(s.log_date), wert: s.portfolio_value }));
    }
    const byDate = new Map<string, number>();
    for (const s of data.snapshots) byDate.set(s.log_date, (byDate.get(s.log_date) ?? 0) + s.portfolio_value * usdToEur!);
    for (const s of saxoPerf?.snapshots ?? []) byDate.set(s.log_date, (byDate.get(s.log_date) ?? 0) + s.portfolio_value_eur);
    const mergedChart = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return slice(mergedChart).map(([log_date, wert]) => ({ date: formatDatum(log_date), wert }));
  }, [data, saxoPerf, usdToEur, canMergeAll, periodDef.days, brokerFilter]);

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

  const benchmarkRows = benchmark
    ? [
        { label: "Dein Bot", pct: combinedBenchmark.pct, color: "var(--color-gold)" },
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
        <KPICard
          label="Trades gesamt"
          value={historyLoading ? "…" : String(brokerFiltered.length)}
          color="neutral"
        />
        <KPICard
          label="Trefferquote"
          value={winRate !== null ? `${winRate.toFixed(0)}%` : "–"}
          color={winRate !== null && winRate >= 50 ? "gain" : "neutral"}
        />
        <KPICard
          label="Ø P&L"
          value={avgPnlPerTrade != null ? fmtMoneySigned(avgPnlPerTrade, avgPnlCurrency) : "–"}
          color={avgPnlPerTrade != null && avgPnlPerTrade >= 0 ? "gain" : "loss"}
          subtext={!realized.currency && realized.eurTotal != null ? "≈ EUR" : undefined}
        />
        <KPICard
          label="Bester Trade"
          value={bestTrade ? fmtMoneySigned(bestTrade.pnl ?? 0, bestTrade.currency) : "–"}
          color="gain"
          subtext={bestTrade && <TickerLabel ticker={bestTrade.ticker} companyName={bestTrade.company_name} />}
        />
        <KPICard
          label="Schlechtester Trade"
          value={worstTrade ? fmtMoneySigned(worstTrade.pnl ?? 0, worstTrade.currency) : "–"}
          color="loss"
          subtext={worstTrade && <TickerLabel ticker={worstTrade.ticker} companyName={worstTrade.company_name} />}
        />
        <KPICard
          label="Realisierter P&L"
          value={fmtAggregate(realized)}
          color={(realized.nativeTotal ?? realized.eurTotal ?? 0) >= 0 ? "gain" : "loss"}
          subtext={!realized.currency && realized.eurTotal != null ? "≈ EUR" : undefined}
        />
        <KPICard
          label="Unrealisierter P&L"
          value={fmtAggregate(unrealized)}
          color={(unrealized.nativeTotal ?? unrealized.eurTotal ?? 0) >= 0 ? "gain" : "loss"}
          subtext={!unrealized.currency && unrealized.eurTotal != null ? "≈ EUR" : "nicht realisiert"}
        />
      </div>

      {/* Globaler Broker-Filter (Aufgabe "Globaler Broker-Filter") – wirkt auf
          Portfolio-Wert-Chart, Handelshistorie-Tabelle und deren
          Zusammenfassungs-Zeile darunter. */}
      <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted">
          Broker
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

      <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
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
        {brokerFilter === "alle" && (
          <div className="text-[0.65rem] text-text-disabled mb-3">
            {canMergeAll
              ? "Alpaca + Saxo kombiniert, ≈ EUR (heutiger USD/EUR-Kurs rückwirkend auf Alpaca-Werte angewendet). Saxo-Historie erst seit Kurzem verfügbar, daher für ältere Tage ggf. nur Alpaca-Anteil."
              : "Saxo-Umrechnungskurs aktuell nicht verfügbar – zeigt vorübergehend nur Alpaca (USD)."}
          </div>
        )}
        {chartData.length === 0 ? (
          <p className="text-text-muted text-sm py-8 text-center">
            {brokerFilter === "saxo" ? "Noch keine Saxo-Historie (Snapshot-Tracking läuft erst seit Kurzem)." : "Noch keine Performance-Daten."}
          </p>
        ) : (
          <div className="h-48 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={11} />
                <YAxis
                  stroke="var(--color-text-muted)"
                  fontSize={11}
                  domain={[0, "auto"]}
                  tickFormatter={(v) => `${chartCurrency === "EUR" ? "€" : "$"}${v}`}
                />
                <Tooltip
                  contentStyle={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: 3 }}
                  labelStyle={{ color: "var(--color-text-muted)" }}
                  formatter={(value) => [fmtMoney(Number(value), chartCurrency), "Portfolio"]}
                />
                <Line type="monotone" dataKey="wert" stroke="var(--color-gold)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <TradeHistorySection
        trades={brokerFiltered}
        isLoading={historyLoading}
        saxoError={saxoHistError}
        realized={realized}
        gewinner={gewinner}
        verlierer={verlierer}
        offenCount={offen.length}
        closedCount={closed.length}
      />

      <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5">
        <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted mb-1">
          {/* Zeitraum UND einbezogene Broker explizit im Titel (Fix 2026-08-07,
              siehe Diagnose "Performance-Vergleich (30 Tage)") – vorher stand
              hier immer "(30 Tage)", obwohl der Wert unabhängig vom Zeitraum-
              Schalter war UND ausschließlich Alpaca enthielt. */}
          Performance-Vergleich ({periodLabel} · {brokerLabel})
        </div>
        {combinedBenchmark.isApprox && (
          <div className="text-[0.65rem] text-text-disabled mb-1">
            Näherungswert: Alpaca (USD) + Saxo (EUR) wertgewichtet kombiniert, aktueller USD/EUR-Kurs
            rückwirkend auf Alpacas Startwert angewendet (wie beim Portfolio-Wert-Chart oben).
          </div>
        )}
        {periodSpansFormulaChange && formulaDeployAt && (
          <div className="text-[0.65rem] text-text-disabled mb-3">
            Seit {new Date(formulaDeployAt).toLocaleDateString("de-DE")} rechnet die Performance-%
            Ein-/Auszahlungen korrekt heraus – dieser Wert nutzt für den gesamten gewählten Zeitraum
            bereits die korrigierte Formel, die zugrundeliegenden Depotwerte blieben unverändert.
          </div>
        )}
        {combinedBenchmark.pct === null ? (
          <p className="text-text-muted text-sm">Noch nicht genug Historie für diesen Vergleichszeitraum ({periodLabel}).</p>
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
