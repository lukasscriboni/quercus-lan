"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, ClipboardCheck, Eye, EyeOff, Grid2X2, PackageCheck, ReceiptText, RefreshCw } from "lucide-react";
import { BrandMark } from "@/components/brand";

type Dashboard = { salesToday: string; ordersToday: number; averageTicket: string; tablesOccupied: number; activeProducts: number; criticalStock: number };
type Metric = { label: string; value: string | number; icon: typeof ArrowUpRight; accent: string; note: string; hideable?: boolean; visibilityControl?: boolean };
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [amountsHidden, setAmountsHidden] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setData(await response.json()); setError("");
    } catch { setError("No pudimos actualizar el resumen"); }
  }, []);
  useEffect(() => {
    load();
    const refresh = (event: Event) => {
      const type = (event as CustomEvent).detail?.type as string | undefined;
      if (type?.startsWith("stock.") || type?.startsWith("products.") || type?.startsWith("orders.")) load();
    };
    window.addEventListener("quercus:update", refresh);
    return () => window.removeEventListener("quercus:update", refresh);
  }, [load]);

  const metrics: Metric[] = [
    { label: "Ventas de hoy", value: data ? money.format(Number(data.salesToday)) : "—", icon: ArrowUpRight, accent: "text-amber", note: "Cierres confirmados", hideable: true, visibilityControl: true },
    { label: "Pedidos", value: data?.ordersToday ?? "—", icon: ReceiptText, accent: "text-mint", note: "Pagados hoy" },
    { label: "Ticket promedio", value: data ? money.format(Number(data.averageTicket)) : "—", icon: ClipboardCheck, accent: "text-[#b5b5b5]", note: "Por pedido", hideable: true },
    { label: "Mesas ocupadas", value: data?.tablesOccupied ?? "—", icon: Grid2X2, accent: "text-[#9d9d9d]", note: "En este momento" },
  ];
  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4"><BrandMark size="large" /><div><p className="eyebrow mb-2">Sucursal principal</p><h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Pulso del local</h1><p className="mt-2 text-sm text-[#a1a1a1]">Información compartida por todas las terminales de la red.</p></div></div>
        <button onClick={load} className="button-secondary"><RefreshCw className="h-4 w-4" />Actualizar</button>
      </div>
      {error && <div className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-[#ffb4a5]">{error}</div>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => { const amountHidden = Boolean(metric.hideable && amountsHidden); return <article key={metric.label} className="surface relative overflow-hidden p-5"><div className="mb-6 flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[#a4a4a4]">{metric.label}</p><div className="flex items-center gap-2">{metric.visibilityControl && <button type="button" title={amountsHidden ? "Mostrar importes" : "Ocultar importes"} aria-label={amountsHidden ? "Mostrar importes" : "Ocultar importes"} onClick={() => setAmountsHidden((current) => !current)} className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-ink text-[#8c8c8c] transition hover:border-[#4e4e4e] hover:text-cream">{amountsHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}<metric.icon className={`h-5 w-5 ${metric.accent}`} /></div></div><p className={`text-3xl font-black tracking-[-.035em] ${amountHidden ? "select-none tracking-[.08em] text-[#858585]" : ""}`}>{amountHidden ? "$ ••••••" : metric.value}</p><p className="mt-2 text-xs text-[#717171]">{metric.note}</p></article>; })}
      </section>
      <section className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <article className="surface p-5 sm:p-6">
          <div className="mb-6 flex items-start justify-between"><div><p className="eyebrow mb-2">Base operativa</p><h2 className="text-xl font-black">Catálogo e inventario</h2></div><PackageCheck className="h-5 w-5 text-mint" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="surface-soft p-4"><p className="text-xs font-semibold text-[#939393]">Productos activos</p><p className="mt-2 text-3xl font-black">{data?.activeProducts ?? "—"}</p><p className="mt-2 text-xs text-[#6f6f6f]">Listos para operar</p></div>
            <div className={`rounded-xl border p-4 ${(data?.criticalStock ?? 0) > 0 ? "border-danger/30 bg-danger/5" : "border-line bg-panel-soft"}`}><p className="flex items-center gap-2 text-xs font-semibold text-[#939393]"><AlertTriangle className={`h-4 w-4 ${(data?.criticalStock ?? 0) > 0 ? "text-danger" : "text-mint"}`} />Stock crítico</p><p className="mt-2 text-3xl font-black">{data?.criticalStock ?? "—"}</p><p className="mt-2 text-xs text-[#6f6f6f]">En mínimo o por debajo</p></div>
          </div>
        </article>
        <article className="surface p-5 sm:p-6">
          <p className="eyebrow mb-2">Estado</p><h2 className="text-xl font-black">Sistema local</h2>
          <div className="mt-6 space-y-4 text-sm"><div className="flex items-center justify-between border-b border-line pb-3"><span className="text-[#969696]">Aplicación</span><span className="pill border-mint/20 bg-mint/10 text-mint">Activa</span></div><div className="flex items-center justify-between border-b border-line pb-3"><span className="text-[#969696]">Datos</span><span className="font-semibold">PostgreSQL local</span></div><div className="flex items-center justify-between"><span className="text-[#969696]">Internet</span><span className="font-semibold text-mint">No requerido</span></div></div>
        </article>
      </section>
    </div>
  );
}
