export function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function cleanText(value: unknown) {
  const text = String(value ?? "").replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
  return text || undefined;
}

export function parseArgentineNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let raw = String(value ?? "")
    .trim()
    .replace(/\u00a0/g, "")
    .replace(/\s/g, "")
    .replace(/^(ARS|AR\$|\$)/i, "")
    .replace(/%$/, "");
  if (!raw) return null;
  const parenthesized = raw.startsWith("(") && raw.endsWith(")");
  if (parenthesized) raw = raw.slice(1, -1);
  if (!/^[+-]?[\d.,]+$/.test(raw)) return null;

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  let normalized = raw;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = raw.split(thousands).join("").replace(decimal, ".");
  } else if (comma >= 0) {
    const parts = raw.split(",");
    const looksThousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].replace(/[+-]/, "").length <= 3);
    normalized = looksThousands ? parts.join("") : `${parts.slice(0, -1).join("")}.${parts.at(-1)}`;
  } else if (dot >= 0) {
    const parts = raw.split(".");
    const looksThousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].replace(/[+-]/, "").length <= 3);
    normalized = looksThousands ? parts.join("") : raw;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parenthesized ? -Math.abs(parsed) : parsed;
}

export function parseBoolean(value: unknown, fallback = true) {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;
  if (["si", "s", "true", "1", "activo", "x"].includes(normalized)) return true;
  if (["no", "n", "false", "0", "inactivo"].includes(normalized)) return false;
  return fallback;
}
