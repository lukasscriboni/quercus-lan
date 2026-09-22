"use client";

import { AlertTriangle, Check, CheckCircle2, LoaderCircle, LockKeyhole, RotateCcw, Save, ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Permission = { key: string; group: string; label: string; description: string };
type Role = { id: string; name: string; description: string | null; isSystem: boolean; userCount: number; permissionKeys: string[] };
type UserAccount = { id: string; displayName: string; username: string; isActive: boolean; createdAt: string; lastLoginAt: string | null; role: { id: string; name: string } };
type RolesPayload = { currentRole: string; permissions: Permission[]; roles: Role[]; users: UserAccount[] };

const roleLabels: Record<string, string> = { ADMIN: "Administrador", CASHIER: "Caja", WAITER: "Mozo", KITCHEN: "Cocina" };
const dateTime = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" });

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
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [userForm, setUserForm] = useState({ displayName: "", username: "", password: "", roleId: "" });

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
  useEffect(() => { setDraft(selected?.permissionKeys ?? []); setDraftName(selected ? (roleLabels[selected.name] ?? selected.name) : ""); setDraftDescription(selected?.description ?? ""); setSuccess(""); }, [selected]);

  const groups = useMemo(() => {
    const result = new Map<string, Permission[]>();
    for (const permission of data?.permissions ?? []) result.set(permission.group, [...(result.get(permission.group) ?? []), permission]);
    return [...result.entries()];
  }, [data?.permissions]);
  const dirty = selected ? [...draft].sort().join("|") !== [...selected.permissionKeys].sort().join("|") || draftName.trim() !== (roleLabels[selected.name] ?? selected.name) || draftDescription.trim() !== (selected.description ?? "") : false;
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
      const payload = await request<{ role: { id: string; name: string; description: string | null; permissionKeys: string[] }; appliesToCurrentUser: boolean }>(`/api/roles/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName, description: draftDescription, permissionKeys: draft }),
      });
      setData((current) => current ? { ...current, currentRole: payload.appliesToCurrentUser ? payload.role.name : current.currentRole, roles: current.roles.map((role) => role.id === selected.id ? { ...role, name: payload.role.name, description: payload.role.description, permissionKeys: payload.role.permissionKeys } : role), users: current.users.map((user) => user.role.id === selected.id ? { ...user, role: { ...user.role, name: payload.role.name } } : user) } : current);
      setDraft(payload.role.permissionKeys);
      setDraftName(payload.role.name); setDraftDescription(payload.role.description ?? "");
      setSuccess("Los permisos del rol se actualizaron correctamente.");
      if (payload.appliesToCurrentUser) router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron guardar los permisos");
    } finally { setSaving(false); }
  }

  async function createUser(event: React.FormEvent) {
    event.preventDefault(); setCreatingUser(true); setError(""); setSuccess("");
    try {
      const payload = await request<{ user: UserAccount }>("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(userForm) });
      setData((current) => current ? { ...current, users: [...current.users, payload.user].sort((a, b) => a.displayName.localeCompare(b.displayName)), roles: current.roles.map((role) => role.id === payload.user.role.id ? { ...role, userCount: role.userCount + 1 } : role) } : current);
      setUserForm({ displayName: "", username: "", password: "", roleId: "" });
      setShowCreateUser(false); setSuccess(`La cuenta de ${payload.user.displayName} fue creada correctamente.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo crear la cuenta"); }
    finally { setCreatingUser(false); }
  }

  if (loading && !data) return <div className="grid min-h-[55vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto h-9 w-9 animate-spin text-amber" /><p className="mt-3 text-sm text-[#8c8c8c]">Cargando roles y funciones…</p></div></div>;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow mb-2">Administración</p><h1 className="text-3xl font-black tracking-[-.035em] sm:text-4xl">Roles y permisos</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#999999]">Creá cuentas de acceso y asigná a cada persona un rol con sus funciones.</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => { setUserForm((current) => ({ ...current, roleId: current.roleId || data?.roles[0]?.id || "" })); setShowCreateUser(true); }} className="button-primary"><UserPlus className="h-4 w-4" />Agregar cuenta</button><button type="button" disabled={loading || saving} onClick={load} className="button-secondary"><RotateCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar</button><button type="button" disabled={!dirty || saving} onClick={save} className="button-primary">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar cambios</button></div></div>

      {error && <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-[#ffb4a5]"><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</span><button type="button" onClick={() => setError("")}><X className="h-4 w-4" /></button></div>}
      {success && <div className="mb-5 flex items-center gap-2 rounded-xl border border-mint/25 bg-mint/10 px-4 py-3 text-sm font-semibold text-mint"><CheckCircle2 className="h-4 w-4" />{success}</div>}

      <div className="grid gap-5 lg:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="surface h-fit overflow-hidden">
          <div className="border-b border-line px-5 py-4"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#808080]">Roles disponibles</p></div>
          <div className="divide-y divide-line">{data?.roles.map((role) => {
            const active = role.id === selectedId;
            return <button type="button" key={role.id} onClick={() => selectRole(role)} className={`flex w-full items-center gap-3 px-4 py-4 text-left transition ${active ? "bg-amber/10" : "hover:bg-[#262626]"}`}><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? "bg-amber text-ink" : "bg-ink text-[#808080]"}`}><ShieldCheck className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className={`truncate text-sm font-black ${active ? "text-amber" : "text-cream"}`}>{roleLabels[role.name] ?? role.name}</p>{role.name === data.currentRole && <span className="rounded-full bg-mint/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-mint">Tu rol</span>}</div><p className="mt-1 flex items-center gap-1 text-[11px] text-[#7b7b7b]"><UsersRound className="h-3 w-3" />{role.userCount} {role.userCount === 1 ? "usuario" : "usuarios"} · {role.permissionKeys.length} funciones</p></div></button>;
          })}</div>
        </aside>

        <section className="surface overflow-hidden">
          {!selected ? <div className="grid min-h-96 place-items-center text-sm text-[#7e7e7e]">No hay roles configurados.</div> : <>
            <header className="border-b border-line px-5 py-5 sm:px-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-2"><h2 className="text-2xl font-black">Editar rol</h2>{selected.isSystem && <span className="pill bg-ink text-[#959595]">Rol del sistema</span>}</div><div className="flex gap-2"><button type="button" disabled={saving} onClick={clearAll} className="button-secondary min-h-9 px-3 py-2 text-xs">Quitar todas</button><button type="button" disabled={saving} onClick={selectAll} className="button-secondary min-h-9 px-3 py-2 text-xs"><Check className="h-3.5 w-3.5" />Agregar todas</button></div></div><div className="mt-4 grid gap-3 sm:grid-cols-[minmax(220px,.65fr)_minmax(280px,1.35fr)]"><label><span className="mb-1.5 block text-xs font-semibold text-[#a4a4a4]">Nombre del rol</span><input className="field" value={draftName} maxLength={80} onChange={(event) => { setDraftName(event.target.value); setSuccess(""); }} /></label><label><span className="mb-1.5 block text-xs font-semibold text-[#a4a4a4]">Descripción</span><input className="field" value={draftDescription} maxLength={240} onChange={(event) => { setDraftDescription(event.target.value); setSuccess(""); }} placeholder="Qué función cumple este rol" /></label></div><p className="mt-3 text-sm text-[#888888]">{draft.length} de {data?.permissions.length ?? 0} funciones habilitadas</p></header>
            {protectsAdministration && <div className="mx-5 mt-5 flex items-start gap-3 rounded-xl border border-amber/25 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-[#ababab] sm:mx-6"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber" /><span>La función <strong className="text-cream">Administrar roles</strong> está protegida en este rol para que siempre puedas volver a esta pantalla.</span></div>}
            <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-2">{groups.map(([group, permissions]) => <div key={group} className="rounded-2xl border border-line bg-[#141414] p-4"><p className="mb-3 text-[10px] font-black uppercase tracking-[.16em] text-mint">{group}</p><div className="space-y-2">{permissions.map((permission) => {
              const checked = draft.includes(permission.key);
              const locked = protectsAdministration && permission.key === "users.manage";
              return <label key={permission.key} className={`flex items-start gap-3 rounded-xl border p-3.5 transition ${checked ? "border-amber/30 bg-amber/5" : "border-line bg-ink"} ${locked ? "cursor-not-allowed" : "cursor-pointer hover:border-[#4e4e4e]"}`}><input type="checkbox" checked={checked} disabled={locked || saving} onChange={() => toggle(permission.key)} className="mt-1 h-4 w-4 shrink-0 accent-[#b8b8b8]" /><span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-bold">{permission.label}{locked && <LockKeyhole className="h-3.5 w-3.5 text-amber" />}</span><span className="mt-1 block text-xs leading-relaxed text-[#7b7b7b]">{permission.description}</span></span></label>;
            })}</div></div>)}</div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#141414] px-5 py-4 sm:px-6"><p className={`text-xs font-semibold ${dirty ? "text-amber" : "text-[#717171]"}`}>{dirty ? "Hay cambios sin guardar" : "Todos los cambios están guardados"}</p><button type="button" disabled={!dirty || saving} onClick={save} className="button-primary">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar cambios</button></footer>
          </>}
        </section>
      </div>
      <section className="surface mt-5 overflow-hidden"><div className="flex items-center justify-between border-b border-line px-5 py-4"><div><p className="font-black">Lista de usuarios</p><p className="mt-1 text-xs text-[#7b7b7b]">Datos de acceso, rol asignado y actividad de cada cuenta.</p></div><span className="pill bg-ink text-[#a3a3a3]">{data?.users.length ?? 0} usuarios</span></div><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left"><thead className="border-b border-line bg-[#141414] text-[10px] font-bold uppercase tracking-[.12em] text-[#7b7b7b]"><tr><th className="px-5 py-3">Nombre</th><th className="px-4 py-3">Usuario</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Creada</th><th className="px-5 py-3">Último ingreso</th></tr></thead><tbody className="divide-y divide-line">{data?.users.map((user) => <tr key={user.id} className="hover:bg-[#222222]"><td className="px-5 py-4 font-black">{user.displayName}</td><td className="px-4 py-4 text-sm text-[#a3a3a3]">@{user.username}</td><td className="px-4 py-4"><span className="inline-flex items-center gap-1.5 text-sm font-bold"><ShieldCheck className="h-3.5 w-3.5 text-amber" />{roleLabels[user.role.name] ?? user.role.name}</span></td><td className="px-4 py-4"><span className={`pill ${user.isActive ? "bg-mint/10 text-mint" : "bg-danger/10 text-danger"}`}>{user.isActive ? "Activa" : "Inactiva"}</span></td><td className="whitespace-nowrap px-4 py-4 text-xs text-[#888888]">{dateTime.format(new Date(user.createdAt))}</td><td className="whitespace-nowrap px-5 py-4 text-xs text-[#888888]">{user.lastLoginAt ? dateTime.format(new Date(user.lastLoginAt)) : "Todavía no ingresó"}</td></tr>)}</tbody></table></div></section>
      {showCreateUser && <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && !creatingUser && setShowCreateUser(false)}><form onSubmit={createUser} className="surface w-full max-w-lg p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="eyebrow mb-1">Nuevo acceso</p><h2 className="text-2xl font-black">Agregar cuenta</h2><p className="mt-2 text-sm text-[#888888]">La persona ingresará con el usuario y la contraseña que definas.</p></div><button type="button" disabled={creatingUser} onClick={() => setShowCreateUser(false)} className="rounded-xl border border-line p-2 text-[#929292]"><X className="h-4 w-4" /></button></div><div className="mt-5 space-y-4"><label className="block"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Nombre visible *</span><input autoFocus required maxLength={120} className="field" value={userForm.displayName} onChange={(event) => setUserForm({ ...userForm, displayName: event.target.value })} placeholder="Ej. Juan Pérez" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Usuario *</span><input required minLength={3} maxLength={80} className="field" value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} placeholder="Ej. juan" autoComplete="off" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Contraseña inicial *</span><input required minLength={6} maxLength={200} type="password" className="field" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} placeholder="Mínimo 6 caracteres" autoComplete="new-password" /></label><label className="block"><span className="mb-2 block text-xs font-semibold text-[#a4a4a4]">Rol asignado *</span><select required className="field" value={userForm.roleId} onChange={(event) => setUserForm({ ...userForm, roleId: event.target.value })}><option value="">Seleccionar rol</option>{data?.roles.map((role) => <option key={role.id} value={role.id}>{roleLabels[role.name] ?? role.name}</option>)}</select></label></div><div className="mt-6 flex justify-end gap-3"><button type="button" disabled={creatingUser} onClick={() => setShowCreateUser(false)} className="button-secondary">Cancelar</button><button disabled={creatingUser} className="button-primary">{creatingUser ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Crear cuenta</button></div></form></div>}
    </div>
  );
}
