"use client";

import { useState } from "react";
import Sidebar, { TabKey } from "@/components/Sidebar";
import MobileTopbar from "@/components/MobileTopbar";
import { QueryProvider } from "@/lib/QueryProvider";
import AlpacaOnboarding from "@/components/AlpacaOnboarding";

import Uebersicht from "@/components/tabs/Uebersicht";
import Performance from "@/components/tabs/Performance";
import ScanHistorie from "@/components/tabs/ScanHistorie";
import Einstellungen from "@/components/tabs/Einstellungen";
import Dokumentation from "@/components/tabs/Dokumentation";

const TABS: Record<TabKey, React.ComponentType> = {
  uebersicht: Uebersicht,
  performance: Performance,
  scanhistorie: ScanHistorie,
  einstellungen: Einstellungen,
  dokumentation: Dokumentation,
};

function App() {
  const [active, setActive] = useState<TabKey>("uebersicht");
  const ActiveTab = TABS[active];

  return (
    <div className="flex min-h-screen">
      <AlpacaOnboarding />
      <MobileTopbar />
      <Sidebar active={active} onSelect={setActive} />
      <div className="flex-1 min-w-0">
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
