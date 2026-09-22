"use client";

import { Banknote, Eye, LoaderCircle, Printer, ReceiptText, Tag, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DiscountType } from "@/lib/discount";

export type ReceiptMode = "NONE" | "PREVIEW" | "PRINT";
export type CheckoutResult = { receiptId: string };

type PaymentMethod = { id: string; name: string };
type CheckoutItem = { id: string; name: string; quantity: number; total: number };
export type CheckoutInput = {
  paymentMethodId: string;
  discountType: DiscountType;
  discountValue: number;
  receiptMode: ReceiptMode;
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });

export function CheckoutDrawer({
  title,
  subtitle,
  subtotal,
  methods,
  items,
  close,
  confirm,
}: {
  title: string;
  subtitle?: string;
  subtotal: number;
  methods: PaymentMethod[];
  items?: CheckoutItem[];
  close: () => void;
  confirm: (input: CheckoutInput) => Promise<CheckoutResult>;
}) {
  const [paymentMethodId, setPaymentMethodId] = useState(methods.find((method) => method.name === "Efectivo")?.id ?? methods[0]?.id ?? "");
  const [discountType, setDiscountType] = useState<DiscountType>("NONE");
  const [discountValue, setDiscountValue] = useState("");
  const [receiptMode, setReceiptMode] = useState<ReceiptMode>("NONE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const totals = useMemo(() => {
    const value = Math.max(0, Number(discountValue) || 0);
    if (discountType === "NONE") return { discount: 0, total: subtotal };
    const rawDiscount = discountType === "PERCENT" ? subtotal * Math.min(value, 100) / 100 : Math.min(value, subtotal);
    const total = Math.floor(Math.max(0, Math.round((subtotal - rawDiscount) * 100) / 100) / 100) * 100;
    return { discount: subtotal - total, total };
  }, [discountType, discountValue, subtotal]);

  const submit = useCallback(async () => {
    if (!paymentMethodId) return;
    const receiptWindow = receiptMode === "NONE" ? null : window.open("", "_blank");
    setBusy(true); setError("");
    try {
      const result = await confirm({
        paymentMethodId,
        discountType,
        discountValue: discountType === "NONE" ? 0 : Math.max(0, Number(discountValue) || 0),
        receiptMode,
      });
      if (receiptMode !== "NONE") {
        const url = `/receipt/${result.receiptId}${receiptMode === "PRINT" ? "?print=1" : ""}`;
        if (receiptWindow) receiptWindow.location.href = url;
        else window.open(url, "_blank");
      }
    } catch (caught) {
      receiptWindow?.close();
      setError(caught instanceof Error ? caught.message : "No se pudo completar el cobro");
    } finally { setBusy(false); }
  }, [confirm, discountType, discountValue, paymentMethodId, receiptMode]);

  useEffect(() => {
    function handleConfirmShortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "c" || !event.ctrlKey || !event.shiftKey || event.altKey || event.repeat) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (!busy && paymentMethodId) void submit();
    }

    window.addEventListener("keydown", handleConfirmShortcut, true);
    return () => window.removeEventListener("keydown", handleConfirmShortcut, true);
  }, [busy, paymentMethodId, submit]);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/65 p-4 backdrop-blur-[2px] sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && !busy && close()}>
      <aside role="dialog" aria-modal="true" aria-labelledby="checkout-title" className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-line bg-[#101010] shadow-2xl sm:max-h-[calc(100vh-3rem)]">
        <header className="flex items-start gap-3 border-b border-line p-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber/10 text-amber"><Banknote className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><p className="eyebrow mb-1">Confirmación de cobro</p><h2 id="checkout-title" className="truncate text-xl font-black">{title}</h2>{subtitle && <p className="mt-1 text-xs text-[#888888]">{subtitle}</p>}</div>
          <button type="button" disabled={busy} onClick={close} className="rounded-xl border border-line p-2.5 text-[#929292] hover:text-cream disabled:opacity-40"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {items && items.length > 0 && <section><p className="mb-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#787878]">Detalle</p><div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-line bg-ink p-3">{items.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 py-1.5 text-sm"><p className="min-w-0 truncate"><span className="mr-2 font-black text-amber">{item.quantity}×</span>{item.name}</p><p className="shrink-0 font-bold">{money.format(item.total)}</p></div>)}</div></section>}

          <section>
            <div className="mb-2 flex items-center gap-2"><Tag className="h-4 w-4 text-mint" /><p className="text-sm font-black">Descuento</p></div>
            <div className="grid grid-cols-3 gap-2">{(["NONE", "PERCENT", "FIXED"] as DiscountType[]).map((type) => <button type="button" key={type} disabled={busy} onClick={() => { setDiscountType(type); if (type === "NONE") setDiscountValue(""); }} className={`rounded-xl border px-2 py-2.5 text-xs font-bold transition ${discountType === type ? "border-amber bg-amber/10 text-amber" : "border-line bg-ink text-[#949494]"}`}>{type === "NONE" ? "Sin descuento" : type === "PERCENT" ? "Porcentaje" : "Importe fijo"}</button>)}</div>
            {discountType !== "NONE" && <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold text-[#989898]">{discountType === "PERCENT" ? "Porcentaje de descuento" : "Importe a descontar"}</span><div className="relative"><input autoFocus type="number" min="0" max={discountType === "PERCENT" ? 100 : subtotal} step="0.01" className="field pr-12" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder="0" /><span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#787878]">{discountType === "PERCENT" ? "%" : "$"}</span></div></label>}
          </section>

          <section><label><span className="mb-2 block text-sm font-black">Medio de pago</span><select className="field" disabled={busy} value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>{methods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}</select></label></section>

          <section>
            <div className="mb-2 flex items-center gap-2"><ReceiptText className="h-4 w-4 text-mint" /><p className="text-sm font-black">Recibo</p></div>
            <div className="space-y-2">
              <ReceiptOption active={receiptMode === "NONE"} icon={X} title="No imprimir" description="Finaliza el cobro sin abrir el recibo." select={() => setReceiptMode("NONE")} />
              <ReceiptOption active={receiptMode === "PREVIEW"} icon={Eye} title="Vista previa" description="Abre el recibo para revisarlo o imprimirlo manualmente." select={() => setReceiptMode("PREVIEW")} />
              <ReceiptOption active={receiptMode === "PRINT"} icon={Printer} title="Imprimir al cobrar" description="Abre el recibo y muestra el cuadro de impresión." select={() => setReceiptMode("PRINT")} />
            </div>
          </section>

          {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs font-semibold text-[#ffb4a5]">{error}</div>}
        </div>

        <footer className="border-t border-line bg-[#181818] p-5">
          <div className="space-y-2 text-sm"><div className="flex justify-between text-[#979797]"><span>Subtotal</span><span>{money.format(subtotal)}</span></div>{totals.discount > 0 && <div className="flex justify-between text-mint"><span>Descuento</span><span>− {money.format(totals.discount)}</span></div>}<div className="flex items-end justify-between border-t border-line pt-3"><span className="font-black">Total a cobrar</span><span className="text-3xl font-black text-amber">{money.format(totals.total)}</span></div></div>
          <div className="mt-4 grid grid-cols-[auto_1fr] gap-2"><button type="button" disabled={busy} onClick={close} className="button-secondary">Cancelar</button><button type="button" disabled={busy || !paymentMethodId} onClick={submit} className="button-primary">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}Confirmar cobro <kbd className="rounded border border-black/20 bg-black/10 px-1.5 py-0.5 text-[10px] font-black">Ctrl ⇧ C</kbd></button></div>
        </footer>
      </aside>
    </div>
  );
}

function ReceiptOption({ active, icon: Icon, title, description, select }: { active: boolean; icon: typeof Printer; title: string; description: string; select: () => void }) {
  return <button type="button" onClick={select} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${active ? "border-amber bg-amber/10" : "border-line bg-ink hover:border-[#4e4e4e]"}`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? "bg-amber text-ink" : "bg-panel text-[#888888]"}`}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className={`block text-sm font-black ${active ? "text-amber" : "text-cream"}`}>{title}</span><span className="mt-0.5 block text-[10px] leading-relaxed text-[#787878]">{description}</span></span></button>;
}
