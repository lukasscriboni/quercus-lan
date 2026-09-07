"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext } from "react";
import { BarChart3, Boxes, ChefHat, ChevronRight, ClipboardList, Grid2X2, LayoutDashboard, LogOut, PackageSearch, ShieldCheck, ShoppingCart, WalletCards } from "lucide-react";
import { Brand } from "@/components/brand";
import { ConnectionStatus } from "@/components/connection-status";

export type ShellUser = { displayName: string; username: string; role: string; permissions: string[] };

const AppUserContext = createContext<ShellUser | null>(null);

export function useAppUser() {
  const user = useContext(AppUserContext);
  if (!user) throw new Error("AppShell no está disponible");
  return user;
}

const operationItems = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/floor", label: "Salón", icon: Grid2X2, permission: "floor.view" },
  { href: "/direct-sales", label: "Ventas directas", icon: ShoppingCart, permission: "cash.view" },
  { href: "/products", label: "Productos", icon: PackageSearch, permission: "products.view" },
  { href: "/stock", label: "Stock", icon: Boxes, permission: "stock.view" },
  { href: "/cash", label: "Caja", icon: WalletCards, permission: "cash.view" },
  { href: "/reports", label: "Reportes", icon: BarChart3, permission: "reports.view" },
];

const administrationItems = [
  { href: "/roles", label: "Roles y permisos", icon: ShieldCheck, permission: "users.manage" },
];

const nextItems = [
  { label: "Cocina", icon: ChefHat },
  { label: "Compras", icon: ClipboardList },
];

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const operationNav = operationItems.filter((item) => user.permissions.includes(item.permission));
  const administrationNav = administrationItems.filter((item) => user.permissions.includes(item.permission));
  const nav = [...operationNav, ...administrationNav];
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <AppUserContext.Provider value={user}>
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-[#121a17]/95 p-4 backdrop-blur md:flex">
        <div className="px-2 py-2"><Brand /></div>
        <nav aria-label="Principal" className="mt-8 space-y-1">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#56645e]">Operación</p>
          {operationNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link key={item.href} href={item.href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${active ? "bg-amber/12 text-amber" : "text-[#9aa8a1] hover:bg-panel hover:text-cream"}`}><item.icon className="h-[18px] w-[18px]" />{item.label}{active && <ChevronRight className="ml-auto h-4 w-4" />}</Link>;
          })}
          {administrationNav.length > 0 && <><p className="mb-3 mt-7 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#56645e]">Administración</p>{administrationNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link key={item.href} href={item.href} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${active ? "bg-amber/12 text-amber" : "text-[#9aa8a1] hover:bg-panel hover:text-cream"}`}><item.icon className="h-[18px] w-[18px]" />{item.label}{active && <ChevronRight className="ml-auto h-4 w-4" />}</Link>;
          })}</>}
          <p className="mb-3 mt-7 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#56645e]">Próxima fase</p>
          {nextItems.map((item) => <div key={item.label} className="flex min-h-10 items-center gap-3 px-3 text-sm text-[#52605a]"><item.icon className="h-[17px] w-[17px]" />{item.label}</div>)}
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <div className="mb-4 px-2"><ConnectionStatus /></div>
          <div className="flex items-center gap-3 rounded-xl bg-panel p-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-mint/10 text-sm font-black text-mint">{user.displayName.slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0"><p className="truncate text-sm font-bold">{user.displayName}</p><p className="truncate text-[11px] text-[#728079]">{user.role}</p></div>
            <button onClick={logout} title="Cerrar sesión" className="ml-auto rounded-lg p-2 text-[#718078] transition hover:bg-ink hover:text-danger"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-[#101715]/90 px-4 backdrop-blur md:hidden">
        <Brand compact /><ConnectionStatus />
        <button onClick={logout} aria-label="Cerrar sesión" className="rounded-xl border border-line p-2.5 text-[#96a39d]"><LogOut className="h-4 w-4" /></button>
      </header>
      <div className="mobile-scroll flex gap-2 overflow-x-auto border-b border-line px-4 py-2 md:hidden">
        {nav.map((item) => <Link key={item.href} href={item.href} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${pathname.startsWith(item.href) ? "bg-amber text-ink" : "bg-panel text-[#9aa8a1]"}`}><item.icon className="h-4 w-4" />{item.label}</Link>)}
      </div>
      <main className="px-4 py-6 md:ml-[248px] md:px-8 md:py-8 xl:px-12">{children}</main>
    </div>
    </AppUserContext.Provider>
  );
}
