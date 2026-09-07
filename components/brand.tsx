export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-xl border border-amber/30 bg-amber/10 text-xl font-black text-amber">Q</div>
      {!compact && <div><div className="text-[15px] font-extrabold tracking-[.12em]">QUERCUS</div><div className="text-[10px] font-medium uppercase tracking-[.15em] text-[#82918a]">operaciones locales</div></div>}
    </div>
  );
}
