"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Check, X, Shield, Activity, Zap, AlertTriangle } from "lucide-react";
import {
  api, BotConfigEntry, EntrySlot, GUARDRAIL_LABELS, fmtGuardrailValue, parseGuardrailInput,
} from "@/lib/api";
import { TableSkeleton, CardSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
import { fmtPct, gainLossClass } from "@/lib/format";

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
      <div className="grid grid-cols-3 gap-3">
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
        {!editing && (
          <button onClick={startEdit} className="text-text-muted hover:text-gold transition-colors" aria-label={`${label} bearbeiten`}>
            <Pencil size={13} strokeWidth={1.5} />
          </button>
        )}
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
      <div className="bg-bg-card border border-border rounded-card px-4 py-4">
        <table className="w-full text-sm">
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
        <div className="grid grid-cols-3 gap-3">
          {GUARDRAIL_KEYS.filter((k) => k in config).map((key) => (
            <GuardrailCard key={key} botKey={key} value={config[key]} config={config} />
          ))}
        </div>
      </div>

      <EntrySlotsSection />
    </div>
  );
}
