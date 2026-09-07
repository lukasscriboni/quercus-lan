"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CircleDollarSign,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  Minus,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckoutDrawer, type CheckoutInput, type CheckoutResult } from "@/components/cash/checkout-drawer";

type Register = { id: string; name: string };
type PaymentMethod = { id: string; name: string };
type Category = { id: string; name: string };
type CatalogProduct = { id: string; name: string; sku: string | null; price: string; categoryId: string | null; categoryName: string };
type CashMovement = {
  id: string;
  type: "OPENING" | "SALE" | "INCOME" | "EXPENSE" | "WITHDRAWAL" | "REFUND" | "CLOSING";
  amount: string;
  reason: string;
  createdAt: string;
  user: { displayName: string };
};
type OpenShift = {
  id: string;
  cashRegisterId: string;
  registerName: string;
  openingAmount: string;
  openedAt: string;
  version: number;
  openedBy: { displayName: string };
  salesTotal: string;
  cashSales: string;
  virtualSales: string;
  income: string;
  expenses: string;
  withdrawals: string;
  expectedCash: string;
  paymentBreakdown: { id: string; name: string; total: number; count: number }[];
  movements: CashMovement[];
};
type PendingOrder = {
  id: string;
  number: number;
  status: "OPEN" | "IN_PROGRESS" | "READY" | "BILL_REQUESTED";
  guestCount: number;
  subtotal: string;
  discount: string;
  total: string;
  version: number;
  openedAt: string;
  table: { id: string; name: string; sectorName: string } | null;
  items: { id: string; name: string; quantity: number; total: number }[];
};
type CashData = {
  branch: { id: string; name: string };
  registers: Register[];
  paymentMethods: PaymentMethod[];
  openShift: OpenShift | null;
  pendingOrders: PendingOrder[];
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const movementMeta: Record<CashMovement["type"], { label: string; className: string }> = {
  OPENING: { label: "Apertura", className: "text-[#9ca9a3]" },
  SALE: { label: "Venta", className: "text-mint" },
  INCOME: { label: "Ingreso", className: "text-mint" },
  EXPENSE: { label: "Gasto", className: "text-danger" },
  WITHDRAWAL: { label: "Retiro", className: "text-amber" },
  REFUND: { label: "Devolución", className: "text-danger" },
  CLOSING: { label: "Cierre", className: "text-[#9ca9a3]" },
};
const statusLabel: Record<PendingOrder["status"], string> = {
  OPEN: "Abierta",
  IN_PROGRESS: "En curso",
  READY: "Lista",
  BILL_REQUESTED: "Pide cuenta",
};

function balanceLabel(value: number) {
  if (Math.abs(value) < 0.005) return "Sin diferencia";
  return `${value < 0 ? "Faltante" : "Excedente"} ${money.format(Math.abs(value))}`;
}

function balanceClass(value: number) {
  if (Math.abs(value) < 0.005) return "text-mint";
  return value < 0 ? "text-danger" : "text-amber";
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "No se pudo completar la operación");
  return payload as T;
}

export default function CashPage() {
  const [data, setData] = useState<CashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [registerId, setRegisterId] = useState("");
  const [openingAmount, setOpeningAmount] = useState("0");
  const [movementType, setMovementType] = useState<"INCOME" | "EXPENSE" | "WITHDRAWAL">("INCOME");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [showMovement, setShowMovement] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [closingAmount, setClosingAmount] = useState("");
  const [virtualClosingAmount, setVirtualClosingAmount] = useState("");
  const [checkoutOrder, setCheckoutOrder] = useState<PendingOrder | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const payload = await request<CashData>("/api/cash", { cache: "no-store" });
      setData(payload);
      setRegisterId((current) => current || payload.registers[0]?.id || "");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar la caja");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (type === "cash.changed" || type === "orders.changed") load(true);
    };
    window.addEventListener("quercus:update", refresh);
    return () => window.removeEventListener("quercus:update", refresh);
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function openShift(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await request("/api/cash/shifts", { method: "POST", body: JSON.stringify({ cashRegisterId: registerId, openingAmount }) });
      setNotice("Turno de caja abierto"); await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo abrir la caja"); }
    finally { setBusy(false); }
  }

  async function addMovement(event: React.FormEvent) {
    event.preventDefault();
    if (!data?.openShift) return;
    setBusy(true); setError("");
    try {
      await request("/api/cash/movements", {
        method: "POST",
        body: JSON.stringify({ cashShiftId: data.openShift.id, shiftVersion: data.openShift.version, type: movementType, amount: movementAmount, reason: movementReason }),
      });
      setShowMovement(false); setMovementAmount(""); setMovementReason(""); setNotice("Movimiento registrado"); await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo registrar el movimiento"); await load(true); }
    finally { setBusy(false); }
  }

  async function closeShift(event: React.FormEvent) {
    event.preventDefault();
    if (!data?.openShift) return;
    setBusy(true); setError("");
    try {
      const payload = await request<{ shift: { cashDifference: string; virtualDifference: string; totalDifference: string; reportId: string } }>(`/api/cash/shifts/${data.openShift.id}/close`, {
        method: "PUT",
        body: JSON.stringify({ version: data.openShift.version, closingAmount, virtualClosingAmount }),
      });
      setShowClose(false); setClosingAmount(""); setVirtualClosingAmount(""); setNotice(`Caja cerrada · reporte generado · ${balanceLabel(Number(payload.shift.totalDifference))}`); await load(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cerrar la caja"); await load(true); }
    finally { setBusy(false); }
  }

  async function payOrder(order: PendingOrder, input: CheckoutInput): Promise<CheckoutResult> {
    if (!data?.openShift) throw new Error("No hay un turno de caja abierto");
    try {
      const payload = await request<{ order: { id: string }; payment: { paymentMethod: string } }>(`/api/orders/${order.id}/pay`, {
        method: "POST",
        body: JSON.stringify({
          orderVersion: order.version,
          cashShiftId: data.openShift.id,
          paymentMethodId: input.paymentMethodId,
          discountType: input.discountType,
          discountValue: input.discountValue,
        }),
      });
      setCheckoutOrder(null);
      setNotice(`${order.table?.name ?? `Pedido #${order.number}`} cobrada con ${payload.payment.paymentMethod}`);
      await load(true);
      return { receiptId: payload.order.id };
    } catch (caught) {
      await load(true);
      throw caught instanceof Error ? caught : new Error("No se pudo cobrar la cuenta");
    }
  }

  const requestedOrders = useMemo(() => data?.pendingOrders.filter((order) => order.status === "BILL_REQUESTED") ?? [], [data?.pendingOrders]);
  const otherOrders = useMemo(() => data?.pendingOrders.filter((order) => order.status !== "BILL_REQUESTED") ?? [], [data?.pendingOrders]);

  if (loading) return <div className="grid min-h-[60vh] place-items-center"><LoaderCircle className="h-8 w-8 animate-spin text-amber" /></div>;

  return (
    <div className="mx-auto max-w-[1500px]">
      {notice && <div className="fixed right-5 top-5 z-50 rounded-xl border border-mint/30 bg-[#173128] px-4 py-3 text-sm font-bold text-mint shadow-2xl">{notice}</div>}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow mb-2">Turnos, cobros y efectivo</p><h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Caja</h1><p className="mt-2 text-sm text-[#8f9d96]">Conectada con las cuentas del salón y guardada en el servidor local.</p></div>
        <button type="button" onClick={() => load()} disabled={busy} className="button-secondary"><RefreshCcw className="h-4 w-4" />Actualizar</button>
      </div>

      {error && <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-[#ffb4a5]"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}

      {!data?.openShift ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="surface grid min-h-[420px] place-items-center p-8 text-center"><div><div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-line bg-ink text-amber"><LockKeyhole className="h-8 w-8" /></div><h2 className="mt-5 text-2xl font-black">La caja está cerrada</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#87948d]">Abrí un turno para cobrar las mesas, registrar ingresos o gastos y controlar el efectivo.</p></div></div>
          <form onSubmit={openShift} className="surface h-fit p-5 sm:p-6">
            <p className="eyebrow mb-1">Inicio de jornada</p><h2 className="text-xl font-black">Abrir turno</h2>
            <label className="mt-5 block"><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Caja</span><select className="field" required value={registerId} onChange={(event) => setRegisterId(event.target.value)}>{data?.registers.map((register) => <option key={register.id} value={register.id}>{register.name}</option>)}</select></label>
            <label className="mt-4 block"><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Efectivo inicial</span><input type="number" min="0" step="0.01" required className="field" value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} /></label>
            <button disabled={busy || !registerId} className="button-primary mt-6 w-full">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}Abrir caja</button>
          </form>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-mint/25 bg-mint/5 p-4">
            <div className="flex items-center gap-3"><span className="live-dot h-3 w-3 rounded-full bg-mint" /><div><p className="font-black">{data.openShift.registerName} · turno abierto</p><p className="mt-0.5 text-xs text-[#7f8c85]">Desde {dateTime.format(new Date(data.openShift.openedAt))} · {data.openShift.openedBy.displayName}</p></div></div>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setShowMovement(true)} className="button-secondary"><CircleDollarSign className="h-4 w-4" />Nuevo movimiento</button><button type="button" onClick={() => { setClosingAmount(""); setVirtualClosingAmount(""); setShowClose(true); }} className="button-secondary text-amber"><LockKeyhole className="h-4 w-4" />Cerrar caja</button></div>
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Ventas del turno" value={data.openShift.salesTotal} icon={ReceiptText} />
            <SummaryCard label="Ventas en efectivo" value={data.openShift.cashSales} icon={Banknote} />
            <SummaryCard label="Ingresos y gastos" value={Number(data.openShift.income) - Number(data.openShift.expenses) - Number(data.openShift.withdrawals)} icon={ArrowDownToLine} />
            <SummaryCard label="Efectivo esperado" value={data.openShift.expectedCash} icon={ShieldCheck} highlight />
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,.65fr)]">
            <section className="surface overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><p className="eyebrow mb-1">Salón</p><h2 className="text-xl font-black">Cuentas para cobrar</h2></div><span className="pill bg-amber/10 text-amber">{requestedOrders.length} solicitadas</span></div>
              <div className="p-3 sm:p-4">
                {requestedOrders.length === 0 ? <div className="py-12 text-center"><ReceiptText className="mx-auto h-8 w-8 text-[#4e5b55]" /><p className="mt-3 text-sm font-bold">No hay mesas esperando el cobro</p><p className="mt-1 text-xs text-[#6f7c76]">Cuando una mesa solicite la cuenta aparecerá automáticamente.</p></div> : <div className="space-y-2">{requestedOrders.map((order) => <OrderRow key={order.id} order={order} disabled={busy} pay={() => setCheckoutOrder(order)} />)}</div>}
              </div>
              {otherOrders.length > 0 && <div className="border-t border-line px-5 py-4"><p className="mb-3 text-[10px] font-bold uppercase tracking-[.15em] text-[#6d7a74]">Otras cuentas abiertas</p><div className="flex flex-wrap gap-2">{otherOrders.map((order) => <span key={order.id} className="rounded-xl border border-line bg-ink px-3 py-2 text-xs text-[#87948d]"><strong className="text-cream">{order.table?.name ?? `#${order.number}`}</strong> · {statusLabel[order.status]} · {money.format(Number(order.total))}</span>)}</div></div>}
            </section>

            <section className="surface overflow-hidden">
              <div className="border-b border-line px-5 py-4"><p className="eyebrow mb-1">Trazabilidad</p><h2 className="text-xl font-black">Movimientos recientes</h2></div>
              <div className="max-h-[520px] overflow-y-auto p-3">{data.openShift.movements.length === 0 ? <p className="py-10 text-center text-sm text-[#74817b]">Todavía no hay movimientos.</p> : data.openShift.movements.map((movement) => <div key={movement.id} className="flex items-center gap-3 border-b border-line/70 px-2 py-3 last:border-0"><div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink ${movementMeta[movement.type].className}`}>{movement.type === "EXPENSE" || movement.type === "WITHDRAWAL" ? <ArrowUpFromLine className="h-4 w-4" /> : <ArrowDownToLine className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{movement.reason}</p><p className="mt-0.5 text-[10px] text-[#6e7b75]">{movementMeta[movement.type].label} · {dateTime.format(new Date(movement.createdAt))} · {movement.user.displayName}</p></div><p className={`shrink-0 text-sm font-black ${movementMeta[movement.type].className}`}>{["EXPENSE", "WITHDRAWAL", "REFUND"].includes(movement.type) ? "−" : "+"}{money.format(Number(movement.amount))}</p></div>)}</div>
            </section>
          </div>
        </>
      )}

      {showMovement && data?.openShift && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !busy && setShowMovement(false)}><form onSubmit={addMovement} className="surface w-full max-w-md p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="eyebrow mb-1">Caja abierta</p><h2 className="text-2xl font-black">Nuevo movimiento</h2></div><button type="button" disabled={busy} onClick={() => setShowMovement(false)} className="rounded-xl border border-line p-2 text-[#89968f]"><X className="h-4 w-4" /></button></div><label className="mt-5 block"><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Tipo</span><select className="field" value={movementType} onChange={(event) => setMovementType(event.target.value as typeof movementType)}><option value="INCOME">Ingreso de efectivo</option><option value="EXPENSE">Gasto</option><option value="WITHDRAWAL">Retiro de efectivo</option></select></label><label className="mt-4 block"><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Monto</span><input autoFocus type="number" min="0.01" step="0.01" required className="field" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} /></label><label className="mt-4 block"><span className="mb-2 block text-xs font-semibold text-[#9ba8a2]">Motivo</span><input required minLength={3} maxLength={200} className="field" value={movementReason} onChange={(event) => setMovementReason(event.target.value)} placeholder="Ej. Pago a proveedor" /></label><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setShowMovement(false)} className="button-secondary">Cancelar</button><button disabled={busy} className="button-primary">{busy && <LoaderCircle className="h-4 w-4 animate-spin" />}Registrar</button></div></form></div>}

      {checkoutOrder && data?.openShift && <CheckoutDrawer title={checkoutOrder.table?.name ?? `Pedido #${checkoutOrder.number}`} subtitle={`${checkoutOrder.table?.sectorName ?? "Mostrador"} · Pedido #${checkoutOrder.number}`} subtotal={Number(checkoutOrder.subtotal)} methods={data.paymentMethods} items={checkoutOrder.items} close={() => setCheckoutOrder(null)} confirm={(input) => payOrder(checkoutOrder, input)} />}

      {showClose && data?.openShift && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !busy && setShowClose(false)}>
          <form onSubmit={closeShift} className="surface max-h-[92vh] w-full max-w-lg overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between">
              <div><p className="eyebrow mb-1">Fin de turno</p><h2 className="text-2xl font-black">Cerrar caja</h2></div>
              <button type="button" disabled={busy} onClick={() => setShowClose(false)} className="rounded-xl border border-line p-2 text-[#89968f]"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-ink p-3">
                <p className="text-[11px] font-semibold text-[#7d8a84]">Ventas en efectivo</p>
                <p className="mt-1 text-lg font-black text-mint">{money.format(Number(data.openShift.cashSales))}</p>
              </div>
              <div className="rounded-xl border border-line bg-ink p-3">
                <p className="text-[11px] font-semibold text-[#7d8a84]">Ventas virtuales</p>
                <p className="mt-1 text-lg font-black text-sky-300">{money.format(Number(data.openShift.virtualSales))}</p>
              </div>
              <div className="rounded-xl border border-amber/30 bg-amber/5 p-3">
                <p className="text-[11px] font-semibold text-[#9c8b69]">Total vendido</p>
                <p className="mt-1 text-lg font-black text-amber">{money.format(Number(data.openShift.salesTotal))}</p>
              </div>
            </div>

            {data.openShift.paymentBreakdown.length > 0 && (
              <div className="mt-3 rounded-xl border border-line bg-ink px-4 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#68756f]">Detalle por medio de pago</p>
                <div className="space-y-2">
                  {data.openShift.paymentBreakdown.map((method) => (
                    <div key={method.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-[#a2aea8]">{method.name} <span className="text-[10px] text-[#65716b]">({method.count})</span></span>
                      <strong>{money.format(method.total)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="rounded-xl border border-line bg-ink p-4">
                <span className="block text-xs font-semibold text-[#9ba8a2]">Efectivo declarado</span>
                <span className="mt-1 block text-[10px] text-[#69766f]">Esperado: {money.format(Number(data.openShift.expectedCash))}</span>
                <input autoFocus type="number" min="0" step="0.01" required className="field mt-3" value={closingAmount} onChange={(event) => setClosingAmount(event.target.value)} placeholder="Ingresá el total" />
                <span className={`mt-2 block text-xs font-black ${closingAmount === "" ? "text-[#66736d]" : balanceClass(Number(closingAmount) - Number(data.openShift.expectedCash))}`}>{closingAmount === "" ? "Pendiente de declarar" : balanceLabel(Number(closingAmount) - Number(data.openShift.expectedCash))}</span>
              </label>
              <label className="rounded-xl border border-line bg-ink p-4">
                <span className="block text-xs font-semibold text-[#9ba8a2]">Dinero virtual declarado</span>
                <span className="mt-1 block text-[10px] text-[#69766f]">Registrado: {money.format(Number(data.openShift.virtualSales))}</span>
                <input type="number" min="0" step="0.01" required className="field mt-3" value={virtualClosingAmount} onChange={(event) => setVirtualClosingAmount(event.target.value)} placeholder="Ingresá el total" />
                <span className={`mt-2 block text-xs font-black ${virtualClosingAmount === "" ? "text-[#66736d]" : balanceClass(Number(virtualClosingAmount) - Number(data.openShift.virtualSales))}`}>{virtualClosingAmount === "" ? "Pendiente de declarar" : balanceLabel(Number(virtualClosingAmount) - Number(data.openShift.virtualSales))}</span>
              </label>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-amber/25 bg-amber/5 px-4 py-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8e8167]">Resultado total del cierre</p><p className="mt-1 text-[11px] text-[#776f5e]">Efectivo más dinero virtual</p></div>
              {closingAmount !== "" && virtualClosingAmount !== "" ? <strong className={`text-base ${balanceClass((Number(closingAmount) - Number(data.openShift.expectedCash)) + (Number(virtualClosingAmount) - Number(data.openShift.virtualSales)))}`}>{balanceLabel((Number(closingAmount) - Number(data.openShift.expectedCash)) + (Number(virtualClosingAmount) - Number(data.openShift.virtualSales)))}</strong> : <strong className="text-sm text-[#6f7b75]">Pendiente</strong>}
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setShowClose(false)} className="button-secondary">Cancelar</button><button disabled={busy} className="button-primary">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}Confirmar cierre</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, highlight = false }: { label: string; value: string | number; icon: typeof Banknote; highlight?: boolean }) {
  return <div className={`surface p-4 ${highlight ? "border-amber/35 bg-amber/5" : ""}`}><div className="flex items-center justify-between"><p className="text-xs font-bold text-[#87948d]">{label}</p><Icon className={`h-4 w-4 ${highlight ? "text-amber" : "text-mint"}`} /></div><p className={`mt-3 text-2xl font-black ${highlight ? "text-amber" : ""}`}>{money.format(Number(value))}</p></div>;
}

function OrderRow({ order, disabled, pay }: { order: PendingOrder; disabled: boolean; pay: () => void }) {
  return <div className="grid gap-3 rounded-2xl border border-amber/25 bg-amber/5 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-lg font-black">{order.table?.name ?? `Pedido #${order.number}`}</h3><span className="rounded-full bg-amber/12 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber">Pide cuenta</span></div><p className="mt-1 text-xs text-[#7e8b85]">{order.table?.sectorName ?? "Mostrador"} · Pedido #{order.number} · {order.guestCount} personas</p></div><button type="button" disabled={disabled} onClick={pay} className="button-primary min-w-40"><Banknote className="h-4 w-4" />Revisar cobro · {money.format(Number(order.total))}</button></div>;
}

function DirectSaleModal({ shift, methods, close, completed }: { shift: OpenShift; methods: PaymentMethod[]; close: () => void; completed: (sale: { number: number; paymentMethod: string }) => void | Promise<void> }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, { product: CatalogProduct; quantity: number }>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadCatalog = useCallback(async (search: string, category: string) => {
    setCatalogLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (category) params.set("categoryId", category);
      const payload = await request<{ categories: Category[]; products: CatalogProduct[] }>(`/api/orders/catalog?${params}`, { cache: "no-store" });
      setCategories(payload.categories);
      setProducts(payload.products);
      if (category && !payload.categories.some((item) => item.id === category)) setCategoryId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo cargar el catálogo");
    } finally { setCatalogLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadCatalog(query, categoryId), 180);
    return () => window.clearTimeout(timer);
  }, [categoryId, loadCatalog, query]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (type === "products.changed" || type === "categories.changed") loadCatalog(query, categoryId);
    };
    window.addEventListener("quercus:update", refresh);
    return () => window.removeEventListener("quercus:update", refresh);
  }, [categoryId, loadCatalog, query]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const total = useMemo(() => cartItems.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0), [cartItems]);

  function addProduct(product: CatalogProduct) {
    setCart((current) => {
      const existing = current[product.id];
      return { ...current, [product.id]: { product, quantity: Math.min(100, (existing?.quantity ?? 0) + 1) } };
    });
  }

  function changeQuantity(productId: string, nextQuantity: number) {
    setCart((current) => {
      const next = { ...current };
      if (nextQuantity <= 0) delete next[productId];
      else if (next[productId]) next[productId] = { ...next[productId], quantity: Math.min(100, nextQuantity) };
      return next;
    });
  }

  async function finishSale(input: CheckoutInput): Promise<CheckoutResult> {
    if (cartItems.length === 0) throw new Error("Agregá al menos un producto");
    try {
      const payload = await request<{ sale: { id: string; number: number; paymentMethod: string } }>("/api/cash/direct-sales", {
        method: "POST",
        body: JSON.stringify({
          cashShiftId: shift.id,
          shiftVersion: shift.version,
          paymentMethodId: input.paymentMethodId,
          discountType: input.discountType,
          discountValue: input.discountValue,
          items: cartItems.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
        }),
      });
      await completed(payload.sale);
      return { receiptId: payload.sale.id };
    } catch (caught) {
      throw caught instanceof Error ? caught : new Error("No se pudo completar la venta");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-3 backdrop-blur-sm sm:p-5" onMouseDown={(event) => event.target === event.currentTarget && !busy && close()}>
      <div role="dialog" aria-modal="true" aria-labelledby="direct-sale-title" className="surface flex h-[min(850px,94vh)] w-full max-w-6xl flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-line p-4 sm:px-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber/10 text-amber"><ShoppingCart className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="eyebrow mb-0.5">Caja · mostrador</p><h2 id="direct-sale-title" className="text-xl font-black">Venta directa</h2></div>
          <button type="button" disabled={busy} onClick={close} className="rounded-xl border border-line p-2.5 text-[#89968f] hover:text-cream"><X className="h-4 w-4" /></button>
        </header>

        {error && <div className="mx-4 mt-3 flex items-start justify-between gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs font-semibold text-[#ffb4a5]"><span>{error}</span><button type="button" onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_390px]">
          <section className="flex min-h-0 flex-col border-b border-line lg:border-b-0 lg:border-r">
            <div className="border-b border-line p-3 sm:p-4">
              <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#69766f]" /><input autoFocus className="field py-2.5 pl-10 pr-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre por partes, SKU o código…" autoComplete="off" />{catalogLoading && <LoaderCircle className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-amber" />}</div>
              <div className="mobile-scroll mt-2.5 flex gap-2 overflow-x-auto pb-1"><button type="button" onClick={() => setCategoryId("")} className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-bold ${!categoryId ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink text-[#89968f]"}`}>Todos</button>{categories.map((category) => <button type="button" key={category.id} onClick={() => setCategoryId(category.id)} className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-bold ${categoryId === category.id ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink text-[#89968f]"}`}>{category.name}</button>)}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">{products.map((product) => <button type="button" key={product.id} disabled={busy} onClick={() => addProduct(product)} className="group min-h-[112px] rounded-2xl border border-line bg-[#1b2622] p-3 text-left transition hover:border-amber/50 hover:bg-[#202e29] active:scale-[.98] disabled:opacity-45"><p className="line-clamp-2 text-sm font-black leading-tight">{product.name}</p><p className="mt-1 truncate text-[9px] font-semibold uppercase tracking-wider text-[#65726c]">{product.categoryName}</p><div className="mt-3 flex items-end justify-between gap-1"><span className="text-xs font-black text-amber">{money.format(Number(product.price))}</span><span className="grid h-7 w-7 place-items-center rounded-lg bg-amber/10 text-amber group-hover:bg-amber group-hover:text-ink"><Plus className="h-4 w-4" /></span></div></button>)}</div>{!catalogLoading && products.length === 0 && <div className="py-16 text-center text-sm text-[#75827c]">No se encontraron productos.</div>}</div>
          </section>

          <aside className="flex min-h-0 flex-col bg-[#151e1b]">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><div><p className="text-sm font-black">Venta actual</p><p className="mt-0.5 text-[10px] text-[#6f7c76]">{cartItems.reduce((sum, item) => sum + item.quantity, 0)} unidades</p></div><span className="pill bg-ink text-[#9aa8a1]">Sin mesa</span></div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{cartItems.length === 0 ? <div className="grid h-full place-items-center text-center"><div><ShoppingCart className="mx-auto h-8 w-8 text-[#4f5c56]" /><p className="mt-3 text-sm font-bold">Carrito vacío</p><p className="mt-1 text-xs text-[#6f7c76]">Seleccioná productos del catálogo.</p></div></div> : cartItems.map((item) => <div key={item.product.id} className="rounded-xl border border-line bg-panel p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{item.product.name}</p><p className="mt-1 text-xs text-[#6f7c76]">{money.format(Number(item.product.price))} c/u</p></div><p className="shrink-0 text-sm font-black text-amber">{money.format(Number(item.product.price) * item.quantity)}</p></div><div className="mt-2 flex items-center justify-between"><div className="flex items-center rounded-xl border border-line bg-ink"><button type="button" disabled={busy} onClick={() => changeQuantity(item.product.id, item.quantity - 1)} className="grid h-9 w-9 place-items-center text-[#8f9c95] hover:text-cream"><Minus className="h-4 w-4" /></button><span className="min-w-8 text-center text-sm font-black">{item.quantity}</span><button type="button" disabled={busy || item.quantity >= 100} onClick={() => changeQuantity(item.product.id, item.quantity + 1)} className="grid h-9 w-9 place-items-center text-[#8f9c95] hover:text-cream disabled:opacity-40"><Plus className="h-4 w-4" /></button></div><button type="button" disabled={busy} onClick={() => changeQuantity(item.product.id, 0)} title="Quitar producto" className="grid h-9 w-9 place-items-center rounded-lg text-[#7f8c85] hover:bg-danger/10 hover:text-danger"><Trash2 className="h-4 w-4" /></button></div></div>)}</div>
            <div className="border-t border-line p-4"><div className="flex items-end justify-between"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#6f7c76]">Subtotal</p><p className="text-2xl font-black text-amber">{money.format(total)}</p></div><button type="button" disabled={busy || cartItems.length === 0} onClick={() => setShowCheckout(true)} className="button-primary mt-4 w-full"><Banknote className="h-4 w-4" />Continuar al cobro</button></div>
          </aside>
        </div>
      </div>
      {showCheckout && <CheckoutDrawer title="Venta directa" subtitle={`${cartItems.reduce((sum, item) => sum + item.quantity, 0)} unidades · Sin mesa`} subtotal={total} methods={methods} items={cartItems.map((item) => ({ id: item.product.id, name: item.product.name, quantity: item.quantity, total: Number(item.product.price) * item.quantity }))} close={() => setShowCheckout(false)} confirm={finishSale} />}
    </div>
  );
}
