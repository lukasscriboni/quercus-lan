import type { Metadata } from "next";
import { CanonicalLocalHost } from "@/components/canonical-local-host";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Quercus · Gestión local", template: "%s · Quercus" },
  description: "Gestión gastronómica para red local: productos, stock, salón, pedidos y caja.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body><CanonicalLocalHost />{children}</body></html>;
}
