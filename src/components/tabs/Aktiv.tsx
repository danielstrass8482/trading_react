"use client";

// Direkthandel-Feature (Konzept 2026-08-14, Backend Chunk 1 - Commits
// 388b3d2/ea8bf16, Frontend Chunk 2): Kunden können hier manuell, frei
// wählbar Aktien kaufen/verkaufen, unabhängig vom Bot. Aktuell Alpaca-only
// (Saxo bleibt Single-Tenant-Blocker, siehe Konzept-Dokument) - der
// Broker-Badge zeigt trotzdem broker-generisch an statt hart "ALPACA" zu
// kodieren, damit eine spätere Saxo-Erweiterung hier keine UI-Änderung
// braucht, nur einen neuen Broker-Wert in den API-Antworten.
//
// Mobile von Anfang an als Card-Layout gebaut (Name/Ticker eigene Zeile,
// Kurs/Status/P&L zweite Zeile, Card-Gruppen mit Abstand) - anders als bei
// der Handelshistorie/Sektor-Verteilung (48b03c6/6ac8260) sind das hier
// aber keine <table>-Zeilen, sondern von Anfang an eigenständige
// Card-Container: jedes Suchergebnis/jede Position ist bereits EIN Block,
// daher kein Bedarf für den dortigen Trick mit einer zweiten "Ergebnis"-
// Tabellenzeile - flex-col (Mobile) / md:flex-row (Desktop) auf demselben
// Card-Container reicht.
//
// Detail-Ansicht ist auf Mobile ein eigener Screen (Push-Navigation über
// internen View-State), keine Inline-Erweiterung - Chart+Score-Panel+Kauf-
// Formular sind zu viel Inhalt für eine Akkordeon-Zeile.

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Search as SearchIcon, ArrowLeft, AlertTriangle, Check, Loader2 } from "lucide-react";
import {
  api, ScoreBreakdown, ActiveSearchResult, ActiveAnalysis, ActiveSectorRecommendation,
  ManualTrade, ManualTradeOrigin, ActiveBuyRequest, ActiveSellRequest, BLACKLIST_LABELS,
} from "@/lib/api";
import { fmtUsd, fmtUsdSigned, fmtPct, fmtMenge, gainLossClass } from "@/lib/format";
import { CardSkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
import TickerLabel from "@/components/ui/TickerLabel";

// ── Kleine, lokale Hilfsstücke (bewusst pro Datei dupliziert statt geteilt -
// gleiche Konvention wie brokerBadgeSmall/statusBadge in Performance.tsx/
// Bestaetigungen.tsx) ────────────────────────────────────────────────────

function brokerBadge(broker: string) {
  const isAlpaca = broker === "alpaca";
  return (
    <span className={`text-[0.6rem] font-semibold px-1 py-0.5 rounded-btn shrink-0 ${isAlpaca ? "bg-gold/20 text-gold" : "bg-paper/20 text-paper"}`}>
      {broker.toUpperCase()}
    </span>
  );
}

// Identisch zu Performance.tsx (Score-Faktor-Anzeige) - gleiche Quelle
// (rule_engine.calculate_score), daher dieselben sechs Keys/Label.
const SCORE_FACTOR_LABELS: Record<string, string> = {
  rsi: "RSI",
  sma_trend: "SMA-Trend",
  volume: "Volumen",
  pe_ratio: "KGV (P/E)",
  debt_equity: "Verschuldung (D/E)",
  revenue_growth: "Umsatzwachstum",
};

function formatScoreValue(value: ScoreBreakdown[string]["value"]): string | null {
  if (value == null) return null;
  if (typeof value === "object") {
    const { sma50, sma200 } = value;
    if (sma50 == null && sma200 == null) return null;
    return `SMA50 ${sma50 ?? "–"} / SMA200 ${sma200 ?? "–"}`;
  }
  return String(value);
}

function BlacklistBanner({ flag }: { flag: string | null }) {
  if (!flag) return null;
  const label = BLACKLIST_LABELS[flag] ?? flag;
  return (
    <div className="flex items-start gap-2 bg-loss/10 border border-loss/40 rounded-card px-3 py-2.5 text-xs text-loss">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>Dieser Titel fällt in eine Kategorie, die der automatisierte Bot ausschließt: <b>{label}</b>. Du kannst trotzdem kaufen.</span>
    </div>
  );
}

function LimitedDataBanner() {
  return (
    <div className="flex items-start gap-2 bg-bg-hover border border-border rounded-card px-3 py-2.5 text-xs text-text-muted">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>Eingeschränkte Datenbasis (unter 200 Handelstage Historie) - der Score ist hier weniger aussagekräftig als bei etablierten Titeln.</span>
    </div>
  );
}

const MANUAL_STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-paper/15 text-paper",
  CLOSED_MANUAL: "bg-text-muted/15 text-text-muted",
  CLOSED_SL: "bg-loss/15 text-loss",
  CLOSED_TP: "bg-gain/15 text-gain",
  FAILED_ENTRY: "bg-loss/15 text-loss",
};

function statusBadge(status: string, grund: string) {
  const cls = MANUAL_STATUS_BADGE[status] ?? "bg-text-muted/15 text-text-muted";
  return (
    <span className={`inline-block text-[0.65rem] font-semibold px-2 py-0.5 rounded-btn leading-tight shrink-0 ${cls}`}>
      {grund}
    </span>
  );
}

// Idempotenz-Key wird EINMALIG beim Übergang input->review erzeugt (nicht
// bei jedem Klick neu, siehe Aufgabe) - crypto.randomUUID() ist in allen
// unterstützten Browsern verfügbar (Web Crypto API, HTTPS-Kontext).
function genClientOrderId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatChartDatum(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

// ════════════════════════════════════════════════════════════════════════
// View-State: "search"/"sector" sind die beiden Landing-Modi (Umschalter),
// "detail" ist der Push-Navigation-Screen nach einem Treffer-Klick -
// previousMode merkt sich, wohin "Zurück" führt.
// ════════════════════════════════════════════════════════════════════════

type SearchMode = "search" | "sector";
type View =
  | { kind: "list"; mode: SearchMode }
  | { kind: "detail"; ticker: string; origin: ManualTradeOrigin; previousMode: SearchMode };

export default function Aktiv() {
  const [view, setView] = useState<View>({ kind: "list", mode: "search" });

  const openDetail = (ticker: string, origin: ManualTradeOrigin) => {
    setView((v) => ({ kind: "detail", ticker, origin, previousMode: v.kind === "list" ? v.mode : "search" }));
  };
  const goBack = () => {
    setView((v) => ({ kind: "list", mode: v.kind === "detail" ? v.previousMode : "search" }));
  };

  if (view.kind === "detail") {
    return <DetailView ticker={view.ticker} origin={view.origin} onBack={goBack} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted mb-1">
          Aktiv
        </div>
        <p className="text-xs text-text-muted max-w-2xl">
          Kaufe frei wählbare Aktien manuell, unabhängig vom Bot - kein automatischer Stop-Loss/Take-Profit, keine
          Bot-Guardrails. Aktuell nur US-Titel über Alpaca.
        </p>
      </div>

      <SearchOrSectorSection mode={view.mode} onModeChange={(mode) => setView({ kind: "list", mode })} onSelect={openDetail} />

      <PositionsSection onSelect={openDetail} />
    </div>
  );
}

// ── Feature 1 + 2: Suche / Sektor-Empfehlung ────────────────────────────

function SearchOrSectorSection({
  mode, onModeChange, onSelect,
}: {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  onSelect: (ticker: string, origin: ManualTradeOrigin) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sectorQuery, setSectorQuery] = useState("");
  const [sectorSubmitted, setSectorSubmitted] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ticker/Name-Suche: live-as-you-type mit Debounce (billig, gecachte
  // Kurs-/Namens-Lookups im Backend). Sektor-Suche BEWUSST NICHT live -
  // scort dort bis zu 383 Watchlist-Ticker pro Aufruf (siehe active_trading.
  // sector_recommendation), das feuert nur auf explizites Absenden.
  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 400);
  }

  const searchQuery = useQuery({
    queryKey: ["active-search", debouncedQuery],
    queryFn: () => api.get<ActiveSearchResult[]>("/api/active/search", { params: { q: debouncedQuery } }).then((r) => r.data),
    enabled: mode === "search" && debouncedQuery.trim().length > 0,
  });

  const sectorQueryResult = useQuery({
    queryKey: ["active-sector-recommendation", sectorSubmitted],
    queryFn: () => api.get<ActiveSectorRecommendation>("/api/active/sector-recommendation", { params: { sector: sectorSubmitted } }).then((r) => r.data),
    enabled: mode === "sector" && sectorSubmitted.trim().length > 0,
  });

  return (
    <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5 space-y-4">
      <div className="flex gap-1">
        <button
          onClick={() => onModeChange("search")}
          className={`text-xs px-2.5 py-1 rounded-btn transition-colors ${mode === "search" ? "bg-gold text-bg-app font-medium" : "text-text-muted hover:text-text-primary"}`}
        >
          Ticker/Name
        </button>
        <button
          onClick={() => onModeChange("sector")}
          className={`text-xs px-2.5 py-1 rounded-btn transition-colors ${mode === "sector" ? "bg-gold text-bg-app font-medium" : "text-text-muted hover:text-text-primary"}`}
        >
          Sektor/Thema
        </button>
      </div>

      {mode === "search" ? (
        <>
          <div className="relative">
            <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled" />
            <input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Ticker, ISIN oder Firmenname…"
              className="w-full bg-bg-hover border border-border rounded-btn pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-gold/50"
            />
          </div>
          {debouncedQuery.trim().length > 0 && (
            <ResultList
              isLoading={searchQuery.isFetching}
              isError={searchQuery.isError}
              empty="Keine Treffer."
            >
              {(searchQuery.data ?? []).map((r) => (
                <SearchResultCard key={r.ticker} result={r} onClick={() => onSelect(r.ticker, "SEARCH")} />
              ))}
            </ResultList>
          )}
        </>
      ) : (
        <>
          <form
            onSubmit={(e) => { e.preventDefault(); setSectorSubmitted(sectorQuery); }}
            className="flex gap-2"
          >
            <input
              value={sectorQuery}
              onChange={(e) => setSectorQuery(e.target.value)}
              placeholder="z.B. Pharma, Erneuerbare Energien…"
              className="flex-1 min-w-0 bg-bg-hover border border-border rounded-btn px-3 py-2.5 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-gold/50"
            />
            <button
              type="submit"
              disabled={!sectorQuery.trim()}
              className="px-4 py-2.5 rounded-btn bg-gold text-bg-app text-sm font-medium disabled:opacity-50"
            >
              Suchen
            </button>
          </form>

          {sectorSubmitted.trim().length > 0 && (
            <>
              {sectorQueryResult.isLoading ? (
                <TableSkeleton rows={3} />
              ) : sectorQueryResult.isError ? (
                <ErrorState message="Sektor-Empfehlung konnte nicht geladen werden." onRetry={() => sectorQueryResult.refetch()} />
              ) : (
                <div className="space-y-3">
                  <BlacklistBanner flag={sectorQueryResult.data?.blacklist_flag ?? null} />
                  {sectorQueryResult.data && sectorQueryResult.data.candidates.length === 0 ? (
                    <p className="text-text-muted text-sm py-4 text-center">Keine Kandidaten für „{sectorQueryResult.data.sector_query}“ gefunden.</p>
                  ) : (
                    <div className="space-y-2">
                      {sectorQueryResult.data?.candidates.map((c) => (
                        <SectorCandidateCard key={c.ticker} candidate={c} onClick={() => onSelect(c.ticker, "SECTOR_RECOMMENDATION")} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ResultList({
  isLoading, isError, empty, children,
}: {
  isLoading: boolean;
  isError: boolean;
  empty: string;
  children: React.ReactNode;
}) {
  if (isLoading) return <TableSkeleton rows={3} />;
  if (isError) return <ErrorState message="Suche fehlgeschlagen." />;
  const items = Array.isArray(children) ? children : [children];
  if (items.length === 0) return <p className="text-text-muted text-sm py-4 text-center">{empty}</p>;
  return <div className="space-y-2">{children}</div>;
}

// Card statt Tabellenzeile - siehe Modul-Docstring. Mobile: Name eigene
// Zeile (flex-col), Kurs+Badge zweite Zeile. Desktop (md:flex-row): eine
// Zeile, TickerLabel wrapOnDesktop statt Abschneiden.
function SearchResultCard({ result, onClick }: { result: ActiveSearchResult; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-bg-hover/40 hover:bg-bg-hover border border-border rounded-card px-4 py-3 transition-colors"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1.5 md:gap-3">
        <TickerLabel ticker={result.ticker} companyName={result.company_name} wrapOnDesktop className="font-medium text-sm md:max-w-[60%]" />
        <div className="flex items-center justify-between md:justify-end gap-2">
          <span className="font-figures text-sm text-text-primary">{fmtUsd(result.price)}</span>
          {brokerBadge(result.broker)}
        </div>
      </div>
    </button>
  );
}

function SectorCandidateCard({ candidate, onClick }: { candidate: { ticker: string; company_name: string | null; score: number; current_price: number; sector: string | null; blacklist_flag: string | null }; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-bg-hover/40 hover:bg-bg-hover border border-border rounded-card px-4 py-3 transition-colors"
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <TickerLabel ticker={candidate.ticker} companyName={candidate.company_name} wrapOnDesktop className="font-medium text-sm" />
          <span className="font-figures text-sm font-semibold text-gold shrink-0">{candidate.score}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
          <span>{candidate.sector ?? "–"} · {fmtUsd(candidate.current_price)}</span>
          {candidate.blacklist_flag && (
            <span className="text-loss shrink-0">⚠ {BLACKLIST_LABELS[candidate.blacklist_flag] ?? candidate.blacklist_flag}</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Feature 1b: Detail-Ansicht + Kauf-Flow ──────────────────────────────

function DetailView({ ticker, origin, onBack }: { ticker: string; origin: ManualTradeOrigin; onBack: () => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["active-analysis", ticker],
    queryFn: () => api.get<ActiveAnalysis>(`/api/active/analysis/${ticker}`).then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors">
        <ArrowLeft size={16} /> Zurück
      </button>

      {isLoading ? (
        <CardSkeleton className="h-64" />
      ) : isError || !data ? (
        <ErrorState message="Daten für diesen Titel konnten nicht geladen werden." onRetry={() => refetch()} />
      ) : (
        <>
          <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5 space-y-4">
            <div>
              <TickerLabel ticker={data.ticker} companyName={data.company_name} wrapOnDesktop className="text-lg font-semibold text-text-primary" />
              <div className="font-figures text-2xl font-semibold text-text-primary mt-1">{fmtUsd(data.current_price)}</div>
            </div>

            {data.limited_data && <LimitedDataBanner />}
            <BlacklistBanner flag={data.blacklist_flag} />

            {data.chart.length === 0 ? (
              <p className="text-text-muted text-sm py-8 text-center">Kein Kursverlauf verfügbar.</p>
            ) : (
              <div className="h-48 md:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.chart.map((p) => ({ date: formatChartDatum(p.date), wert: p.close }))}>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={11} />
                    <YAxis stroke="var(--color-text-muted)" fontSize={11} domain={["auto", "auto"]} tickFormatter={(v) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: 3 }}
                      labelStyle={{ color: "var(--color-text-muted)" }}
                      formatter={(value) => [fmtUsd(Number(value)), "Kurs"]}
                    />
                    <Line type="monotone" dataKey="wert" stroke="var(--color-gold)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.7rem] font-semibold tracking-wider uppercase text-text-muted">Score</span>
                <span className="font-figures text-lg font-semibold text-gold">{data.score}/100</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 font-figures text-xs text-text-muted">
                {Object.entries(data.score_breakdown).map(([key, v]) => {
                  const formattedValue = formatScoreValue(v.value);
                  return (
                    <span key={key}>
                      {SCORE_FACTOR_LABELS[key] ?? key}: <span className="text-text-primary">{v.score}/{v.max}</span>
                      {formattedValue != null && <span className="text-text-disabled"> ({formattedValue})</span>}
                    </span>
                  );
                })}
              </div>
              <div className="text-xs text-text-disabled mt-2">
                Vorschlag bei Kauf: SL {fmtUsd(data.suggested_stop_loss)} · TP {fmtUsd(data.suggested_take_profit)} (wie beim Bot berechnet, rein informativ)
              </div>
            </div>
          </div>

          <BuyPanel ticker={data.ticker} currentPrice={data.current_price} origin={origin} onBought={onBack} />
        </>
      )}
    </div>
  );
}

function BuyPanel({
  ticker, currentPrice, origin, onBought,
}: {
  ticker: string;
  currentPrice: number;
  origin: ManualTradeOrigin;
  onBought: () => void;
}) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<"input" | "review">("input");
  const [amountMode, setAmountMode] = useState<"quantity" | "notional">("notional");
  const [amountValue, setAmountValue] = useState("");
  const [slValue, setSlValue] = useState("");
  const [tpValue, setTpValue] = useState("");
  const [successTrade, setSuccessTrade] = useState<ManualTrade | null>(null);
  const clientOrderIdRef = useRef<string | null>(null);
  const firedRef = useRef(false);

  const amountNum = Number(amountValue.replace(",", "."));
  const validAmount = amountValue.trim() !== "" && !Number.isNaN(amountNum) && amountNum > 0;
  const estimate = validAmount
    ? amountMode === "notional"
      ? { quantity: amountNum / currentPrice, cost: amountNum }
      : { quantity: amountNum, cost: amountNum * currentPrice }
    : null;

  const slNum = slValue.trim() !== "" ? Number(slValue.replace(",", ".")) : null;
  const tpNum = tpValue.trim() !== "" ? Number(tpValue.replace(",", ".")) : null;
  const slWarning = slNum != null && slNum >= currentPrice;
  const tpWarning = tpNum != null && tpNum <= currentPrice;

  const buyMutation = useMutation({
    // Backend antwortet synchron mit Timeout auf die Fill-Bestätigung
    // (siehe active_trading.buy()/_poll_fill, ~5s) - großzügiger Client-
    // Timeout als Sicherheitsnetz, kein Hängenbleiben bei einer
    // ungewöhnlich langsamen Antwort.
    mutationFn: (body: ActiveBuyRequest) => api.post<ManualTrade>("/api/active/buy", body, { timeout: 20000 }).then((r) => r.data),
    onSuccess: (trade) => {
      queryClient.invalidateQueries({ queryKey: ["manual-trades"] });
      setSuccessTrade(trade);
    },
    onError: () => {
      firedRef.current = false; // erneuter Versuch möglich - client_order_id bleibt gleich (Idempotenz)
    },
  });

  function handleGoToReview() {
    if (!validAmount) return;
    clientOrderIdRef.current = genClientOrderId(`buy-${ticker}`);
    setStage("review");
  }

  function handleConfirmBuy() {
    if (firedRef.current || !clientOrderIdRef.current) return;
    firedRef.current = true;
    const body: ActiveBuyRequest = {
      ticker, client_order_id: clientOrderIdRef.current, origin,
      ...(amountMode === "quantity" ? { quantity: amountNum } : { notional: amountNum }),
      ...(slNum != null ? { stop_loss_price: slNum } : {}),
      ...(tpNum != null ? { take_profit_price: tpNum } : {}),
    };
    buyMutation.mutate(body);
  }

  function resetForm() {
    setStage("input");
    setAmountValue("");
    setSlValue("");
    setTpValue("");
    setSuccessTrade(null);
    clientOrderIdRef.current = null;
    firedRef.current = false;
  }

  const isTimeout = (buyMutation.error as { code?: string } | null)?.code === "ECONNABORTED";
  const errorDetail = (buyMutation.error as { response?: { data?: { detail?: string } } } | null)?.response?.data?.detail;

  if (successTrade) {
    return (
      <div className="bg-bg-card border border-gain/40 rounded-card px-4 md:px-6 py-4 md:py-5 space-y-3">
        <div className="flex items-center gap-2 text-gain font-semibold">
          <Check size={16} /> Kauf platziert
        </div>
        <p className="text-sm text-text-muted">
          {fmtMenge(successTrade.quantity, 6)} {successTrade.ticker} für {fmtUsd(successTrade.capital_used)}.
          {successTrade.entry_price == null && (
            <> Die Order wurde bei Alpaca angenommen, der Kaufkurs ist noch nicht final bestätigt (z.B. weil der Markt gerade geschlossen ist) - die Position erscheint als offen in deiner Kaufhistorie, sobald der Fill bestätigt ist.</>
          )}
        </p>
        <button onClick={() => { resetForm(); onBought(); }} className="text-xs text-gold hover:underline">
          Fertig
        </button>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5 space-y-4">
      <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted">Kaufen</div>

      {stage === "input" ? (
        <>
          <div className="flex gap-1">
            <button
              onClick={() => setAmountMode("notional")}
              className={`text-xs px-2.5 py-1 rounded-btn transition-colors ${amountMode === "notional" ? "bg-gold text-bg-app font-medium" : "text-text-muted hover:text-text-primary"}`}
            >
              $-Betrag
            </button>
            <button
              onClick={() => setAmountMode("quantity")}
              className={`text-xs px-2.5 py-1 rounded-btn transition-colors ${amountMode === "quantity" ? "bg-gold text-bg-app font-medium" : "text-text-muted hover:text-text-primary"}`}
            >
              Stück
            </button>
          </div>

          <div>
            <label className="text-xs text-text-muted block mb-1">{amountMode === "notional" ? "Betrag ($)" : "Menge (Stück, Bruchteile möglich)"}</label>
            <input
              value={amountValue}
              onChange={(e) => setAmountValue(e.target.value)}
              inputMode="decimal"
              placeholder={amountMode === "notional" ? "z.B. 100" : "z.B. 1.5"}
              className="w-full bg-bg-hover border border-border rounded-btn px-3 py-2 text-sm font-figures text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-gold/50"
            />
            {estimate && (
              <p className="text-xs text-text-disabled mt-1 font-figures">
                {amountMode === "notional" ? `≈ ${fmtMenge(estimate.quantity, 6)} Stück` : `≈ ${fmtUsd(estimate.cost)} geschätzter Betrag`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Stop-Loss (optional, $)</label>
              <input
                value={slValue}
                onChange={(e) => setSlValue(e.target.value)}
                inputMode="decimal"
                placeholder="–"
                className="w-full bg-bg-hover border border-border rounded-btn px-3 py-2 text-sm font-figures text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-gold/50"
              />
              {slWarning && <p className="text-xs text-loss mt-1">Liegt über dem aktuellen Kurs - würde sofort auslösen.</p>}
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Take-Profit (optional, $)</label>
              <input
                value={tpValue}
                onChange={(e) => setTpValue(e.target.value)}
                inputMode="decimal"
                placeholder="–"
                className="w-full bg-bg-hover border border-border rounded-btn px-3 py-2 text-sm font-figures text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-gold/50"
              />
              {tpWarning && <p className="text-xs text-loss mt-1">Liegt unter dem aktuellen Kurs - würde sofort auslösen.</p>}
            </div>
          </div>
          <p className="text-[11px] text-text-disabled">
            Optional und frei wählbar (kein ATR, keine automatische Berechnung wie beim Bot). Ohne Angabe läuft die
            Position ohne automatischen Verkauf weiter, bis du sie manuell verkaufst.
          </p>

          <button
            onClick={handleGoToReview}
            disabled={!validAmount}
            className="w-full py-2.5 rounded-btn bg-gold text-bg-app text-sm font-medium disabled:opacity-50"
          >
            Kaufen
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <div className="bg-bg-hover rounded-card px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-text-muted">Ticker</span><span className="font-medium">{ticker}</span></div>
            <div className="flex justify-between">
              <span className="text-text-muted">{amountMode === "notional" ? "Betrag" : "Menge"}</span>
              <span className="font-figures">{amountMode === "notional" ? fmtUsd(amountNum) : `${fmtMenge(amountNum, 6)} Stück`}</span>
            </div>
            {estimate && (
              <div className="flex justify-between">
                <span className="text-text-muted">{amountMode === "notional" ? "≈ Menge" : "≈ Betrag"}</span>
                <span className="font-figures text-text-muted">{amountMode === "notional" ? `${fmtMenge(estimate.quantity, 6)} Stück` : fmtUsd(estimate.cost)}</span>
              </div>
            )}
            {slNum != null && <div className="flex justify-between"><span className="text-text-muted">Stop-Loss</span><span className="font-figures text-loss">{fmtUsd(slNum)}</span></div>}
            {tpNum != null && <div className="flex justify-between"><span className="text-text-muted">Take-Profit</span><span className="font-figures text-gain">{fmtUsd(tpNum)}</span></div>}
          </div>

          {buyMutation.isError && (
            <div className="flex items-start gap-2 bg-loss/10 border border-loss/40 rounded-card px-3 py-2.5 text-xs text-loss">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                {isTimeout
                  ? "Zeitüberschreitung - dein Kauf könnte trotzdem ausgeführt worden sein. Bitte prüfe deine Kaufhistorie unten, bevor du es erneut versuchst."
                  : errorDetail ?? "Kauf fehlgeschlagen. Bitte erneut versuchen."}
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStage("input")}
              disabled={buyMutation.isPending}
              className="flex-1 py-2.5 rounded-btn border border-border text-text-muted text-sm hover:text-text-primary transition-colors disabled:opacity-50"
            >
              Zurück
            </button>
            <button
              onClick={handleConfirmBuy}
              disabled={buyMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-btn bg-gold text-bg-app text-sm font-medium disabled:opacity-50"
            >
              {buyMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {buyMutation.isPending ? "Wird platziert…" : "Jetzt kaufen"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Feature 3: eigene Direkthandel-Positionen + Verkauf ─────────────────

function PositionsSection({ onSelect }: { onSelect: (ticker: string, origin: ManualTradeOrigin) => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["manual-trades"],
    queryFn: () => api.get<ManualTrade[]>("/api/active/manual-trades").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div>
        <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted border-b border-border pb-2 mb-3">
          Direkthandel-Positionen
        </div>
        <TableSkeleton rows={2} />
      </div>
    );
  }
  if (isError) {
    return <ErrorState message="Direkthandel-Positionen konnten nicht geladen werden." onRetry={() => refetch()} />;
  }

  const rows = data ?? [];
  const open = rows.filter((t) => t.status === "OPEN");
  const closed = rows.filter((t) => t.status !== "OPEN");

  return (
    <div>
      <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted border-b border-border pb-2 mb-3">
        Direkthandel-Positionen
      </div>
      <p className="text-xs text-text-disabled mb-3">
        Eigene manuelle Käufe - getrennt von den Bot-Positionen, fließen nicht in dessen Performance ein.
      </p>

      {open.length === 0 ? (
        <p className="text-text-muted text-sm py-3">Keine offenen Direkthandel-Positionen.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {open.map((t) => (
            <OpenPositionCard key={t.id} trade={t} />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div className="space-y-2">
          {closed.map((t) => (
            <ClosedPositionRow key={t.id} trade={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function OpenPositionCard({ trade }: { trade: ManualTrade }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const clientOrderIdRef = useRef<string | null>(null);
  const firedRef = useRef(false);

  const sellMutation = useMutation({
    mutationFn: (body: ActiveSellRequest) => api.post<ManualTrade>("/api/active/sell", body, { timeout: 20000 }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual-trades"] });
      setConfirming(false);
    },
    onError: () => {
      firedRef.current = false;
    },
  });

  function handleSellClick() {
    clientOrderIdRef.current = genClientOrderId(`sell-${trade.ticker}`);
    setConfirming(true);
  }
  function handleConfirmSell() {
    if (firedRef.current || !clientOrderIdRef.current) return;
    firedRef.current = true;
    sellMutation.mutate({ trade_id: trade.id, client_order_id: clientOrderIdRef.current });
  }

  const pnl = trade.unrealized_pnl;
  const isTimeout = (sellMutation.error as { code?: string } | null)?.code === "ECONNABORTED";
  const errorDetail = (sellMutation.error as { response?: { data?: { detail?: string } } } | null)?.response?.data?.detail;

  return (
    <div className="bg-bg-hover/40 border border-border rounded-card px-4 py-3 space-y-2">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1.5 md:gap-3">
        <TickerLabel ticker={trade.ticker} companyName={trade.company_name} wrapOnDesktop className="font-medium text-sm" />
        <div className="flex items-center gap-2">
          {statusBadge(trade.status, trade.exit_grund)}
          {(trade.stop_loss_price != null || trade.take_profit_price != null) && (
            <span className="text-[0.6rem] text-text-disabled font-figures">
              {trade.stop_loss_price != null && `SL ${fmtUsd(trade.stop_loss_price)}`}
              {trade.stop_loss_price != null && trade.take_profit_price != null && " · "}
              {trade.take_profit_price != null && `TP ${fmtUsd(trade.take_profit_price)}`}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-figures">
        <span className="text-text-muted">
          {fmtMenge(trade.quantity, 6)} Stück · Entry {trade.entry_price != null ? fmtUsd(trade.entry_price) : "wartet auf Fill"}
          {trade.current_price != null && <> · Kurs {fmtUsd(trade.current_price)}</>}
        </span>
        {pnl != null && (
          <span className={`font-semibold ${gainLossClass(pnl)}`}>
            {fmtUsdSigned(pnl)} {trade.unrealized_pnl_pct != null && `(${fmtPct(trade.unrealized_pnl_pct)})`}
          </span>
        )}
      </div>

      {confirming ? (
        <div className="space-y-2 pt-1 border-t border-border">
          <p className="text-xs text-text-muted pt-2">
            {fmtMenge(trade.quantity, 6)} {trade.ticker} zum aktuellen Marktpreis verkaufen?
          </p>
          {sellMutation.isError && (
            <p className="text-xs text-loss">
              {isTimeout ? "Zeitüberschreitung - Verkauf könnte trotzdem ausgeführt worden sein, bitte Status oben prüfen." : errorDetail ?? "Verkauf fehlgeschlagen."}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={sellMutation.isPending}
              className="flex-1 py-1.5 rounded-btn border border-border text-text-muted text-xs hover:text-text-primary transition-colors disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              onClick={handleConfirmSell}
              disabled={sellMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-btn bg-loss/15 text-loss text-xs font-medium hover:bg-loss/25 transition-colors disabled:opacity-50"
            >
              {sellMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : null}
              {sellMutation.isPending ? "Verkaufe…" : "Ja, verkaufen"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleSellClick}
          className="text-xs px-3 py-1.5 rounded-btn border border-border text-text-muted hover:text-text-primary hover:border-text-muted transition-colors"
        >
          Verkaufen
        </button>
      )}
    </div>
  );
}

function ClosedPositionRow({ trade }: { trade: ManualTrade }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0 text-xs">
      <TickerLabel ticker={trade.ticker} companyName={trade.company_name} wrapOnDesktop className="font-medium text-text-primary" />
      <div className="flex items-center gap-2 font-figures">
        {trade.pnl_usd != null && <span className={gainLossClass(trade.pnl_usd)}>{fmtUsdSigned(trade.pnl_usd)}</span>}
        {statusBadge(trade.status, trade.exit_grund)}
      </div>
    </div>
  );
}
