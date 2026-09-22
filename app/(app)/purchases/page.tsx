"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronRight, ClipboardList, History, LoaderCircle, PackageCheck, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { useAppUser } from "@/components/app-shell";

type Supplier = { id: string; name: string };
type Product = { id: string; name: string; barcode: string | null; unit: string; cost: string; supplierId: string | null };
type PurchaseItem = { id: string; quantity: string; receivedQty: string; unitCost: string; product: { id: string; name: string; barcode: string | null; unit: string } };
type Purchase = { id: string; number: number; status: string; total: string; orderedAt: string | null; receivedAt: string | null; createdAt: string; supplier: Supplier; createdBy: { displayName: string }; items: PurchaseItem[] };
type Line = { key: number; productId: string; quantity: string; unitCost: string };
type Receipt = { id: string; quantity: string; previousQty: string; newQty: string; reason: string; createdAt: string; purchaseOrderNumber: number | null; product: { name: string; barcode: string | null; unit: string }; warehouse: { name: string }; user: { displayName: string } | null; supplier: { name: string; taxId: string | null } | null };

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const statusLabel: Record<string, string> = { DRAFT: "Borrador", ORDERED: "Pendiente", PARTIALLY_RECEIVED: "Recepción parcial", RECEIVED: "Recibida", CANCELLED: "Cancelada" };
const statusClass: Record<string, string> = { ORDERED: "text-[#d5d5d5]", PARTIALLY_RECEIVED: "text-[#bcbcbc]", RECEIVED: "text-mint", CANCELLED: "text-danger", DRAFT: "text-[#999]" };

function dateInput(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

function ReceiptHistory({ close }: { close: () => void }) {
  const initialTo = useMemo(() => dateInput(new Date()), []);
  const initialFrom = useMemo(() => { const date = new Date(); date.setDate(date.getDate() - 30); return dateInput(date); }, []);
  const [from, setFrom] = useState(initialFrom); const [to, setTo] = useState(initialTo);
  const [rows, setRows] = useState<Receipt[]>([]); const [selected, setSelected] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch(`/api/stock/receipts/history?from=${from}&to=${to}`, { cache: "no-store" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar el historial"); setRows(payload.receipts ?? []); setSelected(null); } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar el historial"); } finally { setLoading(false); } }, [from, to]);
  useEffect(() => { load(); }, [load]);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}><div className="surface flex h-[min(850px,94vh)] w-full max-w-7xl flex-col overflow-hidden">
    <header className="flex items-start gap-4 border-b border-line p-5"><div className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-[#222]"><History className="h-5 w-5" /></div><div className="flex-1"><p className="eyebrow mb-1">Compras</p><h2 className="text-2xl font-black">Historial de ingresos</h2><p className="mt-1 text-xs text-[#888]">Mercadería efectivamente recibida y sumada a existencias.</p></div><button onClick={close} className="rounded-xl border border-line p-2"><X className="h-4 w-4" /></button></header>
    <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex flex-wrap items-end gap-3 border-b border-line bg-[#111] p-4"><label><span className="mb-1 block text-xs text-[#888]">Desde</span><input type="date" className="field py-2.5" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label><span className="mb-1 block text-xs text-[#888]">Hasta</span><input type="date" className="field py-2.5" value={to} onChange={(e) => setTo(e.target.value)} /></label><button className="button-secondary"><Search className="h-4 w-4" />Buscar</button><p className="ml-auto pb-2 text-xs font-bold text-[#777]">{rows.length} ingresos</p></form>
    {error && <p className="m-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-[#ffb4a5]">{error}</p>}
    <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_360px]"><div className="overflow-auto border-r border-line"><table className="w-full min-w-[720px] text-left"><thead className="sticky top-0 bg-[#141414] text-[10px] uppercase text-[#777]"><tr><th className="px-5 py-3">Fecha</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3 text-right">Cantidad</th></tr></thead><tbody className="divide-y divide-line">{loading ? <tr><td colSpan={4} className="py-16 text-center text-sm text-[#777]">Cargando ingresos…</td></tr> : rows.length === 0 ? <tr><td colSpan={4} className="py-16 text-center text-sm text-[#777]">No hay ingresos en este período.</td></tr> : rows.map((row) => <tr key={row.id} onClick={() => setSelected(row)} className={`cursor-pointer hover:bg-[#222] ${selected?.id === row.id ? "bg-[#242424]" : ""}`}><td className="whitespace-nowrap px-5 py-4 text-xs text-[#999]">{new Date(row.createdAt).toLocaleString("es-AR")}</td><td className="px-4 py-4"><p className="font-bold">{row.product.name}</p><p className="text-xs text-[#777]">{row.product.barcode ?? "Sin código"}</p></td><td className="px-4 py-4 text-sm">{row.supplier?.name ?? "Sin proveedor"}</td><td className="px-4 py-4 text-right font-black">+{Number(row.quantity).toLocaleString("es-AR")}</td></tr>)}</tbody></table></div>
      <aside className="overflow-y-auto bg-[#181818] p-5">{selected ? <><p className="eyebrow">Detalle del ingreso</p><h3 className="mt-2 text-xl font-black">{selected.product.name}</h3>{selected.purchaseOrderNumber && <p className="mt-1 text-xs text-[#888]">Orden de compra #{selected.purchaseOrderNumber}</p>}<div className="mt-5 rounded-xl border border-line bg-[#111] p-4"><p className="text-3xl font-black">+{Number(selected.quantity).toLocaleString("es-AR")}</p><p className="mt-1 text-xs text-[#888]">Existencia: {Number(selected.previousQty).toLocaleString("es-AR")} → {Number(selected.newQty).toLocaleString("es-AR")}</p></div><div className="mt-5 space-y-4 text-sm"><div><p className="text-[10px] uppercase text-[#777]">Proveedor</p><p className="font-bold">{selected.supplier?.name ?? "Sin proveedor"}</p></div><div><p className="text-[10px] uppercase text-[#777]">Responsable</p><p className="font-bold">{selected.user?.displayName ?? "Sistema"}</p></div><div><p className="text-[10px] uppercase text-[#777]">Ubicación</p><p className="font-bold">{selected.warehouse.name}</p></div><div><p className="text-[10px] uppercase text-[#777]">Registro</p><p className="font-bold">{selected.reason}</p></div></div></> : <div className="grid h-full place-items-center text-center text-sm text-[#777]">Seleccioná un ingreso para ver sus datos.</div>}</aside>
    </div>
  </div></div>;
}

function CreatePurchase({ suppliers, products, close, saved }: { suppliers: Supplier[]; products: Product[]; close: () => void; saved: () => void }) {
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ key: 1, productId: "", quantity: "1", unitCost: "0" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available = useMemo(() => supplierId ? products.filter((p) => !p.supplierId || p.supplierId === supplierId) : products, [products, supplierId]);
  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0);
  function update(key: number, patch: Partial<Line>) { setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line)); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const items = lines.filter((line) => line.productId).map(({ productId, quantity, unitCost }) => ({ productId, quantity, unitCost }));
      const response = await fetch("/api/purchases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplierId, items }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo crear la compra");
      saved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo crear la compra"); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
    <form onSubmit={submit} className="surface flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden">
      <header className="flex items-start justify-between border-b border-line p-5"><div><p className="eyebrow mb-1">Compras</p><h2 className="text-2xl font-black">Nueva orden de compra</h2><p className="mt-1 text-sm text-[#888]">La mercadería se suma al stock recién cuando registrás la recepción.</p></div><button type="button" onClick={close} className="rounded-xl border border-line p-2"><X className="h-4 w-4" /></button></header>
      <div className="overflow-y-auto p-5">
        <label className="block max-w-md"><span className="mb-2 block text-xs font-bold text-[#aaa]">Proveedor *</span><select required autoFocus className="field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Seleccionar proveedor…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <div className="mt-6 space-y-3">{lines.map((line, index) => <div key={line.key} className="grid gap-3 rounded-xl border border-line bg-[#121212] p-3 md:grid-cols-[minmax(240px,1fr)_140px_180px_44px]">
          <label><span className="mb-1.5 block text-[10px] font-bold uppercase text-[#777]">Producto</span><select required className="field py-2.5" value={line.productId} onChange={(e) => { const product = products.find((p) => p.id === e.target.value); update(line.key, { productId: e.target.value, unitCost: product ? String(Number(product.cost)) : line.unitCost }); }}><option value="">Seleccionar…</option>{available.map((p) => <option key={p.id} value={p.id}>{p.name}{p.barcode ? ` · ${p.barcode}` : ""}</option>)}</select></label>
          <label><span className="mb-1.5 block text-[10px] font-bold uppercase text-[#777]">Cantidad</span><input required type="number" min="0.001" step="0.001" className="field py-2.5" value={line.quantity} onChange={(e) => update(line.key, { quantity: e.target.value })} /></label>
          <label><span className="mb-1.5 block text-[10px] font-bold uppercase text-[#777]">Costo unitario</span><input required type="number" min="0" step="0.01" className="field py-2.5" value={line.unitCost} onChange={(e) => update(line.key, { unitCost: e.target.value })} /></label>
          <button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} className="mt-5 grid h-11 place-items-center rounded-xl border border-line text-[#888] hover:text-danger disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
          <p className="text-xs font-bold text-[#888] md:col-start-3 md:text-right">Subtotal: {money.format((Number(line.quantity) || 0) * (Number(line.unitCost) || 0))}</p>
        </div>)}</div>
        <button type="button" onClick={() => setLines((current) => [...current, { key: Date.now(), productId: "", quantity: "1", unitCost: "0" }])} className="button-secondary mt-3"><Plus className="h-4 w-4" />Agregar producto</button>
        {error && <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-[#ffb4a5]">{error}</p>}
      </div>
      <footer className="flex items-center justify-between border-t border-line bg-[#111] p-5"><div><p className="text-[10px] font-bold uppercase text-[#777]">Total estimado</p><p className="text-2xl font-black">{money.format(total)}</p></div><div className="flex gap-3"><button type="button" onClick={close} className="button-secondary">Cancelar</button><button disabled={busy} className="button-primary">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}Crear pedido</button></div></footer>
    </form>
  </div>;
}

function PurchaseDetail({ purchase, canReceive, close, received }: { purchase: Purchase; canReceive: boolean; close: () => void; received: () => void }) {
  const pending = purchase.items.filter((item) => Number(item.receivedQty) < Number(item.quantity));
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(pending.map((item) => [item.id, String(Number(item.quantity) - Number(item.receivedQty))])));
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function receive() {
    setBusy(true); setError("");
    try {
      const items = pending.map((item) => ({ itemId: item.id, quantity: Number(quantities[item.id] ?? 0) })).filter((item) => item.quantity > 0);
      const response = await fetch(`/api/purchases/${purchase.id}/receive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "No se pudo recibir la compra"); received();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo recibir la compra"); } finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && close()}><div className="surface max-h-[94vh] w-full max-w-4xl overflow-y-auto">
    <header className="flex items-start justify-between border-b border-line p-5"><div><p className="eyebrow mb-1">Orden #{purchase.number}</p><h2 className="text-2xl font-black">{purchase.supplier.name}</h2><p className="mt-1 text-xs text-[#888]">Creada {new Date(purchase.createdAt).toLocaleString("es-AR")} por {purchase.createdBy.displayName}</p></div><button onClick={close} className="rounded-xl border border-line p-2"><X className="h-4 w-4" /></button></header>
    <div className="p-5"><div className="mb-5 flex items-center justify-between rounded-xl border border-line bg-[#111] p-4"><span className={`font-black ${statusClass[purchase.status]}`}>{statusLabel[purchase.status]}</span><strong className="text-xl">{money.format(Number(purchase.total))}</strong></div>
      <div className="space-y-3">{purchase.items.map((item) => { const outstanding = Number(item.quantity) - Number(item.receivedQty); return <div key={item.id} className="grid items-center gap-3 rounded-xl border border-line p-4 sm:grid-cols-[1fr_130px_170px]"><div><p className="font-bold">{item.product.name}</p><p className="mt-1 text-xs text-[#777]">{item.product.barcode ?? "Sin código"} · {money.format(Number(item.unitCost))} c/u</p></div><div className="text-xs text-[#999]"><p>Pedido: <b className="text-cream">{Number(item.quantity).toLocaleString("es-AR")}</b></p><p>Recibido: <b className="text-cream">{Number(item.receivedQty).toLocaleString("es-AR")}</b></p></div>{outstanding > 0 && canReceive ? <label><span className="mb-1 block text-[10px] font-bold uppercase text-[#777]">Recibir ahora</span><input type="number" min="0" max={outstanding} step="0.001" className="field py-2" value={quantities[item.id] ?? "0"} onChange={(e) => setQuantities((current) => ({ ...current, [item.id]: e.target.value }))} /></label> : <span className="text-right text-sm font-bold text-mint"><Check className="mr-1 inline h-4 w-4" />Completo</span>}</div>; })}</div>
      {error && <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-[#ffb4a5]">{error}</p>}
      {pending.length > 0 && canReceive && <button disabled={busy} onClick={receive} className="button-primary mt-5 w-full">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}Confirmar recepción y actualizar stock</button>}
    </div>
  </div></div>;
}

export default function PurchasesPage() {
  const { permissions } = useAppUser(); const canWrite = permissions.includes("stock.adjust");
  const [orders, setOrders] = useState<Purchase[]>([]); const [suppliers, setSuppliers] = useState<Supplier[]>([]); const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("ALL"); const [supplierId, setSupplierId] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true); const [creating, setCreating] = useState(false); const [selected, setSelected] = useState<Purchase | null>(null); const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const params = new URLSearchParams(); if (query) params.set("q", query); if (status !== "ALL") params.set("status", status); if (supplierId) params.set("supplierId", supplierId); if (from) params.set("from", from); if (to) params.set("to", to); const response = await fetch(`/api/purchases?${params}`, { cache: "no-store" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "No se pudieron cargar las compras"); setOrders(payload.orders ?? []); setSuppliers(payload.suppliers ?? []); setProducts(payload.products ?? []); setError(""); } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudieron cargar las compras"); } finally { setLoading(false); } }, [from, query, status, supplierId, to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const listener = (event: Event) => { if ((event as CustomEvent<{ type?: string }>).detail?.type?.startsWith("purchases.")) load(); }; window.addEventListener("quercus:update", listener); return () => window.removeEventListener("quercus:update", listener); }, [load]);
  const pending = orders.filter((o) => o.status === "ORDERED" || o.status === "PARTIALLY_RECEIVED").length;
  return <div className="mx-auto max-w-[1500px]">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow mb-1">Abastecimiento</p><h1 className="font-black">Compras</h1><p className="mt-1 text-sm text-[#888]">Pedidos a proveedores y recepción conectada con las existencias.</p></div><div className="flex flex-wrap items-center gap-3"><div className="surface-soft px-4 py-2.5"><p className="text-[10px] uppercase text-[#777]">Pendientes</p><p className="text-lg font-black">{pending}</p></div><button onClick={() => setShowHistory(true)} className="button-secondary"><History className="h-4 w-4" />Historial de ingresos</button>{canWrite && <button onClick={() => setCreating(true)} className="button-primary"><Plus className="h-4 w-4" />Nueva compra</button>}</div></header>
    <form onSubmit={(e) => { e.preventDefault(); load(); }} className="surface mb-4 grid gap-3 p-4 md:grid-cols-[1fr_190px_170px_150px_150px_auto]"><label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-[#777]" /><input className="field pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Proveedor o número de orden…" /></label><select className="field" value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">Todos los estados</option><option value="ORDERED">Pendientes</option><option value="PARTIALLY_RECEIVED">Recepción parcial</option><option value="RECEIVED">Recibidas</option><option value="CANCELLED">Canceladas</option></select><select className="field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Todos los proveedores</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><label className="relative"><CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-[#777]" /><input aria-label="Desde" type="date" className="field pl-10" value={from} onChange={(e) => setFrom(e.target.value)} /></label><input aria-label="Hasta" type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /><button className="button-secondary">Buscar</button></form>
    {error && <p className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-[#ffb4a5]">{error}</p>}
    <div className="table-wrap overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead className="border-b border-line bg-[#111] text-[10px] uppercase tracking-[.12em] text-[#777]"><tr><th className="px-5 py-4">Orden</th><th className="px-4 py-4">Proveedor</th><th className="px-4 py-4">Fecha</th><th className="px-4 py-4">Estado</th><th className="px-4 py-4 text-right">Artículos</th><th className="px-4 py-4 text-right">Total</th><th /></tr></thead><tbody className="divide-y divide-line">{loading ? <tr><td colSpan={7} className="py-16 text-center text-sm text-[#777]">Cargando compras…</td></tr> : orders.length === 0 ? <tr><td colSpan={7} className="py-16 text-center"><ClipboardList className="mx-auto h-8 w-8 text-[#555]" /><p className="mt-3 font-bold">No hay compras para mostrar</p></td></tr> : orders.map((order) => <tr key={order.id} tabIndex={0} onClick={() => setSelected(order)} onKeyDown={(e) => { if (e.key === "Enter") setSelected(order); }} className="cursor-pointer hover:bg-[#222] focus:bg-[#222] focus:outline-none"><td className="px-5 py-4 font-black">#{order.number}</td><td className="px-4 py-4"><p className="font-bold">{order.supplier.name}</p><p className="mt-1 text-xs text-[#777]">por {order.createdBy.displayName}</p></td><td className="px-4 py-4 text-sm text-[#999]">{new Date(order.createdAt).toLocaleDateString("es-AR")}</td><td className={`px-4 py-4 text-sm font-bold ${statusClass[order.status]}`}>{statusLabel[order.status]}</td><td className="px-4 py-4 text-right">{order.items.length}</td><td className="px-4 py-4 text-right text-lg font-black">{money.format(Number(order.total))}</td><td className="px-4"><ChevronRight className="h-4 w-4 text-[#666]" /></td></tr>)}</tbody></table></div>
    {creating && <CreatePurchase suppliers={suppliers} products={products} close={() => setCreating(false)} saved={() => { setCreating(false); load(); }} />}
    {selected && <PurchaseDetail purchase={selected} canReceive={canWrite} close={() => setSelected(null)} received={() => { setSelected(null); load(); }} />}
    {showHistory && <ReceiptHistory close={() => setShowHistory(false)} />}
  </div>;
}
