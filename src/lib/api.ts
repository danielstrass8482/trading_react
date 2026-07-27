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
  portfolio_value: number;
  realized_pnl: number;
  open_trades: OpenTrade[];
  daily_trades: number;
  max_trades_per_day: number;
  max_open_positions: number;
  vix: number;
  market_regime: MarketRegime;
  trading_mode: TradingMode;
};

export type DailySnapshot = {
  log_date: string;
  portfolio_value: number;
  daily_pnl: number;
  trades_count: number;
};

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
};

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
export const GUARDRAIL_LABELS: Record<string, { label: string; format: "pct" | "usd" | "int" }> = {
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
};

export function fmtGuardrailValue(key: string, raw: string): string {
  const spec = GUARDRAIL_LABELS[key];
  const n = Number(raw);
  if (!spec || Number.isNaN(n)) return raw;
  if (spec.format === "pct") return `${(n * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })}%`;
  if (spec.format === "usd") return `${n.toLocaleString("de-DE", { maximumFractionDigits: 0 })} $`;
  return n.toLocaleString("de-DE");
}

export function parseGuardrailInput(key: string, display: string): string {
  const spec = GUARDRAIL_LABELS[key];
  const n = Number(display.replace(",", ".").replace("%", "").replace("$", "").trim());
  if (!spec || Number.isNaN(n)) return display;
  if (spec.format === "pct") return String(n / 100);
  return String(n);
}
