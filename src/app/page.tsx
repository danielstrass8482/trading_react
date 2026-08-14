"use client";

import { useState } from "react";
import Sidebar, { TabKey } from "@/components/Sidebar";
import MobileTopbar from "@/components/MobileTopbar";
import { QueryProvider } from "@/lib/QueryProvider";
import AlpacaOnboarding from "@/components/AlpacaOnboarding";

import Uebersicht from "@/components/tabs/Uebersicht";
import Performance from "@/components/tabs/Performance";
import ScanHistorie from "@/components/tabs/ScanHistorie";
import Bestaetigungen from "@/components/tabs/Bestaetigungen";
import Aktiv from "@/components/tabs/Aktiv";
import Einstellungen from "@/components/tabs/Einstellungen";
import Dokumentation from "@/components/tabs/Dokumentation";

const TABS: Record<TabKey, React.ComponentType> = {
  uebersicht: Uebersicht,
  performance: Performance,
  scanhistorie: ScanHistorie,
  bestaetigungen: Bestaetigungen,
  aktiv: Aktiv,
  einstellungen: Einstellungen,
  dokumentation: Dokumentation,
};

function App() {
  const [active, setActive] = useState<TabKey>("uebersicht");
  const ActiveTab = TABS[active];

  // FIX Scroll-Bug: vorher min-h-screen (Container wächst mit dem Inhalt über
  // den Viewport hinaus) statt fixer h-screen+overflow-hidden-Hülle – dadurch
  // scrollte die ganze Seite (inkl. Sidebar) statt nur des Hauptinhalts, weil
  // die sticky-Positionierung der Sidebar von einem unbegrenzt wachsenden
  // Containing Block abhing statt von einer echten, viewport-hohen Hülle.
  // Jetzt: äußere Hülle exakt 100vh + overflow-hidden (scrollt nie selbst),
  // NUR der Hauptinhalt-Bereich ist selbst h-screen+overflow-y-auto und
  // scrollt unabhängig – die Sidebar bleibt dadurch strukturell fixiert,
  // unabhängig von Inhaltslänge/Browser-Eigenheiten bei position:sticky.
  return (
    <div className="flex h-screen overflow-hidden">
      <AlpacaOnboarding />
      <MobileTopbar />
      <Sidebar active={active} onSelect={setActive} />
      <div className="flex-1 min-w-0 h-screen overflow-y-auto">
        <main className="pt-14 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-0 px-4 md:px-8 py-4 md:py-6 max-w-[1400px] w-full min-w-0">
          <ActiveTab />
        </main>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <QueryProvider>
      <App />
    </QueryProvider>
  );
}
