"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function ConnectionStatus() {
  const [connected, setConnected] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource | undefined;
    const connect = () => {
      source?.close();
      source = new EventSource("/api/events");
      source.onopen = () => { setConnected(true); setReconnecting(false); };
      source.addEventListener("update", (event) => {
        const detail = JSON.parse((event as MessageEvent).data);
        window.dispatchEvent(new CustomEvent("quercus:update", { detail }));
      });
      source.onerror = () => {
        setConnected(false);
        setReconnecting(true);
        source?.close();
        retry = setTimeout(connect, 2500);
      };
    };
    const offline = () => { setConnected(false); setReconnecting(true); };
    const online = () => connect();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    connect();
    return () => {
      source?.close();
      if (retry) clearTimeout(retry);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  return (
    <>
      <div className="flex items-center gap-2 text-xs font-semibold text-[#91a099]">
        <span className={`h-2 w-2 rounded-full ${connected ? "live-dot bg-mint" : "bg-danger"}`} />
        {connected ? "Servidor local" : "Reconectando"}
      </div>
      {!connected && (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 items-center gap-3 rounded-2xl border border-danger/30 bg-[#2b1d19] px-4 py-3.5 shadow-2xl">
          <WifiOff className="h-5 w-5 shrink-0 text-danger" />
          <div><p className="text-sm font-bold">Sin conexión con el servidor local</p><p className="text-xs text-[#c59e95]">{reconnecting ? "Reintentando automáticamente. No cierres esta pantalla." : "Verificá la red del establecimiento."}</p></div>
        </div>
      )}
    </>
  );
}
