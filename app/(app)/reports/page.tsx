"use client";

import { Banknote, BarChart3, CalendarDays, ChevronRight, CreditCard, LoaderCircle, ReceiptText, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type RangeMode = "DAY" | "WEEK" | "MONTH" | "CUSTOM";
type ReportRow = {
  id: string;
  periodStart: string;
  periodEnd: string;
  cashTotal: string;
  virtualTotal: string;
  grandTotal: string;
  expectedCash: string | null;
  declaredCash: string | null;
  declaredVirtual: string | null;
  cashDifference: string | null;
  virtualDifference: string | null;
  totalDifference: string | null;
  saleCount: number;
  createdAt: string;
  branch: { id: string; name: string };
  createdBy: { id: string; displayName: string };
  shift: { id: string; register: { id: string; name: string } };
};
type ReportList = { from: string; to: string; totals: { cash: string; virtual: string; grand: string; sales: number }; reports: ReportRow[] };
type ReportSale = { paymentId: string; orderNumber: number; source: string; paymentMethod: string; category: "CASH" | "VIRTUAL"; amount: string; paidAt: string };
type ReportDetail = ReportRow & {
  sales: ReportSale[];
  shift: ReportRow["shift"] & { openingAmount: string; closingAmount: string | null; expectedAmount: string | null; difference: string | null; virtualClosingAmount: string | null; virtualExpectedAmount: string | null; virtualDifference: string | null; totalDifference: string | null; openedBy: { displayName: string }; closedBy: { displayName: string } | null };
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });
const dayLabel = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function balanceLabel(value: number) {
  if (Math.abs(value) < 0.005) return "Sin diferencia";
  return `${value < 0 ? "Faltante" : "Excedente"} ${money.format(Math.abs(value))}`;
}

function balanceClass(value: number) {
  if (Math.abs(value) < 0.005) return "text-mint";
  return value < 0 ? "text-danger" : "text-amber";
}

function inputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeFor(mode: Exclude<RangeMode, "CUSTOM">) {
  const now = new Date();
  if (mode === "DAY") return { from: inputDate(now), to: inputDate(now) };
  if (mode === "WEEK") {
    const monday = new Date(now);
    const offset = (now.getDay() + 6) % 7;
    monday.setDate(now.getDate() - offset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: inputDate(monday), to: inputDate(sunday) };
  }
  return { from: inputDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: inputDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}

async function request<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar el reporte");
  return payload as T;
}

export default function ReportsPage() {
  const initial = rangeFor("DAY");
  const [mode, setMode] = useState<RangeMode>("DAY");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<ReportList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadReports = useCallback(async (fromValue: string, toValue: string) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ from: fromValue, to: toValue });
      setData(await request<ReportList>(`/api/reports/sales?${params}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar los reportes");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadReports(initial.from, initial.to); }, [initial.from, initial.to, loadReports]);

  function selectMode(nextMode: Exclude<RangeMode, "CUSTOM">) {
    const range = rangeFor(nextMode);
    setMode(nextMode); setFrom(range.from); setTo(range.to); loadReports(range.from, range.to);
  }

  async function openDetail(id: string) {
    setDetailLoading(true); setDetail(null);
    try { const payload = await request<{ report: ReportDetail }>(`/api/reports/sales/${id}`); setDetail(payload.report); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo abrir el reporte"); }
    finally { setDetailLoading(false); }
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow mb-2">Cierres de caja</p><h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Reportes de ventas</h1><p className="mt-2 text-sm text-[#8f9d96]">Cada cierre conserva sus ventas separadas entre efectivo y dinero virtual.</p></div><button type="button" disabled={loading} onClick={() => loadReports(from, to)} className="button-secondary"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button></div>

      {error && <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-[#ffb4a5]"><span>{error}</span><button type="button" onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}

      <section className="surface mb-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div><p className="mb-2 text-xs font-semibold text-[#909d96]">Período rápido</p><div className="flex flex-wrap gap-2">{(["DAY", "WEEK", "MONTH"] as const).map((value) => <button type="button" key={value} onClick={() => selectMode(value)} className={`rounded-xl border px-4 py-2.5 text-xs font-black transition ${mode === value ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink text-[#8b9892]"}`}>{value === "DAY" ? "Día" : value === "WEEK" ? "Semana" : "Mes"}</button>)}<button type="button" onClick={() => setMode("CUSTOM")} className={`rounded-xl border px-4 py-2.5 text-xs font-black transition ${mode === "CUSTOM" ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink text-[#8b9892]"}`}>Personalizado</button></div></div>
          <form onSubmit={(event) => { event.preventDefault(); setMode("CUSTOM"); loadReports(from, to); }} className="flex flex-1 flex-wrap items-end justify-end gap-2"><label className="min-w-[160px]"><span className="mb-2 block text-xs font-semibold text-[#909d96]">Desde</span><input required type="date" className="field py-2.5" value={from} onChange={(event) => { setFrom(event.target.value); setMode("CUSTOM"); }} /></label><label className="min-w-[160px]"><span className="mb-2 block text-xs font-semibold text-[#909d96]">Hasta</span><input required type="date" className="field py-2.5" value={to} onChange={(event) => { setTo(event.target.value); setMode("CUSTOM"); }} /></label><button disabled={loading || !from || !to} className="button-primary"><CalendarDays className="h-4 w-4" />Consultar</button></form>
        </div>
      </section>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Ventas totales" value={data?.totals.grand ?? "0"} icon={BarChart3} accent="text-amber" />
        <SummaryCard label="Efectivo" value={data?.totals.cash ?? "0"} icon={Banknote} accent="text-mint" />
        <SummaryCard label="Dinero virtual" value={data?.totals.virtual ?? "0"} icon={CreditCard} accent="text-[#65b9e6]" />
        <div className="surface p-4"><div className="flex items-center justify-between"><p className="text-xs font-bold text-[#87948d]">Cantidad de ventas</p><ReceiptText className="h-4 w-4 text-[#ad9fe8]" /></div><p className="mt-3 text-2xl font-black">{(data?.totals.sales ?? 0).toLocaleString("es-AR")}</p><p className="mt-1 text-[10px] text-[#68756f]">Operaciones cobradas</p></div>
      </section>

      <section className="surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><p className="eyebrow mb-1">Archivo de cierres</p><h2 className="text-xl font-black">Reportes encontrados</h2></div><span className="pill bg-ink text-[#98a59f]">{data?.reports.length ?? 0} reportes</span></div>
        <div className="divide-y divide-line">{loading ? <div className="grid min-h-48 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-amber" /></div> : !data?.reports.length ? <div className="px-5 py-16 text-center"><BarChart3 className="mx-auto h-9 w-9 text-[#4c5953]" /><p className="mt-3 text-sm font-black">No hay cierres en este período</p><p className="mt-1 text-xs text-[#6f7c76]">El primer reporte aparecerá automáticamente cuando se cierre una caja.</p></div> : data.reports.map((report) => <button type="button" key={report.id} onClick={() => openDetail(report.id)} className="grid w-full gap-4 px-5 py-4 text-left transition hover:bg-[#1c2723] md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(120px,.45fr))_auto] md:items-center"><div className="min-w-0"><p className="font-black capitalize">{dayLabel.format(new Date(report.periodEnd))}</p><p className="mt-1 text-xs text-[#75827c]">{report.shift.register.name} · {dateTime.format(new Date(report.periodStart))} a {dateTime.format(new Date(report.periodEnd))} · cerrado por {report.createdBy.displayName}</p></div><ReportAmount label="Efectivo" value={report.cashTotal} className="text-mint" /><ReportAmount label="Virtual" value={report.virtualTotal} className="text-[#65b9e6]" /><ReportAmount label={`${report.saleCount} ventas`} value={report.grandTotal} className="text-amber" /><ChevronRight className="h-5 w-5 text-[#65726c]" /></button>)}</div>
      </section>

      {(detailLoading || detail) && <ReportDrawer report={detail} loading={detailLoading} close={() => { setDetail(null); setDetailLoading(false); }} />}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof BarChart3; accent: string }) {
  return <div className="surface p-4"><div className="flex items-center justify-between"><p className="text-xs font-bold text-[#87948d]">{label}</p><Icon className={`h-4 w-4 ${accent}`} /></div><p className={`mt-3 text-2xl font-black ${accent}`}>{money.format(Number(value))}</p></div>;
}

function ReportAmount({ label, value, className }: { label: string; value: string; className: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#68756f]">{label}</p><p className={`mt-1 text-sm font-black ${className}`}>{money.format(Number(value))}</p></div>;
}

function ReportDrawer({ report, loading, close }: { report: ReportDetail | null; loading: boolean; close: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col border-l border-line bg-[#121a17] shadow-2xl">
        <header className="flex items-start gap-3 border-b border-line p-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber/10 text-amber"><BarChart3 className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="eyebrow mb-1">Detalle del cierre</p><h2 className="text-xl font-black">{report ? `${report.shift.register.name} · ${dateTime.format(new Date(report.periodEnd))}` : "Cargando reporte"}</h2></div>
          <button type="button" onClick={close} className="rounded-xl border border-line p-2.5 text-[#89968f]"><X className="h-4 w-4" /></button>
        </header>
        {loading || !report ? (
          <div className="grid flex-1 place-items-center"><LoaderCircle className="h-8 w-8 animate-spin text-amber" /></div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 border-b border-line p-4 sm:p-5">
              <MiniTotal label="Efectivo" value={report.cashTotal} className="text-mint" />
              <MiniTotal label="Virtual" value={report.virtualTotal} className="text-[#65b9e6]" />
              <MiniTotal label="Total" value={report.grandTotal} className="text-amber" />
            </div>
            <div className="border-b border-line p-4 sm:p-5">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#6f7c76]">Conciliación declarada</p>
              {report.totalDifference === null ? (
                <p className="rounded-xl border border-line bg-ink px-4 py-3 text-xs text-[#7c8983]">Este cierre es anterior a la conciliación de dinero virtual.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-3">
                  <BalanceCard label="Efectivo" expected={report.expectedCash} declared={report.declaredCash} difference={report.cashDifference} />
                  <BalanceCard label="Dinero virtual" expected={report.virtualTotal} declared={report.declaredVirtual} difference={report.virtualDifference} />
                  <div className="rounded-xl border border-amber/25 bg-amber/5 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8e8167]">Resultado total</p>
                    <p className={`mt-3 text-base font-black ${balanceClass(Number(report.totalDifference))}`}>{balanceLabel(Number(report.totalDifference))}</p>
                  </div>
                </div>
              )}
              <p className="mt-3 text-xs text-[#7c8983]">Turno abierto por <strong className="text-cream">{report.shift.openedBy.displayName}</strong> · cerrado por <strong className="text-cream">{report.shift.closedBy?.displayName ?? report.createdBy.displayName}</strong></p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[680px] text-left">
                <thead className="sticky top-0 bg-[#141d1a] text-[10px] font-bold uppercase tracking-[.12em] text-[#718078]"><tr><th className="px-5 py-3">Fecha y hora</th><th className="px-4 py-3">Venta</th><th className="px-4 py-3">Medio</th><th className="px-5 py-3 text-right">Monto</th></tr></thead>
                <tbody className="divide-y divide-line">{report.sales.length === 0 ? <tr><td colSpan={4} className="px-5 py-16 text-center text-sm text-[#74817b]">Este cierre no tuvo ventas.</td></tr> : report.sales.map((sale) => <tr key={sale.paymentId}><td className="whitespace-nowrap px-5 py-4 text-xs text-[#8b9892]">{dateTime.format(new Date(sale.paidAt))}</td><td className="px-4 py-4"><p className="text-sm font-bold">Pedido #{sale.orderNumber}</p><p className="mt-1 text-[10px] text-[#6f7c76]">{sale.source}</p></td><td className="px-4 py-4"><p className="text-sm font-semibold">{sale.paymentMethod}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${sale.category === "CASH" ? "bg-mint/10 text-mint" : "bg-[#65b9e6]/10 text-[#65b9e6]"}`}>{sale.category === "CASH" ? "Efectivo" : "Virtual"}</span></td><td className="px-5 py-4 text-right text-base font-black text-amber">{money.format(Number(sale.amount))}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function BalanceCard({ label, expected, declared, difference }: { label: string; expected: string | null; declared: string | null; difference: string | null }) {
  const value = Number(difference ?? 0);
  return <div className="rounded-xl border border-line bg-ink p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#68756f]">{label}</p><div className="mt-2 flex justify-between gap-2 text-[10px] text-[#78857f]"><span>Esperado</span><strong className="text-[#a6b1ac]">{money.format(Number(expected ?? 0))}</strong></div><div className="mt-1 flex justify-between gap-2 text-[10px] text-[#78857f]"><span>Declarado</span><strong className="text-cream">{money.format(Number(declared ?? 0))}</strong></div><p className={`mt-3 text-sm font-black ${balanceClass(value)}`}>{balanceLabel(value)}</p></div>;
}

function MiniTotal({ label, value, className }: { label: string; value: string; className: string }) {
  return <div className="rounded-xl border border-line bg-ink p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[#68756f]">{label}</p><p className={`mt-1 text-lg font-black ${className}`}>{money.format(Number(value))}</p></div>;
}
