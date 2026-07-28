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
  subtext?: React.ReactNode;
}) {
  return (
    <div className="bg-bg-card border border-border rounded-card px-3 py-3 md:px-6 md:py-5">
      <div className="text-[10px] md:text-[0.72rem] font-semibold tracking-wider uppercase text-text-muted mb-1 md:mb-1.5">
        {label}
      </div>
      <div className={`font-figures text-2xl md:text-[1.8rem] font-semibold leading-tight ${COLOR_CLASS[color]}`}>
        {value}
      </div>
      {subtext && <div className="text-[10px] md:text-xs text-text-muted mt-0.5 md:mt-1">{subtext}</div>}
    </div>
  );
}
