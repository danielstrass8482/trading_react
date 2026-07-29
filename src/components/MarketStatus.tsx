"use client";

import { useEffect, useState } from "react";

// Zeigt Handelszeiten-Status für beide vom Bot bedienten Märkte (US/Alpaca,
// Europa/Saxo – Xetra/Euronext/LSE laufen DST-synchron mit Europe/Berlin,
// daher genügt eine Zone für "Europa"). Feiertage werden für v1 bewusst
// ignoriert (Näherung, analog zu broker.count_trading_days im Backend) –
// nur Wochentag + Uhrzeit entscheiden.
type MarketDef = {
  key: string;
  label: string;
  timeZone: string;
  // Feste Zonen-Abkürzung (z.B. "ET") statt dynamischer EST/EDT-Unterscheidung
  // – der Rest des Produkts (Backend-Logs, Scheduler) verwendet durchgängig
  // "ET" unabhängig von Sommer-/Winterzeit, das wird hier gespiegelt. Ohne
  // fixedZoneLabel wird die Abkürzung aus dem tatsächlichen UTC-Offset
  // hergeleitet (siehe zoneAbbrev) – für Europe/Berlin also CET/CEST.
  fixedZoneLabel?: string;
  openMinutes: number;
  closeMinutes: number;
};

const MARKETS: MarketDef[] = [
  { key: "us", label: "US-Markt (Alpaca)", timeZone: "America/New_York", fixedZoneLabel: "ET", openMinutes: 9 * 60 + 30, closeMinutes: 16 * 60 },
  { key: "eu", label: "Europa (Saxo)", timeZone: "Europe/Berlin", openMinutes: 9 * 60, closeMinutes: 17 * 60 + 30 },
];

// Rechnet den tatsächlichen UTC-Offset einer Zeitzone zu einem Zeitpunkt aus
// den von Intl gelieferten lokalen Kalenderfeldern zurück – kein hardcoded
// UTC+X/UTC+Y, DST wird dadurch automatisch korrekt berücksichtigt (auch für
// den seltenen Fall, dass US und EU an unterschiedlichen Tagen umstellen).
function getZonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  const asUtcMs = Date.UTC(
    Number(map.year), Number(map.month) - 1, Number(map.day),
    Number(map.hour), Number(map.minute), Number(map.second)
  );
  return {
    hour: Number(map.hour),
    minute: Number(map.minute),
    weekday: map.weekday, // "Mon".."Sun"
    offsetMinutes: Math.round((asUtcMs - date.getTime()) / 60000),
  };
}

function zoneAbbrev(timeZone: string, offsetMinutes: number, fixedLabel?: string): string {
  if (fixedLabel) return fixedLabel;
  if (timeZone === "Europe/Berlin") return offsetMinutes === 120 ? "CEST" : "CET";
  const sign = offsetMinutes >= 0 ? "+" : "-";
  return `UTC${sign}${Math.abs(offsetMinutes) / 60}`;
}

function hhmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function minutesToHhmm(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return hhmm(Math.floor(normalized / 60), normalized % 60);
}

// Rechnet einen in der HEIMAT-Zone fixen Handelszeiten-Zeitpunkt (z.B. Open/
// Close-Minuten) in die entsprechende Uhrzeit der ANDEREN Zone um, anhand der
// für "jetzt" tatsächlich geltenden Offset-Differenz (siehe getZonedParts) –
// damit die Anzeige "09:30–16:00 ET (15:30–22:00 CEST)" auch bei künftigen
// abweichenden DST-Umstellterminen zwischen US und EU korrekt bleibt.
function convertMinutesToOtherZone(minutes: number, homeOffset: number, otherOffset: number): number {
  return minutes + (otherOffset - homeOffset);
}

function isMarketOpen(date: Date, market: MarketDef): boolean {
  const { hour, minute, weekday } = getZonedParts(date, market.timeZone);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const minutesNow = hour * 60 + minute;
  return minutesNow >= market.openMinutes && minutesNow < market.closeMinutes;
}

export default function MarketStatus() {
  // "now" erst nach Mount setzen (client-abhängig, sonst Hydration-Mismatch
  // zwischen Server- und Client-Render der Uhrzeit).
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return <div className="px-2 text-xs text-text-muted">Marktzeiten werden geladen…</div>;
  }

  // Aktuelle Uhrzeit wird nur EINMAL oben zentral angezeigt (ET + CEST) statt
  // redundant pro Markt-Zeile – beide Zeilen zeigten vorher denselben
  // Zeitpunkt nur aus unterschiedlicher Perspektive.
  const usParts = getZonedParts(now, MARKETS[0].timeZone);
  const euParts = getZonedParts(now, MARKETS[1].timeZone);
  const usLabel = zoneAbbrev(MARKETS[0].timeZone, usParts.offsetMinutes, MARKETS[0].fixedZoneLabel);
  const euLabel = zoneAbbrev(MARKETS[1].timeZone, euParts.offsetMinutes, MARKETS[1].fixedZoneLabel);

  return (
    <div className="px-2 space-y-3 text-xs">
      <div className="text-text-disabled font-figures pb-1 border-b border-border">
        Jetzt: {hhmm(usParts.hour, usParts.minute)} {usLabel} · {hhmm(euParts.hour, euParts.minute)} {euLabel}
      </div>
      {MARKETS.map((market) => {
        const other = MARKETS.find((m) => m.key !== market.key)!;
        const home = getZonedParts(now, market.timeZone);
        const otherParts = getZonedParts(now, other.timeZone);
        const open = isMarketOpen(now, market);
        const homeLabel = zoneAbbrev(market.timeZone, home.offsetMinutes, market.fixedZoneLabel);
        const otherLabel = zoneAbbrev(other.timeZone, otherParts.offsetMinutes, other.fixedZoneLabel);

        // Feste Handelszeiten (Open/Close) zusätzlich zum aktuellen Live-
        // Status anzeigen, in der Heimat-Zone UND umgerechnet in die jeweils
        // andere Zone - macht explizit, WANN gehandelt wird, statt nur den
        // Live-Snapshot zu zeigen (der z.B. kurz vor Open leicht als "falsch"
        // missverstanden werden kann).
        const otherOpenMinutes = convertMinutesToOtherZone(market.openMinutes, home.offsetMinutes, otherParts.offsetMinutes);
        const otherCloseMinutes = convertMinutesToOtherZone(market.closeMinutes, home.offsetMinutes, otherParts.offsetMinutes);

        return (
          <div key={market.key}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-text-primary">{market.label}</span>
              <span className={`flex items-center gap-1 font-semibold shrink-0 ${open ? "text-gain" : "text-loss"}`}>
                <span>●</span> {open ? "Offen" : "Geschlossen"}
              </span>
            </div>
            <div className="text-text-muted font-figures mt-0.5">
              {minutesToHhmm(market.openMinutes)}–{minutesToHhmm(market.closeMinutes)} {homeLabel}
              {" "}({minutesToHhmm(otherOpenMinutes)}–{minutesToHhmm(otherCloseMinutes)} {otherLabel})
            </div>
            {!open && (
              <div className="text-text-disabled text-[0.65rem] mt-0.5">
                Positionen ändern sich erst wieder bei Markteröffnung
              </div>
            )}
          </div>
        );
      })}
      <div className="text-text-disabled text-[0.65rem] pt-1 border-t border-border">
        Zeigt nur, ob die Börse gerade handelt – unabhängig davon, ob/wann der Bot neue Trades platziert (Entry-Slots).
      </div>
    </div>
  );
}
