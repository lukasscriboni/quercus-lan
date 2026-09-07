"use client";

import { AlertTriangle, Check, CheckCircle2, LoaderCircle, LockKeyhole, RotateCcw, Save, ShieldCheck, UsersRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Permission = { key: string; group: string; label: string; description: string };
type Role = { id: string; name: string; description: string | null; isSystem: boolean; userCount: number; permissionKeys: string[] };
type RolesPayload = { currentRole: string; permissions: Permission[]; roles: Role[] };

const roleLabels: Record<string, string> = { ADMIN: "Administrador", CASHIER: "Caja", WAITER: "Mozo", KITCHEN: "Cocina" };

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "No se pudo completar la operación");
  return payload as T;
}

export function RolesManager() {
  const router = useRouter();
  const [data, setData] = useState<RolesPayload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const payload = await request<RolesPayload>("/api/roles");
      setData(payload);
      setSelectedId((current) => current && payload.roles.some((role) => role.id === current) ? current : payload.roles[0]?.id ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar los roles");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const selected = data?.roles.find((role) => role.id === selectedId) ?? null;
  useEffect(() => { setDraft(selected?.permissionKeys ?? []); setSuccess(""); }, [selected]);

  const groups = useMemo(() => {
    const result = new Map<string, Permission[]>();
    for (const permission of data?.permissions ?? []) result.set(permission.group, [...(result.get(permission.group) ?? []), permission]);
    return [...result.entries()];
  }, [data?.permissions]);
  const dirty = selected ? [...draft].sort().join("|") !== [...selected.permissionKeys].sort().join("|") : false;
  const protectsAdministration = selected?.name === "ADMIN" || selected?.name === data?.currentRole;

  function selectRole(role: Role) {
    setSelectedId(role.id); setDraft(role.permissionKeys); setError(""); setSuccess("");
  }

  function toggle(key: string) {
    if (protectsAdministration && key === "users.manage") return;
    setDraft((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
    setSuccess("");
  }

  function selectAll() {
    setDraft(data?.permissions.map((permission) => permission.key) ?? []); setSuccess("");
  }

  function clearAll() {
    setDraft(protectsAdministration ? ["users.manage"] : []); setSuccess("");
  }

  async function save() {
    if (!selected || !dirty) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = await request<{ role: { id: string; permissionKeys: string[] }; appliesToCurrentUser: boolean }>(`/api/roles/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionKeys: draft }),
      });
      setData((current) => current ? { ...current, roles: current.roles.map((role) => role.id === selected.id ? { ...role, permissionKeys: payload.role.permissionKeys } : role) } : current);
      setDraft(payload.role.permissionKeys);
      setSuccess("Los permisos del rol se actualizaron correctamente.");
      if (payload.appliesToCurrentUser) router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron guardar los permisos");
    } finally { setSaving(false); }
  }

  if (loading && !data) return <div className="grid min-h-[55vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto h-9 w-9 animate-spin text-amber" /><p className="mt-3 text-sm text-[#829089]">Cargando roles y funciones…</p></div></div>;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow mb-2">Administración</p><h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Roles y permisos</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#8f9d96]">Elegí qué partes de la aplicación puede ver y modificar cada tipo de usuario.</p></div><div className="flex items-center gap-2"><button type="button" disabled={loading || saving} onClick={load} className="button-secondary"><RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button><button type="button" disabled={!dirty || saving} onClick={save} className="button-primary">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar cambios</button></div></div>

      {error && <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-[#ffb4a5]"><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</span><button type="button" onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
      {success && <div className="mb-5 flex items-center gap-2 rounded-xl border border-mint/25 bg-mint/10 px-4 py-3 text-sm font-semibold text-mint"><CheckCircle2 className="h-4 w-4" />{success}</div>}

      <div className="grid gap-5 lg:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="surface h-fit overflow-hidden">
          <div className="border-b border-line px-5 py-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#77847e]">Roles disponibles</p></div>
          <div className="divide-y divide-line">{data?.roles.map((role) => {
            const active = role.id === selectedId;
            return <button type="button" key={role.id} onClick={() => selectRole(role)} className={`flex w-full items-center gap-3 px-4 py-4 text-left transition ${active ? "bg-amber/10" : "hover:bg-[#1c2723]"}`}><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? "bg-amber text-ink" : "bg-ink text-[#77847e]"}`}><ShieldCheck className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className={`truncate text-sm font-black ${active ? "text-amber" : "text-cream"}`}>{roleLabels[role.name] ?? role.name}</p>{role.name === data.currentRole && <span className="rounded-full bg-mint/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-mint">Tu rol</span>}</div><p className="mt-1 flex items-center gap-1 text-[11px] text-[#718078]"><UsersRound className="h-3 w-3" />{role.userCount} {role.userCount === 1 ? "usuario" : "usuarios"} · {role.permissionKeys.length} funciones</p></div></button>;
          })}</div>
        </aside>

        <section className="surface overflow-hidden">
          {!selected ? <div className="grid min-h-96 place-items-center text-sm text-[#75827c]">No hay roles configurados.</div> : <>
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-6"><div><div className="flex items-center gap-2"><h2 className="text-2xl font-black">{roleLabels[selected.name] ?? selected.name}</h2>{selected.isSystem && <span className="pill bg-ink text-[#8c9993]">Rol del sistema</span>}</div><p className="mt-2 text-sm text-[#7f8c86]">{draft.length} de {data?.permissions.length ?? 0} funciones habilitadas</p></div><div className="flex gap-2"><button type="button" disabled={saving} onClick={clearAll} className="button-secondary min-h-9 px-3 py-2 text-xs">Quitar todas</button><button type="button" disabled={saving} onClick={selectAll} className="button-secondary min-h-9 px-3 py-2 text-xs"><Check className="h-3.5 w-3.5" />Agregar todas</button></div></header>
            {protectsAdministration && <div className="mx-5 mt-5 flex items-start gap-3 rounded-xl border border-amber/25 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-[#b8aa8e] sm:mx-6"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber" /><span>La función <strong className="text-cream">Administrar roles</strong> está protegida en este rol para que siempre puedas volver a esta pantalla.</span></div>}
            <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-2">{groups.map(([group, permissions]) => <div key={group} className="rounded-2xl border border-line bg-[#141d1a] p-4"><p className="mb-3 text-[10px] font-black uppercase tracking-[.16em] text-mint">{group}</p><div className="space-y-2">{permissions.map((permission) => {
              const checked = draft.includes(permission.key);
              const locked = protectsAdministration && permission.key === "users.manage";
              return <label key={permission.key} className={`flex items-start gap-3 rounded-xl border p-3.5 transition ${checked ? "border-amber/30 bg-amber/5" : "border-line bg-ink"} ${locked ? "cursor-not-allowed" : "cursor-pointer hover:border-[#43534d]"}`}><input type="checkbox" checked={checked} disabled={locked || saving} onChange={() => toggle(permission.key)} className="mt-1 h-4 w-4 shrink-0 accent-[#e6a63a]" /><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-bold">{permission.label}{locked && <LockKeyhole className="h-3.5 w-3.5 text-amber" />}</span><span className="mt-1 block text-xs leading-relaxed text-[#718078]">{permission.description}</span></span></label>;
            })}</div></div>)}</div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#141d1a] px-5 py-4 sm:px-6"><p className={`text-xs font-semibold ${dirty ? "text-amber" : "text-[#68756f]"}`}>{dirty ? "Hay cambios sin guardar" : "Todos los cambios están guardados"}</p><button type="button" disabled={!dirty || saving} onClick={save} className="button-primary">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar cambios</button></footer>
          </>}
        </section>
      </div>
    </div>
  );
}
