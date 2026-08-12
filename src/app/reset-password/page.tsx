import { Suspense } from "react";
import ResetPasswordForm from "./ResetPasswordForm";

// Gleicher Cache-Control-Fix wie bei /login (siehe dortige Begründung):
// ohne dynamic="force-dynamic" liefert Next.js hier "Cache-Control:
// s-maxage=31536000" (1 Jahr) aus - für eine tokenbasierte Seite (?token=...)
// besonders kritisch, da ein am Edge/CDN gecachtes Ergebnis sonst quer über
// verschiedene Tokens hinweg ausgeliefert werden könnte. Nur in einer
// Server-Component-page.tsx zuverlässig wirksam, daher der Split in ein
// dünnes Server-Component-page.tsx + ResetPasswordForm.tsx ("use client").
export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
