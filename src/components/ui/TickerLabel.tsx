// Beta-Feedback (Dana, 2026-08-13): überall wo bisher nur der reine Ticker
// stand, jetzt "Firmenname (TICKER)" – z.B. "United Parcel Service (UPS)".
// Mobile-Verhalten folgt der bereits etablierten Konvention dieser Codebase
// (siehe ScanHistorie.tsx statusCell-Docstring): reine Tooltips sind auf
// Mobile praktisch unauffindbar (kein Hover) – deshalb auf Mobile NUR der
// kompakte Ticker (title-Attribut liefert den Firmennamen fürs Long-Press),
// auf Desktop (md:-Breakpoint) der volle "Firmenname (TICKER)"-Text mit
// truncate+title als zusätzliches Sicherheitsnetz bei sehr langen Namen in
// schmalen Spalten (z.B. Tabellen mit vielen Spalten).
//
// Fallback: fehlt der Firmenname (noch nicht gecacht, siehe
// database.TickerCompanyName/config.WATCHLIST), wird auf BEIDEN Breakpoints
// einfach der reine Ticker gezeigt – kein Crash, keine leere Anzeige, kein
// "(TICKER)"-Duplikat.
export default function TickerLabel({
  ticker,
  companyName,
  className = "",
}: {
  ticker: string;
  companyName?: string | null;
  className?: string;
}) {
  if (!companyName) {
    return <span className={className}>{ticker}</span>;
  }

  const full = `${companyName} (${ticker})`;

  return (
    <>
      <span className={`md:hidden ${className}`} title={full}>
        {ticker}
      </span>
      <span
        className={`hidden md:inline-block max-w-full truncate align-bottom ${className}`}
        title={full}
      >
        {full}
      </span>
    </>
  );
}
