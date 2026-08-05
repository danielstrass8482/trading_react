import LoginForm from "./LoginForm";

// Login-Seite bewusst nicht statisch prerendert: ohne dynamic="force-dynamic"
// liefert Next.js hier "Cache-Control: s-maxage=31536000" (1 Jahr) aus, weil die
// Seite keine dynamischen Server-APIs nutzt und daher als vollstatisch gilt -
// UI-Änderungen nach einem Deploy wären dadurch am Edge/CDN bis zu 1 Jahr lang
// verdeckt geblieben. Dieser Export wird nur in einer Server-Component-page.tsx
// zuverlässig ausgewertet (in einer "use client"-page.tsx wurde er in dieser
// Next.js/Turbopack-Version nachweislich ignoriert), daher der Split in ein
// dünnes Server-Component-page.tsx + LoginForm.tsx ("use client").
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm />;
}
