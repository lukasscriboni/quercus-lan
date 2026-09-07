"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronRight, History, LoaderCircle, PackagePlus, Plus, Search, TriangleAlert, Truck, UserRound, X } from "lucide-react";
import { useAppUser } from "@/components/app-shell";

type StockRow = { id: string; warehouseId: string; quantity: string; minimum: string; version: number };
type Product = { id: string; name: string; sku: string | null; unit: string; stockMode: string; stocks: StockRow[] };
type Movement = { id: string; type: string; quantity: string; previousQty: string; newQty: string; reason: string; createdAt: string; user: { displayName: string } | null };
type ReceiptProduct = { id: string; name: string; sku: string | null; unit: string };
type ReceiptUser = { id: string; displayName: string; username: string; role: { name: string } };
type SupplierOption = { id: string; name: string };
type CategoryOption = { id: string; name: string };
type ReceiptOptions = { products: ReceiptProduct[]; users: ReceiptUser[]; suppliers: SupplierOption[]; categories: CategoryOption[]; currentUserId: string };
type ReceiptHistoryRow = {
  id: string;
  quantity: string;
  previousQty: string;
  newQty: string;
  reason: string;
  createdAt: string;
  product: { id: string; name: string; sku: string | null; barcode: string | null; unit: string };
  warehouse: { id: string; name: string };
  user: { id: string; displayName: string; username: string } | null;
  supplier: { id: string; name: string; taxId: string | null; contactName: string | null; phone: string | null; email: string | null } | null;
};

const movementLabels: Record<string, string> = { INITIAL_IMPORT: "Importación inicial", PURCHASE: "Ingreso de mercadería", SALE: "Venta", ENTRY: "Entrada", EXIT: "Salida", ADJUSTMENT: "Ajuste", WASTE: "Merma", TRANSFER_IN: "Transferencia recibida", TRANSFER_OUT: "Transferencia enviada", INVENTORY_ADJUSTMENT: "Ajuste de inventario", REVERSAL: "Reversión" };
const unitLabels: Record<string, string> = { UNIT: "unidades", GRAM: "gramos", KILOGRAM: "kilogramos", MILLILITER: "mililitros", LITER: "litros" };
const receiptDateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

function inputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultReceiptRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: inputDate(from), to: inputDate(to) };
}

function HistoryModal({ product, close }: { product: Product; close: () => void }) {
  const [rows, setRows] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch(`/api/stock/movements?productId=${product.id}`).then((response) => response.json()).then((data) => setRows(data.movements ?? [])).finally(() => setLoading(false)); }, [product.id]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="surface max-h-[90vh] w-full max-w-4xl overflow-hidden">
        <div className="flex items-start justify-between border-b border-line p-5 sm:p-6"><div><p className="eyebrow mb-1">Trazabilidad</p><h2 className="text-2xl font-black">{product.name}</h2><p className="mt-1 text-xs text-[#7c8983]">{product.sku ?? "Sin SKU"} · últimos 100 movimientos</p></div><button onClick={close} className="rounded-xl border border-line p-2 text-[#89968f]"><X className="h-4 w-4" /></button></div>
        <div className="max-h-[65vh] overflow-auto"><table className="w-full min-w-[720px] text-left"><thead className="sticky top-0 bg-[#141d1a] text-[10px] uppercase tracking-[.12em] text-[#718078]"><tr><th className="px-5 py-3">Fecha</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3 text-right">Cantidad</th><th className="px-4 py-3 text-right">Anterior → nuevo</th><th className="px-5 py-3">Responsable / detalle</th></tr></thead><tbody className="divide-y divide-line">{loading ? <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-[#74817b]">Cargando historial…</td></tr> : rows.length === 0 ? <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-[#74817b]">Todavía no hay movimientos.</td></tr> : rows.map((row) => <tr key={row.id}><td className="whitespace-nowrap px-5 py-4 text-xs text-[#8b9892]">{new Date(row.createdAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td className="px-4 py-4 text-sm font-bold">{movementLabels[row.type] ?? row.type}</td><td className={`px-4 py-4 text-right font-black ${Number(row.quantity) > 0 ? "text-mint" : "text-danger"}`}>{Number(row.quantity) > 0 ? "+" : ""}{Number(row.quantity).toLocaleString("es-AR")}</td><td className="px-4 py-4 text-right text-sm text-[#a1ada7]">{Number(row.previousQty).toLocaleString("es-AR")} → {Number(row.newQty).toLocaleString("es-AR")}</td><td className="px-5 py-4"><p className="text-sm">{row.user?.displayName ?? "Sistema"}</p><p className="mt-1 text-xs text-[#718078]">{row.reason}</p></td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}

function SupplierModal({ close, saved }: { close: () => void; saved: (supplier: SupplierOption) => void }) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, contactName, taxId, phone, email }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo guardar el proveedor");
      saved(payload.supplier);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar el proveedor"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !busy && close()}>
      <form onSubmit={submit} className="surface max-h-[92vh] w-full max-w-lg overflow-y-auto p-5 sm:p-6">
        <div className="mb-6 flex items-start justify-between"><div><p className="eyebrow mb-1">Proveedores</p><h2 className="text-2xl font-black">Nuevo proveedor</h2><p className="mt-2 text-sm text-[#84918b]">Solo el nombre es obligatorio.</p></div><button type="button" disabled={busy} onClick={close} className="rounded-xl border border-line p-2 text-[#89968f] disabled:opacity-40"><X className="h-4 w-4" /></button></div>
        <div className="space-y-4">
          <label className="block"><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Nombre *</span><input required autoFocus maxLength={120} className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre o razón social" /></label>
          <label className="block"><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Persona de contacto</span><input maxLength={120} className="field" value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Opcional" /></label>
          <label className="block"><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">CUIT</span><input maxLength={30} className="field" value={taxId} onChange={(event) => setTaxId(event.target.value)} placeholder="Opcional" /></label>
          <label className="block"><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Teléfono</span><input type="tel" maxLength={40} className="field" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Opcional" /></label>
          <label className="block"><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Correo electrónico</span><input type="email" maxLength={160} className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Opcional" /></label>
        </div>
        {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-[#ffb4a5]">{error}</div>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={close} className="button-secondary">Cancelar</button><button disabled={busy} className="button-primary">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{busy ? "Guardando…" : "Agregar proveedor"}</button></div>
      </form>
    </div>
  );
}

function ReceiptProductModal({ categories, close, saved }: { categories: CategoryOption[]; close: () => void; saved: (product: ReceiptProduct) => void }) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("UNIT");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (categoryId && !categories.some((category) => category.id === categoryId)) setCategoryId(""); }, [categories, categoryId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, sku, barcode, categoryId, unit, cost: Number(cost || 0), price: Number(price || 0), taxRate: 21, stockMode: "DIRECT", isActive: true }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo crear el producto");
      saved({ id: payload.product.id, name: payload.product.name, sku: payload.product.sku, unit: payload.product.unit });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo crear el producto"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !busy && close()}>
      <form onSubmit={submit} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} className="surface max-h-[92vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-6">
        <div className="mb-6 flex items-start justify-between"><div><p className="eyebrow mb-1">Catálogo</p><h2 className="text-2xl font-black">Nuevo producto</h2><p className="mt-2 text-sm text-[#84918b]">Solo el nombre es obligatorio. Se activará el control directo de stock.</p></div><button type="button" disabled={busy} onClick={close} className="rounded-xl border border-line p-2 text-[#89968f] disabled:opacity-40"><X className="h-4 w-4" /></button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Nombre *</span><input required autoFocus maxLength={200} className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre del producto" /></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">SKU</span><input maxLength={80} className="field" value={sku} onChange={(event) => setSku(event.target.value)} placeholder="Opcional" /></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Código de barras</span><input maxLength={80} className="field" value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Opcional" /></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Categoría</span><select className="field" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Unidad</span><select className="field" value={unit} onChange={(event) => setUnit(event.target.value)}><option value="UNIT">Unidad</option><option value="GRAM">Gramo</option><option value="KILOGRAM">Kilogramo</option><option value="MILLILITER">Mililitro</option><option value="LITER">Litro</option></select></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Costo</span><input type="number" min="0" step="0.01" className="field" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="0" /></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Precio de venta</span><input type="number" min="0" step="0.01" className="field" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" /></label>
        </div>
        {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-[#ffb4a5]">{error}</div>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={close} className="button-secondary">Cancelar</button><button disabled={busy} className="button-primary">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}{busy ? "Guardando…" : "Agregar producto"}</button></div>
      </form>
    </div>
  );
}

function ReceiptModal({ options, canCreateProduct, close, saved, supplierCreated, productCreated }: { options: ReceiptOptions; canCreateProduct: boolean; close: () => void; saved: () => void; supplierCreated: (supplier: SupplierOption) => void; productCreated: (product: ReceiptProduct) => void }) {
  const [suppliers, setSuppliers] = useState(options.suppliers);
  const [supplierId, setSupplierId] = useState("");
  const [showSupplier, setShowSupplier] = useState(false);
  const [products, setProducts] = useState(options.products);
  const [showProduct, setShowProduct] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [receivedByUserId, setReceivedByUserId] = useState("");
  const [automaticDate] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectedProduct = products.find((product) => product.id === productId);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/stock/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplierId, productId, quantity: Number(quantity), receivedByUserId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo ingresar la mercadería");
      saved(); close();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo ingresar la mercadería"); }
    finally { setBusy(false); }
  }

  function addSupplier(supplier: SupplierOption) {
    setSuppliers((current) => [...current.filter((item) => item.id !== supplier.id), supplier].sort((a, b) => a.name.localeCompare(b.name, "es")));
    setSupplierId(supplier.id);
    supplierCreated(supplier);
    setShowSupplier(false);
  }

  function addProduct(product: ReceiptProduct) {
    setProducts((current) => [...current.filter((item) => item.id !== product.id), product].sort((a, b) => a.name.localeCompare(b.name, "es")));
    setProductId(product.id);
    productCreated(product);
    setShowProduct(false);
  }

  return <>
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !busy && close()}>
      <form onSubmit={submit} className="surface max-h-[92vh] w-full max-w-xl overflow-y-auto p-5 sm:p-6">
        <div className="mb-6 flex items-start justify-between"><div><p className="eyebrow mb-1">Stock del local</p><h2 className="text-2xl font-black">Ingresar mercadería</h2><p className="mt-2 text-sm text-[#84918b]">La existencia se actualizará al confirmar.</p></div><button type="button" disabled={busy} onClick={close} className="rounded-xl border border-line p-2 text-[#89968f] disabled:opacity-40"><X className="h-4 w-4" /></button></div>
        <div className="space-y-4">
          <div className="block"><div className="mb-2 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-semibold text-[#9ba8a2]"><Truck className="h-3.5 w-3.5" />Proveedor *</span><button type="button" onClick={() => setShowSupplier(true)} className="flex items-center gap-1.5 rounded-lg border border-mint/25 bg-mint/5 px-2.5 py-1.5 text-xs font-bold text-mint transition hover:bg-mint/10"><Plus className="h-3.5 w-3.5" />Nuevo proveedor</button></div><select required className="field" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}><option value="">Seleccionar proveedor…</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div>
          <div className="block"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-semibold text-[#9ba8a2]">Producto *</span>{canCreateProduct && <button type="button" onClick={() => setShowProduct(true)} className="flex items-center gap-1.5 rounded-lg border border-mint/25 bg-mint/5 px-2.5 py-1.5 text-xs font-bold text-mint transition hover:bg-mint/10"><Plus className="h-3.5 w-3.5" />Nuevo producto</button>}</div><select required className="field" value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Seleccionar producto…</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></div>
          <label className="block"><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Cantidad *</span><div className="relative"><input required type="number" min="0.001" step="0.001" className="field pr-28" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="0" />{selectedProduct && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#6f7c76]">{unitLabels[selectedProduct.unit] ?? selectedProduct.unit}</span>}</div></label>
          <label className="block"><span className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#9ba8a2]"><CalendarDays className="h-3.5 w-3.5" />Fecha automática</span><div className="field cursor-default bg-ink text-[#8f9c95]">{automaticDate.toLocaleString("es-AR", { dateStyle: "full", timeStyle: "short" })}</div></label>
          <label className="block"><span className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#9ba8a2]"><UserRound className="h-3.5 w-3.5" />Quién ingresa la mercadería *</span><select required className="field" value={receivedByUserId} onChange={(event) => setReceivedByUserId(event.target.value)}><option value="">Seleccionar persona…</option>{options.users.map((user) => <option key={user.id} value={user.id}>{user.displayName} · {user.role.name}</option>)}</select></label>
        </div>
        {products.length === 0 && <div className="mt-4 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">No hay productos activos con control directo de stock.</div>}
        {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-[#ffb4a5]">{error}</div>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={close} className="button-secondary">Cancelar</button><button disabled={busy || products.length === 0} className="button-primary">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}{busy ? "Registrando…" : "Confirmar ingreso"}</button></div>
      </form>
    </div>
    {showSupplier && <SupplierModal close={() => setShowSupplier(false)} saved={addSupplier} />}
    {showProduct && <ReceiptProductModal categories={options.categories} close={() => setShowProduct(false)} saved={addProduct} />}
  </>;
}

function ReceiptHistoryModal({ close }: { close: () => void }) {
  const initialRange = useMemo(() => defaultReceiptRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [rows, setRows] = useState<ReceiptHistoryRow[]>([]);
  const [selected, setSelected] = useState<ReceiptHistoryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);

  const loadHistory = useCallback(async (fromValue: string, toValue: string) => {
    setLoading(true); setError(""); setSelected(null);
    try {
      const params = new URLSearchParams({ from: fromValue, to: toValue });
      const response = await fetch(`/api/stock/receipts/history?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudieron cargar los ingresos");
      setRows(payload.receipts ?? []);
      setHasMore(Boolean(payload.hasMore));
    } catch (caught) {
      setRows([]);
      setHasMore(false);
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar los ingresos");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadHistory(initialRange.from, initialRange.to); }, [initialRange, loadHistory]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3 backdrop-blur-sm sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-labelledby="receipt-history-title" className="surface flex h-[min(850px,94vh)] w-full max-w-7xl flex-col overflow-hidden">
        <header className="flex flex-wrap items-start gap-4 border-b border-line p-4 sm:px-6 sm:py-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-mint/10 text-mint"><CalendarDays className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="eyebrow mb-1">Trazabilidad de stock</p><h2 id="receipt-history-title" className="text-2xl font-black">Ingresos de mercadería</h2><p className="mt-1 text-xs text-[#7d8a84]">Buscá por fecha y seleccioná un ingreso para consultar todos sus datos.</p></div>
          <button type="button" onClick={close} className="rounded-xl border border-line p-2.5 text-[#89968f] hover:text-cream"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={(event) => { event.preventDefault(); loadHistory(from, to); }} className="flex flex-wrap items-end gap-3 border-b border-line bg-[#151e1b] p-4 sm:px-6">
          <label className="min-w-[170px] flex-1 sm:max-w-[230px]"><span className="mb-1.5 block text-xs font-semibold text-[#909d96]">Desde</span><input required type="date" className="field py-2.5" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label className="min-w-[170px] flex-1 sm:max-w-[230px]"><span className="mb-1.5 block text-xs font-semibold text-[#909d96]">Hasta</span><input required type="date" className="field py-2.5" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <button type="submit" disabled={loading || !from || !to} className="button-primary min-w-32">{loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Buscar</button>
          <p className="pb-2 text-xs font-semibold text-[#7b8882] sm:ml-auto">{loading ? "Buscando…" : `${rows.length.toLocaleString("es-AR")} ingresos encontrados`}</p>
        </form>

        {error && <div className="mx-4 mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-[#ffb4a5] sm:mx-6">{error}</div>}
        {hasMore && <div className="mx-4 mt-4 rounded-xl border border-amber/25 bg-amber/10 px-4 py-3 text-xs font-semibold text-amber sm:mx-6">Se muestran los 500 ingresos más recientes del período. Acortá el rango para consultar el resto.</div>}

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_370px]">
          <section className="min-h-0 overflow-auto lg:border-r lg:border-line">
            <table className="w-full min-w-[760px] text-left">
              <thead className="sticky top-0 z-10 bg-[#141d1a] text-[10px] font-bold uppercase tracking-[.12em] text-[#718078]"><tr><th className="px-5 py-3">Fecha</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3 text-right">Cantidad</th><th className="w-12 px-3 py-3" /></tr></thead>
              <tbody className="divide-y divide-line">{loading ? <tr><td colSpan={5} className="px-5 py-16 text-center text-sm text-[#74817b]">Buscando ingresos…</td></tr> : rows.length === 0 ? <tr><td colSpan={5} className="px-5 py-16 text-center"><PackagePlus className="mx-auto h-8 w-8 text-[#4e5b55]" /><p className="mt-3 text-sm font-bold">No hay ingresos en este período</p><p className="mt-1 text-xs text-[#6f7c76]">Probá con un rango de fechas más amplio.</p></td></tr> : rows.map((row) => <tr key={row.id} tabIndex={0} onClick={() => setSelected(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(row); } }} className={`cursor-pointer transition hover:bg-[#1c2723] focus:outline-none ${selected?.id === row.id ? "bg-amber/5" : ""}`}><td className="whitespace-nowrap px-5 py-4 text-xs text-[#8b9892]">{receiptDateTime.format(new Date(row.createdAt))}</td><td className="px-4 py-4"><p className="max-w-[260px] truncate text-sm font-bold">{row.product.name}</p><p className="mt-1 text-[10px] text-[#6f7c76]">SKU {row.product.sku ?? "—"}</p></td><td className="px-4 py-4 text-sm text-[#a1ada7]">{row.supplier?.name ?? "Sin proveedor"}</td><td className="px-4 py-4 text-right text-base font-black text-mint">+{Number(row.quantity).toLocaleString("es-AR")}</td><td className="px-3 py-4"><ChevronRight className="h-4 w-4 text-[#65726c]" /></td></tr>)}</tbody>
            </table>
          </section>

          <aside className="min-h-0 overflow-y-auto bg-[#151e1b] p-5">
            {!selected ? <div className="grid h-full min-h-64 place-items-center text-center"><div><History className="mx-auto h-8 w-8 text-[#4f5c56]" /><p className="mt-3 text-sm font-black">Seleccioná un ingreso</p><p className="mx-auto mt-1 max-w-[230px] text-xs leading-relaxed text-[#6f7c76]">Acá vas a ver el proveedor, producto, cantidades y responsable.</p></div></div> : <div><p className="eyebrow mb-1">Detalle del ingreso</p><h3 className="text-xl font-black">{selected.product.name}</h3><p className="mt-1 text-xs text-[#7a8781]">{receiptDateTime.format(new Date(selected.createdAt))}</p><div className="mt-5 rounded-2xl border border-mint/20 bg-mint/5 p-4"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#739181]">Cantidad ingresada</p><p className="mt-1 text-3xl font-black text-mint">+{Number(selected.quantity).toLocaleString("es-AR")} <span className="text-sm">{unitLabels[selected.product.unit] ?? selected.product.unit}</span></p><p className="mt-2 text-xs text-[#829089]">Stock: {Number(selected.previousQty).toLocaleString("es-AR")} → {Number(selected.newQty).toLocaleString("es-AR")}</p></div><div className="mt-5 space-y-4"><ReceiptDetail label="Proveedor" value={selected.supplier?.name ?? "Sin proveedor"} /><ReceiptDetail label="CUIT" value={selected.supplier?.taxId || "No informado"} /><ReceiptDetail label="Producto / SKU" value={`${selected.product.name} · ${selected.product.sku ?? "Sin SKU"}`} /><ReceiptDetail label="Código de barras" value={selected.product.barcode || "No informado"} /><ReceiptDetail label="Responsable" value={selected.user ? `${selected.user.displayName} · ${selected.user.username}` : "Sistema"} /><ReceiptDetail label="Ubicación" value={selected.warehouse.name} /><ReceiptDetail label="Motivo registrado" value={selected.reason} /></div></div>}
          </aside>
        </div>
      </div>
    </div>
  );
}

function ReceiptDetail({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-line pb-3 last:border-0"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#69766f]">{label}</p><p className="mt-1 text-sm font-semibold leading-relaxed text-[#dce2dd]">{value}</p></div>;
}

export default function StockPage() {
  const { permissions } = useAppUser();
  const [warehouseId, setWarehouseId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Product | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showReceiptHistory, setShowReceiptHistory] = useState(false);
  const [receiptOptions, setReceiptOptions] = useState<ReceiptOptions>({ products: [], users: [], suppliers: [], categories: [], currentUserId: "" });
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/warehouses").then((response) => response.json()).then((warehouseData) => {
      const warehouse = (warehouseData.warehouses ?? []).find((item: { isDefault: boolean }) => item.isDefault) ?? warehouseData.warehouses?.[0];
      setWarehouseId(warehouse?.id ?? "");
    });
  }, []);

  const load = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/stock?warehouseId=${warehouseId}&q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar el stock");
      setProducts(payload.products ?? []); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar el stock"); }
    finally { setLoading(false); }
  }, [query, warehouseId]);

  const loadReceiptOptions = useCallback(async () => {
    setReceiptLoading(true);
    try {
      const response = await fetch("/api/stock/receipts", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo preparar el ingreso");
      setReceiptOptions(payload);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo preparar el ingreso"); }
    finally { setReceiptLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const canAdjust = permissions.includes("stock.adjust");
  const canCreateProduct = permissions.includes("products.write");
  useEffect(() => { if (canAdjust) loadReceiptOptions(); }, [canAdjust, loadReceiptOptions]);
  useEffect(() => { const refresh = (event: Event) => { const type = (event as CustomEvent<{ type?: string }>).detail?.type; if (type?.startsWith("stock.")) load(); if (type === "categories.changed" || type === "suppliers.changed") loadReceiptOptions(); }; window.addEventListener("quercus:update", refresh); return () => window.removeEventListener("quercus:update", refresh); }, [load, loadReceiptOptions]);

  const critical = useMemo(() => products.filter((product) => { const row = product.stocks[0]; return row && Number(row.quantity) <= Number(row.minimum); }).length, [products]);

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow mb-2">Inventario</p><h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Stock</h1><p className="mt-2 text-sm text-[#8f9d96]">Existencias del local e historial completo de movimientos.</p></div><div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => setShowReceiptHistory(true)} className="button-secondary"><CalendarDays className="h-4 w-4" />Historial de ingresos</button>{canAdjust && <button type="button" disabled={receiptLoading} onClick={() => setShowReceipt(true)} className="button-primary">{receiptLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}Ingresar mercadería</button>}<div className="surface-soft flex items-center gap-3 px-4 py-3"><TriangleAlert className={`h-5 w-5 ${critical ? "text-danger" : "text-mint"}`} /><div><p className="text-[10px] uppercase tracking-wider text-[#78857f]">Stock crítico</p><p className="text-lg font-black">{critical}</p></div></div></div></div>
      <form onSubmit={(event) => { event.preventDefault(); load(); }} className="relative mb-4 w-full max-w-xl"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#68756f]" /><input className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre por partes, SKU o código de barras…" /></form>
      {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-[#ffb4a5]"><span>{error}</span><button type="button" onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
      <div className="table-wrap overflow-x-auto"><table className="w-full min-w-[680px] text-left"><thead className="border-b border-line bg-[#141d1a] text-[10px] font-bold uppercase tracking-[.14em] text-[#6f7d76]"><tr><th className="px-5 py-4">Producto</th><th className="px-4 py-4 text-right">Actual</th><th className="px-4 py-4 text-right">Mínimo</th><th className="px-5 py-4">Estado</th></tr></thead><tbody className="divide-y divide-line">{loading ? <tr><td colSpan={4} className="px-5 py-16 text-center text-sm text-[#74817b]">Actualizando existencias…</td></tr> : products.map((product) => { const row = product.stocks[0]; const quantity = Number(row?.quantity ?? 0); const minimum = Number(row?.minimum ?? 0); const isCritical = quantity <= minimum; return <tr key={product.id} tabIndex={0} onClick={() => setHistory(product)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setHistory(product); } }} className="cursor-pointer transition hover:bg-[#1c2723] focus:bg-[#1c2723] focus:outline-none" title="Ver historial"><td className="px-5 py-4"><div className="flex items-start gap-3"><History className="mt-1 h-4 w-4 shrink-0 text-[#65736c]" /><div><p className="font-bold">{product.name}</p><p className="mt-1 text-xs text-[#6e7b75]">{product.sku ?? "Sin SKU"} · {unitLabels[product.unit] ?? product.unit}</p></div></div></td><td className="px-4 py-4 text-right text-lg font-black">{quantity.toLocaleString("es-AR")}</td><td className="px-4 py-4 text-right text-sm text-[#929f99]">{minimum.toLocaleString("es-AR")}</td><td className="px-5 py-4"><span className={`pill ${isCritical ? "border-danger/25 bg-danger/10 text-danger" : "border-mint/20 bg-mint/10 text-mint"}`}>{isCritical ? "Crítico" : "Correcto"}</span></td></tr>; })}</tbody></table></div>
      {products.length === 0 && !loading && <div className="surface mt-4 p-10 text-center text-sm text-[#76837d]">No hay artículos con control de stock para mostrar.</div>}
      {showReceipt && <ReceiptModal options={receiptOptions} canCreateProduct={canCreateProduct} close={() => setShowReceipt(false)} saved={() => { load(); loadReceiptOptions(); }} supplierCreated={(supplier) => setReceiptOptions((current) => ({ ...current, suppliers: [...current.suppliers.filter((item) => item.id !== supplier.id), supplier].sort((a, b) => a.name.localeCompare(b.name, "es")) }))} productCreated={(product) => { setReceiptOptions((current) => ({ ...current, products: [...current.products.filter((item) => item.id !== product.id), product].sort((a, b) => a.name.localeCompare(b.name, "es")) })); load(); }} />}
      {showReceiptHistory && <ReceiptHistoryModal close={() => setShowReceiptHistory(false)} />}
      {history && <HistoryModal product={history} close={() => setHistory(null)} />}
    </div>
  );
}
