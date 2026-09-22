import Image from "next/image";

export function BrandMark({ size = "small" }: { size?: "small" | "large" }) {
  const pixels = size === "large" ? 64 : 40;
  return (
    <div aria-hidden="true" className={`${size === "large" ? "h-16 w-16 rounded-2xl" : "h-10 w-10 rounded-xl"} relative shrink-0 overflow-hidden`}>
      <Image src="/quercus-q.png" alt="" width={pixels} height={pixels} priority className="h-full w-full object-contain object-center" />
    </div>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      {!compact && <div><div className="text-[15px] font-black tracking-[.16em] text-[#bcbcbc]">QUERCUS</div><div className="text-[10px] font-medium uppercase tracking-[.15em] text-[#777777]">operaciones locales</div></div>}
    </div>
  );
}
