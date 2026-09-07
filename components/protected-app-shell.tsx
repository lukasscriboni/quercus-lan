"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell, type ShellUser } from "@/components/app-shell";

const sectionRoutes = ["/dashboard", "/floor", "/direct-sales", "/products", "/stock", "/cash", "/reports", "/roles"];

export function ProtectedAppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<ShellUser | null>(null);
  const [error, setError] = useState("");

  const loadUser = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.user) throw new Error(payload.error ?? "No se pudo validar la sesión");
      setUser(payload.user);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo validar la sesión");
    }
  }, [router]);

  useEffect(() => { void loadUser(); }, [loadUser]);
  useEffect(() => {
    if (!user) return;
    for (const route of sectionRoutes) router.prefetch(route);
  }, [router, user]);
  useEffect(() => {
    const refreshUser = (event: Event) => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (type === "roles.changed") void loadUser();
    };
    window.addEventListener("quercus:update", refreshUser);
    return () => window.removeEventListener("quercus:update", refreshUser);
  }, [loadUser]);

  if (!user) {
    return <div className="grid min-h-screen place-items-center bg-[#101715] p-5"><div className="text-center">{error ? <><p className="text-sm font-bold text-danger">{error}</p><button type="button" onClick={() => void loadUser()} className="button-secondary mt-4"><RefreshCw className="h-4 w-4" />Reintentar</button></> : <><LoaderCircle className="mx-auto h-8 w-8 animate-spin text-amber" /><p className="mt-3 text-sm font-semibold text-[#829089]">Preparando la aplicación…</p></>}</div></div>;
  }

  return <AppShell user={user}>{children}</AppShell>;
}
