type Color = "neutral" | "gain" | "loss" | "gold";

const COLOR_CLASS: Record<Color, string> = {
  neutral: "text-text-primary",
  gain: "text-gain",
  loss: "text-loss",
  gold: "text-gold",
};

export default function KPICard({
  label,
  value,
  color = "neutral",
  subtext,
  compact = false,
}: {
  label: string;
  value: string;
  color?: Color;
  subtext?: React.ReactNode;
  // Kleinere Wert-Schrift für Sechs-Kacheln-Zeilen (Gebühren-Kachel-Ergänzung
  // 2026-08-19, siehe Uebersicht.tsx tileGrid) - bei lg:grid-cols-6 reicht
  // die Standardgröße bei 1280px nicht mehr, längere Beträge liefen ohne
  // dies unsichtbar unter die Nachbarkachel (kein Umbruch/Ellipsis bei
  // einem einzelnen zusammenhängenden Zahlen-Token). Default false, damit
  // Performance.tsx (weiterhin fünf-spaltig) unverändert bleibt.
  compact?: boolean;
}) {
  return (
    <div className="bg-bg-card border border-border rounded-card px-3 py-3 md:px-6 md:py-5">
      <div className="text-[10px] md:text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted mb-1 md:mb-1.5">
        {label}
      </div>
      <div
        className={`font-figures ${compact ? "text-lg md:text-xl" : "text-2xl md:text-[1.8rem]"} font-semibold leading-tight ${COLOR_CLASS[color]}`}
      >
        {value}
      </div>
      {subtext && <div className="text-[10px] md:text-xs text-text-muted mt-0.5 md:mt-1">{subtext}</div>}
    </div>
  );
}
