"use client";

import { DndContext, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  Armchair,
  BrickWall,
  CheckCircle2,
  CirclePlus,
  Grid2X2,
  Grid3X3,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCw,
  Save,
  Shapes,
  Sparkles,
  SquareDashed,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FLOOR_CANVAS_HEIGHT,
  FLOOR_CANVAS_WIDTH,
  FLOOR_GRID_SIZE,
  normalizeFloorRect,
  normalizeRotation,
} from "@/lib/floor";
import { findDirectionalTable, shouldAutoOpenTable, type FloorDirection } from "@/lib/floor-keyboard";
import { useAppUser } from "@/components/app-shell";
import { TableServicePanel, type TableServicePanelHandle } from "@/components/floor/table-service-modal";

type TableStatus = "AVAILABLE" | "OCCUPIED" | "BILL_REQUESTED" | "RESERVED" | "DISABLED";
type ElementType = "WALL" | "BAR" | "TEXT" | "DECORATION";
type Rect = { x: number; y: number; width: number; height: number; rotation: number };
type DiningTable = Rect & {
  id: string;
  sectorId: string;
  name: string;
  capacity: number;
  status: TableStatus;
  shape: "ROUND" | "SQUARE" | "RECTANGLE";
  version: number;
  activeOrder: { id: string; number: number; status: string; guestCount: number; total: number; openedAt: string } | null;
  nextReservation: { id: string; partySize: number; reservedFor: string; status: string } | null;
};
type FloorElement = Rect & {
  id: string;
  sectorId: string;
  type: ElementType;
  label: string | null;
  style: unknown;
  version: number;
};
type Sector = { id: string; name: string; sortOrder: number; tables: DiningTable[]; elements: FloorElement[] };
type Selection = { kind: "table" | "element"; id: string } | null;
type CreateKind = "SECTOR" | "TABLE" | ElementType;

const FLOOR_VIEW_WIDTH = 462;
const FLOOR_VIEW_HEIGHT = 650;
const FLOOR_VIEW_MAX_SCALE = 0.68;
const FLOOR_EDITOR_SCALE = 0.65;

function fitSectorToView(_sector: Sector | null) {
  const scale = Math.min(FLOOR_VIEW_MAX_SCALE, FLOOR_VIEW_WIDTH / FLOOR_CANVAS_WIDTH, FLOOR_VIEW_HEIGHT / FLOOR_CANVAS_HEIGHT);
  return { x: 0, y: 0, scale, width: FLOOR_CANVAS_WIDTH * scale, height: FLOOR_CANVAS_HEIGHT * scale };
}

function isInteractiveKeyboardTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true'], [role='dialog']"));
}

const statusMeta: Record<TableStatus, { label: string; card: string; dot: string }> = {
  AVAILABLE: { label: "Libre", card: "border-[#4f8968] bg-[#17241e]", dot: "bg-[#79b993]" },
  OCCUPIED: { label: "Ocupada", card: "border-danger/60 bg-[#262626]", dot: "bg-danger" },
  BILL_REQUESTED: { label: "Pide cuenta", card: "border-[#b18c42] bg-[#292317]", dot: "bg-[#d5aa50]" },
  RESERVED: { label: "Reservada", card: "border-[#a3a3a3]/65 bg-[#292929]", dot: "bg-[#a3a3a3]" },
  DISABLED: { label: "Inactiva", card: "border-[#5c5c5c] bg-[#282828]", dot: "bg-[#777777]" },
};

const elementMeta: Record<ElementType, { label: string; icon: typeof BrickWall; defaults: { width: number; height: number } }> = {
  WALL: { label: "Pared", icon: BrickWall, defaults: { width: 240, height: 24 } },
  BAR: { label: "Barra", icon: LayoutDashboard, defaults: { width: 260, height: 80 } },
  TEXT: { label: "Texto", icon: Pencil, defaults: { width: 180, height: 50 } },
  DECORATION: { label: "Decoración", icon: Sparkles, defaults: { width: 100, height: 100 } },
};

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "No se pudo completar la operación");
  return payload as T;
}

function DraggableObject({
  dragId,
  rect,
  disabled,
  selected,
  onSelect,
  onDoubleClick,
  onResize,
  children,
}: {
  dragId: string;
  rect: Rect;
  disabled: boolean;
  selected: boolean;
  onSelect: () => void;
  onDoubleClick?: () => void;
  onResize: (event: React.PointerEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: dragId, disabled });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onDoubleClick={(event) => { event.stopPropagation(); onDoubleClick?.(); }}
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        transform: `translate3d(${transform?.x ?? 0}px, ${transform?.y ?? 0}px, 0) rotate(${rect.rotation}deg)`,
        transformOrigin: "center",
        zIndex: isDragging ? 30 : selected ? 20 : 10,
        touchAction: disabled ? "auto" : "none",
      }}
      className={`${disabled ? "" : "cursor-grab active:cursor-grabbing"} ${selected ? `${disabled ? "ring-mint" : "ring-amber"} ring-2 ring-offset-4 ring-offset-[#0c0c0c] drop-shadow-[0_0_14px_rgba(170,170,170,.28)]` : ""}`}
    >
      {children}
      {disabled && selected && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-40 flex -translate-x-1/2 -translate-y-[calc(100%+7px)] items-center gap-1.5 whitespace-nowrap rounded-full border border-mint/35 bg-[#202020] px-2.5 py-1 text-[10px] font-black uppercase tracking-[.08em] text-mint shadow-lg">
          <CheckCircle2 className="h-3.5 w-3.5" />Seleccionada
        </div>
      )}
      {!disabled && selected && (
        <button
          type="button"
          aria-label="Redimensionar"
          title="Arrastrar para cambiar tamaño"
          onPointerDown={onResize}
          className="absolute -bottom-2.5 -right-2.5 z-40 grid h-7 w-7 cursor-nwse-resize place-items-center rounded-lg border border-amber bg-[#1c1c1c] text-amber shadow-xl"
        >
          <SquareDashed className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function TableCard({ table, operating = false }: { table: DiningTable; operating?: boolean }) {
  const meta = statusMeta[table.status];
  const radius = table.shape === "ROUND" ? "999px" : table.shape === "SQUARE" ? "18px" : "24px";
  const compact = operating && (table.width < 150 || table.height < 100);
  return (
    <div className={`flex h-full w-full cursor-pointer select-none flex-col items-center justify-center border-2 p-2 text-center shadow-xl ${meta.card}`} style={{ borderRadius: radius }}>
      <span className={`absolute rounded-full ${meta.dot} ${operating ? compact ? "right-3 top-3 h-3 w-3" : "right-5 top-5 h-5 w-5" : "right-2.5 top-2.5 h-2.5 w-2.5"}`} />
      <p className={`max-w-full truncate font-black leading-tight ${operating ? compact ? "text-lg" : "text-3xl" : "text-base"}`}>{table.name}</p>
      <div className={`flex items-center font-bold uppercase text-[#b1b1b1] ${operating ? compact ? "mt-1 gap-1 text-xs tracking-[.05em]" : "mt-2 gap-2 text-xl tracking-[.08em]" : "mt-1 gap-1 text-[10px] tracking-[.1em]"}`}><Users className={operating ? compact ? "h-3 w-3" : "h-5 w-5" : "h-3 w-3"} />{table.capacity} · {meta.label}</div>
      {table.activeOrder && <p className={`rounded-full bg-black/20 font-bold text-cream ${operating ? compact ? "mt-1 px-2 py-0.5 text-xs" : "mt-2.5 px-4 py-1 text-xl" : "mt-1.5 px-2 py-0.5 text-[10px]"}`}>Pedido #{table.activeOrder.number}</p>}
    </div>
  );
}

function ElementCard({ element }: { element: FloorElement }) {
  if (element.type === "WALL") return <div className="h-full w-full rounded-md border border-[#686868] bg-[repeating-linear-gradient(90deg,#46514c_0,#46514c_18px,#37413d_18px,#37413d_20px)] shadow-lg" />;
  if (element.type === "BAR") return <div className="flex h-full w-full items-center justify-center rounded-2xl border-2 border-amber/40 bg-[#363636] text-xs font-black uppercase tracking-[.16em] text-amber shadow-xl">{element.label || "Barra"}</div>;
  if (element.type === "TEXT") return <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-[#6f6f6f] bg-[#1d1d1d]/70 px-3 text-center text-sm font-black text-[#b6b6b6]">{element.label || "Texto"}</div>;
  return <div className="grid h-full w-full place-items-center rounded-full border-2 border-mint/35 bg-mint/10 text-mint"><Sparkles className="h-7 w-7" /><span className="sr-only">{element.label || "Decoración"}</span></div>;
}

function CreateModal({ kind, close, submit }: { kind: CreateKind; close: () => void; submit: (data: { name: string; capacity: number; shape: string }) => Promise<void> }) {
  const [name, setName] = useState(kind === "TABLE" ? "Mesa" : kind === "SECTOR" ? "" : elementMeta[kind as ElementType].label);
  const [capacity, setCapacity] = useState(4);
  const [shape, setShape] = useState("ROUND");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = kind === "SECTOR" ? "Nuevo sector" : kind === "TABLE" ? "Nueva mesa" : `Agregar ${elementMeta[kind].label.toLocaleLowerCase()}`;
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await submit({ name, capacity, shape }); close(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo crear"); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <form onSubmit={save} className="surface w-full max-w-md p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between"><div><p className="eyebrow mb-1">Editor de salón</p><h2 className="text-2xl font-black">{title}</h2></div><button type="button" onClick={close} className="rounded-xl border border-line p-2 text-[#929292]"><X className="h-4 w-4" /></button></div>
        <label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">{kind === "TABLE" || kind === "SECTOR" ? "Nombre" : "Etiqueta"}</span><input autoFocus required={kind === "TABLE" || kind === "SECTOR"} className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "TABLE" ? "Ej. Mesa 8" : "Nombre"} /></label>
        {kind === "TABLE" && <div className="mt-4 grid grid-cols-2 gap-3"><label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Personas</span><input type="number" min="1" max="30" className="field" value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} /></label><label><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Forma</span><select className="field" value={shape} onChange={(event) => setShape(event.target.value)}><option value="ROUND">Redonda</option><option value="SQUARE">Cuadrada</option><option value="RECTANGLE">Rectangular</option></select></label></div>}
        {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-[#ffb4a5]">{error}</div>}
        <div className="mt-6 flex justify-end gap-2"><button type="button" className="button-secondary" onClick={close}>Cancelar</button><button disabled={busy} className="button-primary">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Agregar</button></div>
      </form>
    </div>
  );
}

function DeleteSectorModal({ sector, busy, error, close, confirm }: { sector: Sector; busy: boolean; error: string; close: () => void; confirm: () => Promise<void> }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !busy && close()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="delete-sector-title" className="surface w-full max-w-md p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between"><div><p className="eyebrow mb-1">Acción permanente</p><h2 id="delete-sector-title" className="text-2xl font-black">Eliminar “{sector.name}”</h2></div><button type="button" disabled={busy} onClick={close} className="rounded-xl border border-line p-2 text-[#929292]"><X className="h-4 w-4" /></button></div>
        <div className="rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm leading-relaxed text-[#e8c0b7]">
          Se eliminarán <strong>{sector.tables.length} {sector.tables.length === 1 ? "mesa" : "mesas"}</strong> y <strong>{sector.elements.length} {sector.elements.length === 1 ? "elemento del plano" : "elementos del plano"}</strong>. Los pedidos históricos se conservan.
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[#888888]">La operación se bloqueará si alguna mesa tiene un pedido abierto o una reserva futura.</p>
        {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-semibold text-[#ffb4a5]">{error}</div>}
        <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} onClick={close} className="button-secondary">Cancelar</button><button type="button" disabled={busy} onClick={confirm} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-black text-[#141414] transition hover:bg-[#ff8b73] disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Eliminar sector</button></div>
      </div>
    </div>
  );
}

export function FloorEditor() {
  const { permissions } = useAppUser();
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [activeSectorId, setActiveSectorId] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [editing, setEditing] = useState(false);
  const [snap, setSnap] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createKind, setCreateKind] = useState<CreateKind | null>(null);
  const [showDeleteSector, setShowDeleteSector] = useState(false);
  const [deleteSectorError, setDeleteSectorError] = useState("");
  const [serviceTableId, setServiceTableId] = useState("");
  const [interactiveTableId, setInteractiveTableId] = useState("");
  const [productHost, setProductHost] = useState<HTMLDivElement | null>(null);
  const [autoOpenTableId, setAutoOpenTableId] = useState("");
  const [keyboardTableId, setKeyboardTableId] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [sectorName, setSectorName] = useState("");
  const servicePanelRef = useRef<TableServicePanelHandle>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const floor = await api<{ sectors: Sector[] }>("/api/floor", { cache: "no-store" });
      setSectors(floor.sectors);
      setActiveSectorId((current) => floor.sectors.some((sector) => sector.id === current) ? current : floor.sectors[0]?.id ?? "");
      setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo cargar el salón"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string }>).detail;
      if (detail?.type === "floor.changed") load(true);
    };
    window.addEventListener("quercus:update", refresh);
    return () => window.removeEventListener("quercus:update", refresh);
  }, [load]);

  const activeSector = sectors.find((sector) => sector.id === activeSectorId) ?? null;
  const floorView = useMemo(() => fitSectorToView(activeSector), [activeSector]);
  const floorViewOffsetX = (FLOOR_VIEW_WIDTH - floorView.width) / 2 - floorView.x * floorView.scale;
  const floorViewOffsetY = (FLOOR_VIEW_HEIGHT - floorView.height) / 2 - floorView.y * floorView.scale;
  const canManage = permissions.includes("floor.manage");
  const canOperate = permissions.includes("orders.write");
  const serviceTable = sectors.flatMap((sector) => sector.tables).find((table) => table.id === serviceTableId) ?? null;
  const selectedObject = useMemo(() => {
    if (!activeSector || !selection) return null;
    return selection.kind === "table"
      ? activeSector.tables.find((table) => table.id === selection.id) ?? null
      : activeSector.elements.find((element) => element.id === selection.id) ?? null;
  }, [activeSector, selection]);

  useEffect(() => {
    if (!selectedObject || !selection) { setDraft({}); return; }
    if (selection.kind === "table") {
      const table = selectedObject as DiningTable;
      setDraft({ name: table.name, capacity: String(table.capacity), status: table.status, shape: table.shape, x: String(table.x), y: String(table.y), width: String(table.width), height: String(table.height), rotation: String(table.rotation) });
    } else {
      const element = selectedObject as FloorElement;
      setDraft({ label: element.label ?? "", type: element.type, x: String(element.x), y: String(element.y), width: String(element.width), height: String(element.height), rotation: String(element.rotation) });
    }
  }, [selectedObject, selection]);
  useEffect(() => { setSectorName(activeSector?.name ?? ""); }, [activeSector?.id, activeSector?.name]);
  useEffect(() => { setSelection(null); setServiceTableId(""); setInteractiveTableId(""); }, [activeSectorId]);
  useEffect(() => {
    const tables = activeSector?.tables ?? [];
    setKeyboardTableId((current) => tables.some((table) => table.id === current)
      ? current
      : "");
  }, [activeSector]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (editing || !canOperate || createKind || showDeleteSector || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isInteractiveKeyboardTarget(event.target)) return;
      if (!activeSector) return;

      const directions: FloorDirection[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
      if (directions.includes(event.key as FloorDirection)) {
        event.preventDefault();
        const nextTable = findDirectionalTable(activeSector.tables, keyboardTableId, event.key as FloorDirection);
        if (!nextTable) return;
        setKeyboardTableId(nextTable.id);
        if (serviceTableId) { setServiceTableId(nextTable.id); setInteractiveTableId(activeSector.tables.find((table) => table.id === nextTable.id)?.status === "AVAILABLE" ? nextTable.id : ""); }
        return;
      }

      if (event.key !== "Enter" || event.repeat) return;
      const selectedTable = activeSector.tables.find((table) => table.id === keyboardTableId)
        ?? findDirectionalTable(activeSector.tables, "", "ArrowRight");
      if (!selectedTable) return;

      event.preventDefault();
      setKeyboardTableId(selectedTable.id);
      if (serviceTableId !== selectedTable.id) {
        setServiceTableId(selectedTable.id);
        setInteractiveTableId(activeSector.tables.find((table) => table.id === selectedTable.id)?.status === "AVAILABLE" ? selectedTable.id : "");
        return;
      }

      if (interactiveTableId !== selectedTable.id) {
        setInteractiveTableId(selectedTable.id);
        return;
      }

      servicePanelRef.current?.handleEnter();
    };

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [activeSector, canOperate, createKind, editing, interactiveTableId, keyboardTableId, serviceTableId, showDeleteSector]);

  useEffect(() => {
    if (!autoOpenTableId || serviceTableId !== autoOpenTableId) return;
    const frame = window.requestAnimationFrame(() => {
      servicePanelRef.current?.openAccountImmediately();
      setAutoOpenTableId("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoOpenTableId, serviceTableId]);

  function replaceTable(id: string, changes: Partial<DiningTable>) {
    setSectors((current) => current.map((sector) => ({ ...sector, tables: sector.tables.map((table) => table.id === id ? { ...table, ...changes } : table) })));
  }
  function replaceElement(id: string, changes: Partial<FloorElement>) {
    setSectors((current) => current.map((sector) => ({ ...sector, elements: sector.elements.map((element) => element.id === id ? { ...element, ...changes } : element) })));
  }
  function findTable(id: string) { return sectors.flatMap((sector) => sector.tables).find((table) => table.id === id); }
  function findElement(id: string) { return sectors.flatMap((sector) => sector.elements).find((element) => element.id === id); }
  function flash(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 2600); }

  async function saveTable(id: string, changes: Partial<DiningTable>, versionOverride?: number) {
    const current = findTable(id);
    if (!current) return;
    setSaving(true); setError("");
    try {
      const payload = await api<{ table: Partial<DiningTable> & { version: number } }>(`/api/floor/tables/${id}`, { method: "PUT", body: JSON.stringify({ ...changes, version: versionOverride ?? current.version }) });
      replaceTable(id, payload.table);
      flash("Mesa guardada");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar"); await load(true); }
    finally { setSaving(false); }
  }
  async function saveElement(id: string, changes: Partial<FloorElement>, versionOverride?: number) {
    const current = findElement(id);
    if (!current) return;
    setSaving(true); setError("");
    try {
      const payload = await api<{ element: Partial<FloorElement> & { version: number } }>(`/api/floor/elements/${id}`, { method: "PUT", body: JSON.stringify({ ...changes, version: versionOverride ?? current.version }) });
      replaceElement(id, payload.element);
      flash("Elemento guardado");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar"); await load(true); }
    finally { setSaving(false); }
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!activeSector || !editing) return;
    const [kind, id] = String(event.active.id).split(":");
    if (kind === "table") {
      const table = findTable(id); if (!table) return;
      const rect = normalizeFloorRect({ ...table, x: table.x + event.delta.x / FLOOR_EDITOR_SCALE, y: table.y + event.delta.y / FLOOR_EDITOR_SCALE }, { snap, minWidth: 70, minHeight: 60 });
      replaceTable(id, rect); await saveTable(id, rect, table.version);
    } else {
      const element = findElement(id); if (!element) return;
      const rect = normalizeFloorRect({ ...element, x: element.x + event.delta.x / FLOOR_EDITOR_SCALE, y: element.y + event.delta.y / FLOOR_EDITOR_SCALE }, { snap, minWidth: 30, minHeight: 20 });
      replaceElement(id, rect); await saveElement(id, rect, element.version);
    }
  }

  function beginResize(event: React.PointerEvent<HTMLButtonElement>, kind: "table" | "element", object: DiningTable | FloorElement) {
    event.preventDefault(); event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY, width: object.width, height: object.height };
    let latest = normalizeFloorRect(object, { snap, minWidth: kind === "table" ? 70 : 30, minHeight: kind === "table" ? 60 : 20 });
    const move = (pointer: PointerEvent) => {
      latest = normalizeFloorRect({ ...object, width: start.width + (pointer.clientX - start.x) / FLOOR_EDITOR_SCALE, height: start.height + (pointer.clientY - start.y) / FLOOR_EDITOR_SCALE }, { snap, minWidth: kind === "table" ? 70 : 30, minHeight: kind === "table" ? 60 : 20 });
      if (kind === "table") replaceTable(object.id, latest); else replaceElement(object.id, latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      if (kind === "table") saveTable(object.id, latest, object.version); else saveElement(object.id, latest, object.version);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up, { once: true });
  }

  async function create(data: { name: string; capacity: number; shape: string }) {
    if (createKind === "SECTOR") {
      const payload = await api<{ sector: Sector }>("/api/floor/sectors", { method: "POST", body: JSON.stringify({ name: data.name }) });
      await load(true); setActiveSectorId(payload.sector.id); flash("Sector creado"); return;
    }
    if (!activeSector || !createKind) return;
    const offset = ((activeSector.tables.length + activeSector.elements.length) % 8) * 25;
    if (createKind === "TABLE") {
      await api("/api/floor/tables", { method: "POST", body: JSON.stringify({ sectorId: activeSector.id, name: data.name, capacity: data.capacity, shape: data.shape, x: 80 + offset, y: 80 + offset }) });
    } else {
      const defaults = elementMeta[createKind].defaults;
      await api("/api/floor/elements", { method: "POST", body: JSON.stringify({ sectorId: activeSector.id, type: createKind, label: data.name, ...defaults, x: 100 + offset, y: 100 + offset }) });
    }
    await load(true); flash("Elemento agregado");
  }

  async function submitInspector(event: React.FormEvent) {
    event.preventDefault();
    if (!selection || !selectedObject) return;
    const rect = { x: Number(draft.x), y: Number(draft.y), width: Number(draft.width), height: Number(draft.height), rotation: Number(draft.rotation) };
    if (selection.kind === "table") await saveTable(selection.id, { ...rect, name: draft.name, capacity: Number(draft.capacity), status: draft.status as TableStatus, shape: draft.shape as DiningTable["shape"] });
    else await saveElement(selection.id, { ...rect, label: draft.label, type: draft.type as ElementType });
  }

  async function deleteSelected() {
    if (!selection || !selectedObject || !window.confirm("¿Eliminar este elemento del salón?")) return;
    setSaving(true); setError("");
    try {
      await api(`/api/floor/${selection.kind === "table" ? "tables" : "elements"}/${selection.id}?version=${selectedObject.version}`, { method: "DELETE" });
      setSelection(null); await load(true); flash("Elemento eliminado");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo eliminar"); }
    finally { setSaving(false); }
  }

  async function rotateSelected() {
    if (!selection || !selectedObject) return;
    const rotation = normalizeRotation(selectedObject.rotation + 15);
    if (selection.kind === "table") { replaceTable(selection.id, { rotation }); await saveTable(selection.id, { rotation }); }
    else { replaceElement(selection.id, { rotation }); await saveElement(selection.id, { rotation }); }
  }

  async function renameSector() {
    if (!activeSector || !sectorName.trim()) return;
    setSaving(true); setError("");
    try { await api(`/api/floor/sectors/${activeSector.id}`, { method: "PUT", body: JSON.stringify({ name: sectorName }) }); await load(true); flash("Sector renombrado"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo renombrar"); }
    finally { setSaving(false); }
  }
  async function deleteSector() {
    if (!activeSector) return;
    setSaving(true); setDeleteSectorError("");
    try {
      const result = await api<{ deletedTables: number; deletedElements: number }>(`/api/floor/sectors/${activeSector.id}`, { method: "DELETE" });
      setSelection(null); setShowDeleteSector(false); await load(true);
      flash(`Sector eliminado · ${result.deletedTables} mesas y ${result.deletedElements} elementos`);
    }
    catch (caught) { setDeleteSectorError(caught instanceof Error ? caught.message : "No se pudo eliminar"); }
    finally { setSaving(false); }
  }

  const totals = useMemo(() => ({
    tables: sectors.reduce((sum, sector) => sum + sector.tables.length, 0),
    occupied: sectors.reduce((sum, sector) => sum + sector.tables.filter((table) => table.status === "OCCUPIED" || table.status === "BILL_REQUESTED").length, 0),
    available: sectors.reduce((sum, sector) => sum + sector.tables.filter((table) => table.status === "AVAILABLE").length, 0),
  }), [sectors]);

  if (loading) return <div className="grid min-h-[60vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto h-7 w-7 animate-spin text-amber" /><p className="mt-3 text-sm text-[#929292]">Cargando salón…</p></div></div>;

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel/70 px-4 py-3">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-mint/10 text-mint"><Armchair className="h-5 w-5" /></div><div><p className="eyebrow mb-0.5">Operación en tiempo real</p><h1 className="font-black tracking-[-.035em]">Salón</h1></div></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="pill bg-panel text-[#b2b2b2]"><span className="mr-2 h-2 w-2 rounded-full bg-mint" />{totals.available} libres</div>
          <div className="pill bg-panel text-[#b2b2b2]"><span className="mr-2 h-2 w-2 rounded-full bg-danger" />{totals.occupied} en atención</div>
          {canManage && <button onClick={() => { setEditing((value) => !value); setSelection(null); setServiceTableId(""); }} className={editing ? "button-primary" : "button-secondary"}>{editing ? <LockKeyhole className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}{editing ? "Terminar edición" : "Editar plano"}</button>}
        </div>
      </div>

      {error && <div className="mb-4 flex items-center justify-between rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-[#ffb4a5]"><span>{error}</span><button onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
      {notice && <div className="fixed right-5 top-5 z-50 rounded-xl border border-mint/30 bg-[#2a2a2a] px-4 py-3 text-sm font-bold text-mint shadow-2xl">{notice}</div>}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-[#141414] p-1.5">
        <div className="mobile-scroll flex max-w-full gap-1 overflow-x-auto">
          {sectors.map((sector) => <button key={sector.id} onClick={() => setActiveSectorId(sector.id)} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition ${activeSectorId === sector.id ? "bg-amber text-ink shadow-md" : "text-[#9d9d9d] hover:bg-panel hover:text-cream"}`}>{sector.name}<span className="ml-2 rounded-full bg-black/15 px-1.5 py-0.5 text-[9px] opacity-70">{sector.tables.length}</span></button>)}
          {canManage && editing && <button onClick={() => setCreateKind("SECTOR")} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-dashed border-[#555555] text-[#959595] hover:border-amber hover:text-amber" title="Nuevo sector"><Plus className="h-4 w-4" /></button>}
        </div>
        {saving && <span className="flex items-center gap-2 text-xs font-semibold text-[#8e8e8e]"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Guardando en el servidor…</span>}
      </div>

      {editing && canManage && activeSector && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel p-3">
          <button onClick={() => setCreateKind("TABLE")} className="button-primary"><CirclePlus className="h-4 w-4" />Mesa</button>
          {(Object.keys(elementMeta) as ElementType[]).map((type) => { const Icon = elementMeta[type].icon; return <button key={type} onClick={() => setCreateKind(type)} className="button-secondary px-3"><Icon className="h-4 w-4" />{elementMeta[type].label}</button>; })}
          <div className="mx-1 hidden h-7 w-px bg-line sm:block" />
          <button onClick={() => setSnap((value) => !value)} className={`button-secondary px-3 ${snap ? "border-mint/40 text-mint" : ""}`}>{snap ? <Grid3X3 className="h-4 w-4" /> : <Grid2X2 className="h-4 w-4" />}Ajuste {snap ? "20 px" : "libre"}</button>
          <p className="ml-auto hidden text-xs text-[#727272] xl:block">Arrastrá para mover · esquina inferior para redimensionar</p>
        </div>
      )}

      {!activeSector ? <div className="surface grid min-h-[440px] place-items-center p-8 text-center"><div><Shapes className="mx-auto h-10 w-10 text-[#626262]" /><h2 className="mt-4 text-xl font-black">Todavía no hay sectores</h2><p className="mt-2 text-sm text-[#888888]">Creá el primer sector para comenzar a diseñar el salón.</p>{canManage && <button onClick={() => { setEditing(true); setCreateKind("SECTOR"); }} className="button-primary mt-5"><Plus className="h-4 w-4" />Crear sector</button>}</div></div> : (
        <div className={`grid items-start gap-3 ${editing ? "xl:grid-cols-[minmax(0,1fr)_310px]" : canOperate ? "xl:grid-cols-[510px_minmax(0,1fr)]" : ""}`}>
          <div className={`surface relative h-fit self-start overflow-hidden ${!editing && canOperate ? "xl:flex xl:h-[740px] xl:flex-col" : ""}`}>
            <div className={`${editing ? "flex justify-center overflow-auto" : "flex justify-center overflow-hidden xl:min-h-0 xl:flex-1 xl:items-center"} bg-[radial-gradient(circle_at_50%_42%,#19241f_0%,#0c0c0c_72%)] p-3`}>
              <DndContext sensors={sensors} onDragEnd={handleDragEnd} modifiers={editing ? [({ transform }) => ({ ...transform, x: transform.x / FLOOR_EDITOR_SCALE, y: transform.y / FLOOR_EDITOR_SCALE })] : undefined}>
                <div
                  onClick={() => !editing && setSelection(null)}
                  className="relative shrink-0 overflow-hidden rounded-xl border border-[#2f2f2f] bg-[#151515] shadow-inner"
                  style={{
                    width: editing ? FLOOR_CANVAS_WIDTH * FLOOR_EDITOR_SCALE : FLOOR_VIEW_WIDTH,
                    height: editing ? FLOOR_CANVAS_HEIGHT * FLOOR_EDITOR_SCALE : FLOOR_VIEW_HEIGHT,
                    backgroundImage: editing ? undefined : "radial-gradient(circle at 50% 40%, rgba(170,170,170,.035), transparent 60%)",
                  }}
                >
                  <div
                    onClick={() => editing && setSelection(null)}
                    className="absolute left-0 top-0 overflow-hidden"
                    style={{
                      width: FLOOR_CANVAS_WIDTH,
                      height: FLOOR_CANVAS_HEIGHT,
                      transform: editing ? `scale(${FLOOR_EDITOR_SCALE})` : `translate(${floorViewOffsetX}px, ${floorViewOffsetY}px) scale(${floorView.scale})`,
                      transformOrigin: "top left",
                      backgroundColor: editing ? "#151515" : "transparent",
                      backgroundImage: editing ? "linear-gradient(rgba(135,135,135,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(135,135,135,.1) 1px, transparent 1px)" : "none",
                      backgroundSize: editing ? `${FLOOR_GRID_SIZE}px ${FLOOR_GRID_SIZE}px` : "auto",
                    }}
                  >
                    {activeSector.elements.map((element) => <DraggableObject key={element.id} dragId={`element:${element.id}`} rect={element} disabled={!editing} selected={selection?.kind === "element" && selection.id === element.id} onSelect={() => editing && setSelection({ kind: "element", id: element.id })} onResize={(event) => beginResize(event, "element", element)}><ElementCard element={element} /></DraggableObject>)}
                    {activeSector.tables.map((table) => <DraggableObject key={table.id} dragId={`table:${table.id}`} rect={table} disabled={!editing} selected={editing ? selection?.kind === "table" && selection.id === table.id : keyboardTableId === table.id} onSelect={() => { if (editing) setSelection({ kind: "table", id: table.id }); else if (canOperate) { setKeyboardTableId(table.id); setServiceTableId(table.id); setInteractiveTableId(table.status === "AVAILABLE" ? table.id : ""); } }} onDoubleClick={() => { if (editing || !canOperate) return; setKeyboardTableId(table.id); setServiceTableId(table.id); setInteractiveTableId(table.id); if (shouldAutoOpenTable(table)) setAutoOpenTableId(table.id); }} onResize={(event) => beginResize(event, "table", table)}><TableCard table={table} operating={!editing} /></DraggableObject>)}
                    {editing && activeSector.tables.length === 0 && activeSector.elements.length === 0 && <div className="absolute inset-0 grid place-items-center text-center"><div><Armchair className="mx-auto h-9 w-9 text-[#515151]" /><p className="mt-3 font-bold text-[#8d8d8d]">Sector vacío</p><p className="mt-1 text-xs text-[#686868]">Usá la barra superior para agregar mesas y elementos.</p></div></div>}
                  </div>
                  {!editing && activeSector.tables.length === 0 && activeSector.elements.length === 0 && <div className="absolute inset-0 grid place-items-center text-center"><div><Armchair className="mx-auto h-9 w-9 text-[#515151]" /><p className="mt-3 font-bold text-[#8d8d8d]">Sector vacío</p><p className="mt-1 text-xs text-[#686868]">El administrador todavía no diseñó este sector.</p></div></div>}
                </div>
              </DndContext>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line bg-[#141414] px-3 py-2 text-[10px] font-semibold text-[#7b7b7b]">
              {(Object.keys(statusMeta) as TableStatus[]).map((status) => <span key={status} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${statusMeta[status].dot}`} />{statusMeta[status].label}</span>)}
              {!editing && canOperate && <span className="rounded-lg border border-line bg-ink px-2 py-1 text-[10px] text-[#a6a6a6]">← ↑ ↓ → seleccionar · Enter abrir / acción · Tab recorrer controles</span>}
              <span className="ml-auto">{activeSector.tables.length} mesas · capacidad {activeSector.tables.reduce((sum, table) => sum + table.capacity, 0)}</span>
            </div>
            {!editing && canOperate && <div ref={setProductHost} className="absolute inset-0 z-20 flex flex-col bg-[#141414] empty:hidden" />}
          </div>

          {editing && canManage && (
            <aside className="surface h-fit p-4 xl:sticky xl:top-6">
              {selectedObject && selection ? <form onSubmit={submitInspector}>
                <div className="mb-5 flex items-start justify-between"><div><p className="eyebrow mb-1">Propiedades</p><h2 className="text-lg font-black">{selection.kind === "table" ? (selectedObject as DiningTable).name : elementMeta[(selectedObject as FloorElement).type].label}</h2></div><button type="button" onClick={() => setSelection(null)} className="rounded-lg border border-line p-2 text-[#888888]"><X className="h-4 w-4" /></button></div>
                {selection.kind === "table" ? <>
                  <label><span className="mb-1.5 block text-xs font-semibold text-[#9c9c9c]">Nombre</span><input className="field py-2.5" value={draft.name ?? ""} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                  <div className="mt-3 grid grid-cols-2 gap-2"><label><span className="mb-1.5 block text-xs font-semibold text-[#9c9c9c]">Personas</span><input type="number" min="1" max="30" className="field py-2.5" value={draft.capacity ?? ""} onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} /></label><label><span className="mb-1.5 block text-xs font-semibold text-[#9c9c9c]">Forma</span><select className="field py-2.5" value={draft.shape ?? "ROUND"} onChange={(event) => setDraft({ ...draft, shape: event.target.value })}><option value="ROUND">Redonda</option><option value="SQUARE">Cuadrada</option><option value="RECTANGLE">Rectangular</option></select></label></div>
                  <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold text-[#9c9c9c]">Estado</span><select className="field py-2.5" value={draft.status ?? "AVAILABLE"} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{(Object.keys(statusMeta) as TableStatus[]).map((status) => <option key={status} value={status}>{statusMeta[status].label}</option>)}</select></label>
                </> : <>
                  <label><span className="mb-1.5 block text-xs font-semibold text-[#9c9c9c]">Etiqueta</span><input className="field py-2.5" value={draft.label ?? ""} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
                  <label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold text-[#9c9c9c]">Tipo</span><select className="field py-2.5" value={draft.type ?? "TEXT"} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>{(Object.keys(elementMeta) as ElementType[]).map((type) => <option key={type} value={type}>{elementMeta[type].label}</option>)}</select></label>
                </>}
                <div className="my-4 border-t border-line" />
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#717171]">Posición y tamaño</p>
                <div className="grid grid-cols-2 gap-2">{(["x", "y", "width", "height"] as const).map((field) => <label key={field}><span className="mb-1 block text-[10px] font-bold uppercase text-[#7e7e7e]">{field === "width" ? "Ancho" : field === "height" ? "Alto" : field.toUpperCase()}</span><input type="number" className="field px-2.5 py-2" value={draft[field] ?? ""} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} /></label>)}</div>
                <label className="mt-2 block"><span className="mb-1 block text-[10px] font-bold uppercase text-[#7e7e7e]">Rotación</span><div className="flex gap-2"><input type="number" className="field px-2.5 py-2" value={draft.rotation ?? "0"} onChange={(event) => setDraft({ ...draft, rotation: event.target.value })} /><button type="button" onClick={rotateSelected} className="button-secondary min-h-10 px-3" title="Girar 15 grados"><RotateCw className="h-4 w-4" /></button></div></label>
                <div className="mt-5 grid grid-cols-[1fr_auto] gap-2"><button disabled={saving} className="button-primary"><Save className="h-4 w-4" />Guardar</button><button type="button" onClick={deleteSelected} disabled={saving} className="button-secondary px-3 text-danger" title="Eliminar"><Trash2 className="h-4 w-4" /></button></div>
              </form> : <div>
                <p className="eyebrow mb-1">Sector activo</p><h2 className="mb-4 text-lg font-black">Configuración</h2>
                <label><span className="mb-1.5 block text-xs font-semibold text-[#9c9c9c]">Nombre del sector</span><input className="field py-2.5" value={sectorName} onChange={(event) => setSectorName(event.target.value)} /></label>
                <button onClick={renameSector} disabled={saving || !sectorName.trim()} className="button-secondary mt-3 w-full"><Save className="h-4 w-4" />Guardar nombre</button>
                <div className="my-5 border-t border-line" />
                <p className="text-sm font-bold">Cómo editar</p><ul className="mt-3 space-y-2 text-xs leading-relaxed text-[#888888]"><li>• Arrastrá cualquier objeto para moverlo.</li><li>• Usá la esquina marcada para cambiar su tamaño.</li><li>• Seleccioná una mesa para editar forma, capacidad y estado.</li><li>• Los cambios se confirman en PostgreSQL.</li></ul>
                <button onClick={() => { setDeleteSectorError(""); setShowDeleteSector(true); }} disabled={saving} className="mt-5 flex items-center gap-2 text-xs font-bold text-danger hover:underline"><Trash2 className="h-3.5 w-3.5" />Eliminar sector completo</button>
              </div>}
            </aside>
          )}

          {!editing && canOperate && <TableServicePanel ref={servicePanelRef} table={serviceTable} interactive={interactiveTableId === serviceTableId} productHost={productHost} close={() => { setServiceTableId(""); setInteractiveTableId(""); setKeyboardTableId(""); }} floorChanged={() => load(true)} canCharge={permissions.includes("cash.write")} paymentCompleted={(message) => { flash(message); setServiceTableId(""); setInteractiveTableId(""); setKeyboardTableId(""); load(true); }} tableReleased={(message) => { flash(message); setServiceTableId(""); setInteractiveTableId(""); setKeyboardTableId(""); load(true); }} />}
        </div>
      )}
      {createKind && <CreateModal kind={createKind} close={() => setCreateKind(null)} submit={create} />}
      {showDeleteSector && activeSector && <DeleteSectorModal sector={activeSector} busy={saving} error={deleteSectorError} close={() => { setShowDeleteSector(false); setDeleteSectorError(""); }} confirm={deleteSector} />}
    </div>
  );
}
