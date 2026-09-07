"use client";

import { Banknote, Clock3, LoaderCircle, Plus, RefreshCcw, Search, ShoppingCart, Store, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckoutDrawer, type CheckoutInput, type CheckoutResult } from "@/components/cash/checkout-drawer";
import { QuantityControl } from "@/components/quantity-control";

type OrderItem = { id: string; productId: string; name: string; quantity: string; unitPrice: string; total: string; version: number };
type DirectOrder = {
  id: string;
  number: number;
  status: "OPEN" | "IN_PROGRESS" | "READY" | "BILL_REQUESTED";
  subtotal: string;
  total: string;
  notes: string | null;
  version: number;
  openedAt: string;
  openedBy: { displayName: string };
  items: OrderItem[];
};
type CatalogProduct = { id: string; name: string; sku: string | null; price: string; categoryId: string | null; categoryName: string };
type PaymentMethod = { id: string; name: string };
type CashInfo = { paymentMethods: PaymentMethod[]; openShift: { id: string; registerName: string; openedAt: string } | null };

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "No se pudo completar la operación");
  return payload as T;
}

export default function DirectSalesPage() {
  const [orders, setOrders] = useState<DirectOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cash, setCash] = useState<CashInfo | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkout, setCheckout] = useState(false);
  const [cancelOrder, setCancelOrder] = useState<DirectOrder | null>(null);
  const catalogRequest = useRef(0);

  const selected = useMemo(() => orders.find((order) => order.id === selectedId) ?? null, [orders, selectedId]);

  const loadOrders = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const payload = await request<{ orders: DirectOrder[] }>("/api/direct-sales", { cache: "no-store" });
      setOrders(payload.orders);
      setSelectedId((current) => current && payload.orders.some((order) => order.id === current) ? current : payload.orders[0]?.id ?? null);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudieron cargar las ventas directas"); }
    finally { if (!quiet) setLoading(false); }
  }, []);

  const loadCash = useCallback(async () => {
    try { setCash(await request<CashInfo>("/api/cash", { cache: "no-store" })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo consultar la caja"); }
  }, []);

  const loadCatalog = useCallback(async (search: string) => {
    const requestId = ++catalogRequest.current;
    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      setProducts([]);
      setCatalogLoading(false);
      return;
    }
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams({ q: trimmedSearch });
      const payload = await request<{ products: CatalogProduct[] }>(`/api/orders/catalog?${params}`, { cache: "no-store" });
      if (requestId === catalogRequest.current) setProducts(payload.products);
    } catch (caught) {
      if (requestId === catalogRequest.current) setError(caught instanceof Error ? caught.message : "No se pudo cargar el catálogo");
    } finally {
      if (requestId === catalogRequest.current) setCatalogLoading(false);
    }
  }, []);

  useEffect(() => { Promise.all([loadOrders(), loadCash()]); }, [loadCash, loadOrders]);
  useEffect(() => { const timer = window.setTimeout(() => loadCatalog(query), 220); return () => window.clearTimeout(timer); }, [loadCatalog, query]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (type === "orders.changed") loadOrders(true);
      if (type === "cash.changed") loadCash();
      if (type === "products.changed") loadCatalog(query);
    };
    window.addEventListener("quercus:update", refresh);
    return () => window.removeEventListener("quercus:update", refresh);
  }, [loadCash, loadCatalog, loadOrders, query]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 3500); return () => window.clearTimeout(timer); }, [notice]);

  function replaceOrder(order: DirectOrder) {
    setOrders((current) => current.map((row) => row.id === order.id ? order : row));
  }

  async function createOrder() {
    setBusy(true); setError("");
    try {
      const payload = await request<{ order: DirectOrder }>("/api/direct-sales", { method: "POST", body: JSON.stringify({}) });
      setOrders((current) => [payload.order, ...current.filter((order) => order.id !== payload.order.id)]);
      setSelectedId(payload.order.id);
      setNotice(`Venta directa #${payload.order.number} abierta`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo abrir la venta"); }
    finally { setBusy(false); }
  }

  async function addProduct(product: CatalogProduct) {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const existing = selected.items.find((item) => item.productId === product.id);
      const payload = existing
        ? await request<{ order: DirectOrder }>(`/api/orders/${selected.id}/items/${existing.id}`, { method: "PUT", body: JSON.stringify({ version: existing.version, quantity: Number(existing.quantity) + 1 }) })
        : await request<{ order: DirectOrder }>(`/api/orders/${selected.id}/items`, { method: "POST", body: JSON.stringify({ productId: product.id, quantity: 1 }) });
      replaceOrder(payload.order);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo agregar el producto"); await loadOrders(true); }
    finally { setBusy(false); }
  }

  async function changeItem(item: OrderItem, quantity: number) {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const payload = quantity <= 0
        ? await request<{ order: DirectOrder }>(`/api/orders/${selected.id}/items/${item.id}?version=${item.version}`, { method: "DELETE" })
        : await request<{ order: DirectOrder }>(`/api/orders/${selected.id}/items/${item.id}`, { method: "PUT", body: JSON.stringify({ version: item.version, quantity }) });
      replaceOrder(payload.order);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo modificar el producto"); await loadOrders(true); }
    finally { setBusy(false); }
  }

  async function confirmPayment(input: CheckoutInput): Promise<CheckoutResult> {
    if (!selected || !cash?.openShift) throw new Error("Abrí un turno de caja antes de cobrar");
    const payload = await request<{ order: { id: string }; payment: { id: string; paymentMethod: string } }>(`/api/orders/${selected.id}/pay`, {
      method: "POST",
      body: JSON.stringify({ orderVersion: selected.version, cashShiftId: cash.openShift.id, paymentMethodId: input.paymentMethodId, discountType: input.discountType, discountValue: input.discountValue }),
    });
    setCheckout(false);
    setNotice(`Venta directa #${selected.number} cobrada con ${payload.payment.paymentMethod}`);
    await Promise.all([loadOrders(true), loadCash()]);
    return { receiptId: payload.order.id };
  }

  async function confirmCancel() {
    if (!cancelOrder) return;
    setBusy(true); setError("");
    try {
      await request(`/api/direct-sales/${cancelOrder.id}?version=${cancelOrder.version}`, { method: "DELETE" });
      setOrders((current) => current.filter((order) => order.id !== cancelOrder.id));
      if (selectedId === cancelOrder.id) setSelectedId(orders.find((order) => order.id !== cancelOrder.id)?.id ?? null);
      setNotice(`Venta directa #${cancelOrder.number} cancelada`); setCancelOrder(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cancelar la venta"); await loadOrders(true); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow mb-2">Mostrador</p><h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Ventas directas</h1><p className="mt-2 text-sm text-[#8f9d96]">Abrí varias ventas, mantenelas pendientes y cobrá cada una cuando corresponda.</p></div>
        <div className="flex gap-2"><button type="button" disabled={loading} onClick={() => loadOrders()} className="button-secondary"><RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button><button type="button" disabled={busy} onClick={createOrder} className="button-primary"><Plus className="h-4 w-4" />Nueva venta</button></div>
      </div>

      {error && <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-[#ffb4a5]"><span>{error}</span><button type="button" onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
      {notice && <div className="mb-4 rounded-xl border border-mint/25 bg-mint/10 px-4 py-3 text-sm font-semibold text-mint">{notice}</div>}
      {!cash?.openShift && !loading && <div className="mb-4 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">Podés preparar ventas, pero para cobrarlas primero debe haber una caja abierta.</div>}

      <div className="grid overflow-hidden rounded-2xl border border-line bg-panel lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b border-line bg-[#141d1a] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-line px-4 py-4"><div><p className="text-sm font-black">Ventas abiertas</p><p className="mt-1 text-[10px] text-[#6f7c76]">{orders.length} pendientes</p></div><Store className="h-5 w-5 text-amber" /></div>
          <div className="max-h-[260px] space-y-2 overflow-y-auto p-3 lg:max-h-[480px]">
            {loading ? <div className="grid h-40 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-amber" /></div> : orders.length === 0 ? <div className="px-3 py-12 text-center"><ShoppingCart className="mx-auto h-7 w-7 text-[#4d5a54]" /><p className="mt-3 text-sm font-bold">No hay ventas abiertas</p><button type="button" onClick={createOrder} className="mt-3 text-xs font-black text-amber">Crear la primera</button></div> : orders.map((order) => <button type="button" key={order.id} onClick={() => setSelectedId(order.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === order.id ? "border-amber/40 bg-amber/10" : "border-line bg-ink hover:border-[#42514b]"}`}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-black">Venta #{order.number}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-[#718078]"><Clock3 className="h-3 w-3" />{time.format(new Date(order.openedAt))} · {order.openedBy.displayName}</p></div><span className="text-sm font-black text-amber">{money.format(Number(order.total))}</span></div><p className="mt-2 text-[10px] text-[#6d7973]">{order.items.reduce((sum, item) => sum + Number(item.quantity), 0)} unidades</p></button>)}
          </div>
        </aside>

        {!selected ? (
          <div className="grid place-items-center p-8 text-center"><div><ShoppingCart className="mx-auto h-10 w-10 text-[#4f5c56]" /><h2 className="mt-4 text-xl font-black">Abrí una venta directa</h2><p className="mt-2 text-sm text-[#718078]">Podés mantener varias abiertas y alternar entre ellas.</p><button type="button" disabled={busy} onClick={createOrder} className="button-primary mt-5"><Plus className="h-4 w-4" />Nueva venta</button></div></div>
        ) : (
          <div className="min-w-0">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5"><div><p className="eyebrow mb-1">Cuenta de mostrador</p><h2 className="text-xl font-black">Venta directa #{selected.number}</h2></div><button type="button" disabled={busy} onClick={() => setCancelOrder(selected)} className="button-secondary text-danger"><Trash2 className="h-4 w-4" />Cancelar venta</button></header>
            <div className="grid items-start xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
              <section className="flex h-[430px] min-w-0 flex-col border-b border-line xl:border-b-0 xl:border-r">
                <div className="border-b border-line p-3 sm:p-4"><div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#69766f]" /><input className="field py-2.5 pl-10 pr-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre por partes, SKU o código…" autoComplete="off" />{catalogLoading && <LoaderCircle className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-amber" />}</div></div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">{products.map((product) => <button type="button" key={product.id} disabled={busy} onClick={() => addProduct(product)} className="group min-h-[112px] rounded-2xl border border-line bg-[#1b2622] p-3 text-left transition hover:border-amber/50 hover:bg-[#202e29] active:scale-[.98] disabled:opacity-45"><p className="line-clamp-2 text-sm font-black leading-tight">{product.name}</p><p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-wider text-[#65726c]">{product.categoryName}</p><div className="mt-3 flex items-end justify-between gap-1"><span className="text-xs font-black text-amber">{money.format(Number(product.price))}</span><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber/10 text-amber group-hover:bg-amber group-hover:text-ink"><Plus className="h-4 w-4" /></span></div></button>)}</div>{!catalogLoading && products.length === 0 && <div className="grid min-h-[250px] place-items-center px-5 text-center"><div><Search className="mx-auto h-8 w-8 text-[#4f5c56]" /><p className="mt-3 text-sm font-bold">{query.trim() ? "No se encontraron productos" : "Buscá un producto para comenzar"}</p><p className="mt-1 text-xs text-[#6f7c76]">{query.trim() ? "Probá escribiendo menos palabras o revisá el código." : "Podés escribir el nombre completo, partes del nombre, el SKU o el código de barras."}</p></div></div>}</div>
              </section>

              <section className="min-w-0 self-start overflow-hidden bg-[#151e1b]">
                <div className="border-b border-line px-4 py-3"><p className="text-sm font-black">Detalle de la venta</p><p className="mt-1 text-[10px] text-[#6f7c76]">El stock se actualiza al agregar o quitar productos.</p></div>
                <div className="min-h-[150px] max-h-[430px] space-y-2 overflow-y-auto p-3">{selected.items.length === 0 ? <div className="grid min-h-[126px] place-items-center text-center"><div><ShoppingCart className="mx-auto h-8 w-8 text-[#4f5c56]" /><p className="mt-3 text-sm font-bold">Venta vacía</p><p className="mt-1 text-xs text-[#6f7c76]">Seleccioná productos del catálogo.</p></div></div> : selected.items.map((item) => <div key={item.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.name}</p><p className="mt-1 text-xs text-[#6f7c76]">{money.format(Number(item.unitPrice))} c/u</p></div><p className="shrink-0 text-sm font-black text-amber">{money.format(Number(item.total))}</p></div><div className="mt-2 flex items-center justify-between"><QuantityControl value={Number(item.quantity)} disabled={busy} min={1} max={100} onChange={(value) => changeItem(item, value)} /><button type="button" disabled={busy} onClick={() => changeItem(item, 0)} title="Quitar producto" className="grid h-9 w-9 place-items-center rounded-lg text-[#7f8c85] hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>
                <footer className="border-t border-line p-4"><div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-[#6f7c76]">Total actual</p><p className="mt-1 text-xs text-[#7e8b85]">{selected.items.reduce((sum, item) => sum + Number(item.quantity), 0)} unidades</p></div><p className="text-3xl font-black text-amber">{money.format(Number(selected.subtotal))}</p></div><button type="button" disabled={busy || selected.items.length === 0 || !cash?.openShift} onClick={() => setCheckout(true)} className="button-primary w-full"><Banknote className="h-4 w-4" />{cash?.openShift ? "Cobrar venta" : "Caja cerrada"}</button></footer>
              </section>
            </div>
          </div>
        )}
      </div>

      {checkout && selected && cash?.openShift && <CheckoutDrawer title={`Venta directa #${selected.number}`} subtitle={`${selected.items.reduce((sum, item) => sum + Number(item.quantity), 0)} unidades · ${cash.openShift.registerName}`} subtotal={Number(selected.subtotal)} methods={cash.paymentMethods} items={selected.items.map((item) => ({ id: item.id, name: item.name, quantity: Number(item.quantity), total: Number(item.total) }))} close={() => setCheckout(false)} confirm={confirmPayment} />}

      {cancelOrder && <div className="fixed inset-0 z-[75] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !busy && setCancelOrder(null)}><div className="surface w-full max-w-md p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="eyebrow mb-1">Confirmación</p><h2 className="text-2xl font-black">Cancelar venta #{cancelOrder.number}</h2></div><button type="button" disabled={busy} onClick={() => setCancelOrder(null)} className="rounded-xl border border-line p-2 text-[#89968f]"><X className="h-4 w-4" /></button></div><p className="mt-4 text-sm leading-relaxed text-[#89968f]">Se cerrará esta venta sin cobrar y se devolverán al stock todos los productos agregados.</p><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setCancelOrder(null)} className="button-secondary">Volver</button><button type="button" disabled={busy} onClick={confirmCancel} className="button-primary bg-danger text-white hover:bg-danger/90">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Cancelar venta</button></div></div></div>}
    </div>
  );
}
