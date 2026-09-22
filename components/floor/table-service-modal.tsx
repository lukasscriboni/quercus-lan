"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { Banknote, ChefHat, Clock3, LoaderCircle, Plus, ReceiptText, Search, ShoppingCart, Trash2, Undo2, Wine, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { CheckoutDrawer, type CheckoutInput, type CheckoutResult } from "@/components/cash/checkout-drawer";
import { QuantityControl } from "@/components/quantity-control";
import { ProductSearchModeControl, useProductSearchMode } from "@/components/product-search-mode";
import { itemQuantitiesByProduct, sumItemQuantities } from "@/lib/order-item-summary";

type ActiveOrder = { id: string; number: number; status: string; guestCount: number; total: number; openedAt: string };
export type ServiceTable = { id: string; name: string; capacity: number; status: string; version: number; activeOrder: ActiveOrder | null };
type AccountItem = { id: string; productId: string; kitchenStationId: string | null; kitchenStation: { id: string; name: string; type: "BAR" | "KITCHEN" | "OTHER" } | null; name: string; quantity: string; unitPrice: string; total: string; status: string; notes: string | null; version: number };
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
  internalLabel: string | null;
  version: number;
  openedAt: string;
  openedBy: { displayName: string };
  items: AccountItem[];
};
type CatalogProduct = { id: string; name: string; sku: string | null; price: string; categoryId: string | null; categoryName: string; kitchenStationName: string | null };
type CashInfo = {
  openShift: { id: string; registerName: string } | null;
  paymentMethods: { id: string; name: string }[];
};

export type TableServicePanelHandle = {
  handleEnter: () => void;
  openAccountImmediately: () => void;
};

type TableServicePanelProps = {
  table: ServiceTable | null;
  interactive: boolean;
  productHost: HTMLElement | null;
  close: () => void;
  floorChanged: () => void;
  canCharge: boolean;
  paymentCompleted: (message: string) => void;
  tableReleased: (message: string) => void;
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });
const itemStatus: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Sin enviar", className: "bg-amber/10 text-amber" },
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

function InternalTableLabel({ orderId, initialValue, onError }: { orderId: string; initialValue: string | null; onError: (message: string) => void }) {
  const [value, setValue] = useState(initialValue ?? "");
  const savedValue = useRef(initialValue ?? "");

  async function save() {
    const next = value.trim();
    if (next === savedValue.current) return;
    try {
      const result = await request<{ internalLabel: string | null }>(`/api/orders/${orderId}/internal-label`, {
        method: "PATCH",
        body: JSON.stringify({ internalLabel: next }),
      });
      savedValue.current = result.internalLabel ?? "";
      setValue(savedValue.current);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "No se pudo guardar la anotación");
    }
  }

  return <input aria-label="Nota interna de la mesa" title="Solo visible en la atención de esta mesa" maxLength={80} value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => void save()} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} placeholder="Nota:" className="min-w-0 w-40 rounded-lg border border-line bg-ink px-2.5 py-1.5 text-xs text-cream outline-none placeholder:text-[#777777] focus:border-[#888888]" />;
}

export const TableServicePanel = forwardRef<TableServicePanelHandle, TableServicePanelProps>(function TableServicePanel({ table, interactive, productHost, close, floorChanged, canCharge, paymentCompleted, tableReleased }, ref) {
  const [account, setAccount] = useState<Account | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [cashInfo, setCashInfo] = useState<CashInfo | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCancelAccount, setShowCancelAccount] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const accountRequest = useRef(0);
  const catalogRequest = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchMode = useProductSearchMode();
  const selectedTable = useRef({ tableId: "", orderId: "" });
  const tableId = table?.id ?? "";
  const orderId = table?.activeOrder?.id ?? "";

  const loadAccount = useCallback(async (id: string, quiet = false) => {
    const requestId = ++accountRequest.current;
    if (!quiet) setLoading(true);
    try {
      const payload = await request<{ order: Account }>(`/api/orders/${id}`, { cache: "no-store" });
      if (requestId !== accountRequest.current) return;
      setAccount(payload.order);
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
      return [] as CatalogProduct[];
    }
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams({ q: trimmedSearch, searchMode });
      const payload = await request<{ products: CatalogProduct[] }>(`/api/orders/catalog?${params}`, { cache: "no-store" });
      if (requestId !== catalogRequest.current) return [] as CatalogProduct[];
      setProducts(payload.products);
      return payload.products;
    } catch (caught) {
      if (requestId === catalogRequest.current) setError(caught instanceof Error ? caught.message : "No se pudo cargar el catálogo");
      return [] as CatalogProduct[];
    } finally {
      if (requestId === catalogRequest.current) setCatalogLoading(false);
    }
  }, [searchMode]);

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
    setNotice("");
    setQuery("");
    setProducts([]);
    setShowCancelAccount(false);
    if (!tableId) {
      setAccount(null);
      setCashInfo(null);
      setLoading(false);
      return;
    }
    if (orderId) loadAccount(orderId);
    else {
      setAccount(null);
      setLoading(false);
    }
  }, [loadAccount, orderId, tableId]);

  useEffect(() => {
    if (canCharge && account?.status === "BILL_REQUESTED") loadCash();
  }, [account?.status, canCharge, loadCash]);

  useEffect(() => {
    if (!interactive || !account?.id || loading || showCheckout || showCancelAccount) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [account?.id, interactive, loading, showCancelAccount, showCheckout, tableId]);

  useEffect(() => {
    if (!tableId) {
      catalogRequest.current += 1;
      setCatalogLoading(false);
      return;
    }
    if (searchMode === "barcode") {
      catalogRequest.current += 1;
      setProducts([]);
      setCatalogLoading(false);
      return;
    }
    const timer = window.setTimeout(() => loadCatalog(query), 220);
    return () => window.clearTimeout(timer);
  }, [loadCatalog, query, searchMode, tableId]);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; payload?: { orderId?: string } }>).detail;
      if (detail?.type === "orders.changed" && account?.id && detail.payload?.orderId === account.id) loadAccount(account.id, true);
      if (tableId && detail?.type === "products.changed" && searchMode === "name") loadCatalog(query);
      if (canCharge && detail?.type === "cash.changed") loadCash();
    };
    window.addEventListener("quercus:update", update);
    return () => window.removeEventListener("quercus:update", update);
  }, [account?.id, canCharge, loadAccount, loadCash, loadCatalog, query, searchMode, tableId]);

  async function openAccount() {
    if (!table || table.status === "DISABLED") return;
    setBusy(true); setError("");
    try {
      const payload = await request<{ order: Account }>("/api/orders", { method: "POST", body: JSON.stringify({ diningTableId: table.id, tableVersion: table.version }) });
      setAccount(payload.order); floorChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo abrir la cuenta"); floorChanged(); }
    finally { setBusy(false); }
  }

  async function updateAccount(changes: { guestCount?: number; status?: "IN_PROGRESS" | "BILL_REQUESTED" }) {
    if (!account) return;
    setBusy(true); setError("");
    try {
      const payload = await request<{ order: Account }>(`/api/orders/${account.id}`, { method: "PUT", body: JSON.stringify({ ...changes, version: account.version }) });
      setAccount(payload.order); floorChanged();
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
    try { const payload = await request<{ order: Account }>(`/api/orders/${account.id}/items`, { method: "POST", body: JSON.stringify({ productId, quantity: 1 }) }); setAccount(payload.order); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo agregar"); await loadAccount(account.id, true); }
    finally { setBusy(false); }
  }

  async function handleProductSearchEnter() {
    if (!query.trim() || busy || requested) return;
    if (searchMode === "barcode") {
      const matches = await loadCatalog(query);
      if (matches.length === 1) {
        await addProduct(matches[0].id);
        setQuery("");
        setProducts([]);
      }
      return;
    }
    if (!catalogLoading && products.length === 1) {
      await addProduct(products[0].id);
      setQuery("");
    }
  }

  async function sendItemToStation(item: AccountItem, destination: "KITCHEN" | "BAR") {
    if (!account || item.status !== "PENDING") return;
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = await request<{ order: Account }>(`/api/orders/${account.id}/items/${item.id}/kitchen`, { method: "POST", body: JSON.stringify({ version: item.version, destination }) });
      setAccount(payload.order);
      setNotice(`${item.name} enviado a ${destination === "BAR" ? "Barra" : "Cocina"}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo enviar la consumición");
      await loadAccount(account.id, true);
    } finally {
      setBusy(false);
    }
  }

  async function changeItem(item: AccountItem, nextQuantity: number) {
    if (!account) return;
    setBusy(true); setError("");
    try {
      const url = `/api/orders/${account.id}/items/${item.id}${nextQuantity <= 0 ? `?version=${item.version}` : ""}`;
      const payload = await request<{ order: Account }>(url, nextQuantity <= 0 ? { method: "DELETE" } : { method: "PUT", body: JSON.stringify({ version: item.version, quantity: nextQuantity }) });
      setAccount(payload.order);
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
  const itemCount = useMemo(() => sumItemQuantities(account?.items ?? []), [account?.items]);
  const quantitiesByProduct = useMemo(() => itemQuantitiesByProduct(account?.items ?? []), [account?.items]);

  useEffect(() => {
    const handleChargeShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "c" || !event.ctrlKey || !event.shiftKey || event.altKey || event.repeat) return;
      if (!interactive || !account || busy || showCheckout || account.items.length === 0) return;
      if (requested) {
        if (!canCharge || !cashInfo?.openShift) return;
        event.preventDefault();
        setShowCheckout(true);
        return;
      }
      event.preventDefault();
      void updateAccount({ status: "BILL_REQUESTED" });
    };
    window.addEventListener("keydown", handleChargeShortcut);
    return () => window.removeEventListener("keydown", handleChargeShortcut);
  }, [account, busy, canCharge, cashInfo?.openShift, interactive, requested, showCheckout]);

  useImperativeHandle(ref, () => ({
    openAccountImmediately() {
      if (!table || table.activeOrder || busy || loading || showCheckout || showCancelAccount) return;
      void openAccount();
    },
    handleEnter() {
      if (!table || busy || loading || showCheckout) return;
      if (!account) {
        void openAccount();
        return;
      }

      if (!requested && account.items.length > 0) {
        void updateAccount({ status: "BILL_REQUESTED" });
      }
    },
  }));

  const productPanel = account ? (
            <section className="flex h-full min-h-0 flex-col">
              <div className="border-b border-line p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-black">Agregar productos</p><p className="mt-0.5 text-[10px] text-[#787878]">Buscá y sumá consumiciones</p></div><span className="pill bg-ink text-[#969696]">{itemCount.toLocaleString("es-AR")} en cuenta</span><button type="button" onClick={close} className="rounded-lg border border-line px-2.5 py-1.5 text-[10px] font-bold text-[#a4a4a4] hover:text-cream">Volver al plano</button></div>
                <ProductSearchModeControl mode={searchMode} />
                <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#727272]" /><input ref={searchInputRef} className="field py-2.5 pl-10 pr-10" value={query} onChange={(event) => { catalogRequest.current += 1; setProducts([]); setQuery(event.target.value); if (!event.target.value.trim()) setCatalogLoading(false); }} onKeyDown={(event) => { if (event.key !== "Enter") return; event.preventDefault(); event.stopPropagation(); void handleProductSearchEnter(); }} placeholder={searchMode === "barcode" ? "Escaneá o escribí el código de barras y presioná Enter…" : "Escribí el nombre del producto…"} autoComplete="off" />{catalogLoading && <LoaderCircle className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-amber" />}</div>
                {query.trim() && !catalogLoading && products.length === 1 && !requested && <p className="mt-2 text-[10px] font-bold uppercase tracking-[.12em] text-mint">Enter · agregar {products[0].name}</p>}
              </div>
              {requested && <div className="mx-3 mt-3 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2.5 text-xs font-semibold text-amber">La cuenta está solicitada. Reabrila desde el panel inferior para agregar productos.</div>}
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="grid grid-cols-2 gap-2">
                  {products.map((product) => {
                    const quantityInAccount = quantitiesByProduct[product.id] ?? 0;
                    const stationName = product.kitchenStationName === "COCINA" ? "Cocina" : product.kitchenStationName === "BAR" ? "Barra" : product.kitchenStationName;
                    return <button type="button" key={product.id} disabled={busy || requested} onClick={(event) => { void addProduct(product.id); if (event.detail === 0) setQuery(""); }} className="group min-h-[116px] rounded-2xl border border-line bg-[#202020] p-3 text-left transition hover:border-amber/50 hover:bg-[#2b2b2b] active:scale-[.98] disabled:cursor-wait">
                      <p className="line-clamp-2 text-sm font-black leading-tight">{product.name}</p>
                      <p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-wider text-[#6e6e6e]">{product.categoryName}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={`pill px-2 py-0.5 text-[9px] ${stationName ? "bg-mint/10 text-mint" : "bg-ink text-[#929292]"}`}>{stationName ? `${stationName} automática` : "Envío manual"}</span>
                        {quantityInAccount > 0 && <span className="pill flex items-center gap-1 bg-mint/10 px-2 py-0.5 text-[9px] text-mint"><ShoppingCart className="h-3 w-3" />En cuenta: {quantityInAccount.toLocaleString("es-AR")}</span>}
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-1"><span className="text-xs font-black text-amber">{money.format(Number(product.price))}</span><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber/10 text-amber transition group-hover:bg-amber group-hover:text-ink"><Plus className="h-4 w-4" /></span></div>
                    </button>;
                  })}
                </div>
                {!catalogLoading && products.length === 0 && <div className="grid min-h-[120px] place-items-center px-4 text-center"><div><Search className="mx-auto h-7 w-7 text-[#585858]" /><p className="mt-2 text-sm font-bold">{query.trim() ? "No se encontraron productos" : "Buscá un producto para comenzar"}</p><p className="mt-1 text-xs leading-relaxed text-[#787878]">{query.trim() ? "Probá escribiendo menos palabras o revisá el código." : "Nombre o código de barras."}</p></div></div>}
              </div>
            </section>
  ) : null;

  return (
    <>
    <aside className="surface flex h-[740px] min-h-0 flex-col overflow-hidden xl:sticky xl:top-5">
      {!table ? (
        <div className="grid h-full place-items-center p-7 text-center">
          <div><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-line bg-ink text-[#707070]"><ReceiptText className="h-7 w-7" /></div><p className="eyebrow mb-2 mt-5">Atención de mesa</p><h2 className="text-xl font-black">Seleccioná una mesa</h2><p className="mx-auto mt-2 max-w-[250px] text-sm leading-relaxed text-[#888888]">Tocá una mesa del plano. Su cuenta y sus consumiciones aparecerán acá.</p></div>
        </div>
      ) : <>
        <header className="flex items-center gap-3 border-b border-line p-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber/10 text-amber"><ReceiptText className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="eyebrow mb-0.5">Atención de mesa</p><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-black">{table.name}{account ? ` · #${account.number}` : ""}</h2>{account && (interactive ? <InternalTableLabel key={account.id} orderId={account.id} initialValue={account.internalLabel} onError={setError} /> : account.internalLabel ? <span className="rounded-lg border border-line bg-ink px-2.5 py-1.5 text-xs text-[#aaa]">{account.internalLabel}</span> : null)}</div>{account && <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#868686]"><Clock3 className="h-3 w-3" />{time.format(new Date(account.openedAt))} · {elapsed} min</p>}</div>
          <button type="button" onClick={close} disabled={busy} title="Cerrar mesa" className="rounded-xl border border-line p-2.5 text-[#929292] hover:text-cream"><X className="h-4 w-4" /></button>
        </header>

        {error && <div className="mx-3 mt-3 flex items-start justify-between gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs font-semibold text-[#ffb4a5]"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
        {notice && <div className="mx-3 mt-3 flex items-start justify-between gap-2 rounded-xl border border-mint/30 bg-mint/10 px-3 py-2.5 text-xs font-semibold text-mint"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}

        {loading ? <div className="grid flex-1 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-amber" /></div> : !account ? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <div className="w-full"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-mint/10 text-mint"><ReceiptText className="h-6 w-6" /></div><h3 className="mt-4 text-xl font-black">Abrir una cuenta</h3><p className="mx-auto mt-2 max-w-[280px] text-sm leading-relaxed text-[#909090]">La cantidad de personas es opcional y se puede modificar después desde la cuenta.</p><button type="button" onClick={openAccount} disabled={busy || table.status === "DISABLED"} className="button-primary mt-7 w-full">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}Abrir cuenta</button>{table.status === "DISABLED" && <p className="mt-3 text-xs font-semibold text-danger">Esta mesa está inactiva.</p>}</div>
          </div>
        ) : !interactive ? <div className="flex min-h-0 flex-1 flex-col bg-[#181818]">
          <div className="border-b border-line px-4 py-3"><p className="text-sm font-black">Vista previa de consumiciones <span className="ml-1 rounded-full bg-ink px-2 py-0.5 text-[10px] text-[#aaa]">{itemCount.toLocaleString("es-AR")}</span></p><p className="mt-1 text-xs text-[#888]">{requested ? "Cuenta solicitada" : "Mesa ocupada"} · Doble clic en la mesa para interactuar</p></div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{account.items.length === 0 ? <p className="py-10 text-center text-sm text-[#888]">Todavía no hay consumiciones.</p> : account.items.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-panel p-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.name}</p><p className="mt-1 text-xs text-[#888]">{Number(item.quantity).toLocaleString("es-AR")} × {money.format(Number(item.unitPrice))}</p></div><p className="shrink-0 text-sm font-black">{money.format(Number(item.total))}</p></div>)}</div>
          <div className="flex items-center justify-between border-t border-line p-4"><span className="text-xs font-bold uppercase text-[#888]">Total de la cuenta</span><strong className="text-2xl">{money.format(Number(account.total))}</strong></div>
        </div> : <>
          <div className="flex min-h-0 flex-1 flex-col">
            <section className="flex min-h-0 flex-1 flex-col bg-[#181818]">
              <div className="flex items-center justify-between border-b border-line p-3"><div><p className="text-sm font-black">Cuenta <span className="ml-1 rounded-full bg-ink px-2 py-0.5 text-[10px] text-[#a4a4a4]">{itemCount.toLocaleString("es-AR")}</span></p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#787878]">Personas <span className="normal-case tracking-normal text-[#5f5f5f]">(opcional)</span></p></div><QuantityControl value={account.guestCount} disabled={busy} min={1} max={50} onChange={(value) => updateAccount({ guestCount: value })} /></div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
                {account.items.length === 0 ? <div className="grid h-full place-items-center text-center"><div><ShoppingCart className="mx-auto h-7 w-7 text-[#585858]" /><p className="mt-3 text-sm font-bold">Cuenta sin consumiciones</p><button type="button" onClick={() => searchInputRef.current?.focus()} className="mt-2 text-xs font-bold text-amber hover:underline">Buscar un producto arriba</button><button type="button" disabled={busy} onClick={() => setShowCancelAccount(true)} className="mx-auto mt-5 flex items-center gap-2 rounded-xl border border-danger/35 px-3 py-2 text-xs font-black text-[#ff9a85] transition hover:bg-danger/10 disabled:opacity-40"><Undo2 className="h-3.5 w-3.5" />Cancelar apertura y liberar mesa</button><p className="mx-auto mt-2 max-w-[240px] text-[10px] leading-relaxed text-[#787878]">Solo se puede usar mientras la cuenta no tenga consumiciones ni pagos.</p></div></div> : account.items.map((item) => {
                  const kitchenLocked = Boolean(item.kitchenStationId) && ["PREPARING", "READY", "DELIVERED"].includes(item.status);
                  const state = itemStatus[item.status] ?? itemStatus.PENDING;
                  const destination = item.kitchenStation?.type === "BAR" ? "Barra" : item.kitchenStation?.type === "KITCHEN" ? "Cocina" : null;
                  return <div key={item.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.name}</p><div className="mt-1 flex flex-wrap items-center gap-2"><p className="text-xs text-[#787878]">{money.format(Number(item.unitPrice))} c/u</p><span className={`pill px-2 py-0.5 text-[9px] ${state.className}`}>{state.label}{destination ? ` · ${destination}` : ""}</span></div></div><p className="shrink-0 text-sm font-black text-amber">{money.format(Number(item.total))}</p></div><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><QuantityControl value={Number(item.quantity)} disabled={requested || kitchenLocked} busy={busy} min={1} max={100} onChange={(value) => changeItem(item, value)} /><div className="flex flex-wrap items-center justify-end gap-2">{item.status === "PENDING" && <><button type="button" disabled={busy} onClick={() => sendItemToStation(item, "KITCHEN")} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-amber/40 px-2.5 text-[10px] font-black text-amber transition hover:bg-amber/10 disabled:cursor-wait"><ChefHat className="h-3.5 w-3.5" />Cocina</button><button type="button" disabled={busy} onClick={() => sendItemToStation(item, "BAR")} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-mint/35 px-2.5 text-[10px] font-black text-mint transition hover:bg-mint/10 disabled:cursor-wait"><Wine className="h-3.5 w-3.5" />Barra</button></>}<button type="button" title={kitchenLocked ? "La preparación de esta consumición ya comenzó" : "Quitar consumición"} disabled={busy || requested || kitchenLocked} onClick={() => changeItem(item, 0)} className="grid h-9 w-9 place-items-center rounded-lg text-[#888888] hover:bg-danger/10 hover:text-danger disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></div></div></div>;
                })}
              </div>
              <div className="border-t border-line p-4"><div className="flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#787878]">Total de la cuenta</p><p className="mt-1 text-xs text-[#7c7c7c]">{money.format(perGuest)} por persona</p></div><p className="text-2xl font-black text-amber">{money.format(Number(account.total))}</p></div>{requested ? <div className="mt-4 space-y-2">{canCharge ? cashInfo?.openShift ? <button type="button" disabled={busy} onClick={() => setShowCheckout(true)} className="button-primary w-full"><Banknote className="h-4 w-4" />Revisar y cobrar <kbd className="rounded-md border border-black/20 bg-black/10 px-1.5 py-0.5 text-[9px]">Ctrl ⇧ C</kbd></button> : <div className="rounded-xl border border-amber/30 bg-amber/10 p-3 text-xs leading-relaxed text-amber">No hay un turno abierto. <Link href="/cash" className="font-black underline">Abrir Caja</Link> para poder cobrar.</div> : <div className="rounded-xl border border-amber/25 bg-amber/10 p-3 text-xs font-semibold text-amber">Cuenta enviada a Caja para su cobro.</div>}<button type="button" disabled={busy} onClick={() => updateAccount({ status: "IN_PROGRESS" })} className="button-secondary w-full">Reabrir para modificar</button></div> : <button type="button" disabled={busy || account.items.length === 0} style={busy && account.items.length > 0 ? { opacity: 1 } : undefined} onClick={() => updateAccount({ status: "BILL_REQUESTED" })} className="button-primary mt-4 w-full"><ReceiptText className="h-4 w-4" />Solicitar cuenta <kbd className="rounded-md border border-black/20 bg-black/10 px-1.5 py-0.5 text-[9px]">Ctrl ⇧ C</kbd></button>}</div>
            </section>
          </div>
        </>}
      </>}
    </aside>
    {interactive && productHost && productPanel && createPortal(productPanel, productHost)}
    {showCancelAccount && account && table && <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !busy && setShowCancelAccount(false)}><div role="alertdialog" aria-modal="true" aria-labelledby="cancel-table-account-title" className="surface w-full max-w-md p-5 sm:p-6"><div className="mb-5 flex items-start justify-between"><div><p className="eyebrow mb-1">Apertura accidental</p><h2 id="cancel-table-account-title" className="text-2xl font-black">Liberar “{table.name}”</h2></div><button type="button" disabled={busy} onClick={() => setShowCancelAccount(false)} className="rounded-xl border border-line p-2 text-[#929292]"><X className="h-4 w-4" /></button></div><div className="rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm leading-relaxed text-[#e8c0b7]">Se cancelará la cuenta <strong>#{account.number}</strong> vacía y la mesa volverá a figurar como <strong>Libre</strong>.</div><p className="mt-3 text-xs leading-relaxed text-[#888888]">La cuenta cancelada quedará registrada en el historial para mantener la trazabilidad.</p><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setShowCancelAccount(false)} className="button-secondary">Volver</button><button type="button" disabled={busy} onClick={cancelEmptyAccount} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-black text-[#141414] transition hover:bg-[#ff8b73] disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}Liberar mesa</button></div></div></div>}
    {showCheckout && account && cashInfo?.openShift && <CheckoutDrawer title={table?.name ?? `Pedido #${account.number}`} subtitle={`Pedido #${account.number} · ${account.guestCount} ${account.guestCount === 1 ? "persona" : "personas"}`} subtotal={Number(account.subtotal)} methods={cashInfo.paymentMethods} items={account.items.map((item) => ({ id: item.id, name: item.name, quantity: Number(item.quantity), total: Number(item.total) }))} close={() => setShowCheckout(false)} confirm={payAccount} />}
    </>
  );
});
