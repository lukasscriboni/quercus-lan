"use client";

import Link from "next/link";
import { Banknote, Clock3, LoaderCircle, Plus, ReceiptText, Search, ShoppingCart, Trash2, Undo2, Users, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CheckoutDrawer, type CheckoutInput, type CheckoutResult } from "@/components/cash/checkout-drawer";
import { QuantityControl } from "@/components/quantity-control";

type ActiveOrder = { id: string; number: number; status: string; guestCount: number; total: number; openedAt: string };
export type ServiceTable = { id: string; name: string; capacity: number; status: string; version: number; activeOrder: ActiveOrder | null };
type AccountItem = { id: string; productId: string; name: string; quantity: string; unitPrice: string; total: string; status: string; notes: string | null; version: number };
type Account = {
  id: string;
  number: number;
  status: "OPEN" | "IN_PROGRESS" | "READY" | "BILL_REQUESTED" | "PAID" | "CANCELLED";
  guestCount: number;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  notes: string | null;
  version: number;
  openedAt: string;
  openedBy: { displayName: string };
  items: AccountItem[];
};
type CatalogProduct = { id: string; name: string; sku: string | null; price: string; categoryId: string | null; categoryName: string };
type CashInfo = {
  openShift: { id: string; registerName: string } | null;
  paymentMethods: { id: string; name: string }[];
};

export type TableServicePanelHandle = {
  handleEnter: () => void;
  handleTab: () => boolean;
};

type TableServicePanelProps = {
  table: ServiceTable | null;
  close: () => void;
  floorChanged: () => void;
  canCharge: boolean;
  paymentCompleted: (message: string) => void;
  tableReleased: (message: string) => void;
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "No se pudo completar la operación");
  return payload as T;
}

export const TableServicePanel = forwardRef<TableServicePanelHandle, TableServicePanelProps>(function TableServicePanel({ table, close, floorChanged, canCharge, paymentCompleted, tableReleased }, ref) {
  const [account, setAccount] = useState<Account | null>(null);
  const [guestCount, setGuestCount] = useState(2);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"PRODUCTS" | "ACCOUNT">("PRODUCTS");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [cashInfo, setCashInfo] = useState<CashInfo | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCancelAccount, setShowCancelAccount] = useState(false);
  const [error, setError] = useState("");
  const accountRequest = useRef(0);
  const catalogRequest = useRef(0);
  const selectedTable = useRef({ tableId: "", orderId: "" });
  const tableId = table?.id ?? "";
  const orderId = table?.activeOrder?.id ?? "";
  const suggestedGuests = table?.activeOrder?.guestCount ?? Math.max(1, Math.min(2, table?.capacity ?? 1));

  const loadAccount = useCallback(async (id: string, quiet = false) => {
    const requestId = ++accountRequest.current;
    if (!quiet) setLoading(true);
    try {
      const payload = await request<{ order: Account }>(`/api/orders/${id}`, { cache: "no-store" });
      if (requestId !== accountRequest.current) return;
      setAccount(payload.order);
      setGuestCount(payload.order.guestCount);
      setError("");
    } catch (caught) {
      if (requestId === accountRequest.current) setError(caught instanceof Error ? caught.message : "No se pudo cargar la cuenta");
    } finally {
      if (requestId === accountRequest.current) setLoading(false);
    }
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
      if (requestId !== catalogRequest.current) return;
      setProducts(payload.products);
    } catch (caught) {
      if (requestId === catalogRequest.current) setError(caught instanceof Error ? caught.message : "No se pudo cargar el catálogo");
    } finally {
      if (requestId === catalogRequest.current) setCatalogLoading(false);
    }
  }, []);

  const loadCash = useCallback(async () => {
    if (!canCharge) return;
    try {
      const payload = await request<CashInfo>("/api/cash", { cache: "no-store" });
      setCashInfo(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo consultar la caja");
    }
  }, [canCharge]);

  useEffect(() => {
    if (selectedTable.current.tableId === tableId && selectedTable.current.orderId === orderId) return;
    selectedTable.current = { tableId, orderId };
    accountRequest.current += 1;
    setError("");
    setQuery("");
    setProducts([]);
    setActiveTab("PRODUCTS");
    setShowCancelAccount(false);
    if (!tableId) {
      setAccount(null);
      setCashInfo(null);
      setLoading(false);
      return;
    }
    setGuestCount(suggestedGuests);
    if (orderId) loadAccount(orderId);
    else {
      setAccount(null);
      setLoading(false);
    }
  }, [loadAccount, orderId, suggestedGuests, tableId]);

  useEffect(() => {
    if (canCharge && account?.status === "BILL_REQUESTED") loadCash();
  }, [account?.status, canCharge, loadCash]);

  useEffect(() => {
    if (!tableId) {
      catalogRequest.current += 1;
      setCatalogLoading(false);
      return;
    }
    const timer = window.setTimeout(() => loadCatalog(query), 220);
    return () => window.clearTimeout(timer);
  }, [loadCatalog, query, tableId]);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; payload?: { orderId?: string } }>).detail;
      if (detail?.type === "orders.changed" && account?.id && detail.payload?.orderId === account.id) loadAccount(account.id, true);
      if (tableId && detail?.type === "products.changed") loadCatalog(query);
      if (canCharge && detail?.type === "cash.changed") loadCash();
    };
    window.addEventListener("quercus:update", update);
    return () => window.removeEventListener("quercus:update", update);
  }, [account?.id, canCharge, loadAccount, loadCash, loadCatalog, query, tableId]);

  async function openAccount() {
    if (!table || table.status === "DISABLED") return;
    setBusy(true); setError("");
    try {
      const payload = await request<{ order: Account }>("/api/orders", { method: "POST", body: JSON.stringify({ diningTableId: table.id, tableVersion: table.version, guestCount }) });
      setAccount(payload.order); floorChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo abrir la cuenta"); floorChanged(); }
    finally { setBusy(false); }
  }

  async function updateAccount(changes: { guestCount?: number; status?: "IN_PROGRESS" | "BILL_REQUESTED" }) {
    if (!account) return;
    setBusy(true); setError("");
    try {
      const payload = await request<{ order: Account }>(`/api/orders/${account.id}`, { method: "PUT", body: JSON.stringify({ ...changes, version: account.version }) });
      setAccount(payload.order); setGuestCount(payload.order.guestCount); floorChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo actualizar la cuenta"); await loadAccount(account.id, true); }
    finally { setBusy(false); }
  }

  async function cancelEmptyAccount() {
    if (!account || account.items.length > 0) return;
    setBusy(true); setError("");
    try {
      await request<{ success: true }>(`/api/orders/${account.id}?version=${account.version}`, { method: "DELETE" });
      setShowCancelAccount(false);
      setAccount(null);
      tableReleased(`${table?.name ?? "La mesa"} volvió a estar disponible`);
    } catch (caught) {
      setShowCancelAccount(false);
      setError(caught instanceof Error ? caught.message : "No se pudo liberar la mesa");
      await loadAccount(account.id, true);
      floorChanged();
    } finally {
      setBusy(false);
    }
  }

  async function addProduct(productId: string) {
    if (!account) return;
    setBusy(true); setError("");
    try { const payload = await request<{ order: Account }>(`/api/orders/${account.id}/items`, { method: "POST", body: JSON.stringify({ productId, quantity: 1 }) }); setAccount(payload.order); floorChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo agregar"); await loadAccount(account.id, true); }
    finally { setBusy(false); }
  }

  async function changeItem(item: AccountItem, nextQuantity: number) {
    if (!account) return;
    setBusy(true); setError("");
    try {
      const url = `/api/orders/${account.id}/items/${item.id}${nextQuantity <= 0 ? `?version=${item.version}` : ""}`;
      const payload = await request<{ order: Account }>(url, nextQuantity <= 0 ? { method: "DELETE" } : { method: "PUT", body: JSON.stringify({ version: item.version, quantity: nextQuantity }) });
      setAccount(payload.order); floorChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo modificar"); await loadAccount(account.id, true); }
    finally { setBusy(false); }
  }

  async function payAccount(input: CheckoutInput): Promise<CheckoutResult> {
    if (!account || !cashInfo?.openShift) throw new Error("No hay un turno de caja abierto");
    try {
      const payload = await request<{ order: { id: string }; payment: { paymentMethod: string } }>(`/api/orders/${account.id}/pay`, {
        method: "POST",
        body: JSON.stringify({
          orderVersion: account.version,
          cashShiftId: cashInfo.openShift.id,
          paymentMethodId: input.paymentMethodId,
          discountType: input.discountType,
          discountValue: input.discountValue,
        }),
      });
      paymentCompleted(`${table?.name ?? "Mesa"} cobrada con ${payload.payment.paymentMethod}`);
      return { receiptId: payload.order.id };
    } catch (caught) {
      await loadAccount(account.id, true);
      await loadCash();
      throw caught instanceof Error ? caught : new Error("No se pudo cobrar la cuenta");
    }
  }

  const requested = account?.status === "BILL_REQUESTED";
  const elapsed = account ? Math.max(0, Math.floor((Date.now() - new Date(account.openedAt).getTime()) / 60000)) : 0;
  const perGuest = account && account.guestCount ? Number(account.total) / account.guestCount : 0;
  const itemCount = useMemo(() => account?.items.reduce((sum, item) => sum + Number(item.quantity), 0) ?? 0, [account?.items]);

  useImperativeHandle(ref, () => ({
    handleEnter() {
      if (!table || busy || loading || showCheckout) return;
      if (!account) {
        void openAccount();
        return;
      }

      setActiveTab("ACCOUNT");
      if (!requested && account.items.length > 0) {
        void updateAccount({ status: "BILL_REQUESTED" });
      }
    },
    handleTab() {
      if (!table || !account || busy || loading || showCheckout || showCancelAccount) return false;
      setActiveTab((current) => current === "PRODUCTS" ? "ACCOUNT" : "PRODUCTS");
      return true;
    },
  }));

  return (
    <>
    <aside className="surface flex h-[729px] min-h-0 flex-col overflow-hidden xl:sticky xl:top-6">
      {!table ? (
        <div className="grid h-full place-items-center p-7 text-center">
          <div><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-line bg-ink text-[#66746d]"><ReceiptText className="h-7 w-7" /></div><p className="eyebrow mb-2 mt-5">Atención de mesa</p><h2 className="text-xl font-black">Seleccioná una mesa</h2><p className="mx-auto mt-2 max-w-[250px] text-sm leading-relaxed text-[#7f8c85]">Tocá una mesa del plano. Su cuenta y sus consumiciones aparecerán acá.</p></div>
        </div>
      ) : <>
        <header className="flex items-center gap-3 border-b border-line p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber/10 text-amber"><ReceiptText className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="eyebrow mb-0.5">Atención de mesa</p><h2 className="truncate text-lg font-black">{table.name}{account ? ` · #${account.number}` : ""}</h2>{account && <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#7d8a84]"><Clock3 className="h-3 w-3" />{time.format(new Date(account.openedAt))} · {elapsed} min</p>}</div>
          <button type="button" onClick={close} disabled={busy} title="Cerrar mesa" className="rounded-xl border border-line p-2.5 text-[#89968f] hover:text-cream"><X className="h-4 w-4" /></button>
        </header>

        {error && <div className="mx-3 mt-3 flex items-start justify-between gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs font-semibold text-[#ffb4a5]"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}

        {loading ? <div className="grid flex-1 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-amber" /></div> : !account ? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div className="w-full"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-mint/10 text-mint"><Users className="h-6 w-6" /></div><h3 className="mt-4 text-xl font-black">Abrir una cuenta</h3><p className="mt-2 text-sm text-[#87948d]">Indicá cuántas personas se sentaron.</p><div className="mx-auto mt-6 w-fit"><QuantityControl value={guestCount} min={1} max={50} size="large" onChange={setGuestCount} /><p className="mt-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#6e7b75]">personas · tocá el número para editar</p></div><button type="button" onClick={openAccount} disabled={busy || table.status === "DISABLED"} className="button-primary mt-7 w-full">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}Abrir cuenta</button>{table.status === "DISABLED" && <p className="mt-3 text-xs font-semibold text-danger">Esta mesa está inactiva.</p>}</div>
          </div>
        ) : <>
          <div className="grid grid-cols-2 border-b border-line bg-[#151e1b] p-2">
            <button type="button" onClick={() => setActiveTab("PRODUCTS")} className={`rounded-xl px-3 py-2.5 text-xs font-black transition ${activeTab === "PRODUCTS" ? "bg-amber text-ink" : "text-[#8d9a94] hover:text-cream"}`}>Productos</button>
            <button type="button" onClick={() => setActiveTab("ACCOUNT")} className={`rounded-xl px-3 py-2.5 text-xs font-black transition ${activeTab === "ACCOUNT" ? "bg-amber text-ink" : "text-[#8d9a94] hover:text-cream"}`}>Cuenta <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${activeTab === "ACCOUNT" ? "bg-ink/15" : "bg-ink"}`}>{itemCount.toLocaleString("es-AR")}</span></button>
          </div>

          {activeTab === "PRODUCTS" ? (
            <section className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-line p-3">
                <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#69766f]" /><input className="field py-2.5 pl-10 pr-10" value={query} onChange={(event) => { catalogRequest.current += 1; setProducts([]); setQuery(event.target.value); if (!event.target.value.trim()) setCatalogLoading(false); }} onKeyDown={(event) => { if (event.key !== "Enter") return; event.preventDefault(); event.stopPropagation(); if (query.trim() && !catalogLoading && products.length === 1 && !busy && !requested) void addProduct(products[0].id); }} placeholder="Nombre por partes, SKU o código…" autoComplete="off" />{catalogLoading && <LoaderCircle className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-amber" />}</div>
                {query.trim() && !catalogLoading && products.length === 1 && !requested && <p className="mt-2 text-[10px] font-bold uppercase tracking-[.12em] text-mint">Enter · agregar {products[0].name}</p>}
              </div>
              {requested && <div className="mx-3 mt-3 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2.5 text-xs font-semibold text-amber">La cuenta está solicitada. Reabrila desde la pestaña Cuenta para agregar productos.</div>}
              <div className="min-h-0 flex-1 overflow-y-auto p-3"><div className="grid grid-cols-2 gap-2">{products.map((product) => <button type="button" key={product.id} disabled={busy || requested} onClick={() => addProduct(product.id)} className="group min-h-[104px] rounded-2xl border border-line bg-[#1b2622] p-3 text-left transition hover:border-amber/50 hover:bg-[#202e29] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45"><p className="line-clamp-2 text-sm font-black leading-tight">{product.name}</p><p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-wider text-[#65726c]">{product.categoryName}</p><div className="mt-3 flex items-end justify-between gap-1"><span className="text-xs font-black text-amber">{money.format(Number(product.price))}</span><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber/10 text-amber transition group-hover:bg-amber group-hover:text-ink"><Plus className="h-4 w-4" /></span></div></button>)}</div>{!catalogLoading && products.length === 0 && <div className="grid min-h-[250px] place-items-center px-4 text-center"><div><Search className="mx-auto h-8 w-8 text-[#4f5c56]" /><p className="mt-3 text-sm font-bold">{query.trim() ? "No se encontraron productos" : "Buscá un producto para comenzar"}</p><p className="mt-1 text-xs leading-relaxed text-[#6f7c76]">{query.trim() ? "Probá escribiendo menos palabras o revisá el código." : "Podés escribir el nombre completo, partes del nombre, el SKU o el código de barras."}</p></div></div>}</div>
            </section>
          ) : (
            <section className="flex min-h-0 flex-1 flex-col bg-[#151e1b]">
              <div className="flex items-center justify-between border-b border-line p-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#6f7c76]">Personas</p><p className="mt-1 text-xs text-[#87948d]">{itemCount.toLocaleString("es-AR")} unidades</p></div><QuantityControl value={account.guestCount} disabled={busy} min={1} max={50} onChange={(value) => updateAccount({ guestCount: value })} /></div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{account.items.length === 0 ? <div className="grid h-full place-items-center text-center"><div><ShoppingCart className="mx-auto h-7 w-7 text-[#4f5c56]" /><p className="mt-3 text-sm font-bold">Cuenta sin consumiciones</p><button type="button" onClick={() => setActiveTab("PRODUCTS")} className="mt-2 text-xs font-bold text-amber hover:underline">Ir a productos</button><button type="button" disabled={busy} onClick={() => setShowCancelAccount(true)} className="mx-auto mt-6 flex items-center gap-2 rounded-xl border border-danger/35 px-3 py-2 text-xs font-black text-[#ff9a85] transition hover:bg-danger/10 disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" />Cancelar apertura y liberar mesa</button><p className="mx-auto mt-2 max-w-[240px] text-[10px] leading-relaxed text-[#6f7c76]">Solo se puede usar mientras la cuenta no tenga consumiciones ni pagos.</p></div></div> : account.items.map((item) => <div key={item.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.name}</p><p className="mt-1 text-xs text-[#6f7c76]">{money.format(Number(item.unitPrice))} c/u</p></div><p className="shrink-0 text-sm font-black text-amber">{money.format(Number(item.total))}</p></div><div className="mt-2 flex items-center justify-between"><QuantityControl value={Number(item.quantity)} disabled={busy || requested} min={1} max={100} onChange={(value) => changeItem(item, value)} /><button type="button" title="Quitar consumición" disabled={busy || requested} onClick={() => changeItem(item, 0)} className="grid h-9 w-9 place-items-center rounded-lg text-[#7f8c85] hover:bg-danger/10 hover:text-danger disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>
              <div className="border-t border-line p-4"><div className="flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#6f7c76]">Total de la cuenta</p><p className="mt-1 text-xs text-[#738079]">{money.format(perGuest)} por persona</p></div><p className="text-2xl font-black text-amber">{money.format(Number(account.total))}</p></div>{requested ? <div className="mt-4 space-y-2">{canCharge ? cashInfo?.openShift ? <button type="button" disabled={busy} onClick={() => setShowCheckout(true)} className="button-primary w-full"><Banknote className="h-4 w-4" />Revisar y cobrar</button> : <div className="rounded-xl border border-amber/30 bg-amber/10 p-3 text-xs leading-relaxed text-amber">No hay un turno abierto. <Link href="/cash" className="font-black underline">Abrir Caja</Link> para poder cobrar.</div> : <div className="rounded-xl border border-amber/25 bg-amber/10 p-3 text-xs font-semibold text-amber">Cuenta enviada a Caja para su cobro.</div>}<button type="button" disabled={busy} onClick={() => updateAccount({ status: "IN_PROGRESS" })} className="button-secondary w-full">Reabrir para modificar</button></div> : <button type="button" disabled={busy || account.items.length === 0} onClick={() => updateAccount({ status: "BILL_REQUESTED" })} className="button-primary mt-4 w-full"><ReceiptText className="h-4 w-4" />Solicitar cuenta</button>}</div>
            </section>
          )}
        </>}
      </>}
    </aside>
    {showCancelAccount && account && table && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !busy && setShowCancelAccount(false)}><div role="alertdialog" aria-modal="true" aria-labelledby="cancel-table-account-title" className="surface w-full max-w-md p-5 sm:p-6"><div className="mb-5 flex items-start justify-between"><div><p className="eyebrow mb-1">Apertura accidental</p><h2 id="cancel-table-account-title" className="text-2xl font-black">Liberar “{table.name}”</h2></div><button type="button" disabled={busy} onClick={() => setShowCancelAccount(false)} className="rounded-xl border border-line p-2 text-[#89968f]"><X className="h-4 w-4" /></button></div><div className="rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm leading-relaxed text-[#e8c0b7]">Se cancelará la cuenta <strong>#{account.number}</strong> vacía y la mesa volverá a figurar como <strong>Libre</strong>.</div><p className="mt-3 text-xs leading-relaxed text-[#7f8c85]">La cuenta cancelada quedará registrada en el historial para mantener la trazabilidad.</p><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setShowCancelAccount(false)} className="button-secondary">Volver</button><button type="button" disabled={busy} onClick={cancelEmptyAccount} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-black text-[#21100c] transition hover:bg-[#ff8b73] disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}Liberar mesa</button></div></div></div>}
    {showCheckout && account && cashInfo?.openShift && <CheckoutDrawer title={table?.name ?? `Pedido #${account.number}`} subtitle={`Pedido #${account.number} · ${account.guestCount} personas`} subtotal={Number(account.subtotal)} methods={cashInfo.paymentMethods} items={account.items.map((item) => ({ id: item.id, name: item.name, quantity: Number(item.quantity), total: Number(item.total) }))} close={() => setShowCheckout(false)} confirm={payAccount} />}
    </>
  );
});
