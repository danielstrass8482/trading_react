"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown, ChevronRight, CheckCircle, XCircle,
  AlertTriangle, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { api, ScanDay, ScanLogEntry, ScanLogStat, SaxoScanDay, mergeScanDays } from "@/lib/api";
import DataTable, { Column } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";

const MIN_SIGNAL_SCORE = 65;

function checkCell(value: number | null) {
  if (value === null || value === undefined) return <span className="text-text-muted">–</span>;
  return value > 0
    ? <CheckCircle size={16} strokeWidth={1.5} className="text-gain inline" />
    : <XCircle size={16} strokeWidth={1.5} className="text-loss inline" />;
}

function statusCell(row: ScanLogEntry) {
  if (row.ko_reason) {
    const isFairValueKo = row.ko_reason.includes("Fair Value");
    const colorCls = isFairValueKo ? "text-orange-400" : "text-loss";
    return (
      <span className={`flex items-center gap-1.5 ${colorCls}`}>
        <XCircle size={16} strokeWidth={1.5} /> KO: {row.ko_reason}
      </span>
    );
  }
  if (row.trade_executed) {
    return (
      <span className="flex text-gain items-center gap-1.5">
        <CheckCircle size={16} strokeWidth={1.5} /> Trade ausgeführt
      </span>
    );
  }
  if (row.approved) {
    return (
      <span className="flex text-gold items-center gap-1.5">
        <AlertTriangle size={16} strokeWidth={1.5} /> Guardrail{row.guardrail_reason ? `: ${row.guardrail_reason}` : ""}
      </span>
    );
  }
  return <span className="text-text-muted">Score zu niedrig</span>;
}

function brokerBadge(broker: string | null | undefined) {
  const b = (broker ?? "alpaca").toLowerCase();
  return (
    <span className={`text-[0.6rem] font-semibold px-1 py-0.5 rounded-btn ${b === "alpaca" ? "bg-gold/20 text-gold" : "bg-paper/20 text-paper"}`}>
      {b.toUpperCase()}
    </span>
  );
}

function regimeIcon(regime: string | null | undefined) {
  if (regime === "bullish") return <TrendingUp size={16} strokeWidth={1.5} className="text-gain inline" />;
  if (regime === "bearish") return <TrendingDown size={16} strokeWidth={1.5} className="text-loss inline" />;
  return <Minus size={16} strokeWidth={1.5} className="text-text-muted inline" />;
}

function formatTag(datum: string): string {
  return new Date(`${datum}T00:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Alpaca-Slots sind ET-Uhrzeiten ("09:45"), Saxo-Slots Börsen-Codes ("FSE") –
// das " ET"-Suffix ergibt nur bei Ersteren Sinn (siehe mergeScanDays in api.ts).
function slotLabel(slot: string | null | undefined): string {
  const s = slot ?? "?";
  return /^\d{1,2}:\d{2}$/.test(s) ? `${s} ET` : s;
}

// Detail-Panel für einen Ticker: RSI/SMA/Vol/P-E/D-E/Rev/Regime/Score/Status
// waren früher permanent sichtbare Spalten – jetzt nur noch hier, per Klick
// auf den Ticker aufklappbar (siehe SCAN_COLUMNS unten).
function TickerDetail({ row }: { row: ScanLogEntry }) {
  const factors: [string, number | null][] = [
    ["RSI", row.rsi_score],
    ["SMA", row.sma_score],
    ["Vol", row.volume_score],
    ["P/E", row.pe_score],
    ["D/E", row.de_score],
    ["Rev", row.rev_score],
  ];
  return (
    <div className="py-3 space-y-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="text-text-muted">
          Score: <span className="font-figures font-semibold text-text-primary">{row.score}</span>
        </span>
        {factors.map(([label, value]) => (
          <span key={label} className="flex items-center gap-1 text-text-muted">
            {label} {checkCell(value)}
          </span>
        ))}
        {row.market_regime && (
          <span className="flex items-center gap-1 text-text-muted">
            Regime {regimeIcon(row.market_regime)}
          </span>
        )}
      </div>
      <div>{statusCell(row)}</div>
    </div>
  );
}

function ScanSlotBlock({ slot, open, onToggle, expanded, onToggleTicker }: {
  slot: ScanDay["slots"][number]; open: boolean; onToggle: () => void;
  expanded: Set<string>; onToggleTicker: (key: string) => void;
}) {
  const sortedTickers = [...slot.tickers].sort((a, b) => b.score - a.score);
  const rowKey = (r: ScanLogEntry) => `${r.broker}-${r.id}`;

  const columns: Column<ScanLogEntry>[] = [
    {
      key: "ticker", label: "Ticker",
      render: (r) => {
        const key = rowKey(r);
        const isOpen = expanded.has(key);
        return (
          <span className="inline-flex items-center gap-1.5">
            {isOpen ? <ChevronDown size={13} className="text-text-muted shrink-0" /> : <ChevronRight size={13} className="text-text-muted shrink-0" />}
            <span className="font-semibold">{r.ticker}</span>
            {brokerBadge(r.broker)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="border-t border-border/50">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-bg-hover transition-colors text-left"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-figures font-medium">{slotLabel(slot.slot)}</span>
        <span className="text-text-muted text-xs">
          {slot.total} · {slot.above_threshold}≥{MIN_SIGNAL_SCORE} · {slot.trades}T · Ø{slot.avg_score.toFixed(0)}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3">
          <DataTable
            columns={columns}
            rows={sortedTickers}
            keyField="id"
            onRowClick={(r) => onToggleTicker(rowKey(r))}
            isRowExpanded={(r) => expanded.has(rowKey(r))}
            renderExpanded={(r) => <TickerDetail row={r} />}
          />
        </div>
      )}
    </div>
  );
}

function FilterStats({ stats }: { stats: ScanLogStat[] }) {
  const total = stats.reduce((sum, s) => sum + s.anzahl, 0);
  if (total === 0) return null;
  const max = Math.max(...stats.map((s) => s.anzahl));
  return (
    <div className="bg-bg-card border border-border rounded-card px-4 py-3">
      <div className="text-xs font-medium text-text-muted mb-2">
        Filter-Statistik (letzte 30 Tage, {total} geblockt)
      </div>
      <div className="space-y-1.5">
        {stats.map((s) => (
          <div key={s.grund} className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0 text-text-primary">{s.grund}</span>
            <div className="flex-1 bg-bg-app rounded-btn overflow-hidden h-2">
              <div
                className="h-full bg-gold"
                style={{ width: `${(s.anzahl / max) * 100}%` }}
              />
            </div>
            <span className="font-figures text-text-muted w-10 text-right">{s.anzahl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScanHistorie() {
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [openSlots, setOpenSlots] = useState<Set<string>>(new Set());
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());
  const [tickerFilter, setTickerFilter] = useState("");
  const [initialized, setInitialized] = useState(false);

  const { data: alpacaDays, isLoading: alpacaLoading, isError, refetch } = useQuery({
    queryKey: ["scan-log-grouped", "alpaca"],
    queryFn: () => api.get<ScanDay[]>("/api/scan-log", { params: { limit: 2000 } }).then((r) => r.data),
  });

  // Saxo bewusst nicht Teil des Error-Gates (analog Performance.tsx
  // TradeHistorySection) – fällt die Saxo-API aus, zeigt die Historie
  // einfach nur Alpaca-Scans statt komplett zu brechen.
  const { data: saxoDays, isLoading: saxoLoading } = useQuery({
    queryKey: ["scan-log-grouped", "saxo"],
    queryFn: () => api.get<SaxoScanDay[]>("/api/saxo/scan-log", { params: { limit: 2000 } }).then((r) => r.data),
  });

  const isLoading = alpacaLoading || saxoLoading;
  const days = alpacaDays ? mergeScanDays(alpacaDays, saxoDays ?? []) : undefined;

  const { data: filterStats } = useQuery({
    queryKey: ["scan-log-stats"],
    queryFn: () => api.get<ScanLogStat[]>("/api/scan-log/stats").then((r) => r.data),
  });

  const { data: tickerDaysAlpaca } = useQuery({
    queryKey: ["scan-log-ticker", "alpaca", tickerFilter],
    queryFn: () =>
      api.get<ScanDay[]>("/api/scan-log", { params: { limit: 500, ticker: tickerFilter.toUpperCase() } }).then((r) => r.data),
    enabled: tickerFilter.trim().length > 0,
  });

  const { data: tickerDaysSaxo } = useQuery({
    queryKey: ["scan-log-ticker", "saxo", tickerFilter],
    queryFn: () =>
      api.get<SaxoScanDay[]>("/api/saxo/scan-log", { params: { limit: 500, ticker: tickerFilter.toUpperCase() } }).then((r) => r.data),
    enabled: tickerFilter.trim().length > 0,
  });

  const tickerDays = tickerDaysAlpaca ? mergeScanDays(tickerDaysAlpaca, tickerDaysSaxo ?? []) : undefined;

  // Neuesten Tag + dessen ersten Slot beim ersten Laden automatisch aufklappen.
  useEffect(() => {
    if (!initialized && days && days.length > 0) {
      setOpenDays(new Set([days[0].date]));
      if (days[0].slots.length > 0) {
        setOpenSlots(new Set([`${days[0].date}-0`]));
      }
      setInitialized(true);
    }
  }, [days, initialized]);

  function toggleDay(date: string) {
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  function toggleSlot(key: string) {
    setOpenSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleTicker(key: string) {
    setExpandedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (isLoading) return <TableSkeleton />;
  if (isError || !days) {
    return <ErrorState message="Scan-Historie konnte nicht geladen werden." onRetry={() => refetch()} />;
  }

  const tickerRows = tickerFilter.trim() && tickerDays
    ? tickerDays.flatMap((d) => d.slots.flatMap((s) => s.tickers.map((t) => ({
        ...t,
        // Alpaca- und Saxo-scan_log-Tabellen vergeben ids unabhängig
        // voneinander (können kollidieren) – eigener React-Key nötig, da
        // diese flache Liste (anders als die Pro-Slot-Tabellen oben) beide
        // Broker gemischt rendert.
        _key: `${t.broker}-${t.id}`,
        _slot: `${formatTag(d.date)} ${slotLabel(s.slot)}`,
      }))))
    : [];

  const tickerColumns: Column<(typeof tickerRows)[number]>[] = [
    {
      key: "ticker", label: "Ticker",
      render: (r) => {
        const isOpen = expandedTickers.has(r._key);
        return (
          <span className="inline-flex items-center gap-1.5">
            {isOpen ? <ChevronDown size={13} className="text-text-muted shrink-0" /> : <ChevronRight size={13} className="text-text-muted shrink-0" />}
            <span className="font-semibold">{r.ticker}</span>
            {brokerBadge(r.broker)}
          </span>
        );
      },
    },
    { key: "_slot", label: "Scan", align: "right", render: (r) => <span className="text-text-muted">{r._slot}</span> },
  ];

  return (
    <div className="space-y-4">
      {filterStats && filterStats.length > 0 && <FilterStats stats={filterStats} />}

      <div>
        <input
          value={tickerFilter}
          onChange={(e) => setTickerFilter(e.target.value)}
          placeholder="Nach Ticker suchen (z.B. AAPL)"
          className="w-64 bg-bg-app border border-border rounded-btn px-3 py-1.5 text-sm"
        />
      </div>

      {tickerFilter.trim() ? (
        <DataTable
          columns={tickerColumns} rows={tickerRows} keyField="_key"
          emptyLabel={`Keine Scans für ${tickerFilter.toUpperCase()} gefunden.`}
          onRowClick={(r) => toggleTicker(r._key)}
          isRowExpanded={(r) => expandedTickers.has(r._key)}
          renderExpanded={(r) => <TickerDetail row={r} />}
        />
      ) : days.length === 0 ? (
        <p className="text-text-muted text-sm">Noch keine Scans vorhanden.</p>
      ) : (
        <div className="bg-bg-card border border-border rounded-card divide-y divide-border/50">
          {days.map((day) => (
            <div key={day.date}>
              <button
                onClick={() => toggleDay(day.date)}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-bg-hover transition-colors text-left"
              >
                {openDays.has(day.date) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {formatTag(day.date)}
                <span className="text-text-muted text-xs font-normal">
                  ({day.slots.length} Slot{day.slots.length === 1 ? "" : "s"})
                </span>
              </button>
              {openDays.has(day.date) && day.slots.map((slot, i) => (
                <ScanSlotBlock
                  key={`${day.date}-${i}`}
                  slot={slot}
                  open={openSlots.has(`${day.date}-${i}`)}
                  onToggle={() => toggleSlot(`${day.date}-${i}`)}
                  expanded={expandedTickers}
                  onToggleTicker={toggleTicker}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
