"use client";

import { Barcode, Type } from "lucide-react";
import { useEffect, useState } from "react";

export type ProductSearchMode = "name" | "barcode";
const eventName = "quercus:product-search-mode";

export function changeProductSearchMode(mode?: ProductSearchMode) {
  const current = (window.localStorage.getItem(eventName) as ProductSearchMode | null) ?? "barcode";
  const next = mode ?? (current === "name" ? "barcode" : "name");
  window.localStorage.setItem(eventName, next);
  window.dispatchEvent(new CustomEvent<ProductSearchMode>(eventName, { detail: next }));
  window.requestAnimationFrame(() => {
    const search = [...document.querySelectorAll<HTMLInputElement>('input[placeholder*="producto"], input[placeholder*="código de barras"]')]
      .find((input) => !input.disabled && input.getClientRects().length > 0);
    search?.focus();
    search?.select();
  });
}

export function useProductSearchMode() {
  const [mode, setMode] = useState<ProductSearchMode>("barcode");
  useEffect(() => {
    window.localStorage.setItem(eventName, "barcode");
    setMode("barcode");
    const update = (event: Event) => {
      setMode((event as CustomEvent<ProductSearchMode>).detail);
    };
    window.addEventListener(eventName, update);
    return () => window.removeEventListener(eventName, update);
  }, []);
  return mode;
}

export function ProductSearchModeControl({ mode }: { mode: ProductSearchMode }) {
  return <div className="mb-2"><div className="flex items-center gap-1 rounded-lg border border-line bg-ink p-1 text-[10px] font-black"><button type="button" onClick={() => changeProductSearchMode("barcode")} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 ${mode === "barcode" ? "bg-amber text-ink" : "text-[#888888]"}`}><Barcode className="h-3 w-3" />Código de barras</button><button type="button" onClick={() => changeProductSearchMode("name")} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 ${mode === "name" ? "bg-amber text-ink" : "text-[#888888]"}`}><Type className="h-3 w-3" />Nombre</button><kbd className="ml-auto px-1.5 text-[#6c6c6c]">F11</kbd></div><p className="mt-1.5 px-1 text-[10px] text-[#787878]">{mode === "barcode" ? "Ingresá el código completo y presioná Enter." : "Escribí el nombre completo o algunas de sus partes."}</p></div>;
}
