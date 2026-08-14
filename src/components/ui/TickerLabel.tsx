// Beta-Feedback (Dana, 2026-08-13): überall wo bisher nur der reine Ticker
// stand, jetzt "Firmenname (TICKER)" – z.B. "United Parcel Service (UPS)".
//
// Mobile-Redesign (Daniel-Feedback, 2026-08-15): die ursprüngliche Version
// zeigte auf Mobile NUR den Ticker + Firmenname im title-Attribut fürs
// Long-Press (analog ScanHistorie.tsx statusCell()). Auf Daniels eigenem
// Gerät zeigte der Long-Press aber gar nichts - Diagnose ergab: keine
// Datenlücke (dieselbe /api/overview-Response, derselbe company_name-Wert
// wie auf Desktop), sondern eine bekannte Browser-Einschränkung: das
// title-Attribut löst nur bei einem "mouseover"-Event aus, das Touch-Geräte
// grundsätzlich nie erzeugen - iOS Safari unterstützt title-Tooltips per
// Long-Press überhaupt nicht (Android Chrome nur inkonsistent). Der
// Mechanismus war also nie zuverlässig nutzbar, nicht nur bei Daniel.
//
// Neues Verhalten: Mobile zeigt jetzt IMMER den vollen "Firmenname
// (TICKER)"-Text direkt (kein title/Long-Press mehr nötig), darf dafür bei
// Platzmangel mehrzeilig umbrechen (whitespace-normal statt truncate) -
// Aufrufer räumen dafür der Zeile/Karte genug vertikalen Raum ein (siehe
// Uebersicht.tsx/Bestaetigungen.tsx: Ticker-Zeile bricht auf Mobile
// responsive in eine eigene Reihe um, Badges rutschen darunter). Kein
// horizontales Scrollen, kein Abschneiden ohne Alternative.
//
// Desktop (md:-Breakpoint) UNVERÄNDERT: einzeilig mit truncate+title als
// Sicherheitsnetz bei sehr langen Namen in schmalen Spalten - funktioniert
// laut Daniel bereits einwandfrei, hier bewusst nicht angefasst.
//
// wrapOnDesktop (Fix 2026-08-14, Performance.tsx-Handelshistorie): dort war
// die Ticker-Spalte trotz reichlich Platz in den übrigen Spalten zu schmal,
// truncate schnitt Namen wie "Deutsche Post DHL (DHL.DE)" ab. Statt das
// Default-Verhalten für ALLE Aufrufer umzustellen (KPICard-Subtexte etc.
// brauchen truncate weiterhin, da dort der Platz tatsächlich knapp bleibt),
// per Opt-in-Prop: identisches Wrap-statt-Abschneiden-Verhalten wie auf
// Mobile, bewusst OHNE title-Tooltip (Konsistenz-Vorgabe: Info immer
// sichtbar statt hinter Hover versteckt) - EIN Element statt der
// md:hidden/hidden md:inline-block-Aufteilung, da sich Mobile/Desktop in
// diesem Modus nicht mehr unterscheiden.
//
// Fallback: fehlt der Firmenname (noch nicht gecacht, siehe
// database.TickerCompanyName/config.WATCHLIST), wird auf BEIDEN Breakpoints
// einfach der reine Ticker gezeigt – kein Crash, keine leere Anzeige, kein
// "(TICKER)"-Duplikat.
export default function TickerLabel({
  ticker,
  companyName,
  className = "",
  wrapOnDesktop = false,
}: {
  ticker: string;
  companyName?: string | null;
  className?: string;
  wrapOnDesktop?: boolean;
}) {
  if (!companyName) {
    return <span className={className}>{ticker}</span>;
  }

  const full = `${companyName} (${ticker})`;

  if (wrapOnDesktop) {
    return <span className={`whitespace-normal break-words ${className}`}>{full}</span>;
  }

  return (
    <>
      <span className={`md:hidden whitespace-normal break-words ${className}`}>
        {full}
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
