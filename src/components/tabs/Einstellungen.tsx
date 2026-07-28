"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Check, X, Shield, Activity, Zap, AlertTriangle, Info } from "lucide-react";
import {
  api, BotConfigEntry, EntrySlot, Overview, LearningProposal, GUARDRAIL_LABELS, fmtGuardrailValue, parseGuardrailInput,
} from "@/lib/api";
import { TableSkeleton, CardSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
import { fmtPct, fmtUsd, gainLossClass } from "@/lib/format";

type PresetKey = "konservativ" | "ausgewogen" | "aggressiv";

const PRESETS: {
  key: PresetKey; icon: typeof Shield; label: string; bullets: string[]; warnung?: string;
  values: Record<string, string>;
}[] = [
  {
    key: "konservativ", icon: Shield, label: "Konservativ",
    bullets: ["Max $30/Trade", "Max 3 offene Positionen", "ATR × 1.0", "Max 3 Handelstage"],
    values: { MAX_CAPITAL_PER_TRADE: "30", MAX_OPEN_POSITIONS: "3", ATR_MULTIPLIER_SL: "1.0", ATR_MULTIPLIER_TP: "2.0", MAX_HOLDING_DAYS: "3", VOLATILE_SEGMENT_PCT: "0.0" },
  },
  {
    key: "ausgewogen", icon: Activity, label: "Ausgewogen",
    bullets: ["Max $50/Trade", "Max 5 offene Positionen", "ATR × 1.5", "Max 5 Handelstage"],
    values: { MAX_CAPITAL_PER_TRADE: "50", MAX_OPEN_POSITIONS: "5", ATR_MULTIPLIER_SL: "1.5", ATR_MULTIPLIER_TP: "3.0", MAX_HOLDING_DAYS: "5", VOLATILE_SEGMENT_PCT: "0.33" },
  },
  {
    key: "aggressiv", icon: Zap, label: "Aggressiv",
    bullets: ["Max $100/Trade", "Max 8 offene Positionen", "ATR × 2.0", "Max 7 Handelstage"],
    warnung: "Höheres Risiko",
    values: { MAX_CAPITAL_PER_TRADE: "100", MAX_OPEN_POSITIONS: "8", ATR_MULTIPLIER_SL: "2.0", ATR_MULTIPLIER_TP: "4.0", MAX_HOLDING_DAYS: "7", VOLATILE_SEGMENT_PCT: "0.5" },
  },
];

const GUARDRAIL_TOOLTIPS: Record<string, string> = {
  MAX_CAPITAL_TOTAL: "Maximales Kapital das der Bot insgesamt einsetzen darf. Empfehlung: nur Kapital das du entbehren kannst.",
  MAX_CAPITAL_PER_TRADE: "Maximaler Einsatz pro einzelnem Trade. Bei $50 und Score 80 kauft der Bot für $50.",
  MAX_OPEN_POSITIONS: "Wie viele Trades gleichzeitig offen sein dürfen. Bei Erreichen werden keine neuen Käufe getätigt.",
  MAX_TRADES_PER_DAY: "Maximale Anzahl neuer Käufe pro Handelstag. Wird dynamisch auf die Zeitslots verteilt.",
  DAILY_LOSS_LIMIT_PCT: "Bot pausiert automatisch wenn der Tagesverlust diesen Prozentsatz des Gesamtkapitals erreicht.",
  MIN_SIGNAL_SCORE: "Mindest-Score (0-100) den ein Ticker erreichen muss. Höher = konservativer. Standard: 65.",
  VIX_PAUSE_THRESHOLD: "Bot pausiert wenn der VIX (Angst-Index der Börse) diesen Wert überschreitet. VIX >30 = hohe Volatilität.",
  ATR_MULTIPLIER_SL: "Stop Loss = ATR × dieser Wert. ATR misst die typische Tagesschwankung. 1.5 = 1.5× normale Schwankung.",
  ATR_MULTIPLIER_TP: "Take Profit = ATR × dieser Wert. Bei SL=1.5 und TP=3.0 ist das Chance-Risiko-Verhältnis 2:1.",
  MAX_HOLDING_DAYS: "Position wird automatisch nach X Handelstagen verkauft. Verhindert totes Kapital in stagnierenden Positionen.",
  VOLATILE_SEGMENT_PCT: "Anteil volatile Wachstumstitel am Portfolio. Rest = stabile Large Caps. 33% = ausgewogen.",
  EARNINGS_BUFFER_DAYS: "Kein Kauf X Tage vor Quartalszahlen. Verhindert Gap-Risiko durch Earnings-Überraschungen.",
};

function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="relative group inline-block">
      <div
        className="w-4 h-4 rounded-full border border-border flex items-center justify-center cursor-help
                   text-text-muted hover:border-gold hover:text-gold transition-colors"
      >
        <Info size={10} />
      </div>
      <div
        className="absolute bottom-6 right-0 z-50 hidden group-hover:block bg-bg-card border border-border
                   rounded p-2 text-xs text-text-muted max-w-48 w-48 shadow-lg"
      >
        {text}
      </div>
    </div>
  );
}

const GUARDRAIL_KEYS = [
  "MAX_CAPITAL_TOTAL", "MAX_CAPITAL_PER_TRADE", "MAX_OPEN_POSITIONS", "MAX_TRADES_PER_DAY",
  "DAILY_LOSS_LIMIT_PCT", "MIN_SIGNAL_SCORE", "VIX_PAUSE_THRESHOLD",
  "ATR_MULTIPLIER_SL", "ATR_MULTIPLIER_TP", "MAX_HOLDING_DAYS", "VOLATILE_SEGMENT_PCT", "EARNINGS_BUFFER_DAYS",
];

function activePreset(config: Record<string, string>): PresetKey | null {
  for (const preset of PRESETS) {
    const matches = Object.entries(preset.values).every(([k, v]) => config[k] === v);
    if (matches) return preset.key;
  }
  return null;
}

// MAX_OPEN_POSITIONS × MAX_CAPITAL_PER_TRADE darf MAX_CAPITAL_TOTAL nicht
// übersteigen – Live-Validierung während der Eingabe.
function validateCapitalSettings(
  config: Record<string, string>, editingKey: string, draftRawValue: string
): { valid: boolean; message?: string } {
  if (editingKey !== "MAX_OPEN_POSITIONS" && editingKey !== "MAX_CAPITAL_PER_TRADE") return { valid: true };

  const maxOpenPositions = Number(editingKey === "MAX_OPEN_POSITIONS" ? draftRawValue : config.MAX_OPEN_POSITIONS);
  const maxCapitalPerTrade = Number(editingKey === "MAX_CAPITAL_PER_TRADE" ? draftRawValue : config.MAX_CAPITAL_PER_TRADE);
  const gesamtkapital = Number(config.MAX_CAPITAL_TOTAL);

  if (!maxOpenPositions || !maxCapitalPerTrade || !gesamtkapital || Number.isNaN(maxOpenPositions) || Number.isNaN(maxCapitalPerTrade)) {
    return { valid: true };
  }
  const maxInvestiert = maxOpenPositions * maxCapitalPerTrade;
  if (maxInvestiert > gesamtkapital) {
    const maxMoeglich = Math.floor(gesamtkapital / maxCapitalPerTrade);
    return {
      valid: false,
      message: `Mit diesen Einstellungen würdest du ${maxInvestiert.toLocaleString("de-DE")} $ investieren, aber nur ${gesamtkapital.toLocaleString("de-DE")} $ verfügbar. Maximal ${maxMoeglich} Positionen möglich.`,
    };
  }
  return { valid: true };
}

function PresetsSection({ config }: { config: Record<string, string> }) {
  const queryClient = useQueryClient();
  const current = activePreset(config);

  const mutation = useMutation({
    mutationFn: (preset: PresetKey) => api.post("/api/bot-config/preset", { preset }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot-config"] }),
  });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Risiko-Presets</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => mutation.mutate(p.key)}
            disabled={mutation.isPending}
            className={`text-left rounded-card border px-4 py-4 transition-colors disabled:opacity-50 ${
              current === p.key ? "border-gold bg-gold/5" : "border-border hover:border-border-accent/50"
            }`}
          >
            <div className="font-medium mb-2 flex items-center gap-1.5">
              <p.icon size={16} strokeWidth={1.5} /> {p.label}
            </div>
            <ul className="text-xs text-text-muted space-y-1">
              {p.bullets.map((b) => <li key={b}>• {b}</li>)}
            </ul>
            {p.warnung && (
              <p className="text-xs text-loss mt-2 flex items-center gap-1">
                <AlertTriangle size={13} strokeWidth={1.5} /> {p.warnung}
              </p>
            )}
          </button>
        ))}
      </div>
      {mutation.isError && <p className="text-xs text-loss">Preset konnte nicht angewendet werden.</p>}
    </div>
  );
}

function GuardrailCard({ botKey, value, config }: { botKey: string; value: string; config: Record<string, string> }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const spec = GUARDRAIL_LABELS[botKey];
  const label = spec?.label ?? botKey;
  const displayValue = fmtGuardrailValue(botKey, value);

  const mutation = useMutation({
    mutationFn: (rawValue: string) => api.put(`/api/bot-config/${botKey}`, { value: rawValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bot-config"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      setEditing(false);
    },
  });

  const draftRawValue = parseGuardrailInput(botKey, draft);
  const validation = editing ? validateCapitalSettings(config, botKey, draftRawValue) : { valid: true };

  function startEdit() {
    setDraft(displayValue.replace("%", "").replace(" $", "").trim());
    setEditing(true);
  }

  function save() {
    if (!validation.valid) return;
    mutation.mutate(draftRawValue);
  }

  return (
    <div className="bg-bg-card border border-border rounded-card px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="text-text-muted text-xs">{label}</div>
        <div className="flex items-center gap-1.5">
          {GUARDRAIL_TOOLTIPS[botKey] && <InfoTooltip text={GUARDRAIL_TOOLTIPS[botKey]} />}
          {!editing && (
            <button onClick={startEdit} className="text-text-muted hover:text-gold transition-colors" aria-label={`${label} bearbeiten`}>
              <Pencil size={13} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="mt-1">
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              disabled={mutation.isPending}
              className="w-full bg-bg-app border border-gold rounded-btn px-2 py-1 text-sm font-figures"
            />
            <button onClick={save} disabled={mutation.isPending || !validation.valid} className="text-gain hover:opacity-80 shrink-0 disabled:opacity-30" aria-label="Speichern">
              <Check size={16} strokeWidth={2} />
            </button>
            <button onClick={() => setEditing(false)} disabled={mutation.isPending} className="text-text-muted hover:text-loss shrink-0" aria-label="Abbrechen">
              <X size={16} strokeWidth={2} />
            </button>
          </div>
          {!validation.valid && (
            <div className="text-xs text-loss mt-1 flex items-start gap-1">
              <AlertTriangle size={13} strokeWidth={1.5} className="shrink-0 mt-0.5" /> {validation.message}
            </div>
          )}
        </div>
      ) : (
        <div className="font-figures">{displayValue}</div>
      )}
      {mutation.isError && <div className="text-xs text-loss mt-1">Speichern fehlgeschlagen</div>}
    </div>
  );
}

function BrokerConfigSection({ config }: { config: Record<string, string> }) {
  const queryClient = useQueryClient();

  const { data: overview } = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.get<Overview>("/api/overview").then((r) => r.data),
  });

  const activeBroker = config.ACTIVE_BROKER ?? "alpaca";
  const drainMode = (config.ALPACA_DRAIN_MODE ?? "false").toLowerCase() === "true";
  const alpacaOpenTrades = (overview?.open_trades ?? []).filter((t) => (t.broker ?? "alpaca") === "alpaca");

  const brokerMutation = useMutation({
    mutationFn: (broker: string) => api.put("/api/bot-config/ACTIVE_BROKER", { value: broker }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot-config"] }),
  });

  const drainMutation = useMutation({
    mutationFn: (value: boolean) => api.put("/api/bot-config/ALPACA_DRAIN_MODE", { value: value ? "true" : "false" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot-config"] }),
  });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Broker-Konfiguration</h3>
      <p className="text-xs text-text-muted">Aktiver Broker für neue Trades:</p>

      <div className="space-y-2">
        <label
          className={`flex items-start gap-2 px-3 py-2.5 rounded-card border cursor-pointer transition-colors ${
            activeBroker === "alpaca" ? "border-gold bg-gold/5" : "border-border hover:border-border-accent/50"
          } ${brokerMutation.isPending ? "opacity-60 pointer-events-none" : ""}`}
        >
          <input
            type="radio" name="active-broker" className="mt-1 accent-gold"
            checked={activeBroker === "alpaca"}
            onChange={() => activeBroker !== "alpaca" && brokerMutation.mutate("alpaca")}
          />
          <div className="text-sm">
            <div className="font-medium">Alpaca Markets</div>
            <div className="text-xs text-text-muted mt-0.5">US-Aktien · Fractional Shares · Paper Trading verfügbar</div>
            <div className="text-xs mt-1.5 flex items-center gap-3">
              <span className="text-gain font-medium">Status: LIVE ✅</span>
              <span className="text-text-muted font-figures">Konto: {overview ? fmtUsd(overview.portfolio_value, 0) : "…"}</span>
            </div>
          </div>
        </label>

        <label
          className="flex items-start gap-2 px-3 py-2.5 rounded-card border border-border opacity-60 cursor-not-allowed"
        >
          <input type="radio" name="active-broker" className="mt-1 accent-gold" disabled checked={false} readOnly />
          <div className="text-sm">
            <div className="font-medium">Saxo Bank</div>
            <div className="text-xs text-text-muted mt-0.5">Weltweit · US + EU + Asien</div>
            <div className="text-xs mt-1.5 text-text-muted">Status: In Kürze verfügbar</div>
          </div>
        </label>
      </div>

      <div className="bg-bg-card border border-border rounded-card px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Alpaca Drain Mode</div>
          <div className="text-xs text-text-muted mt-0.5">Keine neuen Alpaca-Käufe – bestehende Positionen laufen aus</div>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer shrink-0">
          <span className={`text-xs font-semibold ${drainMode ? "text-orange-400" : "text-text-muted"}`}>
            {drainMode ? "AN" : "AUS"}
          </span>
          <input
            type="checkbox" checked={drainMode}
            disabled={drainMutation.isPending}
            onChange={(e) => drainMutation.mutate(e.target.checked)}
          />
        </label>
      </div>

      {drainMode && (
        <div className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/30 rounded-card px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5" />
          <span>
            Alpaca kauft keine neuen Positionen mehr.{" "}
            {alpacaOpenTrades.length > 0
              ? `Bestehende Positionen (${alpacaOpenTrades.map((t) => t.ticker).join(", ")}) laufen normal bis SL/TP/Time-Exit.`
              : "Aktuell keine offenen Alpaca-Positionen."}
          </span>
        </div>
      )}

      {(brokerMutation.isError || drainMutation.isError) && (
        <p className="text-xs text-loss">Speichern fehlgeschlagen.</p>
      )}
    </div>
  );
}

function EntrySlotsSection() {
  const queryClient = useQueryClient();

  const { data: slots = [] } = useQuery({
    queryKey: ["entry-slots"],
    queryFn: () => api.get<EntrySlot[]>("/api/entry-slots").then((r) => r.data),
  });

  const { data: learningMode } = useQuery({
    queryKey: ["entry-learning-mode"],
    queryFn: () => api.get<{ lernmodus: boolean }>("/api/settings/entry-learning-mode").then((r) => r.data),
  });

  const slotMutation = useMutation({
    mutationFn: ({ id, gewichtung, aktiv }: { id: number; gewichtung?: number; aktiv?: boolean }) =>
      api.put(`/api/entry-slots/${id}`, { gewichtung, aktiv }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entry-slots"] }),
  });

  const learningModeMutation = useMutation({
    mutationFn: (lernmodus: boolean) => api.put("/api/settings/entry-learning-mode", { lernmodus }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["entry-learning-mode"] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Einstiegszeitpunkte</h3>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <span className="text-text-muted text-xs">Lernmodus</span>
          <input
            type="checkbox"
            checked={learningMode?.lernmodus ?? false}
            onChange={(e) => learningModeMutation.mutate(e.target.checked)}
          />
        </label>
      </div>
      <div className="bg-bg-card border border-border rounded-card px-4 py-4 overflow-x-auto">
        <table className="w-full min-w-[500px] text-sm">
          <thead>
            <tr className="text-text-muted text-xs uppercase tracking-wider border-b border-border">
              <th className="text-left py-2 font-semibold">Zeit ET</th>
              <th className="text-right py-2 font-semibold">Gewichtung</th>
              <th className="text-right py-2 font-semibold">Ø G/V</th>
              <th className="text-right py-2 font-semibold">Trefferquote</th>
              <th className="text-left py-2 font-semibold">Quelle</th>
              <th className="text-right py-2 font-semibold">Aktiv</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.id} className="border-b border-border/50 last:border-0">
                <td className="py-2 font-figures">
                  {String(s.stunde_et).padStart(2, "0")}:{String(s.minute_et).padStart(2, "0")}
                </td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    defaultValue={s.gewichtung}
                    onBlur={(e) => {
                      const val = Number(e.target.value);
                      if (val !== s.gewichtung) slotMutation.mutate({ id: s.id, gewichtung: val });
                    }}
                    className="w-16 bg-bg-app border border-border rounded-btn px-1.5 py-0.5 text-right font-figures"
                  />
                </td>
                <td className={`py-2 text-right font-figures ${s.avg_pnl != null ? gainLossClass(s.avg_pnl) : "text-text-muted"}`}>
                  {s.avg_pnl != null ? fmtPct(s.avg_pnl) : "–"}
                </td>
                <td className="py-2 text-right font-figures text-text-muted">
                  {s.trefferquote != null ? `${s.trefferquote.toFixed(0)}%` : "–"} ({s.anzahl_trades})
                </td>
                <td className="py-2 text-text-muted capitalize">{s.quelle}</td>
                <td className="py-2 text-right">
                  <input
                    type="checkbox"
                    checked={s.aktiv}
                    onChange={(e) => slotMutation.mutate({ id: s.id, aktiv: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  threshold_optimierung: "Score-Schwellwert-Optimierung",
  watchlist_optimierung: "Watchlist-Optimierung",
};

function LearningProposalCard({ proposal }: { proposal: LearningProposal }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (action: "accept" | "reject") =>
      api.post(`/api/learning-proposals/${action}`, { index: proposal.index }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["learning-proposals"] }),
  });

  const typLabel = PROPOSAL_TYPE_LABELS[proposal.data.typ] ?? proposal.data.typ;

  return (
    <div className="bg-bg-card border border-border rounded-card px-4 py-3 space-y-2">
      <div className="text-sm font-medium flex items-center gap-1.5">🧠 {typLabel}</div>

      {proposal.data.aktuell !== undefined && proposal.data.empfohlen !== undefined && (
        <p className="text-xs font-figures text-text-muted">
          Aktuell: {proposal.data.aktuell} → Empfohlen: <span className="text-gold">{proposal.data.empfohlen}</span>
        </p>
      )}
      {proposal.data.begruendung && <p className="text-xs text-text-muted">{proposal.data.begruendung}</p>}
      {proposal.data.vorschlaege && (
        <ul className="text-xs text-text-muted space-y-1">
          {proposal.data.vorschlaege.map((v) => (
            <li key={v.ticker}>
              <strong className="text-text-primary">{v.ticker}</strong> entfernen – {v.begruendung}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => mutation.mutate("accept")}
          disabled={mutation.isPending}
          className="text-xs px-3 py-1.5 rounded-btn bg-gold/10 text-gold border border-gold/30 hover:bg-gold/20 transition-colors disabled:opacity-50"
        >
          Übernehmen
        </button>
        <button
          onClick={() => mutation.mutate("reject")}
          disabled={mutation.isPending}
          className="text-xs px-3 py-1.5 rounded-btn border border-border text-text-muted hover:border-loss/50 hover:text-loss transition-colors disabled:opacity-50"
        >
          Ablehnen
        </button>
      </div>
      {mutation.isError && <p className="text-xs text-loss">Aktion fehlgeschlagen.</p>}
    </div>
  );
}

function LearningProposalsSection() {
  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ["learning-proposals"],
    queryFn: () => api.get<LearningProposal[]>("/api/learning-proposals").then((r) => r.data),
  });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">KI-Lernvorschläge</h3>
      {isLoading ? (
        <CardSkeleton className="h-20" />
      ) : proposals.length === 0 ? (
        <p className="text-xs text-text-muted">Noch keine Vorschläge – nächster Lernzyklus: montags 06:00 ET.</p>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <LearningProposalCard key={p.index} proposal={p} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Einstellungen() {
  const { data: configList, isLoading, isError, refetch } = useQuery({
    queryKey: ["bot-config"],
    queryFn: () => api.get<BotConfigEntry[]>("/api/bot-config").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <CardSkeleton className="h-40" />
        <TableSkeleton />
      </div>
    );
  }

  if (isError || !configList) {
    return <ErrorState message="Einstellungen konnten nicht geladen werden." onRetry={() => refetch()} />;
  }

  const config = Object.fromEntries(configList.map((c) => [c.key, c.value]));

  return (
    <div className="space-y-8">
      <PresetsSection config={config} />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Guardrails</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {GUARDRAIL_KEYS.filter((k) => k in config).map((key) => (
            <GuardrailCard key={key} botKey={key} value={config[key]} config={config} />
          ))}
        </div>
      </div>

      <BrokerConfigSection config={config} />

      <EntrySlotsSection />

      <LearningProposalsSection />
    </div>
  );
}
