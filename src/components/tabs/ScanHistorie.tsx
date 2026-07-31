"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api, ScanDay, ScanLogEntry, ScanLogStat, SaxoScanDay, mergeScanDays, MIN_SIGNAL_SCORE } from "@/lib/api";
import DataTable, { Column } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";

function brokerBadge(broker: string | null | undefined) {
  const b = (broker ?? "alpaca").toLowerCase();
  return (
    <span className={`text-[0.6rem] font-semibold px-1 py-0.5 rounded-btn ${b === "alpaca" ? "bg-gold/20 text-gold" : "bg-paper/20 text-paper"}`}>
      {b === "alpaca" ? "Alpaca" : "Saxo"}
    </span>
  );
}

function formatTag(datum: string): string {
  return new Date(`${datum}T00:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Einzelner Faktor-Score (RSI/SMA/Vol/KGV/D-E/Rev) – Punktwert statt reinem
// Bestanden/Nicht-bestanden-Icon, da die Aufgabe explizit "KPI-Werte" verlangt.
function factorCell(value: number | null | undefined) {
  if (value === null || value === undefined) return <span className="text-text-muted">–</span>;
  return <span className={value > 0 ? "text-gain" : "text-loss"}>{value}</span>;
}

type SortDir = "asc" | "desc";

// Score-Spalte für die flachen Ticker-Tabellen (Slot- und Ticker-Suche) –
// einzige sortierbare Spalte laut Aufgabe, Default aufsteigend (kleinster
// Score zuerst), analog zur sortierbaren Spalten-Logik der Handelshistorie
// (Performance.tsx SORT_COLUMNS/SortableTh) – hier direkt über DataTable
// (sortKey/sortDir/onSort), da nur eine Spalte sortierbar sein muss.
// extraColumns wird vor der Score-Spalte eingefügt (z.B. "Scan"-Zeitpunkt in
// der Ticker-Suche, die über mehrere Slots/Tage hinweg streut).
function scanColumns<T extends ScanLogEntry>(extraColumns: Column<T>[] = []): Column<T>[] {
  return [
    {
      key: "ticker", label: "Ticker",
      render: (r) => <span className="font-semibold">{r.ticker}</span>,
    },
    { key: "broker", label: "Broker", render: (r) => brokerBadge(r.broker) },
    { key: "rsi_score", label: "RSI", align: "right", hideOnMobile: true, render: (r) => factorCell(r.rsi_score) },
    { key: "sma_score", label: "SMA", align: "right", hideOnMobile: true, render: (r) => factorCell(r.sma_score) },
    { key: "volume_score", label: "Volumen", align: "right", hideOnMobile: true, render: (r) => factorCell(r.volume_score) },
    { key: "pe_score", label: "KGV", align: "right", hideOnMobile: true, render: (r) => factorCell(r.pe_score) },
    { key: "de_score", label: "D/E", align: "right", hideOnMobile: true, render: (r) => factorCell(r.de_score) },
    { key: "rev_score", label: "Umsatzw.", align: "right", hideOnMobile: true, render: (r) => factorCell(r.rev_score) },
    ...extraColumns,
    {
      key: "score", label: "Score", align: "right", sortable: true,
      render: (r) => <span className="font-figures font-semibold">{r.score}</span>,
    },
  ];
}

function sortByScore<T extends ScanLogEntry>(rows: T[], dir: SortDir): T[] {
  const arr = [...rows];
  arr.sort((a, b) => (dir === "asc" ? a.score - b.score : b.score - a.score));
  return arr;
}

function ScanSlotBlock({ slot, open, onToggle, sortDir, onSort }: {
  slot: ScanDay["slots"][number]; open: boolean; onToggle: () => void;
  sortDir: SortDir; onSort: () => void;
}) {
  const sortedTickers = sortByScore(slot.tickers, sortDir);

  return (
    <div className="border-t border-border/50">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-bg-hover transition-colors text-left"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-figures font-medium">{slot.slot}</span>
        <span className="text-text-muted text-xs">
          {slot.total} · {slot.above_threshold}≥{MIN_SIGNAL_SCORE} · {slot.trades}T · Ø{slot.avg_score.toFixed(0)}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-3">
          <DataTable
            columns={scanColumns()}
            rows={sortedTickers}
            keyField="id"
            sortKey="score"
            sortDir={sortDir}
            onSort={onSort}
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
  const [tickerFilter, setTickerFilter] = useState("");
  const [initialized, setInitialized] = useState(false);
  // Ein gemeinsamer Sortier-Zustand für alle Slot-Tabellen und die
  // Ticker-Suche – dieselbe Interaktion (Score-Spalte klicken) gilt
  // einheitlich überall auf dieser Seite statt pro Tabelle einzeln.
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const toggleSort = () => setSortDir((d) => (d === "asc" ? "desc" : "asc"));

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

  if (isLoading) return <TableSkeleton />;
  if (isError || !days) {
    return <ErrorState message="Scan-Historie konnte nicht geladen werden." onRetry={() => refetch()} />;
  }

  const tickerRowsRaw = tickerFilter.trim() && tickerDays
    ? tickerDays.flatMap((d) => d.slots.flatMap((s) => s.tickers.map((t) => ({
        ...t,
        // Alpaca- und Saxo-scan_log-Tabellen vergeben ids unabhängig
        // voneinander (können kollidieren) – eigener React-Key nötig, da
        // diese flache Liste (anders als die Pro-Slot-Tabellen oben) beide
        // Broker gemischt rendert.
        _key: `${t.broker}-${t.id}`,
        _slot: `${formatTag(d.date)}, ${s.slot}`,
      }))))
    : [];
  const tickerRows = sortByScore(tickerRowsRaw, sortDir);

  const tickerColumns = scanColumns<(typeof tickerRows)[number]>([
    { key: "_slot", label: "Scan", align: "right", hideOnMobile: true, render: (r) => <span className="text-text-muted">{r._slot}</span> },
  ]);

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
          sortKey="score" sortDir={sortDir} onSort={toggleSort}
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
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
