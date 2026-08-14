"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Check, X, AlertTriangle, Loader2 } from "lucide-react";
import { api, PendingConfirmation, ConfirmationResolution, ConfirmationHistoryEntry, ConfirmationStatus } from "@/lib/api";
import { fmtEtDateTime } from "@/lib/format";
import { CardSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
import TickerLabel from "@/components/ui/TickerLabel";

// Confirm-Tier Chunk 2b+2c (2026-08-11): Dashboard-Queue-Kanal für
// EXECUTION_MODE='confirm'-Nutzer (siehe database.DEFAULT_USER_CONFIG,
// Chunk 1/trading_bot-Repo) - Pendant zum Email-Magic-Link
// (trading_api.py::/api/confirm-execution/{token}, dort ohne Login). Zeigt
// NUR die eigenen PENDING-Einträge des eingeloggten Nutzers (user_id kommt
// serverseitig aus dem JWT, siehe trading_api.py::/api/pending-
// confirmations - niemals aus einem hier mitgeschickten Wert), plus eine
// Verlaufs-Sektion aller 5 Status (Chunk 2c).
//
// Zeitzone (Testfeedback 2026-08-11, Punkt 2): formatDatum() wurde durch
// lib/format.ts::fmtEtDateTime() ersetzt - die vorherige new Date(iso).
// toLocaleString()-Variante zeigte wegen eines JS-Date-Parsing-Bugs (siehe
// dortiger Docstring) einen um den Browser-UTC-Offset falschen,
// unbeschrifteten Wert, keine reine Beschriftungslücke. Jetzt konsistent
// zur serverseitig gerenderten Bestätigungsseite/Mail: ET, explizit
// beschriftet.

// Chunk 2c: Preis-Re-Check kann statt einer sofortigen Bestätigung ein
// needs_reconfirmation-Ergebnis liefern (Live-Preis weicht zu stark vom
// Signalzeitpunkt-Preis ab, siehe trading_api._resolve_confirmation) - der
// Nutzer sieht dann alten/neuen Preis + Abweichung und muss EXPLIZIT ein
// zweites Mal bestätigen (Aufgabe Punkt 2), statt dass automatisch zum neuen
// Preis ausgeführt wird.
// Testfeedback (2026-08-11, Punkt 1): onResolved trägt jetzt "ok" mit (statt
// nur der Nachricht), damit die Aufrufer-Ebene Erfolg/Fehlschlag farblich
// unterscheiden kann (vorher ein einzelner neutral eingefärbter Hinweistext
// für beide Fälle - "schwaches Feedback").
type ResolvedCallback = (msg: string, ok: boolean) => void;

function PendingCard({ row, onResolved }: { row: PendingConfirmation; onResolved: ResolvedCallback }) {
  const queryClient = useQueryClient();
  const [reconfirm, setReconfirm] = useState<{ oldPrice: number; newPrice: number; deviationPct: number } | null>(null);

  // Testfeedback Punkt 1: sofortige optimistische Entfernung aus der
  // Pending-Liste statt auf den Refetch-Roundtrip zu warten (vorher:
  // invalidateQueries() allein - der Eintrag verschwand erst NACH dem
  // nächsten erfolgreichen GET, kurzzeitig blieb die Karte inkl. jetzt
  // funktionslos gewordener Buttons sichtbar). invalidateQueries() läuft
  // weiterhin zusätzlich als Fallback-Refresh (z.B. falls der Cache seit
  // dem letzten Laden abweicht) - die Aufgabe verlangt explizit "optimistic
  // UI update mit Fallback-Refresh", kein reiner Cache-Hack ohne Netz-Sync.
  const removeFromPendingCache = () => {
    queryClient.setQueryData<PendingConfirmation[]>(["pending-confirmations"], (old) =>
      old?.filter((r) => r.id !== row.id)
    );
  };
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["pending-confirmations"] });
    queryClient.invalidateQueries({ queryKey: ["confirmation-history"] });
  };

  const confirmMutation = useMutation({
    mutationFn: (ackPrice?: number) =>
      api
        .post<ConfirmationResolution>(`/api/pending-confirmations/${row.id}/confirm`, null, {
          params: ackPrice != null ? { ack_price: ackPrice } : undefined,
        })
        .then((r) => r.data),
    onSuccess: (result) => {
      if (result.needs_reconfirmation && result.old_price != null && result.new_price != null && result.deviation_pct != null) {
        // Kein echter Abschluss, sondern ein neuer, expliziter Entscheidungs-
        // punkt für den Nutzer (siehe reconfirm-Ansicht unten) - firedRef
        // muss zurückgesetzt werden, sonst wären "Trotzdem bestätigen"/
        // "Ablehnen" dort durch den Klick-Guard von oben dauerhaft blockiert.
        firedRef.current = false;
        setReconfirm({ oldPrice: result.old_price, newPrice: result.new_price, deviationPct: result.deviation_pct });
        return;
      }
      setReconfirm(null);
      removeFromPendingCache();
      invalidate();
      onResolved(result.message, result.ok);
    },
    // Testfeedback Punkt 1: vorher KEIN onError - ein Netzwerk-/Server-
    // fehler (z.B. Verbindungsabbruch) blieb komplett unsichtbar, die Karte
    // wirkte nur kurz "hängend" (Button-Spinner verschwand wieder, sonst
    // nichts). Karte bleibt hier bewusst STEHEN (kein removeFromPendingCache/
    // invalidate) - der Vorgang ist ja nicht abgeschlossen, ein erneuter
    // Versuch muss weiterhin möglich sein.
    onError: () => {
      firedRef.current = false;  // Karte bleibt stehen, ein erneuter Versuch muss möglich sein
      onResolved(`${row.ticker}: Verbindung fehlgeschlagen – bitte erneut versuchen.`, false);
    },
  });
  const rejectMutation = useMutation({
    mutationFn: () => api.post<ConfirmationResolution>(`/api/pending-confirmations/${row.id}/reject`).then((r) => r.data),
    onSuccess: (result) => {
      removeFromPendingCache();
      invalidate();
      onResolved(result.message, result.ok);
    },
    onError: () => {
      firedRef.current = false;  // Karte bleibt stehen, ein erneuter Versuch muss möglich sein
      onResolved(`${row.ticker}: Verbindung fehlgeschlagen – bitte erneut versuchen.`, false);
    },
  });

  const busy = confirmMutation.isPending || rejectMutation.isPending;

  // Race-Condition-Fix (2026-08-13): schnelles Mehrfachklicken (3-4x kurz
  // hintereinander) auf "Bestätigen" konnte dazu führen, dass mehrere
  // Confirm-Requests für UNTERSCHIEDLICHE Einträge quasi gleichzeitig
  // beim Backend ankamen, bevor `disabled={busy}` durch den React-Re-Render
  // überhaupt im DOM sichtbar wurde (siehe broker._user_trade_guardrail_lock
  // in trading_bot für den serverseitigen Teil des Fixes - der hier
  // schützt zusätzlich JEDE EINZELNE Karte clientseitig, damit gar nicht
  // erst mehrere Requests rausgehen). firedRef wird SYNCHRON beim allerersten
  // Klick gesetzt (vor jedem Re-Render), nicht erst über `busy`/`disabled`
  // (das hängt vom nächsten Render-Zyklus ab) - zweite/dritte Klicks auf
  // DENSELBEN Button innerhalb desselben Ticks lösen dadurch garantiert
  // keinen zweiten Request aus. Wird bei einem Fehler zurückgesetzt (siehe
  // onError unten), damit ein erneuter Versuch weiterhin möglich ist - die
  // Karte bleibt bei einem Fehler bewusst stehen (kein removeFromPendingCache).
  const firedRef = useRef(false);

  function handleConfirm(ackPrice?: number) {
    if (firedRef.current) return;
    firedRef.current = true;
    confirmMutation.mutate(ackPrice);
  }
  function handleReject() {
    if (firedRef.current) return;
    firedRef.current = true;
    rejectMutation.mutate();
  }

  if (reconfirm) {
    return (
      <div className="bg-bg-card border border-gold/40 rounded-card px-4 py-4 space-y-2">
        <div className="flex items-start gap-2 font-semibold text-gold">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          {/* Ticker+Suffix-Text in EINEM Element statt getrennter Flex-Items
              (Redesign 2026-08-15): so bleibt es normaler, umbrechender
              Textfluss statt dass der Suffix bei einer mehrzeiligen
              TickerLabel-Ausgabe rechts danebenschwebt. */}
          <span>
            <TickerLabel ticker={row.ticker} companyName={row.company_name} className="md:max-w-[220px]" />
            : Preis hat sich geändert
          </span>
        </div>
        <div className="text-xs text-text-muted font-figures">
          Preis zum Signalzeitpunkt: ${reconfirm.oldPrice.toFixed(2)} → Aktuell: ${reconfirm.newPrice.toFixed(2)}
          {" "}({reconfirm.deviationPct >= 0 ? "+" : ""}{reconfirm.deviationPct.toFixed(1)}%)
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => handleConfirm(reconfirm.newPrice)}
            disabled={busy}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-btn bg-gain/15 text-gain hover:bg-gain/25 transition-colors disabled:opacity-50"
          >
            {confirmMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {confirmMutation.isPending ? "Bestätige…" : "Trotzdem bestätigen"}
          </button>
          <button
            onClick={handleReject}
            disabled={busy}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-btn bg-loss/15 text-loss hover:bg-loss/25 transition-colors disabled:opacity-50"
          >
            {rejectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
            {rejectMutation.isPending ? "Lehne ab…" : "Ablehnen"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border rounded-card px-4 py-4 flex flex-wrap items-center gap-3 justify-between">
      <div>
        {/* Ticker/Firmenname auf Mobile in eigener Zeile (Redesign 2026-08-15:
            title-Attribut/Long-Press funktioniert auf Touch-Geräten nicht
            zuverlässig, siehe TickerLabel-Docstring) - darf umbrechen, ohne
            die Broker-/Score-Badges zu zerdrücken. Auf Desktop (md:flex-row)
            unverändert eine einzige Zeile wie zuvor.*/}
        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 font-semibold text-text-primary">
          <TickerLabel ticker={row.ticker} companyName={row.company_name} className="md:max-w-[220px] md:shrink-0" />
          <div className="flex items-center gap-2">
            <span className="text-[0.6rem] font-semibold px-1 py-0.5 rounded-btn bg-gold/20 text-gold shrink-0">
              {row.broker.toUpperCase()}
            </span>
            {/* Score-Anzeige (Confirm-Tier Chunk 2d, Aufgabe Punkt 5) - der
                Wert wird bei jedem Re-Scan aktualisiert (siehe confirm_
                execution.update_pending_confirmation), solange der Kandidat
                über der Schwelle bleibt. Backend liefert die Liste bereits
                absteigend sortiert (Aufgabe Punkt 6, siehe list_pending_
                confirmations-Docstring). */}
            {row.score != null && (
              <span className="text-[0.6rem] font-semibold px-1 py-0.5 rounded-btn bg-paper/20 text-paper font-figures">
                Score {row.score}
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-text-muted font-figures mt-1">
          Menge {row.qty_or_amount} · Preis ${row.signal_price.toFixed(2)} · Aktualisiert {fmtEtDateTime(row.signal_timestamp)}
        </div>
        <div className="text-xs text-text-disabled font-figures mt-0.5 flex items-center gap-1">
          <Clock size={11} /> Läuft ab (Handelsschluss): {fmtEtDateTime(row.expires_at)}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => handleConfirm(undefined)}
          disabled={busy}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-btn bg-gain/15 text-gain hover:bg-gain/25 transition-colors disabled:opacity-50"
        >
          {confirmMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {confirmMutation.isPending ? "Bestätige…" : "Bestätigen"}
        </button>
        <button
          onClick={handleReject}
          disabled={busy}
          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-btn bg-loss/15 text-loss hover:bg-loss/25 transition-colors disabled:opacity-50"
        >
          {rejectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
          {rejectMutation.isPending ? "Lehne ab…" : "Ablehnen"}
        </button>
      </div>
    </div>
  );
}

// Chunk 2c: alle 5 erreichbaren Status unterscheidbar (Aufgabe Punkt 5) -
// Farbe + Label reichen, kein Redesign.
const STATUS_BADGE: Record<ConfirmationStatus, { label: string; cls: string }> = {
  pending: { label: "Ausstehend", cls: "bg-paper/15 text-paper" },
  confirmed: { label: "Bestätigt", cls: "bg-gain/15 text-gain" },
  rejected: { label: "Abgelehnt", cls: "bg-text-muted/15 text-text-muted" },
  expired: { label: "Abgelaufen", cls: "bg-text-disabled/15 text-text-disabled" },
  failed: { label: "Fehlgeschlagen", cls: "bg-loss/15 text-loss" },
};

function HistoryRow({ row }: { row: ConfirmationHistoryEntry }) {
  const badge = STATUS_BADGE[row.status];
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border last:border-0 text-xs">
      <div>
        <TickerLabel ticker={row.ticker} companyName={row.company_name} className="font-semibold text-text-primary md:max-w-[220px]" />{" "}
        <span className="text-text-muted font-figures">${row.signal_price.toFixed(2)} · {fmtEtDateTime(row.signal_timestamp)}</span>
        {row.status === "failed" && row.failure_reason && (
          <div className="text-loss mt-0.5">Grund: {row.failure_reason}</div>
        )}
      </div>
      <span className={`px-2 py-0.5 rounded-btn font-semibold ${badge.cls}`}>{badge.label}</span>
    </div>
  );
}

// Testfeedback Punkt 1: farblich unterscheidbarer, selbst-verschwindender
// Hinweis statt eines dauerhaft stehenbleibenden, neutral eingefärbten
// Textes - grün/Rahmen für Erfolg, rot/Rahmen für Fehlschlag, automatisches
// Ausblenden nach 6s (der Nutzer muss nicht manuell wegklicken, verpasst es
// aber auch nicht wie ein Toast, der sofort wieder verschwindet).
function ActionNotice({ notice }: { notice: { message: string; ok: boolean } }) {
  return (
    <div
      className={`rounded-card px-4 py-2.5 text-xs font-medium border flex items-center gap-2 ${
        notice.ok ? "bg-gain/10 border-gain/40 text-gain" : "bg-loss/10 border-loss/40 text-loss"
      }`}
    >
      {notice.ok ? <Check size={14} className="shrink-0" /> : <AlertTriangle size={14} className="shrink-0" />}
      {notice.message}
    </div>
  );
}

export default function Bestaetigungen() {
  const [notice, setNotice] = useState<{ message: string; ok: boolean } | null>(null);

  // Auto-Ausblenden statt eines Textes, der bis zur nächsten Aktion stehen
  // bleibt (Testfeedback Punkt 1) - jede neue Aktion setzt den Timer über
  // die notice-Änderung selbst zurück (Effekt läuft bei jedem neuen notice
  // erneut).
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["pending-confirmations"],
    queryFn: () => api.get<PendingConfirmation[]>("/api/pending-confirmations").then((r) => r.data),
    // Confirm-Tier Chunk 2d: expires_at ist jetzt der Handelsschluss statt
    // eines starren 15-Minuten-Fensters, Einträge werden außerdem bei jedem
    // Entry-Zyklus mit Preis/Score aktualisiert - kurzes Polling hält die
    // Queue trotzdem aktuell, ohne dass der Nutzer manuell neu laden muss.
    refetchInterval: 30_000,
  });

  const { data: historyRaw } = useQuery({
    queryKey: ["confirmation-history"],
    queryFn: () => api.get<ConfirmationHistoryEntry[]>("/api/pending-confirmations/history").then((r) => r.data),
  });
  // Testfeedback (2026-08-11, Punkt 4): /api/pending-confirmations/history
  // liefert bewusst ALLE 5 Status inkl. PENDING (siehe list_recent_for_user-
  // Docstring in trading_bot/confirm_execution.py - unverändert, andere
  // mögliche Konsumenten könnten das brauchen). Seit Chunk 2d kann ein
  // PENDING-Eintrag aber stundenlang offen bleiben (vorher nur 15 Min) -
  // ohne diesen Filter würde er die GESAMTE Zeit doppelt auf der Seite
  // stehen: einmal aktionsfähig oben in "Ausstehende Bestätigungen", einmal
  // passiv (mit "Ausstehend"-Badge, aber ohne Buttons) hier im "Verlauf".
  // Der Verlauf soll nur ABGESCHLOSSENE Vorgänge zeigen.
  const history = historyRaw?.filter((row) => row.status !== "pending");

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
          Link in der Bestätigungs-Mail zustimmst - weicht der Preis beim Klick zu stark vom Signalzeitpunkt ab,
          wirst du vorher noch einmal um Bestätigung zum neuen Preis gebeten.
        </p>
      </div>

      {notice && <ActionNotice notice={notice} />}

      {rows.length === 0 ? (
        <p className="text-text-muted text-sm py-4 text-center">Keine ausstehenden Bestätigungen.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <PendingCard
              key={row.id}
              row={row}
              onResolved={(message, ok) => setNotice({ message, ok })}
            />
          ))}
        </div>
      )}

      {history && history.length > 0 && (
        <div>
          <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted mb-2">
            Verlauf
          </div>
          <div className="bg-bg-card border border-border rounded-card px-4 py-2">
            {history.map((row) => (
              <HistoryRow key={row.id} row={row} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
