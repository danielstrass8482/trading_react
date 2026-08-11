"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Check, X } from "lucide-react";
import { api, PendingConfirmation, ConfirmationResolution } from "@/lib/api";
import { CardSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";

// Confirm-Tier Chunk 2b (2026-08-11): Dashboard-Queue-Kanal für
// EXECUTION_MODE='confirm'-Nutzer (siehe database.DEFAULT_USER_CONFIG,
// Chunk 1/trading_bot-Repo) - Pendant zum Email-Magic-Link
// (trading_api.py::/api/confirm-execution/{token}, dort ohne Login). Zeigt
// NUR die eigenen PENDING-Einträge des eingeloggten Nutzers (user_id kommt
// serverseitig aus dem JWT, siehe trading_api.py::/api/pending-
// confirmations - niemals aus einem hier mitgeschickten Wert).
function formatDatum(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function PendingCard({ row, onResolved }: { row: PendingConfirmation; onResolved: (msg: string) => void }) {
  const queryClient = useQueryClient();

  const confirmMutation = useMutation({
    mutationFn: () => api.post<ConfirmationResolution>(`/api/pending-confirmations/${row.id}/confirm`).then((r) => r.data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pending-confirmations"] });
      onResolved(result.message);
    },
  });
  const rejectMutation = useMutation({
    mutationFn: () => api.post<ConfirmationResolution>(`/api/pending-confirmations/${row.id}/reject`).then((r) => r.data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["pending-confirmations"] });
      onResolved(result.message);
    },
  });

  const busy = confirmMutation.isPending || rejectMutation.isPending;

  return (
    <div className="bg-bg-card border border-border rounded-card px-4 py-4 flex flex-wrap items-center gap-3 justify-between">
      <div>
        <div className="flex items-center gap-2 font-semibold text-text-primary">
          {row.ticker}
          <span className="text-[0.6rem] font-semibold px-1 py-0.5 rounded-btn bg-gold/20 text-gold">
            {row.broker.toUpperCase()}
          </span>
        </div>
        <div className="text-xs text-text-muted font-figures mt-1">
          Menge {row.qty_or_amount} · Preis ${row.signal_price.toFixed(2)} · Signal {formatDatum(row.signal_timestamp)}
        </div>
        <div className="text-xs text-text-disabled font-figures mt-0.5 flex items-center gap-1">
          <Clock size={11} /> Läuft ab: {formatDatum(row.expires_at)}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => confirmMutation.mutate()}
          disabled={busy}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-btn bg-gain/15 text-gain hover:bg-gain/25 transition-colors disabled:opacity-50"
        >
          <Check size={14} /> Bestätigen
        </button>
        <button
          onClick={() => rejectMutation.mutate()}
          disabled={busy}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-btn bg-loss/15 text-loss hover:bg-loss/25 transition-colors disabled:opacity-50"
        >
          <X size={14} /> Ablehnen
        </button>
      </div>
    </div>
  );
}

export default function Bestaetigungen() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["pending-confirmations"],
    queryFn: () => api.get<PendingConfirmation[]>("/api/pending-confirmations").then((r) => r.data),
    // Läuft nach spätestens ein paar Minuten ab (siehe expires_at) - kurzes
    // Polling hält die Queue aktuell, ohne dass der Nutzer manuell neu laden muss.
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <CardSkeleton className="h-20" />
        <CardSkeleton className="h-20" />
      </div>
    );
  }

  if (isError) {
    return <ErrorState message="Bestätigungen konnten nicht geladen werden." onRetry={() => refetch()} />;
  }

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted mb-1">
          Ausstehende Bestätigungen
        </div>
        <p className="text-xs text-text-muted">
          Entry-Signale, die auf deine Bestätigung warten (nur sichtbar, wenn dein Ausführungs-Modus auf
          &bdquo;Bestätigung erforderlich&ldquo; steht). Der Trade wird erst platziert, wenn du hier oder über den
          Link in der Bestätigungs-Mail zustimmst.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-text-muted text-sm py-4 text-center">Keine ausstehenden Bestätigungen.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <PendingCard key={row.id} row={row} onResolved={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}
