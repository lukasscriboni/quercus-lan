"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Router, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";

export function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo iniciar sesión");
      router.replace("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "Failed to fetch" ? "Sin conexión con el servidor local" : caught instanceof Error ? caught.message : "No se pudo iniciar sesión");
    } finally { setBusy(false); }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_.9fr]">
      <section className="relative hidden overflow-hidden border-r border-line p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "linear-gradient(rgba(180,180,180,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(180,180,180,.08) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="relative"><Brand /></div>
        <div className="relative max-w-xl">
          <p className="eyebrow mb-5">La jornada, bajo control</p>
          <h1 className="text-5xl font-black leading-[1.04] tracking-[-.04em] xl:text-6xl">Todo el bar.<br /><span className="text-amber">En tu propia red.</span></h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#afafaf]">Caja, cocina, mozos y administración trabajando sobre la misma información.</p>
        </div>
        <div className="relative flex gap-8 text-sm text-[#8e8e8e]">
          <span className="flex items-center gap-2"><Router className="h-4 w-4 text-mint" /> 100% LAN</span>
          <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-mint" /> Datos en el local</span>
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><Brand /></div>
          <div className="mb-8">
            <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-panel text-amber"><LockKeyhole className="h-5 w-5" /></div>
            <p className="eyebrow mb-2">Acceso al sistema</p>
            <h2 className="text-3xl font-black tracking-[-.03em]">Bienvenido a la jornada</h2>
            <p className="mt-2 text-sm text-[#999999]">Ingresá con tu usuario asignado.</p>
          </div>
          <form onSubmit={submit} className="surface p-5 sm:p-6">
            <label className="mb-5 block"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Usuario</span><input className="field" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus placeholder="Ej. cajero" /></label>
            <label className="mb-5 block"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Contraseña</span><input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Tu contraseña" /></label>
            {error && <div role="alert" className="mb-5 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-3 text-sm text-[#ffb4a5]">{error}</div>}
            <button className="button-primary w-full" disabled={busy}>{busy ? "Verificando…" : <>Entrar <ArrowRight className="h-4 w-4" /></>}</button>
          </form>
          <p className="mt-5 text-center text-xs text-[#6d6d6d]">Servidor local · Los datos no salen del establecimiento</p>
        </div>
      </section>
    </main>
  );
}
