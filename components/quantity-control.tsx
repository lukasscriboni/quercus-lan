"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function QuantityControl({
  value,
  disabled = false,
  busy = false,
  min = 1,
  max = 100,
  step = 1,
  size = "normal",
  onChange,
}: {
  value: number;
  disabled?: boolean;
  busy?: boolean;
  min?: number;
  max?: number;
  step?: number;
  size?: "normal" | "large";
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const cancelBlur = useRef(false);

  useEffect(() => { if (!editing) setDraft(String(value)); }, [editing, value]);

  function commit() {
    if (cancelBlur.current) { cancelBlur.current = false; return; }
    const parsed = Number(draft);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    setEditing(false); setDraft(String(next));
    if (next !== value) onChange(next);
  }

  const buttonSize = size === "large" ? "h-11 w-11" : "h-9 w-9";
  const valueSize = size === "large" ? "h-14 w-24 text-3xl" : "h-9 w-12 text-sm";
  const unavailable = disabled || busy;
  const minusOpacity = disabled || value <= min ? "disabled:opacity-30" : busy ? "" : "disabled:opacity-30";
  const plusOpacity = disabled || value >= max ? "disabled:opacity-30" : busy ? "" : "disabled:opacity-30";
  return (
    <div className="flex items-center rounded-xl border border-line bg-ink">
      <button type="button" aria-label="Restar uno" disabled={unavailable || value <= min} onClick={() => onChange(Math.max(min, value - step))} className={`grid place-items-center text-[#989898] hover:text-cream ${minusOpacity} ${buttonSize}`}><Minus className={size === "large" ? "h-5 w-5" : "h-4 w-4"} /></button>
      {editing && !unavailable ? (
        <input
          autoFocus
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === "Escape") { cancelBlur.current = true; setDraft(String(value)); setEditing(false); event.currentTarget.blur(); }
          }}
          aria-label="Cantidad"
          className={`border-x border-line bg-[#080808] text-center font-black text-amber outline-none focus:bg-[#1b1b1b] ${valueSize}`}
        />
      ) : (
        <button type="button" disabled={unavailable} title="Editar cantidad" aria-label={`Editar cantidad actual: ${value}`} onClick={() => { setDraft(String(value)); setEditing(true); }} className={`border-x border-line text-center font-black text-amber hover:bg-[#252525] disabled:cursor-default ${busy && !disabled ? "" : "disabled:text-[#838383]"} ${valueSize}`}>{value.toLocaleString("es-AR")}</button>
      )}
      <button type="button" aria-label="Sumar uno" disabled={unavailable || value >= max} onClick={() => onChange(Math.min(max, value + step))} className={`grid place-items-center text-[#989898] hover:text-cream ${plusOpacity} ${buttonSize}`}><Plus className={size === "large" ? "h-5 w-5" : "h-4 w-4"} /></button>
    </div>
  );
}
