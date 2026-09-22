"use client";

import { Banknote, ChefHat, Clock3, LoaderCircle, Plus, RefreshCcw, Search, ShoppingCart, Store, Trash2, Wine, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckoutDrawer, type CheckoutInput, type CheckoutResult } from "@/components/cash/checkout-drawer";
import { QuantityControl } from "@/components/quantity-control";
import { ProductSearchModeControl, useProductSearchMode } from "@/components/product-search-mode";

type OrderItem = { id: string; productId: string; kitchenStationId: string | null; kitchenStation: { id: string; name: string; type: "BAR" | "KITCHEN" | "OTHER" } | null; name: string; quantity: string; unitPrice: string; total: string; status: string; version: number };
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
type CatalogProduct = { id: string; name: string; sku: string | null; price: string; categoryId: string | null; categoryName: string; kitchenStationName: string | null };
type PaymentMethod = { id: string; name: string };
type CashInfo = { paymentMethods: PaymentMethod[]; openShift: { id: string; registerName: string; openedAt: string } | null };

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });
const kitchenState: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Sin enviar", className: "bg-ink text-[#818181]" },
  SENT: { label: "Enviada", className: "bg-amber/10 text-amber" },
  PREPARING: { label: "Preparando", className: "bg-[#4c4c4c]/35 text-[#bebebe]" },
  READY: { label: "Lista", className: "bg-mint/10 text-mint" },
  DELIVERED: { label: "Entregada", className: "bg-ink text-[#a3a3a3]" },
};

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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchMode = useProductSearchMode();

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
      return [] as CatalogProduct[];
    }
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams({ q: trimmedSearch, searchMode });
      const payload = await request<{ products: CatalogProduct[] }>(`/api/orders/catalog?${params}`, { cache: "no-store" });
      if (requestId === catalogRequest.current) setProducts(payload.products);
      return payload.products;
    } catch (caught) {
      if (requestId === catalogRequest.current) setError(caught instanceof Error ? caught.message : "No se pudo cargar el catálogo");
      return [] as CatalogProduct[];
    } finally {
      if (requestId === catalogRequest.current) setCatalogLoading(false);
    }
  }, [searchMode]);

  useEffect(() => { Promise.all([loadOrders(), loadCash()]); }, [loadCash, loadOrders]);
  useEffect(() => {
    if (searchMode === "barcode") { catalogRequest.current += 1; setProducts([]); setCatalogLoading(false); return; }
    const timer = window.setTimeout(() => loadCatalog(query), 220);
    return () => window.clearTimeout(timer);
  }, [loadCatalog, query, searchMode]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (type === "orders.changed") loadOrders(true);
      if (type === "cash.changed") loadCash();
      if (type === "products.changed" && searchMode === "name") loadCatalog(query);
    };
    window.addEventListener("quercus:update", refresh);
    return () => window.removeEventListener("quercus:update", refresh);
  }, [loadCash, loadCatalog, loadOrders, query, searchMode]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 3500); return () => window.clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!selectedId) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId]);

  function replaceOrder(order: DirectOrder) {
    setOrders((current) => current.map((row) => row.id === order.id ? order : row));
  }

  const createOrder = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const payload = await request<{ order: DirectOrder }>("/api/direct-sales", { method: "POST", body: JSON.stringify({}) });
      setQuery("");
      setProducts([]);
      setOrders((current) => [payload.order, ...current.filter((order) => order.id !== payload.order.id)]);
      setSelectedId(payload.order.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo abrir la venta"); }
    finally { setBusy(false); }
  }, []);

  function selectOrder(id: string) {
    setSelectedId(id);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key !== "F12" || event.repeat) return;
      event.preventDefault();
      if (!busy && !loading) void createOrder();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [busy, createOrder, loading]);

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

  async function handleProductSearchEnter() {
    if (!query.trim() || busy) return;
    if (searchMode === "barcode") {
      const matches = await loadCatalog(query);
      if (matches.length === 1) {
        await addProduct(matches[0]);
        setQuery("");
        setProducts([]);
      }
      return;
    }
    if (!catalogLoading && products.length === 1) {
      await addProduct(products[0]);
      setQuery("");
    }
  }

  useEffect(() => {
    const handleChargeShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "c" || !event.ctrlKey || !event.shiftKey || event.altKey || event.repeat) return;
      if (!selected || selected.items.length === 0 || !cash?.openShift || busy || checkout || cancelOrder) return;
      event.preventDefault();
      setCheckout(true);
    };
    window.addEventListener("keydown", handleChargeShortcut);
    return () => window.removeEventListener("keydown", handleChargeShortcut);
  }, [busy, cancelOrder, cash?.openShift, checkout, selected]);

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

  async function sendItemToStation(item: OrderItem, destination: "KITCHEN" | "BAR") {
    if (!selected || item.status !== "PENDING") return;
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = await request<{ order: DirectOrder }>(`/api/orders/${selected.id}/items/${item.id}/kitchen`, {
        method: "POST",
        body: JSON.stringify({ version: item.version, destination }),
      });
      replaceOrder(payload.order);
      setNotice(`${item.name} enviado a ${destination === "BAR" ? "Barra" : "Cocina"}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo enviar el producto");
      await loadOrders(true);
    } finally { setBusy(false); }
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
      setCancelOrder(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cancelar la venta"); await loadOrders(true); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col md:h-[calc(100dvh-4rem)] md:min-h-[640px]">
      <div className="mb-6 flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow mb-2">Mostrador</p><h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Ventas directas</h1><p className="mt-2 text-sm text-[#999999]">Abrí varias ventas, mantenelas pendientes y cobrá cada una cuando corresponda.</p></div>
        <div className="flex gap-2"><button type="button" disabled={loading} onClick={() => loadOrders()} className="button-secondary"><RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button><button type="button" disabled={busy} onClick={createOrder} className="button-primary"><Plus className="h-4 w-4" />Nueva venta <kbd className="rounded-md border border-black/20 bg-black/10 px-1.5 py-0.5 text-[10px] font-black">F12</kbd></button></div>
      </div>

      {error && <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-[#ffb4a5]"><span>{error}</span><button type="button" onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
      {notice && <div className="mb-4 rounded-xl border border-mint/25 bg-mint/10 px-4 py-3 text-sm font-semibold text-mint">{notice}</div>}
      {!cash?.openShift && !loading && <div className="mb-4 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">Podés preparar ventas, pero para cobrarlas primero debe haber una caja abierta.</div>}

      <div className="grid min-h-[560px] flex-1 overflow-hidden rounded-2xl border border-line bg-panel lg:min-h-0 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-line bg-[#141414] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-line px-4 py-4"><div><p className="text-sm font-black">Ventas abiertas</p><p className="mt-1 text-[10px] text-[#787878]">{orders.length} pendientes</p></div><Store className="h-5 w-5 text-amber" /></div>
          <div className="max-h-[260px] space-y-2 overflow-y-auto p-3 lg:min-h-0 lg:flex-1 lg:max-h-none">
            {loading ? <div className="grid h-40 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-amber" /></div> : orders.length === 0 ? <div className="px-3 py-12 text-center"><ShoppingCart className="mx-auto h-7 w-7 text-[#565656]" /><p className="mt-3 text-sm font-bold">No hay ventas abiertas</p><button type="button" onClick={createOrder} className="mt-3 text-xs font-black text-amber">Crear la primera</button></div> : orders.map((order) => <button type="button" key={order.id} onClick={() => selectOrder(order.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === order.id ? "border-amber/40 bg-amber/10" : "border-line bg-ink hover:border-[#4d4d4d]"}`}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-black">Venta #{order.number}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-[#7b7b7b]"><Clock3 className="h-3 w-3" />{time.format(new Date(order.openedAt))} · {order.openedBy.displayName}</p></div><span className="text-sm font-black text-amber">{money.format(Number(order.total))}</span></div><p className="mt-2 text-[10px] text-[#757575]">{order.items.reduce((sum, item) => sum + Number(item.quantity), 0)} unidades</p></button>)}
          </div>
        </aside>

        {!selected ? (
          <div className="grid place-items-center p-8 text-center"><div><ShoppingCart className="mx-auto h-10 w-10 text-[#585858]" /><h2 className="mt-4 text-xl font-black">Abrí una venta directa</h2><p className="mt-2 text-sm text-[#7b7b7b]">Podés mantener varias abiertas y alternar entre ellas.</p><button type="button" disabled={busy} onClick={createOrder} className="button-primary mt-5"><Plus className="h-4 w-4" />Nueva venta <kbd className="rounded-md border border-black/20 bg-black/10 px-1.5 py-0.5 text-[10px] font-black">F12</kbd></button></div></div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-col">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5"><div><p className="eyebrow mb-1">Cuenta de mostrador</p><h2 className="text-xl font-black">Venta directa #{selected.number}</h2></div><button type="button" disabled={busy} onClick={() => setCancelOrder(selected)} className="button-secondary text-danger"><Trash2 className="h-4 w-4" />Cancelar venta</button></header>
            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)]">
              <section className="flex h-[430px] min-w-0 flex-col border-b border-line lg:h-auto lg:min-h-0 lg:border-b-0 lg:border-r">
                <div className="border-b border-line p-3 sm:p-4"><ProductSearchModeControl mode={searchMode} /><div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#727272]" /><input ref={searchInputRef} className="field py-2.5 pl-10 pr-10" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key !== "Enter") return; event.preventDefault(); void handleProductSearchEnter(); }} placeholder={searchMode === "barcode" ? "Escaneá o escribí el código de barras y presioná Enter…" : "Escribí el nombre del producto…"} autoComplete="off" />{catalogLoading && <LoaderCircle className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-amber" />}</div>{query.trim() && !catalogLoading && products.length === 1 && <p className="mt-2 text-[10px] font-bold uppercase tracking-[.12em] text-mint">Enter · agregar {products[0].name}</p>}</div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"><div className="grid grid-cols-2 gap-2 2xl:grid-cols-3">{products.map((product) => { const stationName = product.kitchenStationName === "COCINA" ? "Cocina" : product.kitchenStationName === "BAR" ? "Barra" : product.kitchenStationName; return <button type="button" key={product.id} disabled={busy} onClick={(event) => { void addProduct(product); if (event.detail === 0) setQuery(""); }} className="group min-h-[112px] rounded-2xl border border-line bg-[#202020] p-3 text-left transition hover:border-amber/50 hover:bg-[#2b2b2b] active:scale-[.98] disabled:opacity-45"><p className="line-clamp-2 text-sm font-black leading-tight">{product.name}</p><p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-wider text-[#6e6e6e]">{product.categoryName}</p><span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${stationName ? "bg-mint/10 text-mint" : "bg-ink text-[#929292]"}`}>{stationName ? `${stationName} automática` : "Envío manual"}</span><div className="mt-3 flex items-end justify-between gap-1"><span className="text-xs font-black text-amber">{money.format(Number(product.price))}</span><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber/10 text-amber group-hover:bg-amber group-hover:text-ink"><Plus className="h-4 w-4" /></span></div></button>; })}</div>{!catalogLoading && products.length === 0 && <div className="grid min-h-[250px] place-items-center px-5 text-center"><div><Search className="mx-auto h-8 w-8 text-[#585858]" /><p className="mt-3 text-sm font-bold">{query.trim() ? "No se encontraron productos" : "Buscá un producto para comenzar"}</p><p className="mt-1 text-xs text-[#787878]">{query.trim() ? "Probá escribiendo menos palabras o revisá el código." : "Podés escribir el nombre completo, partes del nombre o el código de barras."}</p></div></div>}</div>
              </section>

              <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[#181818]">
                <div className="border-b border-line px-4 py-3"><p className="text-sm font-black">Detalle de la venta</p><p className="mt-1 text-[10px] text-[#787878]">El stock se actualiza al agregar o quitar productos.</p></div>
                <div className="min-h-[150px] flex-1 space-y-2 overflow-y-auto p-3">{selected.items.length === 0 ? <div className="grid h-full min-h-[126px] place-items-center text-center"><div><ShoppingCart className="mx-auto h-8 w-8 text-[#585858]" /><p className="mt-3 text-sm font-bold">Venta vacía</p><p className="mt-1 text-xs text-[#787878]">Seleccioná productos del catálogo.</p></div></div> : selected.items.map((item) => { const kitchenLocked = Boolean(item.kitchenStationId) && ["PREPARING", "READY", "DELIVERED"].includes(item.status); const state = kitchenState[item.status] ?? kitchenState.PENDING; const destination = item.kitchenStation?.type === "BAR" ? "Barra" : item.kitchenStation?.type === "KITCHEN" ? "Cocina" : null; return <div key={item.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.name}</p><div className="mt-1 flex flex-wrap items-center gap-2"><p className="text-xs text-[#787878]">{money.format(Number(item.unitPrice))} c/u</p><span className={`pill px-2 py-0.5 text-[9px] ${state.className}`}>{state.label}{destination ? ` · ${destination}` : ""}</span></div></div><p className="shrink-0 text-sm font-black text-amber">{money.format(Number(item.total))}</p></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><QuantityControl value={Number(item.quantity)} disabled={busy || kitchenLocked} min={1} max={100} onChange={(value) => changeItem(item, value)} /><div className="flex flex-wrap items-center justify-end gap-2">{item.status === "PENDING" && <><button type="button" disabled={busy} onClick={() => sendItemToStation(item, "KITCHEN")} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-amber/40 px-2.5 text-[10px] font-black text-amber transition hover:bg-amber/10 disabled:opacity-40"><ChefHat className="h-3.5 w-3.5" />Cocina</button><button type="button" disabled={busy} onClick={() => sendItemToStation(item, "BAR")} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-mint/35 px-2.5 text-[10px] font-black text-mint transition hover:bg-mint/10 disabled:opacity-40"><Wine className="h-3.5 w-3.5" />Barra</button></>}<button type="button" disabled={busy || kitchenLocked} onClick={() => changeItem(item, 0)} title={kitchenLocked ? "La preparación de este producto ya comenzó" : "Quitar producto"} className="grid h-9 w-9 place-items-center rounded-lg text-[#888888] hover:bg-danger/10 hover:text-danger disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div></div></div>; })}</div>
                <footer className="shrink-0 border-t border-line p-4"><div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-[#787878]">Total actual</p><p className="mt-1 text-xs text-[#878787]">{selected.items.reduce((sum, item) => sum + Number(item.quantity), 0)} unidades</p></div><p className="text-3xl font-black text-amber">{money.format(Number(selected.subtotal))}</p></div><button type="button" disabled={busy || selected.items.length === 0 || !cash?.openShift} onClick={() => setCheckout(true)} className="button-primary w-full"><Banknote className="h-4 w-4" />{cash?.openShift ? "Cobrar venta" : "Caja cerrada"}{cash?.openShift && <kbd className="rounded-md border border-black/20 bg-black/10 px-1.5 py-0.5 text-[9px]">Ctrl ⇧ C</kbd>}</button></footer>
              </section>
            </div>
          </div>
        )}
      </div>

      {checkout && selected && cash?.openShift && <CheckoutDrawer title={`Venta directa #${selected.number}`} subtitle={`${selected.items.reduce((sum, item) => sum + Number(item.quantity), 0)} unidades · ${cash.openShift.registerName}`} subtotal={Number(selected.subtotal)} methods={cash.paymentMethods} items={selected.items.map((item) => ({ id: item.id, name: item.name, quantity: Number(item.quantity), total: Number(item.total) }))} close={() => setCheckout(false)} confirm={confirmPayment} />}

      {cancelOrder && <div className="fixed inset-0 z-[75] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !busy && setCancelOrder(null)}><div className="surface w-full max-w-md p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="eyebrow mb-1">Confirmación</p><h2 className="text-2xl font-black">Cancelar venta #{cancelOrder.number}</h2></div><button type="button" disabled={busy} onClick={() => setCancelOrder(null)} className="rounded-xl border border-line p-2 text-[#929292]"><X className="h-4 w-4" /></button></div><p className="mt-4 text-sm leading-relaxed text-[#929292]">Se cerrará esta venta sin cobrar y se devolverán al stock todos los productos agregados.</p><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setCancelOrder(null)} className="button-secondary">Volver</button><button type="button" disabled={busy} onClick={confirmCancel} className="button-primary bg-danger text-white hover:bg-danger/90">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Cancelar venta</button></div></div></div>}
    </div>
  );
}
