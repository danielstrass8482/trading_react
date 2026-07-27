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
  { frage: "Kann ich den Bot pausieren?", antwort: "Ja, per Broker-Drain-Mode im Einstellungen-Tab. Bestehende Positionen laufen mit SL/TP/Trailing Stop regulär weiter, bis sie geschlossen werden." },
  { frage: "Was passiert bei Erreichen des täglichen Verlustlimits?", antwort: "Der Bot pausiert automatisch und handelt erst nach manueller Freigabe wieder." },
  { frage: "Kann ich die Einstellungen ändern?", antwort: "Ja, im Tab „Einstellungen“ – Änderungen wirken ab dem nächsten Bot-Zyklus, ohne Neustart." },
  { frage: "Handelt der Bot auch, wenn der Markt fällt?", antwort: "Der Bot erkennt das Marktregime (bullish/bearish/neutral) und bevorzugt in einem bärischen Umfeld inverse ETFs gegenüber klassischen Long-Aktien." },
  { frage: "Trifft der Bot eigenständig Lernentscheidungen?", antwort: "Nein. Der wöchentliche Lernzyklus schlägt Anpassungen nur vor – jeder Vorschlag muss im Einstellungen-Tab manuell übernommen oder abgelehnt werden." },
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
        <p>Der Bot arbeitet mit einer zweistufigen Analyse:</p>
        <ul className="space-y-1.5">
          <li>
            <strong>Stufe 1 – Fair Value Filter (wöchentlich, montags):</strong> Die gesamte
            Watchlist (rund 390 Ticker) wird auf fundamentale Bewertung geprüft. Der Fair Value
            je Ticker wird über KGV, KCV und Dividendenrendite berechnet – mit sektorspezifischen
            Multiples (Tech wird anders bewertet als Utilities). Nur Titel mit mindestens 10%
            Rabatt zum Fair Value kommen in die engere Auswahl; das verhindert den Kauf bereits
            überbewerteter Titel, bevor überhaupt eine technische Analyse stattfindet.
          </li>
          <li>
            <strong>Stufe 2 – Technischer Score (täglich, parallel):</strong> Die verbleibenden
            Titel werden gleichzeitig analysiert (15 parallele Worker). Acht Faktoren fließen ein:
            RSI, SMA-Trend, Volumen, KGV, Verschuldungsgrad und Umsatzwachstum ergeben zusammen
            einen gewichteten Basis-Score (0–100 Punkte); Markt-Regime und Korrelationsfilter
            passen diesen Score zusätzlich modifizierend an bzw. blocken einen Kandidaten komplett.
            Nur ein Score ≥ 65/100 kommt in die engere Auswahl.
          </li>
        </ul>
        <p>
          Eine KI-Komponente (Claude) kommentiert jeden ausgeführten Trade nachträglich mit einer
          kurzen Einschätzung und zwei qualitativen Risiken – trifft aber keine Kauf- oder
          Verkaufsentscheidung. Die Entscheidung liegt ausschließlich bei der regelbasierten Rule-Engine.
        </p>
      </AccordionSection>

      <AccordionSection title="Signal-Score im Detail">
        <p>Der technische Basis-Score setzt sich aus sechs gewichteten Kriterien zusammen und ergibt in Summe maximal 100 Punkte:</p>
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
          Der wöchentliche Lernzyklus wertet abgeschlossene Trades aus und passt jedes Kriterium
          um maximal ±2 Punkte an – die Summe bleibt dabei immer bei 100.
        </p>
      </AccordionSection>

      <AccordionSection title="Einstiegszeitpunkte">
        <p>5 feste Zeitpunkte pro Handelstag (Eastern Time):</p>
        <ul className="space-y-1.5">
          <li><strong className="font-figures">09:45 ET</strong> – max. 1 Trade, um die erste Opening-Volatilität zu vermeiden.</li>
          <li><strong className="font-figures">10:30 ET</strong> – max. 1 Trade, konservativ.</li>
          <li><strong className="font-figures">12:00 ET</strong> – Restbudget dynamisch verteilt.</li>
          <li><strong className="font-figures">14:00 ET</strong> – Restbudget dynamisch verteilt.</li>
          <li><strong className="font-figures">15:00 ET</strong> – Restbudget dynamisch verteilt.</li>
        </ul>
        <p>
          Wie viele Trades an einem Tag insgesamt möglich sind, wird dynamisch aus freiem Kapital
          und freien Positionslimits berechnet und auf die verbleibenden Zeitpunkte des Tages
          verteilt. Der Bot lernt wöchentlich, welche Slots am besten performen, und passt deren
          Gewichtung entsprechend an. Von Guardrails geblockte Kandidaten verbrauchen dabei keinen
          Slot – nur tatsächlich ausgeführte Trades zählen gegen das Tageslimit.
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

      <AccordionSection title="Stop Loss & Take Profit">
        <p>
          Nicht starr, sondern dynamisch: Statt fester Prozentwerte berechnet der Bot Stop Loss
          und Take Profit anhand der <strong>Average True Range (ATR)</strong> – der
          durchschnittlichen Tagesschwankung eines Titels über die letzten 14 Handelstage.
        </p>
        <ul className="space-y-1.5">
          <li>Stop Loss = ATR × 1,5 (begrenzt auf min. 1%, max. 8%)</li>
          <li>Take Profit = ATR × 3,0 (Chance-Risiko-Verhältnis 2:1)</li>
        </ul>
        <p>
          Ruhige Aktien bekommen dadurch automatisch einen engeren Stop (kapitalschonend), volatile
          Aktien einen weiteren Stop (kein vorzeitiges Rauswerfen durch normales Rauschen). Ist die
          ATR ausnahmsweise nicht verfügbar, fällt der Bot auf feste Prozentwerte zurück.
        </p>
      </AccordionSection>

      <AccordionSection title="Trailing Stop">
        <p>
          Nach dem ersten erreichten Take Profit verkauft der Bot nicht sofort fest, sondern
          aktiviert einen Trailing Stop Loss: Er wird auf „Höchstkurs seit Kauf minus ATR ×
          Multiplikator“ gesetzt und bei jedem neuen Hoch automatisch nachgezogen – er kann nur
          steigen, nie fallen. So darf ein Gewinner weiterlaufen, während die bereits erzielten
          Gewinne zunehmend abgesichert werden.
        </p>
        <p>Fällt der Kurs unter diesen nachgezogenen Stop, wird die Position verkauft.</p>
      </AccordionSection>

      <AccordionSection title="Time-Based Exit">
        <p>
          Unabhängig von SL/TP/Trailing wird jede Position spätestens nach 5 Handelstagen
          automatisch geschlossen (konfigurierbar, 3–7 Tage). Das verhindert totes Kapital in
          Positionen, die seitwärts laufen, ohne SL oder TP zu erreichen.
        </p>
      </AccordionSection>

      <AccordionSection title="Markt-Regime Filter">
        <p>
          Täglich vergleicht der Bot den S&amp;P 500 mit seinem SMA50/SMA200 und bestimmt daraus
          ein aktuelles Marktregime:
        </p>
        <ul className="space-y-1.5">
          <li className="flex items-center gap-1.5">
            <TrendingUp size={16} strokeWidth={1.5} className="text-gain shrink-0" />
            <strong>Bullish</strong> – normale Long-Strategie.
          </li>
          <li className="flex items-center gap-1.5">
            <TrendingDown size={16} strokeWidth={1.5} className="text-loss shrink-0" />
            <strong>Bearish</strong> – Score-Abzug für Long-Aktien, Bonus für inverse ETFs.
          </li>
          <li className="flex items-center gap-1.5">
            <Minus size={16} strokeWidth={1.5} className="text-text-muted shrink-0" />
            <strong>Neutral</strong> – ausgewogen, keine Anpassung.
          </li>
        </ul>
        <p>
          In einem bärischen Regime bekommen klassische Long-Aktien −10 Punkte Score-Abzug, inverse
          ETFs +10 Punkte Bonus – der Bot verschiebt sein Verhalten also automatisch mit der
          Marktlage, statt stur in jede Richtung gleich zu handeln.
        </p>
      </AccordionSection>

      <AccordionSection title="Korrelationsfilter">
        <p>
          Der Bot lässt keine zwei Positionen mit mehr als 0,8 Korrelation gleichzeitig offen. Ist
          die 3-Monats-Kursbewegung eines Kandidaten zu stark mit einer bereits offenen Position
          korreliert (z.B. zwei Halbleiter-Titel oder zwei Bitcoin-Proxies gleichzeitig), wird der
          Kandidat mit KO-Grund „Korrelationsfilter“ verworfen – auch wenn Score und Fair Value für
          sich genommen passen würden. Das verhindert Klumpenrisiko im Portfolio.
        </p>
      </AccordionSection>

      <AccordionSection title="Portfolio-Segmentierung">
        <p>
          Das Portfolio wird bewusst gemischt gehalten: 67% stabile Large Caps (S&amp;P-500-Titel)
          und 33% volatile Wachstumstitel (günstige Spekulationswerte, gehebelte ETFs,
          Bitcoin-Proxies).
        </p>
        <ul className="space-y-1.5">
          <li>
            Liegt der volatile Anteil mehr als 15 Prozentpunkte über dem Ziel, wird ein
            weiterer volatiler Kandidat blockiert („Volatile Segment voll“).
          </li>
          <li>
            Liegt der Anteil unter dem Ziel, bekommt ein volatiler Kandidat +5 Punkte
            Score-Bonus, damit das Segment automatisch wieder aufgefüllt wird.
          </li>
        </ul>
        <p>
          So bleibt das offene Portfolio automatisch balanciert, statt sich einseitig in eine
          Richtung zu verschieben.
        </p>
      </AccordionSection>

      <AccordionSection title="Earnings-Filter">
        <p>
          Vor jedem Kauf prüft der Bot über den Earnings-Kalender, ob in den nächsten drei
          Handelstagen eine Quartalszahl ansteht. Ist das der Fall, wird der Kandidat mit
          KO-Grund „Earnings in X Tagen“ verworfen – Kursausschläge rund um Earnings sind
          erratisch (Gap-Risiko) und lassen sich nicht sinnvoll mit ATR-basierten Stops
          absichern. Die Daten kommen über die yfinance Calendar API.
        </p>
      </AccordionSection>

      <AccordionSection title="Morning Brief">
        <p>
          Täglich um 08:30 ET – vor dem ersten Einstiegszeitpunkt (09:45 ET) – erstellt eine
          KI-Komponente ein kurzes Marktbriefing (Deutsch) auf Basis von VIX, S&amp;P 500,
          Nasdaq und Markt-Regime und verschickt es per E-Mail: worauf heute zu achten ist. Ist
          kein LLM-API-Key konfiguriert, verschickt der Bot stattdessen die reinen Marktdaten
          ohne KI-Kommentar (Degraded Mode) – der Zyklus läuft unabhängig davon normal weiter.
        </p>
      </AccordionSection>

      <AccordionSection title="Wöchentlicher Lernzyklus (montags)">
        <p>
          Jeden Montag, vor dem ersten regulären Bot-Zyklus, wertet der Bot die
          abgeschlossenen Trades der letzten Wochen statistisch aus – ohne LLM, rein
          regelbasiert. Er analysiert dabei fünf Fragen:
        </p>
        <ul className="space-y-1.5">
          <li><strong>Welche Zeitslots performen am besten?</strong> Slot-Gewichtung wird entsprechend angepasst.</li>
          <li><strong>Welcher Score-Schwellwert war optimal?</strong> Mehrere Schwellwerte (55–75) werden gegen die tatsächliche Performance abgeschlossener Trades getestet.</li>
          <li><strong>Welche Ticker performen konstant schlecht?</strong> Titel mit negativem Ø-P&amp;L und niedriger Trefferquote über die letzten 90 Tage werden zur Entfernung aus der Watchlist vorgeschlagen.</li>
          <li><strong>Sektor-Rotation:</strong> Welche Branchen liefen zuletzt besser oder schlechter?</li>
          <li><strong>Saisonalität:</strong> Welche Wochentage performen konstant besser oder schlechter?</li>
        </ul>
        <p>
          Der Bot setzt nichts davon eigenständig um – jeder Lernvorschlag erscheint im
          Einstellungen-Tab unter „KI-Lernvorschläge“ und muss dort manuell bestätigt oder
          abgelehnt werden.
        </p>
      </AccordionSection>

      <AccordionSection title="Unterstützte Broker">
        <ul className="space-y-1.5">
          <li><strong>Alpaca Markets</strong> – US-Aktien, Fractional Shares. Aktiv, Standard-Broker.</li>
          <li><strong>Saxo Bank</strong> – weltweit (US, EU, Asien). Demnächst verfügbar.</li>
        </ul>
      </AccordionSection>

      <AccordionSection title="Risiken">
        <div className="bg-loss/10 border border-loss/30 rounded-card px-4 py-4 flex gap-3">
          <AlertTriangle className="text-loss shrink-0 mt-0.5" size={20} />
          <div className="space-y-1.5">
            <p className="font-medium text-loss">Der Bot ist kein Finanzberater.</p>
            <ul className="space-y-1 text-text-primary">
              <li>Du kannst dein Kapital vollständig verlieren.</li>
              <li>Vergangene Performance garantiert keine zukünftigen Ergebnisse.</li>
              <li>Overnight-Gap-Risiko besteht: Bei Börsenschluss können Kurse springen, bevor SL/TP greifen kann.</li>
              <li>Der Bot reagiert nicht auf unvorhergesehene Marktereignisse.</li>
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
