// Format-Helper – angepasst von portfolio_react/src/lib/format.ts auf USD
// (der Bot handelt ausschließlich in USD, siehe trading_bot/config.py).

export function fmtUsd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "–";
  return (
    "$" + value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })
  );
}

export function fmtUsdSigned(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "–";
  return (value >= 0 ? "+" : "") + fmtUsd(value, digits);
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "–";
  return (value >= 0 ? "+" : "") + value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "%";
}

export function fmtZahl(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "–";
  return value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// Für Mengen/Stückzahlen (Fractional Shares): ganze Zahlen ohne
// Nachkommastellen, Bruchteile mit 4 Nachkommastellen (Alpaca rundet
// Fractional-Qty auf 6, aber 4 sind für die Anzeige lesbar genug).
export function fmtMenge(value: number | null | undefined): string {
  if (value === null || value === undefined) return "–";
  if (Number.isInteger(value)) {
    return value.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  }
  return value.toLocaleString("de-DE", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function gainLossClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-text-muted";
  return value >= 0 ? "text-gain" : "text-loss";
}
