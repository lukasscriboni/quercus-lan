"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Boxes, ChevronLeft, ChevronRight, FileUp, History, LoaderCircle, PackagePlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useAppUser } from "@/components/app-shell";
import { ProductSearchModeControl, useProductSearchMode } from "@/components/product-search-mode";
import { isValidProductPrice } from "@/lib/pricing-rules";

type Category = { id: string; name: string; _count: { products: number } };
type Supplier = { id: string; name: string };
type KitchenStation = { id: string; name: string; type: "BAR" | "KITCHEN" | "OTHER" };
type Product = { id: string; name: string; sku: string | null; barcode: string | null; price: string; cost: string; taxRate: string; stockMode: string; unit: string; isActive: boolean; version: number; category: { id: string; name: string } | null; kitchenStation: KitchenStation | null; stocks: { quantity: string; minimum: string; warehouseId: string }[] };
type Pagination = { page: number; pageSize: number; total: number; pages: number };
type StockMovement = { id: string; type: string; quantity: string; previousQty: string; newQty: string; reason: string; createdAt: string; warehouse: { name: string }; user: { displayName: string } | null };
const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });

function ProductModal({ product, categories, stations, canWrite, canAdjustStock, warehouseId, close, saved }: { product: Product | null; categories: Category[]; stations: KitchenStation[]; canWrite: boolean; canAdjustStock: boolean; warehouseId: string; close: () => void; saved: () => void }) {
  const editing = Boolean(product);
  const currentStock = product?.stocks.find((row) => row.warehouseId === warehouseId)?.quantity ?? product?.stocks[0]?.quantity ?? "0";
  const currentMinimum = product?.stocks.find((row) => row.warehouseId === warehouseId)?.minimum ?? product?.stocks[0]?.minimum ?? "0";
  const [form, setForm] = useState({
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? "",
    categoryId: product?.category?.id ?? "",
    kitchenStationId: product?.kitchenStation?.id ?? "",
    price: product?.price ?? "",
    cost: product?.cost ?? "",
    taxRate: product?.taxRate ?? "21",
    stockMode: product?.stockMode ?? "DIRECT",
    unit: product?.unit ?? "UNIT",
    isActive: product?.isActive ?? true,
    stockQuantity: currentStock,
    stockMinimum: currentMinimum,
  });
  const [stockDirty, setStockDirty] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showMovements, setShowMovements] = useState(false);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  useEffect(() => { if (form.categoryId && !categories.some((category) => category.id === form.categoryId)) setForm((current) => ({ ...current, categoryId: "" })); }, [categories, form.categoryId]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    if (!isValidProductPrice(Number(form.price))) { setError("El precio debe ser un múltiplo de $100"); return; }
    setBusy(true); setError("");
    try {
      const { stockQuantity, stockMinimum, ...productForm } = form;
      const body = { ...productForm, stockMode: stockDirty ? "DIRECT" : productForm.stockMode, price: Number(form.price), cost: Number(form.cost || 0), taxRate: Number(form.taxRate || 0), ...(product ? { version: product.version } : {}), ...(editing && canAdjustStock && stockDirty ? { stockQuantity: Number(stockQuantity || 0), stockMinimum: Number(stockMinimum || 0) } : {}) };
      const response = await fetch(product ? `/api/products/${product.id}` : "/api/products", { method: product ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      saved(); close();
    } catch (caught) { setError(caught instanceof Error ? caught.message : `No se pudo ${editing ? "guardar" : "crear"}`); }
    finally { setBusy(false); }
  }
  async function toggleMovements() {
    const next = !showMovements; setShowMovements(next);
    if (!next || !product || movements.length) return;
    setMovementsLoading(true);
    try { const response = await fetch(`/api/stock/movements?productId=${product.id}`, { cache: "no-store" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setMovements(payload.movements ?? []); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar el registro"); }
    finally { setMovementsLoading(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <form onSubmit={submit} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} className="surface max-h-[90vh] w-full max-w-2xl overflow-y-auto p-5 sm:p-6">
        <div className="mb-6 flex items-start justify-between"><div><p className="eyebrow mb-1">{editing ? "Ficha del producto" : "Alta manual"}</p><h2 className="text-2xl font-black">{editing ? product?.name : "Nuevo producto"}</h2>{editing && <p className={`mt-2 text-xs font-bold ${form.isActive ? "text-mint" : "text-danger"}`}>{form.isActive ? "Producto activo" : "Producto inactivo"}</p>}</div><button type="button" disabled={busy} onClick={close} className="rounded-xl border border-line p-2 text-[#929292] hover:text-cream disabled:opacity-40"><X className="h-4 w-4" /></button></div>
        <fieldset disabled={!canWrite || busy} className="grid gap-4 disabled:opacity-75 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Nombre *</span><input required className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej. Cerveza lager 473 ml" /></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">SKU</span><input className="field" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="BEB-001" /></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Código de barras</span><input className="field" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Categoría</span><select className="field" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}><option value="">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Estado</span><select className="field" value={form.isActive ? "ACTIVE" : "INACTIVE"} onChange={(e) => setForm({ ...form, isActive: e.target.value === "ACTIVE" })}><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></select></label>
          <label className="sm:col-span-2"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Destino automático del producto</span><select className="field" value={form.kitchenStationId} onChange={(e) => setForm({ ...form, kitchenStationId: e.target.value })}><option value="">Sin destino automático</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name === "COCINA" ? "Enviar automáticamente a Cocina" : station.name === "BAR" ? "Enviar automáticamente a Barra" : `Enviar automáticamente a ${station.name}`}</option>)}</select><span className="mt-1.5 block text-[10px] text-[#787878]">Al agregar este producto a una mesa, venta o cuenta corriente, se enviará automáticamente al destino seleccionado. Si no elegís uno, se podrá enviar manualmente.</span></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Modo de stock</span><select className="field" value={form.stockMode} onChange={(e) => setForm({ ...form, stockMode: e.target.value })}><option value="DIRECT">Directo</option><option value="RECIPE">Por receta</option><option value="NONE">Sin control</option></select></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Unidad</span><select className="field" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}><option value="UNIT">Unidad</option><option value="GRAM">Gramo</option><option value="KILOGRAM">Kilogramo</option><option value="MILLILITER">Mililitro</option><option value="LITER">Litro</option></select></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Precio * (múltiplos de $100)</span><input required type="number" min="0" step="100" className="field" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Costo</span><input type="number" min="0" step="0.01" className="field" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></label>
          <label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">IVA (%)</span><input type="number" min="0" max="100" step="0.01" className="field" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} /></label>
          {editing && <><label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Existencia actual</span><input disabled={!canAdjustStock} type="number" min="0" step="0.001" className="field" value={form.stockQuantity} onChange={(e) => { setStockDirty(true); setForm({ ...form, stockQuantity: e.target.value, stockMode: "DIRECT" }); }} />{!canAdjustStock ? <span className="mt-1.5 block text-[10px] text-[#787878]">Tu perfil no permite modificar existencias.</span> : product?.stockMode !== "DIRECT" && !stockDirty ? <span className="mt-1.5 block text-[10px] text-amber">Al modificar este valor se activará el control directo.</span> : null}</label><label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Existencia mínima</span><input disabled={!canAdjustStock} type="number" min="0" step="0.001" className="field" value={form.stockMinimum} onChange={(e) => { setStockDirty(true); setForm({ ...form, stockMinimum: e.target.value, stockMode: "DIRECT" }); }} /><span className="mt-1.5 block text-[10px] text-[#787878]">Se marcará como crítico al llegar a este valor.</span></label></>}
        </fieldset>
        {editing && <section className="mt-5 overflow-hidden rounded-xl border border-line bg-[#111]">
          <button type="button" onClick={toggleMovements} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#222]"><History className="h-4 w-4 text-[#aaa]" /><span className="flex-1 text-sm font-bold">Registro de mercadería y movimientos</span><ChevronRight className={`h-4 w-4 text-[#777] transition ${showMovements ? "rotate-90" : ""}`} /></button>
          {showMovements && <div className="max-h-64 overflow-y-auto border-t border-line">{movementsLoading ? <div className="flex items-center justify-center gap-2 py-8 text-sm text-[#777]"><LoaderCircle className="h-4 w-4 animate-spin" />Cargando registro…</div> : movements.length === 0 ? <p className="py-8 text-center text-sm text-[#777]">Este producto todavía no tiene movimientos.</p> : <table className="w-full min-w-[560px] text-left"><thead className="sticky top-0 bg-[#181818] text-[10px] uppercase text-[#777]"><tr><th className="px-4 py-2">Fecha</th><th className="px-3 py-2">Detalle</th><th className="px-3 py-2 text-right">Movimiento</th><th className="px-4 py-2 text-right">Existencia</th></tr></thead><tbody className="divide-y divide-line">{movements.map((movement) => <tr key={movement.id}><td className="whitespace-nowrap px-4 py-3 text-xs text-[#888]">{new Date(movement.createdAt).toLocaleString("es-AR")}</td><td className="px-3 py-3"><p className="text-xs font-bold">{movement.reason}</p><p className="mt-1 text-[10px] text-[#777]">{movement.user?.displayName ?? "Sistema"} · {movement.warehouse.name}</p></td><td className={`px-3 py-3 text-right text-sm font-black ${Number(movement.quantity) >= 0 ? "text-mint" : "text-danger"}`}>{Number(movement.quantity) > 0 ? "+" : ""}{Number(movement.quantity).toLocaleString("es-AR")}</td><td className="px-4 py-3 text-right text-xs text-[#999]">{Number(movement.previousQty).toLocaleString("es-AR")} → {Number(movement.newQty).toLocaleString("es-AR")}</td></tr>)}</tbody></table>}</div>}
        </section>}
        {!canWrite && <div className="mt-4 rounded-xl border border-line bg-ink px-4 py-3 text-sm text-[#989898]">Tenés permiso para ver esta ficha, pero no para modificarla.</div>}
        {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-[#ffb4a5]">{error}</div>}
        <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={close} className="button-secondary">{canWrite ? "Cancelar" : "Cerrar"}</button>{canWrite && <button className="button-primary" disabled={busy}>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear producto"}</button>}</div>
      </form>
    </div>
  );
}

function CategoryPanel({ categories, refresh }: { categories: Category[]; refresh: (deletedId?: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);
  async function add(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const response = await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error);
    setName(""); refresh();
  }

  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true); setError("");
    try {
      const response = await fetch(`/api/categories/${pendingDelete.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo eliminar la categoría");
      const deletedId = pendingDelete.id;
      setPendingDelete(null);
      refresh(deletedId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo eliminar la categoría"); }
    finally { setDeleting(false); }
  }

  return <>
    <div className="surface mb-5 p-5"><div className="grid gap-5 lg:grid-cols-[1fr_360px]"><div><p className="eyebrow mb-2">Categorías</p><div className="flex flex-wrap gap-2">{categories.map((category) => <span key={category.id} className="pill gap-2 bg-ink text-[#b1b1b1]">{category.name}<span className="text-[#686868]">{category._count.products}</span><button type="button" onClick={() => setPendingDelete(category)} title={`Eliminar ${category.name}`} className="ml-1 rounded-md p-1 text-[#727272] transition hover:bg-danger/10 hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button></span>)}</div></div><form onSubmit={add} className="flex items-end gap-2"><label className="flex-1"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Nueva categoría</span><input className="field" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej. Vinos tintos" /></label><button className="button-secondary px-3" title="Agregar"><Plus className="h-4 w-4" /></button></form></div>{error && <p className="mt-3 text-xs text-danger">{error}</p>}</div>
    {pendingDelete && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !deleting && setPendingDelete(null)}><div className="surface w-full max-w-md p-5 sm:p-6"><div className="grid h-11 w-11 place-items-center rounded-xl bg-danger/10 text-danger"><Trash2 className="h-5 w-5" /></div><h3 className="mt-4 text-xl font-black">Eliminar {pendingDelete.name}</h3><p className="mt-2 text-sm leading-relaxed text-[#969696]">La categoría se eliminará. {pendingDelete._count.products > 0 ? `${pendingDelete._count.products.toLocaleString("es-AR")} productos quedarán como “Sin categoría”.` : "No tiene productos asociados."}</p><div className="mt-6 flex justify-end gap-3"><button type="button" disabled={deleting} onClick={() => setPendingDelete(null)} className="button-secondary">Cancelar</button><button type="button" disabled={deleting} onClick={remove} className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Trash2 className="h-4 w-4" />{deleting ? "Eliminando…" : "Eliminar categoría"}</button></div></div></div>}
  </>;
}

export default function ProductsPage() {
  const { permissions } = useAppUser();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 30, total: 0, pages: 1 });
  const [query, setQuery] = useState("");
  const searchMode = useProductSearchMode();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");
  const [showForm, setShowForm] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showCategories, setShowCategories] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadedOnce = useRef(false);
  const [error, setError] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const loadCategories = useCallback(async () => { const response = await fetch("/api/categories"); if (response.ok) setCategories((await response.json()).categories); }, []);
  const loadSuppliers = useCallback(async () => { const response = await fetch("/api/suppliers"); if (response.ok) setSuppliers((await response.json()).suppliers); }, []);
  const loadStations = useCallback(async () => { const response = await fetch("/api/kitchen/stations"); if (response.ok) setStations((await response.json()).stations); }, []);
  const load = useCallback(async (page = 1) => {
    if (!loadedOnce.current) setLoading(true);
    try { const response = await fetch(`/api/products?page=${page}&q=${encodeURIComponent(query)}&searchMode=${searchMode}&categoryId=${encodeURIComponent(categoryFilter)}&supplierId=${encodeURIComponent(supplierFilter)}&sortBy=${sortBy}&sortDirection=${sortDirection}`, { cache: "no-store" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); setProducts(payload.products); setPagination(payload.pagination); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar"); }
    finally { loadedOnce.current = true; setLoading(false); }
  }, [categoryFilter, query, searchMode, sortBy, sortDirection, supplierFilter]);
  useEffect(() => { load(); loadCategories(); loadSuppliers(); loadStations(); fetch("/api/warehouses").then((r) => r.json()).then((v) => { const warehouse = (v.warehouses ?? []).find((item: { isDefault: boolean }) => item.isDefault) ?? v.warehouses?.[0]; setWarehouseId(warehouse?.id ?? ""); }); }, [load, loadCategories, loadStations, loadSuppliers]);
  useEffect(() => { const refresh = (event: Event) => { const type = (event as CustomEvent<{ type?: string }>).detail?.type; load(pagination.page); if (type === "categories.changed") loadCategories(); if (type === "suppliers.changed") loadSuppliers(); }; window.addEventListener("quercus:update", refresh); return () => window.removeEventListener("quercus:update", refresh); }, [load, loadCategories, loadSuppliers, pagination.page]);
  useEffect(() => { if (categoryFilter && categoryFilter !== "UNCATEGORIZED" && !categories.some((category) => category.id === categoryFilter)) setCategoryFilter(""); }, [categories, categoryFilter]);
  const canWrite = permissions.includes("products.write");
  const canAdjustStock = permissions.includes("stock.adjust");
  const canImport = permissions.includes("products.import");
  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow mb-2">Catálogo</p><h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Productos</h1><p className="mt-2 text-sm text-[#999999]">Hacé clic en un producto para ver su ficha y modificarlo.</p></div><div className="flex flex-wrap gap-2">{canWrite && <button onClick={() => setShowCategories(!showCategories)} className="button-secondary"><Boxes className="h-4 w-4" />Categorías</button>}{canImport && <Link href="/products/import" className="button-secondary"><FileUp className="h-4 w-4" />Importar CSV</Link>}{canWrite && <button onClick={() => { setSelectedProduct(null); setShowForm(true); }} className="button-primary"><PackagePlus className="h-4 w-4" />Nuevo producto</button>}</div></div>
      {showCategories && <CategoryPanel categories={categories} refresh={(deletedId) => { loadCategories(); if (deletedId && categoryFilter === deletedId) setCategoryFilter(""); }} />}
      <div className="max-w-md"><ProductSearchModeControl mode={searchMode} /></div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div className="flex w-full flex-1 flex-wrap items-end gap-3"><form onSubmit={(e) => { e.preventDefault(); load(); }} className="relative w-full max-w-md"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717171]" /><input className="field pl-10" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={searchMode === "barcode" ? "Buscar productos por código de barras" : "Buscar productos por nombre"} placeholder={searchMode === "barcode" ? "Código de barras exacto…" : "Nombre del producto por partes…"} /></form><label className="w-full sm:w-60"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Filtrar por categoría</span><select className="field" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Todas las categorías</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}<option value="UNCATEGORIZED">Sin categoría</option></select></label><label className="w-full sm:w-60"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Filtrar por proveedor</span><select className="field" value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}><option value="">Todos los proveedores</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}<option value="UNASSIGNED">Sin proveedor</option></select></label><label className="w-full sm:w-44"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Ordenar por</span><select className="field" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="name">Alfabético</option><option value="stock">Stock</option><option value="price">Precio</option><option value="sku">SKU</option></select></label><label className="w-full sm:w-44"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Dirección</span><select className="field" value={sortDirection} onChange={(event) => setSortDirection(event.target.value)}>{sortBy === "name" || sortBy === "sku" ? <><option value="asc">A → Z</option><option value="desc">Z → A</option></> : <><option value="asc">Menor a mayor</option><option value="desc">Mayor a menor</option></>}</select></label></div><p className="pb-3 text-xs font-semibold text-[#7e7e7e]">{pagination.total.toLocaleString("es-AR")} productos</p></div>
      {error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-[#ffb4a5]">{error}</div>}
      <div className="table-wrap overflow-x-auto"><table className="w-full min-w-[920px] text-left"><thead className="border-b border-line bg-[#141414] text-[10px] font-bold uppercase tracking-[.14em] text-[#797979]"><tr><th className="px-5 py-4">Producto</th><th className="px-4 py-4">Categoría</th><th className="px-4 py-4">Comanda</th><th className="px-4 py-4">Stock</th><th className="px-4 py-4 text-right">Costo</th><th className="px-5 py-4 text-right">Precio</th></tr></thead><tbody className="divide-y divide-line">{loading ? <tr><td colSpan={6} className="px-5 py-16 text-center text-sm text-[#7d7d7d]">Cargando catálogo…</td></tr> : products.length === 0 ? <tr><td colSpan={6} className="px-5 py-16 text-center"><PackagePlus className="mx-auto mb-3 h-7 w-7 text-[#5c5c5c]" /><p className="font-bold">No hay productos para mostrar</p><p className="mt-1 text-sm text-[#7d7d7d]">Creá uno o importá tu archivo CSV.</p></td></tr> : products.map((product) => { const stock = product.stocks.reduce((sum, row) => sum + Number(row.quantity), 0); const open = () => { setSelectedProduct(product); setShowForm(true); }; return <tr key={product.id} tabIndex={0} onClick={open} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } }} className="cursor-pointer transition hover:bg-[#262626] focus:bg-[#262626] focus:outline-none" title={canWrite ? "Ver y editar producto" : "Ver producto"}><td className="px-5 py-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{product.name}</p><p className="mt-1 text-xs text-[#777777]">{product.sku ?? "Sin SKU"}{product.barcode ? ` · ${product.barcode}` : ""}</p></div>{canWrite && <Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-[#707070]" />}</div></td><td className="px-4 py-4"><span className="pill bg-ink text-[#aaaaaa]">{product.category?.name ?? "Sin categoría"}</span></td><td className="px-4 py-4"><span className={`pill ${product.kitchenStation ? "bg-amber/10 text-amber" : "bg-ink text-[#717171]"}`}>{product.kitchenStation?.name ?? "Sin comanda"}</span></td><td className="px-4 py-4"><p className="font-bold">{product.stockMode === "NONE" ? "—" : stock.toLocaleString("es-AR")}</p><p className="mt-1 text-[10px] uppercase tracking-wider text-[#707070]">{product.stockMode === "DIRECT" ? "Directo" : product.stockMode === "RECIPE" ? "Receta" : "Sin control"}</p></td><td className="px-4 py-4 text-right text-sm text-[#a4a4a4]">{money.format(Number(product.cost))}</td><td className="px-5 py-4 text-right font-black text-amber">{money.format(Number(product.price))}</td></tr>; })}</tbody></table></div>
      <div className="mt-4 flex items-center justify-between"><p className="text-xs text-[#797979]">Página {pagination.page} de {Math.max(1, pagination.pages)}</p><div className="flex gap-2"><button disabled={pagination.page <= 1 || loading} onClick={() => load(pagination.page - 1)} className="button-secondary px-3"><ChevronLeft className="h-4 w-4" /></button><button disabled={pagination.page >= pagination.pages || loading} onClick={() => load(pagination.page + 1)} className="button-secondary px-3"><ChevronRight className="h-4 w-4" /></button></div></div>
      {showForm && <ProductModal product={selectedProduct} categories={categories} stations={stations} canWrite={canWrite} canAdjustStock={canAdjustStock} warehouseId={warehouseId} close={() => { setShowForm(false); setSelectedProduct(null); }} saved={() => load(selectedProduct ? pagination.page : 1)} />}
    </div>
  );
}
