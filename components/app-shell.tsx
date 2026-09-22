"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect } from "react";
import { BarChart3, ChefHat, ChevronRight, ClipboardList, ContactRound, Grid2X2, LayoutDashboard, LogOut, PackageSearch, ShieldCheck, ShoppingCart, WalletCards, Wine } from "lucide-react";
import { Brand } from "@/components/brand";
import { ConnectionStatus } from "@/components/connection-status";
import { changeProductSearchMode } from "@/components/product-search-mode";

export type ShellUser = { displayName: string; username: string; role: string; permissions: string[] };

const AppUserContext = createContext<ShellUser | null>(null);

export function useAppUser() {
  const user = useContext(AppUserContext);
  if (!user) throw new Error("AppShell no está disponible");
  return user;
}

const operationItems = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard, permission: "dashboard.view", shortcut: "F1" },
  { href: "/floor", label: "Salón", icon: Grid2X2, permission: "floor.view", shortcut: "F2" },
  { href: "/kitchen", label: "Cocina", icon: ChefHat, permission: "kitchen.view", shortcut: "F3" },
  { href: "/bar", label: "Barra", icon: Wine, permission: "kitchen.view", shortcut: "F4" },
  { href: "/direct-sales", label: "Ventas directas", icon: ShoppingCart, permission: "cash.view", shortcut: "F5" },
  { href: "/products", label: "Productos", icon: PackageSearch, permission: "products.view", shortcut: "F6" },
  { href: "/purchases", label: "Compras", icon: ClipboardList, permission: "stock.view", shortcut: "F7" },
  { href: "/cash", label: "Caja", icon: WalletCards, permission: "cash.view", shortcut: "F8" },
  { href: "/current-accounts", label: "Cuentas corrientes", icon: ContactRound, permission: "orders.view", shortcut: null },
  { href: "/reports", label: "Reportes", icon: BarChart3, permission: "reports.view", shortcut: "F9" },
];

const administrationItems = [
  { href: "/roles", label: "Roles y permisos", icon: ShieldCheck, permission: "users.manage", shortcut: "F10" },
];

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const operationNav = operationItems.filter((item) => user.permissions.includes(item.permission));
  const administrationNav = administrationItems.filter((item) => user.permissions.includes(item.permission));
  const nav = [...operationNav, ...administrationNav];
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const search = [...document.querySelectorAll<HTMLInputElement>('input[type="search"], input[placeholder*="Código de barras"], input[placeholder*="código de barras"], input[placeholder*="Nombre del producto"], input[placeholder*="nombre del producto"]')]
        .find((input) => !input.disabled && input.getClientRects().length > 0);
      search?.focus();
      search?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "F11") {
        const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="search"], input[placeholder*="Nombre"], input[placeholder*="Buscar"], input[placeholder*="Buscá"]')];
        const search = inputs.find((input) => !input.disabled && input.getClientRects().length > 0);
        if (!search) return;
        event.preventDefault();
        changeProductSearchMode();
        search.focus();
        search.select();
        return;
      }
      const item = nav.find((candidate) => candidate.shortcut === event.key);
      if (!item) return;
      event.preventDefault();
      router.push(item.href);
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [nav, router]);
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <AppUserContext.Provider value={user}>
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-[#101010]/95 p-4 backdrop-blur md:flex">
        <div className="px-2 py-2"><Brand /></div>
        <nav aria-label="Principal" className="mt-8 space-y-1">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#777777]">Operación</p>
          {operationNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link key={item.href} href={item.href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${active ? "border border-[#535353] bg-[#2a2a2a] text-[#eeeeee]" : "border border-transparent text-[#a3a3a3] hover:bg-panel hover:text-cream"}`}><item.icon className="h-[18px] w-[18px]" />{item.label}{active && <ChevronRight className="ml-auto h-4 w-4" />}</Link>;
          })}
          {administrationNav.length > 0 && <><p className="mb-3 mt-7 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#777777]">Administración</p>{administrationNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link key={item.href} href={item.href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${active ? "border border-[#535353] bg-[#2a2a2a] text-[#eeeeee]" : "border border-transparent text-[#a3a3a3] hover:bg-panel hover:text-cream"}`}><item.icon className="h-[18px] w-[18px]" />{item.label}{active && <ChevronRight className="ml-auto h-4 w-4" />}</Link>;
          })}</>}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <div className="mb-4 px-2"><ConnectionStatus /></div>
          <div className="flex items-center gap-3 rounded-xl bg-panel p-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-[#2b2b2b] text-sm font-black text-[#d1d1d1]">{user.displayName.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0"><p className="truncate text-sm font-bold">{user.displayName}</p><p className="truncate text-[11px] text-[#7c7c7c]">{user.role}</p></div>
            <button onClick={logout} title="Cerrar sesión" className="ml-auto rounded-lg p-2 text-[#7b7b7b] transition hover:bg-ink hover:text-danger"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-[#101010]/90 px-4 backdrop-blur md:hidden">
        <Brand compact /><ConnectionStatus />
        <button onClick={logout} aria-label="Cerrar sesión" className="rounded-xl border border-line p-2.5 text-[#9f9f9f]"><LogOut className="h-4 w-4" /></button>
      </header>
      <div className="mobile-scroll flex gap-2 overflow-x-auto border-b border-line px-4 py-2 md:hidden">
        {nav.map((item) => <Link key={item.href} href={item.href} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${pathname.startsWith(item.href) ? "bg-amber text-ink" : "bg-panel text-[#a4a4a4]"}`}><item.icon className="h-4 w-4" />{item.label}</Link>)}
      </div>
      <main className="px-4 py-4 md:ml-[248px] md:px-7 md:py-5 xl:px-9">{children}</main>
    </div>
    </AppUserContext.Provider>
  );
}
