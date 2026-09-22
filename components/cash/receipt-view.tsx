"use client";

import { ArrowLeft, Printer } from "lucide-react";
import { useEffect } from "react";

type Receipt = {
  id: string;
  number: number;
  type: string;
  branchName: string;
  branchAddress: string | null;
  tableName: string | null;
  sectorName: string | null;
  cashierName: string;
  paidAt: string;
  paymentMethod: string;
  items: { id: string; name: string; quantity: number; unitPrice: number; total: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

export function ReceiptView({ receipt, autoPrint }: { receipt: Receipt; autoPrint: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  function goBack() {
    if (window.opener) window.close();
    else window.history.back();
  }

  return (
    <main className="receipt-screen min-h-screen bg-[#0c0c0c] px-4 py-8 text-[#171b19] sm:py-12">
      <div className="no-print mx-auto mb-4 flex w-full max-w-[420px] items-center justify-between gap-3">
        <button type="button" onClick={goBack} className="button-secondary"><ArrowLeft className="h-4 w-4" />Volver</button>
        <button type="button" onClick={() => window.print()} className="button-primary"><Printer className="h-4 w-4" />Imprimir recibo</button>
      </div>

      <article className="receipt-paper mx-auto w-full max-w-[420px] bg-white px-7 py-8 text-[#171b19] shadow-2xl sm:px-9">
        <header className="border-b-2 border-dashed border-[#b8b8b8] pb-5 text-center">
          <p className="text-2xl font-black uppercase tracking-[.12em]">Quercus</p>
          <p className="mt-2 text-sm font-bold">{receipt.branchName}</p>
          {receipt.branchAddress && <p className="mt-1 text-xs text-[#545454]">{receipt.branchAddress}</p>}
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#676c69]">Comprobante interno · No fiscal</p>
        </header>

        <section className="border-b-2 border-dashed border-[#b8b8b8] py-4 text-xs">
          <ReceiptLine label="Pedido" value={`#${receipt.number}`} strong />
          <ReceiptLine label="Fecha" value={dateTime.format(new Date(receipt.paidAt))} />
          <ReceiptLine label="Origen" value={receipt.tableName ? `${receipt.tableName}${receipt.sectorName ? ` · ${receipt.sectorName}` : ""}` : "Venta directa"} />
          <ReceiptLine label="Atendió" value={receipt.cashierName} />
        </section>

        <section className="border-b-2 border-dashed border-[#b8b8b8] py-4">
          <div className="mb-3 grid grid-cols-[1fr_auto] gap-3 text-[10px] font-black uppercase tracking-wider text-[#666666]"><span>Detalle</span><span>Importe</span></div>
          <div className="space-y-3">{receipt.items.map((item) => <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 text-xs"><div><p className="font-bold">{item.name}</p><p className="mt-0.5 text-[10px] text-[#6c6c6c]">{item.quantity.toLocaleString("es-AR")} × {money.format(item.unitPrice)}</p></div><p className="font-bold">{money.format(item.total)}</p></div>)}
            {receipt.tableName && <div className="grid grid-cols-[1fr_auto] gap-3 text-xs"><div><p className="font-bold">Cubiertos</p><p className="mt-0.5 text-[10px] text-[#6c6c6c]">1 × {money.format(0)}</p></div><p className="font-bold">{money.format(0)}</p></div>}
          </div>
        </section>

        <section className="space-y-2 py-4 text-xs">
          <ReceiptLine label="Subtotal" value={money.format(receipt.subtotal)} />
          {receipt.discount > 0 && <ReceiptLine label="Descuento" value={`− ${money.format(receipt.discount)}`} />}
          {receipt.tax > 0 && <ReceiptLine label="Impuestos" value={money.format(receipt.tax)} />}
          <div className="mt-3 flex items-end justify-between border-t border-[#c7c7c7] pt-3"><span className="text-sm font-black uppercase">Total</span><span className="text-2xl font-black">{money.format(receipt.total)}</span></div>
          <ReceiptLine label="Medio de pago" value={receipt.paymentMethod} />
        </section>

        <footer className="border-t-2 border-dashed border-[#b8b8b8] pt-5 text-center">
          <p className="text-sm font-black">¡Gracias por su visita!</p>
          <p className="mt-2 break-all text-[9px] text-[#858987]">Ref. {receipt.id}</p>
        </footer>
      </article>
    </main>
  );
}

function ReceiptLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="mb-2 flex items-start justify-between gap-4 last:mb-0"><span className="text-[#636363]">{label}</span><span className={`text-right ${strong ? "font-black" : "font-semibold"}`}>{value}</span></div>;
}
