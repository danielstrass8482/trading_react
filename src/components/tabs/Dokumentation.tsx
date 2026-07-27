"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";

const SCORE_WEIGHTS: { name: string; punkte: number; beschreibung: string }[] = [
  { name: "RSI (14)", punkte: 20, beschreibung: "Momentum – überverkaufte Titel (RSI < 35) gelten als bullisch." },
  { name: "SMA 50/200-Trend", punkte: 20, beschreibung: "Kurs über SMA50 über SMA200 = intakter Aufwärtstrend." },
  { name: "Volumen", punkte: 20, beschreibung: "Handelsvolumen mind. 20% über dem 20-Tage-Durchschnitt bestätigt die Bewegung." },
  { name: "KGV (Trailing P/E)", punkte: 15, beschreibung: "Bewertung im Rahmen (5–40) statt überteuert oder verdächtig günstig." },
  { name: "Verschuldungsgrad", punkte: 15, beschreibung: "Debt-to-Equity unter 200% bevorzugt." },
  { name: "Umsatzwachstum", punkte: 10, beschreibung: "Positives Umsatzwachstum (YoY) wird belohnt." },
];

const FAQ: { frage: string; antwort: string }[] = [
  { frage: "Wird wirklich echtes Geld eingesetzt?", antwort: "Ja. Der Bot handelt live über Alpaca Markets – jede Order bewegt echtes Kapital." },
  { frage: "Wie oft handelt der Bot?", antwort: "Zu mehreren festen Zeitpunkten pro Handelstag (siehe „Einstiegszeitpunkte“), begrenzt durch freies Kapital und offene Positionslimits." },
  { frage: "Was passiert bei starker Marktangst (hoher VIX)?", antwort: "Übersteigt der VIX den konfigurierten Schwellwert, pausiert der Bot komplett und eröffnet keine neuen Positionen." },
  { frage: "Kann ich den Bot pausieren?", antwort: "Ja. Bestehende Positionen laufen mit SL/TP/Trailing Stop regulär weiter, bis sie geschlossen werden." },
  { frage: "Was passiert bei Erreichen des täglichen Verlustlimits?", antwort: "Der Bot pausiert automatisch und handelt erst nach manueller Freigabe wieder." },
  { frage: "Kann ich die Einstellungen ändern?", antwort: "Ja, im Tab „Einstellungen“ – Änderungen wirken ab dem nächsten Bot-Zyklus, ohne Neustart." },
  { frage: "Handelt der Bot auch, wenn der Markt fällt?", antwort: "Der Bot erkennt das Marktregime (bullish/bearish/neutral) und bevorzugt in einem bärischen Umfeld inverse ETFs gegenüber klassischen Long-Aktien." },
];

function AccordionSection({
  title, defaultOpen = false, children,
}: {
  title: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-bg-card border border-border rounded-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-bg-hover transition-colors"
      >
        {open ? <ChevronDown size={16} className="text-gold shrink-0" /> : <ChevronRight size={16} className="text-gold shrink-0" />}
        <span className="font-medium">{title}</span>
      </button>
      {open && <div className="px-5 pb-5 space-y-3 text-sm text-text-primary leading-relaxed">{children}</div>}
    </div>
  );
}

export default function Dokumentation() {
  return (
    <div className="space-y-3">
      <AccordionSection title="Wie funktioniert der Bot?" defaultOpen>
        <p>
          Der Bot durchläuft an jedem Handelstag mehrere feste Zyklen. In jedem Zyklus wird die
          Watchlist gescannt, für jeden Ticker ein Signal-Score berechnet und geprüft, ob KO-Kriterien
          (bevorstehende Earnings, zu starke Kursbewegung, zu hohe Korrelation mit einer bereits offenen
          Position) einen Kauf ausschließen. Nur Kandidaten mit Score ≥ 65/100, ohne KO-Kriterium und
          innerhalb der Kapital- und Positionslimits werden tatsächlich gekauft.
        </p>
        <p>
          Eine KI-Komponente (Claude) kommentiert jeden ausgeführten Trade nachträglich mit einer
          kurzen Einschätzung und zwei qualitativen Risiken – trifft aber keine Kauf- oder
          Verkaufsentscheidung. Die Entscheidung liegt ausschließlich bei der regelbasierten Rule-Engine.
        </p>
      </AccordionSection>

      <AccordionSection title="Signal-Score">
        <p>Der Score setzt sich aus sechs gewichteten Kriterien zusammen und ergibt in Summe maximal 100 Punkte:</p>
        <div className="divide-y divide-border/50 border border-border rounded-card overflow-hidden">
          {SCORE_WEIGHTS.map((w) => (
            <div key={w.name} className="flex items-start gap-3 px-3 py-2.5 bg-bg-app">
              <span className="font-figures text-gold text-sm w-14 shrink-0">{w.punkte} Pkt.</span>
              <div>
                <div className="text-sm font-medium">{w.name}</div>
                <div className="text-xs text-text-muted">{w.beschreibung}</div>
              </div>
            </div>
          ))}
        </div>
        <p>
          Ein wöchentlicher „Backlook“-Lauf wertet abgeschlossene Trades aus und passt jedes Kriterium
          um maximal ±2 Punkte an – die Summe bleibt dabei immer bei 100.
        </p>
      </AccordionSection>

      <AccordionSection title="Fair Value Filter">
        <p>
          Bevor eine technische Analyse überhaupt stattfindet, prüft der Bot in einer{" "}
          <strong>zweistufigen Logik</strong>, ob ein Titel fundamental unterbewertet ist:
        </p>
        <ul className="space-y-1.5">
          <li>
            <strong>Stufe 1 – Gatekeeper (WAS kaufen?):</strong> Aus KGV, Cashflow und
            Dividendenrendite wird wöchentlich ein grober Fair Value je Ticker berechnet und
            zwischengespeichert. Liegt der aktuelle Kurs weniger als 10% unter diesem Fair
            Value, wird der Kandidat sofort mit KO-Grund „Fair Value“ verworfen – noch bevor
            teure Marktdaten geladen werden. Inverse ETFs haben kein KGV/Cashflow und sind
            vom Gatekeeper ausgenommen.
          </li>
          <li>
            <strong>Stufe 2 – Score-Bonus (WIE stark gewichten?):</strong> Besteht ein Titel
            Stufe 1, fließt der Rabatt zusätzlich als Bonus von bis zu +10 Punkten in den
            Signal-Score ein – je tiefer unterbewertet, desto höher der Bonus.
          </li>
        </ul>
        <p>
          Bei hohem Rabatt trotz schwacher Fundamentaldaten markiert der Bot ein „Value
          Trap“-Risiko (niedrig/mittel/hoch) im Log – das blockiert den Trade nicht, dient
          aber als zusätzlicher Hinweis.
        </p>
      </AccordionSection>

      <AccordionSection title="Einstiegszeitpunkte">
        <p>Statt einmal täglich zu scannen, prüft der Bot mehrere feste Zeitpunkte (Eastern Time):</p>
        <ul className="space-y-1.5">
          <li><strong className="font-figures">09:45 ET</strong> – nach Abklingen der ersten Opening-Volatilität.</li>
          <li><strong className="font-figures">10:30 ET</strong> – historisch der stärkste Zeitpunkt, entsprechend höher gewichtet.</li>
          <li><strong className="font-figures">12:00 ET</strong> – Mittagskonsolidierung, bewusst geringeres Budget.</li>
          <li><strong className="font-figures">14:00 ET</strong> – vor der letzten Handelsstunde.</li>
          <li><strong className="font-figures">15:00 ET</strong> – kurz vor Handelsschluss, vorsichtig dosiert.</li>
        </ul>
        <p>
          Wie viele Trades an einem Tag insgesamt möglich sind, wird dynamisch aus freiem Kapital und
          freien Positionslimits berechnet und auf die verbleibenden Zeitpunkte des Tages verteilt.
        </p>
      </AccordionSection>

      <AccordionSection title="Earnings-Filter">
        <p>
          Vor jedem Kauf prüft der Bot über den Earnings-Kalender, ob in den nächsten drei
          Handelstagen eine Quartalszahl ansteht. Ist das der Fall, wird der Kandidat mit
          KO-Grund „Earnings in X Tagen“ verworfen – Kursausschläge rund um Earnings sind
          erratisch und lassen sich nicht sinnvoll mit ATR-basierten Stops absichern.
        </p>
      </AccordionSection>

      <AccordionSection title="Korrelationsfilter">
        <p>
          Um Klumpenrisiko zu vermeiden, vergleicht der Bot einen Kandidaten mit allen
          bereits offenen Positionen. Ist die Kursbewegung zu stark korreliert (z.B. zwei
          Halbleiter-Titel oder zwei Bitcoin-Proxies gleichzeitig), wird der Kandidat mit
          KO-Grund „Korrelationsfilter“ verworfen – auch wenn Score und Fair Value für sich
          genommen passen würden.
        </p>
      </AccordionSection>

      <AccordionSection title="Stop Loss & Take Profit">
        <p>
          Statt fester Prozentwerte berechnet der Bot Stop Loss und Take Profit anhand der{" "}
          <strong>Average True Range (ATR)</strong> – der durchschnittlichen Tagesschwankung eines
          Titels über die letzten 14 Handelstage. Volatilere Aktien bekommen automatisch einen weiteren
          Abstand, ruhigere Aktien einen engeren.
        </p>
        <ul className="space-y-1.5">
          <li>Stop Loss = aktueller Kurs − (ATR × Multiplikator, Standard 1,5)</li>
          <li>Take Profit = aktueller Kurs + (ATR × Multiplikator, Standard 3,0 – Chance-Risiko 2:1)</li>
        </ul>
        <p>
          Als Sicherheitsnetz wird der Stop Loss immer auf 1–8% begrenzt. Ist die ATR ausnahmsweise
          nicht verfügbar, fällt der Bot auf feste Prozentwerte zurück.
        </p>
      </AccordionSection>

      <AccordionSection title="Trailing Stop">
        <p>
          Erreicht eine Position ihr Take-Profit-Ziel, verkauft der Bot nicht sofort, sondern aktiviert
          einen Trailing Stop: Der Stop Loss wird auf „Höchstkurs seit Kauf minus ATR × Multiplikator“
          gesetzt und bei jedem neuen Hoch automatisch nachgezogen – er kann nur steigen, nie fallen.
        </p>
        <p>
          Fällt der Kurs unter diesen nachgezogenen Stop, wird verkauft. Unabhängig davon wird jede
          Position spätestens nach einer maximalen Haltedauer (Standard 5 Handelstage) automatisch
          geschlossen.
        </p>
      </AccordionSection>

      <AccordionSection title="Markt-Regime Filter">
        <p>
          Der Bot bestimmt anhand des S&amp;P 500 (Kurs vs. SMA50/SMA200) ein aktuelles Marktregime:
          bullish, bearish oder neutral.
        </p>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-1.5">
            <TrendingUp size={16} strokeWidth={1.5} className="text-gain shrink-0" />
            <strong>Bullish</strong> – Kurs über SMA200, SMA50 über SMA200.
          </li>
          <li className="flex items-center gap-1.5">
            <TrendingDown size={16} strokeWidth={1.5} className="text-loss shrink-0" />
            <strong>Bearish</strong> – Kurs unter SMA200, SMA50 unter SMA200.
          </li>
          <li className="flex items-center gap-1.5">
            <Minus size={16} strokeWidth={1.5} className="text-text-muted shrink-0" />
            <strong>Neutral</strong> – alles dazwischen.
          </li>
        </ul>
        <p>
          In einem bärischen Regime bekommen klassische Long-Aktien −10 Punkte Score-Abzug, inverse
          ETFs +10 Punkte Bonus – der Bot verschiebt sein Verhalten also automatisch mit der Marktlage,
          statt stur in jede Richtung gleich zu handeln.
        </p>
      </AccordionSection>

      <AccordionSection title="Portfolio-Segmentierung">
        <p>
          Ein Teil der Watchlist gilt als besonders volatil (günstige Spekulationswerte,
          gehebelte ETFs, Bitcoin-Proxies). Der Bot begrenzt den Anteil dieser Titel am
          offenen Portfolio auf einen Zielwert (Standard 33%):
        </p>
        <ul className="space-y-1.5">
          <li>
            Liegt der volatile Anteil mehr als 15 Prozentpunkte über dem Ziel, wird ein
            weiterer volatiler Kandidat blockiert („Volatile Segment voll“).
          </li>
          <li>
            Liegt der Anteil unter dem Ziel, bekommt ein volatiler Kandidat +5 Punkte
            Score-Bonus, damit das Segment tatsächlich befüllt wird.
          </li>
        </ul>
        <p>
          So bleibt das offene Portfolio bewusst gemischt aus stabilen und spekulativeren
          Titeln, statt sich in eine Richtung zu verschieben.
        </p>
      </AccordionSection>

      <AccordionSection title="Morning Brief E-Mail">
        <p>
          Täglich um 08:30 ET – vor dem ersten Einstiegszeitpunkt (09:45 ET) – erstellt eine
          KI-Komponente ein kurzes Marktbriefing (max. 150 Wörter, Deutsch) auf Basis der
          aktuellen Marktdaten und verschickt es per E-Mail. Ist kein LLM-API-Key konfiguriert,
          verschickt der Bot stattdessen die reinen Marktdaten ohne KI-Kommentar
          (Degraded Mode) – der Zyklus läuft unabhängig davon normal weiter.
        </p>
      </AccordionSection>

      <AccordionSection title="Backlook-Lernzyklus">
        <p>
          Jeden Montag um 06:00 ET, vor dem ersten regulären Bot-Zyklus, wertet der Bot die
          in der letzten Woche abgeschlossenen Trades statistisch aus – ohne LLM, rein
          regelbasiert:
        </p>
        <ul className="space-y-1.5">
          <li>
            <strong>Score-Gewichtung:</strong> Kriterien, die bei Gewinnern hoch und bei
            Verlierern niedrig gescort haben, bekommen mehr Gewicht, andere entsprechend
            weniger. Maximal ±2 Punkte pro Kriterium und Lauf, jedes Kriterium bleibt
            zwischen 5 und 35 Punkten, die Summe bleibt exakt 100. Erst ab 5 abgeschlossenen
            Trades in der Woche wird überhaupt angepasst.
          </li>
          <li>
            <strong>Einstiegszeitpunkt-Optimierung:</strong> Zeitslots, die auffällig besser
            oder schlechter abschneiden als der Durchschnitt (ab 20% Abweichung, ab 5 Trades
            pro Slot), werden in ihrer Gewichtung angepasst.
          </li>
          <li>
            <strong>Slot-Cap-Evaluierung:</strong> Bei einer Trefferquote über 70% (ab 10
            Trades) wird das maximale Trade-Limit eines Slots erhöht, bei unter 40% deutlich
            reduziert oder deaktiviert.
          </li>
        </ul>
      </AccordionSection>

      <AccordionSection title="Risiken">
        <div className="bg-loss/10 border border-loss/30 rounded-card px-4 py-4 flex gap-3">
          <AlertTriangle className="text-loss shrink-0 mt-0.5" size={20} />
          <div className="space-y-1.5">
            <p className="font-medium text-loss">Wichtige Risikohinweise:</p>
            <ul className="space-y-1 text-text-primary">
              <li>Du kannst dein eingesetztes Kapital verlieren.</li>
              <li>Vergangene Performance ist kein Indikator für zukünftige Ergebnisse.</li>
              <li>Der Bot reagiert nicht auf unvorhergesehene Marktereignisse.</li>
              <li>Overnight-Gap-Risiko: Bei Börsenschluss können Kurse springen, bevor SL/TP greifen kann.</li>
              <li>Kein Ersatz für professionelle Anlageberatung.</li>
              <li>Die steuerliche Behandlung von Gewinnen liegt beim Nutzer.</li>
            </ul>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="FAQ">
        <div className="space-y-4">
          {FAQ.map((f) => (
            <div key={f.frage}>
              <div className="font-medium">{f.frage}</div>
              <div className="text-text-muted mt-0.5">{f.antwort}</div>
            </div>
          ))}
        </div>
      </AccordionSection>
    </div>
  );
}
