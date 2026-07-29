import axios from "axios";
import { logout } from "./auth";

// Relative Pfade – Nginx proxied /api/ auf trading_api.py (Port 8504) bzw.
// /api/auth/ auf portfolio_os (Port 8503) im selben Origin wie das Frontend
// (siehe nginx sites-available/trading). Im lokalen Dev-Betrieb ohne Nginx
// davor kann NEXT_PUBLIC_API_URL gesetzt werden.
const baseURL = process.env.NEXT_PUBLIC_API_URL || "";

// withCredentials: JWT liegt in einem HttpOnly-Cookie (von portfolio_os
// gesetzt) – der Browser schickt es automatisch mit, kein manueller
// Authorization-Header nötig.
export const api = axios.create({ baseURL, withCredentials: true });

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) logout();
    return Promise.reject(error);
  }
);

export type AlpacaStatus =
  | { connected: false; error?: string }
  | { connected: true; mode: "paper" | "live"; status: string; buying_power: number; cash: number };

export type AlpacaConnectResponse = {
  message: string;
  account: { status: string; buying_power: number; cash: number; mode: "paper" | "live" };
};

export type MarketRegime = "bullish" | "bearish" | "neutral";
export type TradingMode = "LIVE" | "PAPER";

export type OpenTrade = {
  ticker: string;
  direction: string;
  instrument_type: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  quantity: number;
  capital_used: number;
  rule_score: number;
  trailing_sl_active: boolean;
  trailing_sl_price: number | null;
  created_at: string;
  mode: TradingMode;
  broker: string;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
};

export type Overview = {
  // Gesamt-Kontowert (cash + long_market_value) – broker-live von Alpaca
  // wenn erreichbar, sonst yfinance-Näherung (siehe trading_api.get_overview).
  portfolio_value: number;
  // Direkt von Alpaca (GET /v2/account): null falls Alpaca gerade nicht
  // erreichbar war (Frontend zeigt dann "–" statt eines falschen Werts).
  cash: number | null;              // verfügbares Kapital für neue Trades
  long_market_value: number | null; // gebunden in offenen Positionen (Marktwert)
  unrealized_pnl: number | null;    // Summe unrealized_pl aller offenen Alpaca-Positionen (Broker-Wahrheit)
  realized_pnl: number;
  open_trades: OpenTrade[];
  daily_trades: number;
  max_trades_per_day: number;
  max_open_positions: number;
  vix: number;
  market_regime: MarketRegime;
  trading_mode: TradingMode;
};

// Saxo-Bot (trading_bot_saxo-Repo, eigener Prozess/Port 8505, ueber
// /api/saxo/ genginx-geproxied) - eigenes EUR-Budget, komplett getrennt vom
// Alpaca-Bot. Bewusst ein EIGENER Typ statt Wiederverwendung von OpenTrade/
// Overview, da Felder abweichen (currency/exchange statt instrument_type,
// kein trailing_sl/mode, capital_used_eur statt capital_used).
export type SaxoOpenTrade = {
  ticker: string;
  exchange: string;
  currency: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  quantity: number;
  capital_used_eur: number;
  rule_score: number;
  created_at: string;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  broker: "saxo";
};

export type SaxoOverview = {
  portfolio_value_eur: number;
  // Direkt von Saxo (CashAvailableForTrading aus port/v1/balances) - NICHT
  // aus portfolio_value_eur minus Positionswert im Frontend abgeleitet, das
  // driftet ueber Zeit auseinander sobald DB-Werte (entry_price/
  // capital_used_eur) nicht exakt dem echten Saxo-Fill entsprechen (siehe
  // PHIA.AS-Sanity-Check 2026-07-29).
  cash_available_eur: number;
  realized_pnl_eur: number;
  daily_pnl_eur: number;
  open_trades: SaxoOpenTrade[];
  daily_trades: number;
  max_trades_per_day: number;
  max_open_positions: number;
  // Umrechnungskurse fuer alle im Depot vorkommenden Waehrungen -> EUR
  // (siehe broker_saxo.get_fx_rate_to_eur) - noetig um Alpacas USD-Wert und
  // ggf. GBP-Saxo-Trades zu einer EUR-Naeherung zu kombinieren.
  fx_rates_to_eur: Record<string, number>;
};

export type DailySnapshot = {
  log_date: string;
  portfolio_value: number;
  daily_pnl: number;
  trades_count: number;
};

// Saxo-Pendant zu DailySnapshot – eigener Typ da nur log_date/portfolio_value_eur
// geliefert werden (Quelle: saxo_daily_position_snapshot, Total-Zeile pro Tag,
// siehe trading_api_saxo.get_performance). Historie existiert erst seit
// Einführung des 17:30-CET-Snapshot-Jobs, ist also ggf. kurz.
export type SaxoDailySnapshot = {
  log_date: string;
  portfolio_value_eur: number;
};

export type SaxoPerformance = {
  snapshots: SaxoDailySnapshot[];
};

// Struktur von trades.score_breakdown / saxo_trades.score_breakdown (JSON,
// siehe rule_engine.calculate_score) – ein Eintrag pro Kriterium.
// "value" ist meist ein Skalar, außer bei "sma_trend": dort liefert
// rule_engine.calculate_score ein {sma50, sma200}-Objekt statt eines
// einzelnen Werts (siehe rule_engine.py Zeile ~357).
export type ScoreBreakdown = Record<
  string,
  { score: number; max: number; value: number | string | { sma50: number | null; sma200: number | null } | null }
>;

export type TradeStats = {
  total_trades: number | null;
  wins: number | null;
  losses: number | null;
  avg_pnl: number | null;
  best_trade: number | null;
  worst_trade: number | null;
};

export type Performance = {
  snapshots: DailySnapshot[];
  stats: TradeStats;
};

export type Benchmark = {
  bot: number | null;
  benchmarks: Record<string, number | null>;
};

export type ScanLogEntry = {
  id: number;
  scan_date: string;
  slot_et: string | null;
  scan_time: string;
  ticker: string;
  score: number;
  approved: boolean;
  rsi_score: number | null;
  sma_score: number | null;
  volume_score: number | null;
  pe_score: number | null;
  de_score: number | null;
  rev_score: number | null;
  ko_reason: string | null;
  guardrail_reason: string | null;
  trade_executed: boolean;
  mode: string;
  market_regime: MarketRegime | null;
  broker: string;
};

export type ScanSlot = {
  slot: string;
  tickers: ScanLogEntry[];
  total: number;
  above_threshold: number;
  trades: number;
  avg_score: number;
};

export type ScanDay = {
  date: string;
  slots: ScanSlot[];
};

// Rohform von trading_api_saxo.py GET /api/scan-log – bewusst separater Typ
// statt ScanLogEntry: "exchange" statt "slot_et" (der Saxo-Bot hat einen
// Entry-Zyklus pro Börse statt ET-Zeitslots, siehe SaxoScanSlot unten), kein
// market_regime (Saxo berechnet den nicht). "mode" fehlt bewusst (Saxo kennt
// nur LIVE, siehe trading_api_saxo.get_scan_log).
export type SaxoScanLogEntry = {
  id: number;
  scan_date: string;
  exchange: string | null;
  scan_time: string;
  ticker: string;
  score: number;
  approved: boolean;
  current_price: number | null;
  currency: string | null;
  rsi_score: number | null;
  sma_score: number | null;
  volume_score: number | null;
  pe_score: number | null;
  de_score: number | null;
  rev_score: number | null;
  ko_reason: string | null;
  guardrail_reason: string | null;
  trade_executed: boolean;
  broker: "saxo";
};

export type SaxoScanSlot = {
  slot: string; // = Börsen-Code (FSE/PAR/AMS/LSE_SETS), siehe trading_api_saxo.get_scan_log
  tickers: SaxoScanLogEntry[];
  total: number;
  above_threshold: number;
  trades: number;
  avg_score: number;
};

export type SaxoScanDay = {
  date: string;
  slots: SaxoScanSlot[];
};

// Merged Alpaca-ScanDay[] + Saxo-ScanDay[] zu einer gemeinsamen Liste für
// ScanHistorie.tsx – pro Datum werden die Slot-Arrays beider Broker einfach
// aneinandergehängt (Alpaca-Slots sind ET-Uhrzeiten, Saxo-Slots Börsen-Codes,
// die Labels überschneiden sich nie). Tage, die nur bei einem Broker
// existieren, bleiben erhalten (z.B. Alpaca hat heute noch nicht gescannt).
export function mergeScanDays(alpacaDays: ScanDay[], saxoDays: SaxoScanDay[]): ScanDay[] {
  const byDate = new Map<string, ScanSlot[]>();
  for (const day of alpacaDays) byDate.set(day.date, [...day.slots]);
  for (const day of saxoDays) {
    const existing = byDate.get(day.date);
    const saxoSlots = day.slots as unknown as ScanSlot[];
    byDate.set(day.date, existing ? [...existing, ...saxoSlots] : [...saxoSlots]);
  }
  return Array.from(byDate.entries())
    .map(([date, slots]) => ({ date, slots }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export type ScanLogStat = { grund: string; anzahl: number };

export type BotConfigEntry = { key: string; value: string; beschreibung: string | null };

export type EntrySlot = {
  id: number;
  stunde_et: number;
  minute_et: number;
  gewichtung: number;
  max_trades_per_slot: number | null;
  aktiv: boolean;
  avg_pnl: number | null;
  trefferquote: number | null;
  anzahl_trades: number;
  quelle: string;
};

export type TradeHistoryEntry = {
  ticker: string;
  direction: string;
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number;
  take_profit: number;
  capital_used: number;
  pnl_usd: number | null;
  pnl_pct: number | null;
  rule_score: number;
  status: string;
  broker: string;
  mode: TradingMode;
  created_at: string;
  closed_at: string | null;
  exit_grund: string;
  // Nur gesetzt wenn status === "OPEN" (siehe trading_api.py get_trade_history) –
  // pnl_usd/pnl_pct bleiben für offene Positionen bewusst NULL (realisierter P&L).
  current_price: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  // Einstiegsbegründung – bereits bei Trade-Erstellung gespeicherte Daten
  // (llm_analyst.py-Kommentar + rule_engine-Score-Breakdown, siehe
  // broker.place_trade), keine neue Textgenerierung. llm_summary/llm_sentiment
  // sind null wenn die LLM-Analyse nicht verfügbar war (degraded mode).
  llm_summary: string | null;
  llm_sentiment: number | null;
  llm_risks: string[];
  score_breakdown: ScoreBreakdown;
};

// Rohform von trading_api_saxo.py GET /api/trades/history – bewusst separater
// Typ statt TradeHistoryEntry (andere Feldnamen: currency/exchange statt
// direction/mode, pnl_eur statt pnl_usd, capital_used_eur statt capital_used).
export type SaxoTradeEntry = {
  ticker: string;
  exchange: string;
  currency: string;
  direction: string;
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number;
  take_profit: number;
  capital_used_eur: number;
  pnl_eur: number | null;
  pnl_pct: number | null;
  rule_score: number;
  status: string;
  created_at: string;
  closed_at: string | null;
  exit_grund: string;
  broker: "saxo";
  current_price: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  llm_summary: string | null;
  llm_sentiment: number | null;
  llm_risks: string[];
  score_breakdown: ScoreBreakdown;
};

// Gemeinsame Anzeige-Form für Performance.tsx, die Alpaca- (USD) und
// Saxo-Trades (EUR/GBP) nebeneinander in einer Tabelle darstellt – jede
// Zeile behält ihre eigene "currency" statt alles fälschlich als USD/EUR
// auszugeben. "pnl"/"pnl_pct" sind der REALISIERTE G/V (NULL bei OPEN,
// unverändert – siehe database.get_total_pnl/get_daily_pnl bzw.
// get_total_pnl_eur/get_daily_pnl_eur, hier nirgends angefasst).
export type CombinedTradeEntry = {
  ticker: string;
  broker: "alpaca" | "saxo";
  currency: string;
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  current_price: number | null;
  pnl: number | null;
  pnl_pct: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  rule_score: number;
  status: string;
  exit_grund: string;
  created_at: string;
  closed_at: string | null;
  llm_summary: string | null;
  llm_sentiment: number | null;
  llm_risks: string[];
  score_breakdown: ScoreBreakdown;
};

export function fromAlpacaTrade(t: TradeHistoryEntry): CombinedTradeEntry {
  return {
    ticker: t.ticker, broker: "alpaca", currency: "USD", quantity: t.quantity,
    entry_price: t.entry_price, exit_price: t.exit_price, current_price: t.current_price,
    pnl: t.pnl_usd, pnl_pct: t.pnl_pct,
    unrealized_pnl: t.unrealized_pnl, unrealized_pnl_pct: t.unrealized_pnl_pct,
    rule_score: t.rule_score, status: t.status, exit_grund: t.exit_grund,
    created_at: t.created_at, closed_at: t.closed_at,
    // Defensive Fallbacks: älterer Backend-Stand (vor Rollout dieser Felder)
    // liefert diese Keys schlicht nicht mit.
    llm_summary: t.llm_summary ?? null, llm_sentiment: t.llm_sentiment ?? null,
    llm_risks: t.llm_risks ?? [], score_breakdown: t.score_breakdown ?? {},
  };
}

export function fromSaxoTrade(t: SaxoTradeEntry): CombinedTradeEntry {
  return {
    ticker: t.ticker, broker: "saxo", currency: t.currency, quantity: t.quantity,
    entry_price: t.entry_price, exit_price: t.exit_price, current_price: t.current_price,
    pnl: t.pnl_eur, pnl_pct: t.pnl_pct,
    unrealized_pnl: t.unrealized_pnl, unrealized_pnl_pct: t.unrealized_pnl_pct,
    rule_score: t.rule_score, status: t.status, exit_grund: t.exit_grund,
    created_at: t.created_at, closed_at: t.closed_at,
    llm_summary: t.llm_summary ?? null, llm_sentiment: t.llm_sentiment ?? null,
    llm_risks: t.llm_risks ?? [], score_breakdown: t.score_breakdown ?? {},
  };
}

// Gemeinsame Anzeige-Form für Uebersicht.tsx (offene Positionen beider
// Broker in einer Liste/Kartenansicht) – Saxo-Felder ohne Alpaca-spezifische
// Konzepte (trailing_sl/mode) werden mit sinnvollen Defaults aufgefüllt statt
// die Karten-Darstellung mit optionalen Feldern zu verzweigen.
export type CombinedOpenPosition = {
  ticker: string;
  broker: "alpaca" | "saxo";
  currency: string;
  entry_price: number;
  current_price: number;
  stop_loss: number;
  take_profit: number;
  quantity: number;
  capital_used: number;
  rule_score: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  trailing_sl_active: boolean;
  trailing_sl_price: number | null;
  mode: TradingMode;
};

export function fromAlpacaOpenTrade(t: OpenTrade): CombinedOpenPosition {
  return {
    ticker: t.ticker, broker: "alpaca", currency: "USD",
    entry_price: t.entry_price, current_price: t.current_price,
    stop_loss: t.stop_loss, take_profit: t.take_profit, quantity: t.quantity,
    capital_used: t.capital_used,
    rule_score: t.rule_score, unrealized_pnl: t.unrealized_pnl, unrealized_pnl_pct: t.unrealized_pnl_pct,
    trailing_sl_active: t.trailing_sl_active, trailing_sl_price: t.trailing_sl_price, mode: t.mode,
  };
}

export function fromSaxoOpenTrade(t: SaxoOpenTrade): CombinedOpenPosition {
  return {
    ticker: t.ticker, broker: "saxo", currency: t.currency,
    entry_price: t.entry_price, current_price: t.current_price,
    stop_loss: t.stop_loss, take_profit: t.take_profit, quantity: t.quantity,
    capital_used: t.capital_used_eur,
    rule_score: t.rule_score, unrealized_pnl: t.unrealized_pnl, unrealized_pnl_pct: t.unrealized_pnl_pct,
    trailing_sl_active: false, trailing_sl_price: null, mode: "LIVE",
  };
}

export type LearningProposal = {
  index: number;
  typ: string;
  erstellt: string;
  status: string;
  data: {
    typ: string;
    aktuell?: number;
    empfohlen?: number;
    begruendung?: string;
    vorschlaege?: { ticker: string; aktion: string; begruendung: string }[];
  };
};

// Guardrail-Keys → deutsche Labels + Formatierungsregel, identisch zum
// Pendant in portfolio_react/src/lib/api.ts (gleiche bot_config-Keys).
// SAXO_*-Keys (eigener Kapitaltopf, EUR statt USD) hier zusätzlich gepflegt,
// da beide Broker dieselben GuardrailCard/PresetsSection-Komponenten nutzen.
export const GUARDRAIL_LABELS: Record<string, { label: string; format: "pct" | "usd" | "eur" | "int" }> = {
  DAILY_LOSS_LIMIT_PCT: { label: "Tagesverlust-Limit", format: "pct" },
  MAX_CAPITAL_TOTAL: { label: "Gesamtkapital", format: "usd" },
  MAX_CAPITAL_PER_TRADE: { label: "Max. pro Trade", format: "usd" },
  MAX_TRADES_PER_DAY: { label: "Max. Trades/Tag", format: "int" },
  MAX_OPEN_POSITIONS: { label: "Max. offene Positionen", format: "int" },
  VIX_PAUSE_THRESHOLD: { label: "VIX-Limit", format: "int" },
  STOP_LOSS_PCT: { label: "Stop Loss (Fallback)", format: "pct" },
  TAKE_PROFIT_PCT: { label: "Take Profit (Fallback)", format: "pct" },
  MIN_SIGNAL_SCORE: { label: "Min. Signal Score", format: "int" },
  ATR_MULTIPLIER_SL: { label: "ATR-Multiplikator SL", format: "int" },
  ATR_MULTIPLIER_TP: { label: "ATR-Multiplikator TP", format: "int" },
  MAX_HOLDING_DAYS: { label: "Max. Haltedauer (Tage)", format: "int" },
  VOLATILE_SEGMENT_PCT: { label: "Volatiles Segment (Ziel)", format: "pct" },
  EARNINGS_BUFFER_DAYS: { label: "Earnings-Puffer (Tage)", format: "int" },
  // Saxo (eigener Kapitaltopf, EUR)
  SAXO_DAILY_LOSS_LIMIT_PCT: { label: "Tagesverlust-Limit", format: "pct" },
  SAXO_MAX_CAPITAL_TOTAL: { label: "Gesamtkapital", format: "eur" },
  SAXO_MAX_CAPITAL_PER_TRADE: { label: "Max. pro Trade", format: "eur" },
  SAXO_MAX_TRADES_PER_DAY: { label: "Max. Trades/Tag", format: "int" },
  SAXO_MAX_OPEN_POSITIONS: { label: "Max. offene Positionen", format: "int" },
  SAXO_STOP_LOSS_PCT: { label: "Stop Loss", format: "pct" },
  SAXO_TAKE_PROFIT_PCT: { label: "Take Profit", format: "pct" },
  SAXO_MIN_SIGNAL_SCORE: { label: "Min. Signal Score", format: "int" },
};

export function fmtGuardrailValue(key: string, raw: string): string {
  const spec = GUARDRAIL_LABELS[key];
  const n = Number(raw);
  if (!spec || Number.isNaN(n)) return raw;
  if (spec.format === "pct") return `${(n * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`;
  if (spec.format === "usd") return `${n.toLocaleString("de-DE", { maximumFractionDigits: 0 })} $`;
  if (spec.format === "eur") return `${n.toLocaleString("de-DE", { maximumFractionDigits: 0 })} €`;
  return n.toLocaleString("de-DE");
}

export function parseGuardrailInput(key: string, display: string): string {
  const spec = GUARDRAIL_LABELS[key];
  const n = Number(display.replace(",", ".").replace("%", "").replace("$", "").replace("€", "").trim());
  if (!spec || Number.isNaN(n)) return display;
  if (spec.format === "pct") return String(n / 100);
  return String(n);
}
