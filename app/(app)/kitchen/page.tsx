"use client";

import { ChefHat, Clock3, HandPlatter, LoaderCircle, RefreshCcw, UtensilsCrossed, Wine } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppUser } from "@/components/app-shell";

type TicketStatus = "NEW" | "PREPARING" | "READY" | "DELIVERED";
type Station = { id: string; name: string; type: "BAR" | "KITCHEN" | "OTHER" };
type Ticket = {
  id: string;
  number: number;
  status: TicketStatus;
  version: number;
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  station: Station;
  order: {
    id: string;
    number: number;
    type: "TABLE" | "COUNTER" | "DELIVERY" | "TAKEAWAY";
    notes: string | null;
    openedAt: string;
    diningTable: { name: string; sector: { name: string } } | null;
    openedBy: { displayName: string };
  };
  items: { id: string; orderItemId: string; name: string; quantity: string; notes: string | null; status: string }[];
};

const columns: { status: "ACTIVE" | "DELIVERED"; title: string; empty: string; icon: typeof Clock3; accent: string }[] = [
  { status: "ACTIVE", title: "Nuevos", empty: "No hay comandas nuevas", icon: Clock3, accent: "text-amber" },
  { status: "DELIVERED", title: "Entregados", empty: "No hay comandas entregadas recientemente", icon: HandPlatter, accent: "text-mint" },
];

function elapsedLabel(value: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "recién llegada";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function orderLocation(order: Ticket["order"]) {
  if (order.diningTable) return `${order.diningTable.sector.name} · ${order.diningTable.name}`;
  if (order.type === "COUNTER") return `Venta directa #${order.number}`;
  if (order.type === "TAKEAWAY") return `Para llevar #${order.number}`;
  return `Pedido #${order.number}`;
}

function groupDeliveredTickets(tickets: Ticket[]) {
  const groups = new Map<string, Ticket>();
  for (const ticket of tickets) {
    if (ticket.status !== "DELIVERED") continue;
    const key = `${ticket.order.id}:${ticket.station.id}`;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { ...ticket, items: [...ticket.items] });
      continue;
    }
    current.items.push(...ticket.items);
    if (new Date(ticket.createdAt).getTime() < new Date(current.createdAt).getTime()) current.createdAt = ticket.createdAt;
    if (new Date(ticket.deliveredAt ?? 0).getTime() > new Date(current.deliveredAt ?? 0).getTime()) current.deliveredAt = ticket.deliveredAt;
  }
  return [...groups.values()].sort((left, right) => new Date(right.deliveredAt ?? 0).getTime() - new Date(left.deliveredAt ?? 0).getTime());
}

function TicketCard({ ticket, now, busy, canWrite, advance }: { ticket: Ticket; now: number; busy: boolean; canWrite: boolean; advance: (ticket: Ticket) => void }) {
  const isLate = now - new Date(ticket.createdAt).getTime() >= 20 * 60_000 && ticket.status !== "DELIVERED";
  return (
    <article className={`overflow-hidden rounded-2xl border bg-[#1b1b1b] shadow-[0_16px_40px_rgba(0,0,0,.18)] ${isLate ? "border-danger/50" : ticket.status === "READY" ? "border-mint/35" : "border-line"}`}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="min-w-0"><p className="truncate text-base font-black">{orderLocation(ticket.order)}</p><p className="mt-1 text-[11px] text-[#7d7d7d]">Pedido #{ticket.order.number} · {ticket.order.openedBy.displayName}</p></div>
        <div className="shrink-0 text-right"><span className="pill bg-ink text-amber">{ticket.station.name}</span><p className={`mt-2 flex items-center justify-end gap-1 text-[10px] font-black ${isLate ? "text-danger" : "text-[#868686]"}`}><Clock3 className="h-3 w-3" />{elapsedLabel(ticket.createdAt, now)}</p></div>
      </header>
      <div className="space-y-3 p-4">
        {ticket.items.map((item) => <div key={item.id} className="flex items-start gap-3"><span className="grid h-8 min-w-8 place-items-center rounded-lg bg-amber/10 px-2 text-sm font-black text-amber">{Number(item.quantity).toLocaleString("es-AR")}</span><div className="min-w-0 pt-1"><p className="text-sm font-black leading-tight text-cream">{item.name}</p>{item.notes && <p className="mt-1 text-xs font-semibold leading-relaxed text-[#c4c4c4]">Nota: {item.notes}</p>}</div></div>)}
        {ticket.order.notes && <div className="rounded-xl border border-amber/25 bg-amber/8 px-3 py-2.5"><p className="text-[10px] font-black uppercase tracking-wider text-amber">Nota del pedido</p><p className="mt-1 text-xs leading-relaxed text-[#c8c8c8]">{ticket.order.notes}</p></div>}
      </div>
      {ticket.status !== "DELIVERED" && <footer className="border-t border-line p-3"><button type="button" disabled={!canWrite || busy} onClick={() => advance(ticket)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 text-sm font-black text-ink transition hover:bg-[#c5c5c5] disabled:cursor-not-allowed disabled:opacity-45">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <HandPlatter className="h-4 w-4" />}{canWrite ? "Marcar entregado" : "Sólo lectura"}</button></footer>}
    </article>
  );
}

export default function PreparationPage() {
  const { permissions } = useAppUser();
  const pathname = usePathname();
  const isBar = pathname === "/bar" || pathname.startsWith("/bar/");
  const stationType = isBar ? "BAR" : "KITCHEN";
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const canWrite = permissions.includes("kitchen.write");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/kitchen?stationType=${stationType}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudieron cargar las comandas");
      setTickets(payload.tickets);
      setStations(payload.stations);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar las comandas");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [stationType]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const refresh = (event: Event) => {
      const type = (event as CustomEvent<{ type?: string }>).detail?.type;
      if (type === "kitchen.changed" || type === "orders.changed" || type === "products.changed") void load(true);
    };
    window.addEventListener("quercus:update", refresh);
    return () => window.removeEventListener("quercus:update", refresh);
  }, [load]);

  const filtered = useMemo(() => stationId ? tickets.filter((ticket) => ticket.station.id === stationId) : tickets, [stationId, tickets]);
  const activeCount = filtered.filter((ticket) => ticket.status !== "DELIVERED").length;
  const delivered = useMemo(() => groupDeliveredTickets(filtered), [filtered]);

  async function advance(ticket: Ticket) {
    setBusyId(ticket.id); setError("");
    try {
      const response = await fetch(`/api/kitchen/tickets/${ticket.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: ticket.version, status: "DELIVERED" }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo actualizar la comanda");
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar la comanda");
      await load(true);
    } finally { setBusyId(""); }
  }

  return (
    <div className="mx-auto max-w-[1800px]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow mb-2">Preparación en tiempo real</p><h1 className="flex items-center gap-3 text-3xl font-black tracking-[-.035em] sm:text-4xl">{isBar ? <Wine className="h-9 w-9 text-mint" /> : <ChefHat className="h-9 w-9 text-amber" />}{isBar ? "Barra" : "Cocina"}</h1><p className="mt-2 text-sm text-[#999999]">Las consumiciones enviadas a {isBar ? "Barra" : "Cocina"} aparecen acá y se actualizan en tiempo real.</p></div>
        <div className="flex items-center gap-3"><div className="rounded-xl border border-line bg-panel px-4 py-2.5 text-right"><p className="text-[10px] font-black uppercase tracking-wider text-[#787878]">Activas</p><p className="text-xl font-black text-cream">{activeCount}</p></div><button type="button" disabled={loading} onClick={() => void load()} className="button-secondary"><RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button></div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2"><button type="button" onClick={() => setStationId("")} className={`rounded-xl border px-4 py-2 text-xs font-black transition ${!stationId ? "border-amber bg-amber text-ink" : "border-line bg-panel text-[#a3a3a3] hover:text-cream"}`}>Todas</button>{stations.map((station) => <button type="button" key={station.id} onClick={() => setStationId(station.id)} className={`rounded-xl border px-4 py-2 text-xs font-black transition ${stationId === station.id ? "border-amber bg-amber text-ink" : "border-line bg-panel text-[#a3a3a3] hover:text-cream"}`}>{station.name === "COCINA" ? "Cocina" : station.name === "BAR" ? "Barra" : station.name}</button>)}</div>

      {error && <div role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-[#ffb4a5]">{error}</div>}
      {!canWrite && <div className="mb-5 rounded-xl border border-amber/25 bg-amber/8 px-4 py-3 text-sm text-[#bfbfbf]">Tu perfil puede consultar las comandas, pero no cambiar su estado.</div>}

      {loading ? <div className="grid min-h-[420px] place-items-center rounded-2xl border border-line bg-panel"><div className="text-center"><LoaderCircle className="mx-auto h-8 w-8 animate-spin text-amber" /><p className="mt-3 text-sm font-bold text-[#818181]">Cargando comandas…</p></div></div> : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {columns.map((column) => {
            const rows = column.status === "ACTIVE" ? filtered.filter((ticket) => ticket.status !== "DELIVERED") : delivered;
            return <section key={column.status} className="overflow-hidden rounded-2xl border border-line bg-[#171717]"><header className="flex items-center justify-between border-b border-line bg-[#1c1c1c] px-4 py-3.5"><div className={`flex items-center gap-2 text-sm font-black ${column.accent}`}><column.icon className="h-4 w-4" />{column.title}</div><span className="grid h-7 min-w-7 place-items-center rounded-full bg-ink px-2 text-xs font-black text-[#afafaf]">{rows.length}</span></header><div className="min-h-[220px] space-y-3 p-3">{rows.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} now={now} busy={busyId === ticket.id} canWrite={canWrite} advance={advance} />)}{rows.length === 0 && <div className="grid min-h-[190px] place-items-center px-4 text-center"><div><UtensilsCrossed className="mx-auto h-7 w-7 text-[#4f4f4f]" /><p className="mt-3 text-xs font-bold text-[#717171]">{column.empty}</p></div></div>}</div></section>;
          })}
        </div>
      )}

    </div>
  );
}
