"use client";

import { Banknote, ContactRound, LoaderCircle, Plus, Search, Trash2, UserRound, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckoutDrawer, type CheckoutInput, type CheckoutResult } from "@/components/cash/checkout-drawer";
import { ProductSearchModeControl, useProductSearchMode } from "@/components/product-search-mode";
import { QuantityControl } from "@/components/quantity-control";

type Item = { id: string; productId: string; name: string; quantity: string; unitPrice: string; total: string; version: number };
type Order = { id: string; number: number; subtotal: string; total: string; version: number; openedAt: string; items: Item[] };
type Account = { id: string; holderType: "CUSTOMER" | "EMPLOYEE"; name: string; phone: string | null; notes: string | null; createdAt: string; order: Order | null };
type Product = { id: string; name: string; price: string; categoryName: string };
type CashInfo = { paymentMethods: { id: string; name: string }[]; openShift: { id: string; registerName: string } | null };

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "No se pudo completar la operación");
  return payload as T;
}

export default function CurrentAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [cash, setCash] = useState<CashInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [form, setForm] = useState({ holderType: "CUSTOMER" as "CUSTOMER" | "EMPLOYEE", name: "", phone: "", notes: "" });
  const searchMode = useProductSearchMode();
  const searchRef = useRef<HTMLInputElement>(null);
  const requestNumber = useRef(0);
  const selected = useMemo(() => accounts.find((account) => account.id === selectedId) ?? null, [accounts, selectedId]);

  const loadAccounts = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const payload = await request<{ accounts: Account[] }>("/api/current-accounts", { cache: "no-store" });
      setAccounts(payload.accounts);
      setSelectedId((current) => current && payload.accounts.some((row) => row.id === current) ? current : payload.accounts[0]?.id ?? null);
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudieron cargar las cuentas"); }
    finally { if (!quiet) setLoading(false); }
  }, []);

  const loadCash = useCallback(async () => {
    try { setCash(await request<CashInfo>("/api/cash", { cache: "no-store" })); } catch { setCash(null); }
  }, []);

  const loadProducts = useCallback(async (value: string) => {
    const sequence = ++requestNumber.current;
    if (!value.trim()) { setProducts([]); setCatalogLoading(false); return [] as Product[]; }
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams({ q: value.trim(), searchMode });
      const payload = await request<{ products: Product[] }>(`/api/orders/catalog?${params}`, { cache: "no-store" });
      if (sequence === requestNumber.current) setProducts(payload.products);
      return payload.products;
    } catch (caught) { if (sequence === requestNumber.current) setError(caught instanceof Error ? caught.message : "No se pudo buscar el producto"); return []; }
    finally { if (sequence === requestNumber.current) setCatalogLoading(false); }
  }, [searchMode]);

  useEffect(() => { void Promise.all([loadAccounts(), loadCash()]); }, [loadAccounts, loadCash]);
  useEffect(() => {
    if (searchMode === "barcode") { requestNumber.current += 1; setProducts([]); setCatalogLoading(false); return; }
    const timer = window.setTimeout(() => void loadProducts(query), 220);
    return () => window.clearTimeout(timer);
  }, [loadProducts, query, searchMode]);
  useEffect(() => { if (selectedId) window.requestAnimationFrame(() => searchRef.current?.focus()); }, [selectedId]);

  async function createAccount(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload = await request<{ account: Account }>("/api/current-accounts", { method: "POST", body: JSON.stringify(form) });
      setAccounts((current) => [...current, payload.account].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedId(payload.account.id); setShowCreate(false); setForm({ holderType: "CUSTOMER", name: "", phone: "", notes: "" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo crear la cuenta"); }
    finally { setBusy(false); }
  }

  async function addProduct(product: Product) {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const payload = await request<{ order: Order }>(`/api/current-accounts/${selected.id}/items`, { method: "POST", body: JSON.stringify({ productId: product.id, quantity: 1 }) });
      setAccounts((current) => current.map((account) => account.id === selected.id ? { ...account, order: payload.order } : account));
      setQuery(""); setProducts([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo agregar el producto"); await loadAccounts(true); }
    finally { setBusy(false); }
  }

  async function enterSearch() {
    if (!query.trim() || busy) return;
    const matches = searchMode === "barcode" ? await loadProducts(query) : products;
    if (matches.length === 1) await addProduct(matches[0]);
  }

  async function changeItem(item: Item, quantity: number) {
    if (!selected?.order) return;
    setBusy(true); setError("");
    try {
      const payload = quantity <= 0
        ? await request<{ order: Order }>(`/api/orders/${selected.order.id}/items/${item.id}?version=${item.version}`, { method: "DELETE" })
        : await request<{ order: Order }>(`/api/orders/${selected.order.id}/items/${item.id}`, { method: "PUT", body: JSON.stringify({ version: item.version, quantity }) });
      setAccounts((current) => current.map((account) => account.id === selected.id ? { ...account, order: payload.order } : account));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo modificar el consumo"); await loadAccounts(true); }
    finally { setBusy(false); }
  }

  async function confirmPayment(input: CheckoutInput): Promise<CheckoutResult> {
    if (!selected?.order || !cash?.openShift) throw new Error("Abrí una caja antes de cobrar");
    const payload = await request<{ order: { id: string } }>(`/api/orders/${selected.order.id}/pay`, { method: "POST", body: JSON.stringify({ orderVersion: selected.order.version, cashShiftId: cash.openShift.id, paymentMethodId: input.paymentMethodId, discountType: input.discountType, discountValue: input.discountValue }) });
    setCheckout(false); await Promise.all([loadAccounts(true), loadCash()]);
    return { receiptId: payload.order.id };
  }

  return <div className="mx-auto max-w-[1600px]">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow mb-1">Consumos pendientes</p><h1 className="text-3xl font-black tracking-tight">Cuentas corrientes</h1><p className="mt-1 text-sm text-[#929292]">Empleados y clientes recurrentes. El stock se descuenta al cargar cada producto.</p></div><button className="button-primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" />Nueva cuenta</button></div>
    {error && <div className="mb-4 flex justify-between rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-[#ffb4a5]"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
    <div className="grid min-h-[650px] overflow-hidden rounded-2xl border border-line bg-panel lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="border-b border-line bg-[#141414] lg:border-b-0 lg:border-r"><div className="border-b border-line p-4"><p className="font-black">Personas</p><p className="text-xs text-[#727272]">{accounts.length} cuentas activas</p></div><div className="max-h-[260px] space-y-2 overflow-y-auto p-3 lg:max-h-[580px]">{loading ? <LoaderCircle className="mx-auto mt-12 h-6 w-6 animate-spin text-amber" /> : accounts.length === 0 ? <p className="p-8 text-center text-sm text-[#7e7e7e]">Todavía no hay cuentas corrientes.</p> : accounts.map((account) => <button key={account.id} onClick={() => setSelectedId(account.id)} className={`w-full rounded-xl border p-3 text-left ${selectedId === account.id ? "border-amber/40 bg-amber/10" : "border-line bg-ink"}`}><div className="flex items-center gap-2">{account.holderType === "EMPLOYEE" ? <UserRound className="h-4 w-4 text-mint" /> : <UsersRound className="h-4 w-4 text-amber" />}<p className="font-black">{account.name}</p></div><div className="mt-2 flex justify-between text-xs"><span className="text-[#7b7b7b]">{account.holderType === "EMPLOYEE" ? "Empleado" : "Cliente"}</span><span className="font-black text-amber">{money.format(Number(account.order?.total ?? 0))}</span></div></button>)}</div></aside>
      {!selected ? <div className="grid place-items-center p-8 text-center"><div><ContactRound className="mx-auto h-10 w-10 text-[#5c5c5c]" /><p className="mt-3 font-bold">Seleccioná o creá una cuenta</p></div></div> : <div className="flex min-w-0 flex-col"><header className="border-b border-line px-5 py-4"><p className="eyebrow mb-1">{selected.holderType === "EMPLOYEE" ? "Empleado" : "Cliente recurrente"}</p><h2 className="text-2xl font-black">{selected.name}</h2>{selected.phone && <p className="text-xs text-[#7b7b7b]">{selected.phone}</p>}</header><div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(330px,.85fr)]"><section className="border-b border-line lg:border-b-0 lg:border-r"><div className="border-b border-line p-4"><ProductSearchModeControl mode={searchMode} /><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#727272]" /><input ref={searchRef} className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void enterSearch(); } }} placeholder={searchMode === "barcode" ? "Código de barras · Enter" : "Nombre del producto"} />{catalogLoading && <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-amber" />}</div></div><div className="grid grid-cols-2 gap-2 p-4 2xl:grid-cols-3">{products.map((product) => <button key={product.id} disabled={busy} onClick={() => void addProduct(product)} className="min-h-24 rounded-xl border border-line bg-[#202020] p-3 text-left hover:border-amber/40"><p className="text-sm font-black">{product.name}</p><p className="mt-2 text-xs font-black text-amber">{money.format(Number(product.price))}</p></button>)}</div></section><section className="flex min-h-[420px] flex-col bg-[#181818]"><div className="border-b border-line p-4"><p className="font-black">Consumos pendientes</p><p className="text-xs text-[#727272]">Se pueden cobrar más adelante sin descontar nuevamente el stock.</p></div><div className="flex-1 space-y-2 overflow-y-auto p-3">{!selected.order?.items.length ? <div className="grid h-full place-items-center text-center text-sm text-[#7b7b7b]">No hay productos pendientes.</div> : selected.order.items.map((item) => <div key={item.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex justify-between gap-2"><div><p className="font-bold">{item.name}</p><p className="text-xs text-[#7b7b7b]">{money.format(Number(item.unitPrice))} c/u</p></div><p className="font-black text-amber">{money.format(Number(item.total))}</p></div><div className="mt-3 flex items-center justify-between"><QuantityControl value={Number(item.quantity)} min={1} max={100} disabled={busy} onChange={(value) => void changeItem(item, value)} /><button title="Quitar" disabled={busy} onClick={() => void changeItem(item, 0)} className="rounded-lg p-2 text-[#7b7b7b] hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button></div></div>)}</div><footer className="border-t border-line p-4"><div className="mb-3 flex items-end justify-between"><span className="text-xs font-bold uppercase text-[#7b7b7b]">Saldo pendiente</span><span className="text-3xl font-black text-amber">{money.format(Number(selected.order?.total ?? 0))}</span></div><button disabled={!selected.order?.items.length || !cash?.openShift || busy} onClick={() => setCheckout(true)} className="button-primary w-full"><Banknote className="h-4 w-4" />{cash?.openShift ? "Pasar como venta y cobrar" : "Caja cerrada"}</button></footer></section></div></div>}
    </div>
    {showCreate && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4"><form onSubmit={createAccount} className="surface w-full max-w-lg p-6"><div className="flex justify-between"><div><p className="eyebrow mb-1">Alta</p><h2 className="text-2xl font-black">Nueva cuenta corriente</h2></div><button type="button" onClick={() => setShowCreate(false)}><X className="h-5 w-5" /></button></div><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => setForm({ ...form, holderType: "CUSTOMER" })} className={`rounded-xl border p-3 font-bold ${form.holderType === "CUSTOMER" ? "border-amber bg-amber/10 text-amber" : "border-line"}`}>Cliente</button><button type="button" onClick={() => setForm({ ...form, holderType: "EMPLOYEE" })} className={`rounded-xl border p-3 font-bold ${form.holderType === "EMPLOYEE" ? "border-mint bg-mint/10 text-mint" : "border-line"}`}>Empleado</button></div><label className="mt-4 block text-xs font-bold">Nombre *<input autoFocus required className="field mt-2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="mt-4 block text-xs font-bold">Teléfono<input className="field mt-2" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label className="mt-4 block text-xs font-bold">Notas<textarea className="field mt-2 min-h-20" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><button disabled={busy} className="button-primary mt-5 w-full">{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Crear cuenta</button></form></div>}
    {checkout && selected?.order && cash?.openShift && <CheckoutDrawer title={`Cuenta corriente · ${selected.name}`} subtitle={`${selected.order.items.reduce((sum, item) => sum + Number(item.quantity), 0)} unidades · ${cash.openShift.registerName}`} subtotal={Number(selected.order.subtotal)} methods={cash.paymentMethods} items={selected.order.items.map((item) => ({ id: item.id, name: item.name, quantity: Number(item.quantity), total: Number(item.total) }))} close={() => setCheckout(false)} confirm={confirmPayment} />}
  </div>;
}
