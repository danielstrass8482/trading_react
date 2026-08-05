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

// Währungs-Symbol vorangestellt statt "$" fest zu kodieren – für die
// kombinierte Alpaca(USD)+Saxo(EUR/GBP)-Ansicht, wo pro Zeile eine andere
// Währung gelten kann (siehe Uebersicht.tsx/Performance.tsx).
const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

export function fmtMoney(value: number | null | undefined, currency: string, digits = 2): string {
  if (value === null || value === undefined) return "–";
  // EUR folgt der deutschen Konvention (Symbol hinten, Komma als Dezimal-
  // trennzeichen: "162,90 €") statt des sonst hier verwendeten Dollar-Stils
  // (Symbol vorne). USD/GBP bleiben bewusst im bisherigen Format (Alpaca
  // handelt ausschließlich in USD, siehe Modul-Kommentar oben).
  if (currency === "EUR") {
    return new Intl.NumberFormat("de-DE", {
      style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value);
  }
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency + " ";
  return symbol + value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtMoneySigned(value: number | null | undefined, currency: string, digits = 2): string {
  if (value === null || value === undefined) return "–";
  return (value >= 0 ? "+" : "") + fmtMoney(value, currency, digits);
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "–";
  return (value >= 0 ? "+" : "") + value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "%";
}

export function fmtZahl(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "–";
  return value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// Für Mengen/Stückzahlen (Fractional Shares): max. `digits` Nachkommastellen
// in der ANZEIGE (ganze Zahlen ohne Nachkommastellen, Bruchteile gerundet) –
// die zugrunde liegende Precision (Alpaca liefert bis zu 6 Nachkommastellen)
// bleibt in DB/Berechnungen unverändert, hier wird nur für die Darstellung
// gerundet (z.B. 0.3274 -> "0,33" bei digits=2). Default bleibt 2 (Handels-
// historie/sonstige Call-Sites unverändert) – die Positionskarte in
// Uebersicht.tsx übergibt bewusst 4, damit Eingesetzt/Aktueller-Wert-Betrag
// und die angezeigte Stückzahl bei Fractional Shares nachvollziehbar
// zusammenpassen (0,46 Stück rundete den Unterschied vorher weg).
export function fmtMenge(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "–";
  return value.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function gainLossClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-text-muted";
  return value >= 0 ? "text-gain" : "text-loss";
}
