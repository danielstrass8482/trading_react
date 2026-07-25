"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown, ChevronRight, CheckCircle, XCircle,
  AlertTriangle, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { api, ScanDay, ScanLogEntry } from "@/lib/api";
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
    return (
      <span className="text-loss flex items-center gap-1.5">
        <XCircle size={16} strokeWidth={1.5} /> KO: {row.ko_reason}
      </span>
    );
  }
  if (row.trade_executed) {
    return (
      <span className="text-gain flex items-center gap-1.5">
        <CheckCircle size={16} strokeWidth={1.5} /> Trade ausgeführt
      </span>
    );
  }
  if (row.approved) {
    return (
      <span className="text-gold flex items-center gap-1.5">
        <AlertTriangle size={16} strokeWidth={1.5} /> Guardrail{row.guardrail_reason ? `: ${row.guardrail_reason}` : ""}
      </span>
    );
  }
  return <span className="text-text-muted">– Score zu niedrig</span>;
}

function regimeIcon(regime: string | null) {
  if (regime === "bullish") return <TrendingUp size={16} strokeWidth={1.5} className="text-gain inline" />;
  if (regime === "bearish") return <TrendingDown size={16} strokeWidth={1.5} className="text-loss inline" />;
  return <Minus size={16} strokeWidth={1.5} className="text-text-muted inline" />;
}

function formatTag(datum: string): string {
  return new Date(`${datum}T00:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const SCAN_COLUMNS: Column<ScanLogEntry>[] = [
  { key: "ticker", label: "Ticker" },
  { key: "score", label: "Score", align: "right", render: (r) => <span className="font-figures">{r.score}</span> },
  { key: "rsi_score", label: "RSI", align: "center", render: (r) => checkCell(r.rsi_score) },
  { key: "sma_score", label: "SMA", align: "center", render: (r) => checkCell(r.sma_score) },
  { key: "volume_score", label: "Vol", align: "center", render: (r) => checkCell(r.volume_score) },
  { key: "pe_score", label: "P/E", align: "center", render: (r) => checkCell(r.pe_score) },
  { key: "de_score", label: "D/E", align: "center", render: (r) => checkCell(r.de_score) },
  { key: "rev_score", label: "Rev", align: "center", render: (r) => checkCell(r.rev_score) },
  {
    key: "market_regime", label: "Regime", align: "center",
    render: (r) => regimeIcon(r.market_regime),
  },
  { key: "status", label: "Status", render: (r) => statusCell(r) },
];

function ScanSlotBlock({ day, slot, open, onToggle }: {
  day: string; slot: ScanDay["slots"][number]; open: boolean; onToggle: () => void;
}) {
  const sortedTickers = [...slot.tickers].sort((a, b) => b.score - a.score);
  return (
    <div className="border-t border-border/50">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-bg-hover transition-colors text-left"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-figures font-medium">{slot.slot ?? "?"} ET</span>
        <span className="text-text-muted text-xs">
          [{slot.total} gescannt | {slot.above_threshold} über {MIN_SIGNAL_SCORE} | {slot.trades} Trades | Ø {slot.avg_score.toFixed(0)}]
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3">
          <DataTable columns={SCAN_COLUMNS} rows={sortedTickers} keyField="id" />
        </div>
      )}
    </div>
  );
}

export default function ScanHistorie() {
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [openSlots, setOpenSlots] = useState<Set<string>>(new Set());
  const [tickerFilter, setTickerFilter] = useState("");
  const [initialized, setInitialized] = useState(false);

  const { data: days, isLoading, isError, refetch } = useQuery({
    queryKey: ["scan-log-grouped"],
    queryFn: () => api.get<ScanDay[]>("/api/scan-log", { params: { limit: 2000 } }).then((r) => r.data),
  });

  const { data: tickerDays } = useQuery({
    queryKey: ["scan-log-ticker", tickerFilter],
    queryFn: () =>
      api.get<ScanDay[]>("/api/scan-log", { params: { limit: 500, ticker: tickerFilter.toUpperCase() } }).then((r) => r.data),
    enabled: tickerFilter.trim().length > 0,
  });

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

  if (isLoading) return <TableSkeleton />;
  if (isError || !days) {
    return <ErrorState message="Scan-Historie konnte nicht geladen werden." onRetry={() => refetch()} />;
  }

  const tickerRows = tickerFilter.trim() && tickerDays
    ? tickerDays.flatMap((d) => d.slots.flatMap((s) => s.tickers.map((t) => ({ ...t, _slot: `${formatTag(d.date)} ${s.slot ?? ""} ET` }))))
    : [];

  const tickerColumns: Column<(typeof tickerRows)[number]>[] = [
    { key: "_slot", label: "Scan" },
    { key: "score", label: "Score", align: "right" },
    { key: "status", label: "Status", render: (r) => statusCell(r) },
  ];

  return (
    <div className="space-y-4">
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
          columns={tickerColumns} rows={tickerRows} keyField="id"
          emptyLabel={`Keine Scans für ${tickerFilter.toUpperCase()} gefunden.`}
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
                  day={day.date}
                  slot={slot}
                  open={openSlots.has(`${day.date}-${i}`)}
                  onToggle={() => toggleSlot(`${day.date}-${i}`)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
