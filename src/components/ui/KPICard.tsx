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
}: {
  label: string;
  value: string;
  color?: Color;
  subtext?: string;
}) {
  return (
    <div className="bg-bg-card border border-border rounded-card px-6 py-5">
      <div className="text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted mb-1.5">
        {label}
      </div>
      <div className={`font-figures text-[1.8rem] font-semibold leading-tight ${COLOR_CLASS[color]}`}>
        {value}
      </div>
      {subtext && <div className="text-xs text-text-muted mt-1">{subtext}</div>}
    </div>
  );
}
