"use client";

import { useState } from "react";
import Sidebar, { TabKey } from "@/components/Sidebar";
import { QueryProvider } from "@/lib/QueryProvider";

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
      <Sidebar active={active} onSelect={setActive} />
      <div className="flex-1">
        <main className="px-8 py-6 max-w-[1400px] w-full">
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
