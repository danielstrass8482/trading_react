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
  // yfinance-Sektor zum Entry-Zeitpunkt, siehe TradeHistoryEntry.sector.
  sector: string | null;
  trailing_sl_active: boolean;
  trailing_sl_price: number | null;
  created_at: string;
  mode: TradingMode;
  broker: string;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  // Handelstage bis zum automatischen Time-Exit (siehe broker.monitor_open_positions):
  // MAX_HOLDING_DAYS ohne aktiven Trailing-SL, sonst die harte Obergrenze
  // MAX_HOLDING_DAYS * MAX_HOLDING_DAYS_TRAILING_MULTIPLIER. Kann rechnerisch
  // <= 0 sein (Exit steht unmittelbar bevor / überfällig), siehe Uebersicht.tsx.
  // Seit der Time-Exit-Familie für Saxo (Alpaca-Parität) auch dort gesetzt,
  // siehe SaxoOpenTrade.
  // Fix 2026-08-05 (UPS-Befund): während einer laufenden Schutzfrist (siehe
  // time_exit_grace_active) zählt dieser Wert die Handelstage bis zur
  // Schutzfrist-Deadline, NICHT bis zur ursprünglichen MAX_HOLDING_DAYS-
  // Grenze (die ist für diese Position bereits überholt).
  time_exit_days_remaining: number;
  // true, solange eine gewährte Schutzfrist noch läuft (trade.time_exit_grace_used
  // und die Deadline noch nicht erreicht) – siehe trading_api.get_overview.
  time_exit_grace_active: boolean;
  // ISO-Datum der Schutzfrist-Deadline, nur gesetzt wenn time_exit_grace_active.
  time_exit_grace_deadline: string | null;
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
  sector: string | null;
  created_at: string;
  current_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  broker: "saxo";
  // Seit der Time-Exit-Familie für Saxo (Alpaca-Parität, broker_saxo.
  // _check_time_exit) – Bedeutung identisch zu OpenTrade, siehe dortige
  // Kommentare. Bei Saxo wird der Stop broker-seitig als echte Order
  // nachgezogen (replace_stop_order), nicht nur als DB-Wert wie bei Alpaca.
  trailing_sl_active: boolean;
  trailing_sl_price: number | null;
  time_exit_days_remaining: number;
  time_exit_grace_active: boolean;
  time_exit_grace_deadline: string | null;
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

export const MIN_SIGNAL_SCORE = 65;

// scan_time kommt vom Backend als naiver Timestamp OHNE Zeitzonen-Suffix,
// repräsentiert aber tatsächlich UTC (siehe ScanLog.scan_time/SaxoScanLog.
// scan_time in den jeweiligen database.py – beide via datetime.utcnow()
// befüllt). new Date("...") OHNE "Z" würde das fälschlich als
// Browser-Lokalzeit interpretieren, daher hier explizit als UTC parsen.
function parseUtc(scanTime: string): Date {
  return new Date(/[Zz]|[+-]\d\d:?\d\d$/.test(scanTime) ? scanTime : `${scanTime}Z`);
}

const BERLIN_OFFSET_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Berlin", timeZoneName: "shortOffset",
});

// CEST vs. CET anhand des tatsächlichen UTC-Offsets von Europe/Berlin zum
// jeweiligen Zeitpunkt (nicht anhand des heutigen Datums) – korrekt auch für
// historische Scans aus der jeweils anderen Jahreszeit.
function isBerlinSummerTime(d: Date): boolean {
  const part = BERLIN_OFFSET_FORMATTER.formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
  return part.includes("+2");
}

const BERLIN_TIME_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false,
});

// Ordnet einen Scan-Zeitpunkt einem einheitlichen CEST/CET-Slot-Label zu,
// gerundet auf 5 Minuten. Das genügt, um Cron-Jitter (Sekunden bis wenige
// Minuten Verzögerung) zu absorbieren, ohne echte Slots zu verschmelzen: alle
// konfigurierten Entry-Slots (Alpaca wie Saxo, siehe ENTRY_SLOT_OFFSETS_MIN)
// liegen real >= 90 Minuten auseinander. Das ersetzt die früher pro Broker
// unterschiedlichen Slot-Labels (Alpaca "09:45" ET, Saxo "LSE_SETS 13:30")
// durch EIN gemeinsames Label pro tatsächlichem Zeitpunkt – z.B. sind
// LSE_SETS/FSE/PAR/AMS zum selben Entry-Zyklus dieselbe reale CEST-Uhrzeit
// (Xetra/Euronext öffnen 09:00 lokal = 09:00 CEST, LSE öffnet 08:00 London =
// 09:00 CEST, UK/EU stellen synchron auf Sommerzeit um).
function cestSlotLabel(scanTime: string): string {
  const d = parseUtc(scanTime);
  const parts = BERLIN_TIME_FORMATTER.formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  const minute = Number(parts.find((p) => p.type === "minute")!.value);
  const rounded = (Math.round((hour * 60 + minute) / 5) * 5 + 1440) % 1440;
  const hh = String(Math.floor(rounded / 60)).padStart(2, "0");
  const mm = String(rounded % 60).padStart(2, "0");
  return `${hh}:${mm} ${isBerlinSummerTime(d) ? "CEST" : "CET"}`;
}

function bucketByRealSlot(tickers: ScanLogEntry[]): ScanSlot[] {
  const buckets = new Map<string, ScanLogEntry[]>();
  for (const t of tickers) {
    const key = cestSlotLabel(t.scan_time);
    const arr = buckets.get(key);
    if (arr) arr.push(t); else buckets.set(key, [t]);
  }
  return Array.from(buckets.entries())
    .map(([slot, ts]) => {
      const scores = ts.map((t) => t.score).filter((s): s is number => !!s && s > 0);
      return {
        slot,
        tickers: ts,
        total: ts.length,
        above_threshold: ts.filter((t) => t.score >= MIN_SIGNAL_SCORE).length,
        trades: ts.filter((t) => t.trade_executed).length,
        avg_score: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
      };
    })
    // Neuestes Slot-Label zuerst (absteigend), analog zur bisherigen Reihenfolge
    // (Backend lieferte Zeilen scan_time DESC, erster Slot = jüngster Scan).
    .sort((a, b) => b.slot.localeCompare(a.slot));
}

// Merged Alpaca-ScanDay[] + Saxo-ScanDay[] zu einer gemeinsamen Liste für
// ScanHistorie.tsx. Pro Datum werden ALLE Ticker beider Broker (unabhängig
// von ihrem ursprünglichen, pro-Broker unterschiedlichen Slot-Label)
// zusammengeworfen und anhand des tatsächlichen Scan-Zeitpunkts neu in
// CEST/CET-Slots gebündelt (siehe bucketByRealSlot) – vorher erschienen z.B.
// LSE_SETS/FSE/PAR/AMS als 4 separate Slots für denselben realen Zeitpunkt.
// Tage, die nur bei einem Broker existieren, bleiben erhalten (z.B. Alpaca
// hat heute noch nicht gescannt).
export function mergeScanDays(alpacaDays: ScanDay[], saxoDays: SaxoScanDay[]): ScanDay[] {
  const byDate = new Map<string, ScanLogEntry[]>();
  function addTickers(date: string, tickers: ScanLogEntry[]) {
    const existing = byDate.get(date);
    byDate.set(date, existing ? [...existing, ...tickers] : [...tickers]);
  }
  for (const day of alpacaDays) addTickers(day.date, day.slots.flatMap((s) => s.tickers));
  for (const day of saxoDays) addTickers(day.date, day.slots.flatMap((s) => s.tickers) as unknown as ScanLogEntry[]);

  return Array.from(byDate.entries())
    .map(([date, tickers]) => ({ date, slots: bucketByRealSlot(tickers) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export type ScanLogStat = { grund: string; anzahl: number };

export type BotConfigEntry = { key: string; value: string; beschreibung: string | null };

// Kapital-Einstellungen Prozent-Umbau (Alpaca+Saxo identisch, siehe
// trading_api.py::get_capital_allocations_endpoint / trading_api_saxo.py-
// Pendant). `allocations` ist bewusst ein generisches Record<string,number>
// statt fest benannter Felder – neue Kategorien landen einfach als neuer
// Key darin, kein Typ-Update nötig.
export type CapitalAllocations = {
  allocations: Record<string, number>;
  effective_max_capital_total_bot: number;
  real_total_capital: number | null;
};

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
  // yfinance-Sektor zum Entry-Zeitpunkt (siehe rule_engine.SignalResult.sector/
  // broker.place_trade) – null bei Inverse ETFs und bei Trades vor Einführung
  // dieser Spalte, soweit kein fair_value_cache-Eintrag zum Nachfüllen existierte.
  sector: string | null;
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
  // yfinance-Sektor zum Entry-Zeitpunkt, siehe TradeHistoryEntry.sector.
  sector: string | null;
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
  sector: string | null;
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
    sector: t.sector ?? null,
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
    sector: t.sector ?? null,
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
  // Seit der Time-Exit-Familie für Saxo (Alpaca-Parität) bei beiden Brokern
  // gesetzt, siehe OpenTrade/SaxoOpenTrade.
  time_exit_days_remaining: number | null;
  time_exit_grace_active: boolean;
  time_exit_grace_deadline: string | null;
  created_at: string;
};

export function fromAlpacaOpenTrade(t: OpenTrade): CombinedOpenPosition {
  return {
    ticker: t.ticker, broker: "alpaca", currency: "USD",
    entry_price: t.entry_price, current_price: t.current_price,
    stop_loss: t.stop_loss, take_profit: t.take_profit, quantity: t.quantity,
    capital_used: t.capital_used,
    rule_score: t.rule_score, unrealized_pnl: t.unrealized_pnl, unrealized_pnl_pct: t.unrealized_pnl_pct,
    trailing_sl_active: t.trailing_sl_active, trailing_sl_price: t.trailing_sl_price, mode: t.mode,
    time_exit_days_remaining: t.time_exit_days_remaining,
    time_exit_grace_active: t.time_exit_grace_active,
    time_exit_grace_deadline: t.time_exit_grace_deadline,
    created_at: t.created_at,
  };
}

export function fromSaxoOpenTrade(t: SaxoOpenTrade): CombinedOpenPosition {
  return {
    ticker: t.ticker, broker: "saxo", currency: t.currency,
    entry_price: t.entry_price, current_price: t.current_price,
    stop_loss: t.stop_loss, take_profit: t.take_profit, quantity: t.quantity,
    capital_used: t.capital_used_eur,
    rule_score: t.rule_score, unrealized_pnl: t.unrealized_pnl, unrealized_pnl_pct: t.unrealized_pnl_pct,
    trailing_sl_active: t.trailing_sl_active, trailing_sl_price: t.trailing_sl_price, mode: "LIVE",
    time_exit_days_remaining: t.time_exit_days_remaining,
    time_exit_grace_active: t.time_exit_grace_active,
    time_exit_grace_deadline: t.time_exit_grace_deadline,
    created_at: t.created_at,
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
