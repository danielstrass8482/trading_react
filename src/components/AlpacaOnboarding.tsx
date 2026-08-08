"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, AlpacaStatus } from "@/lib/api";
import AlpacaConnectDialog from "./AlpacaConnectDialog";

// Auto-Popup beim Login, solange kein eigener Alpaca-Account verbunden ist
// (einmal pro Session per "Später einrichten" wegklickbar). Für den erneuten
// Einstieg danach siehe die "Account verbinden"/"Verbindung aktualisieren"-
// Karte in Einstellungen.tsx (BrokerConfigSection) — nutzt denselben Dialog
// (AlpacaConnectDialog, context="manage") und dieselbe ["alpaca-status"]-Query.
export default function AlpacaOnboarding() {
  const [dismissed, setDismissed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["alpaca-status"],
    queryFn: () => api.get<AlpacaStatus>("/api/user/alpaca-status").then((r) => r.data),
  });

  if (isLoading || dismissed || !data || data.connected) return null;

  return <AlpacaConnectDialog onClose={() => setDismissed(true)} />;
}
