export const FLOOR_CANVAS_WIDTH = 1100;
export const FLOOR_CANVAS_HEIGHT = 650;
export const FLOOR_GRID_SIZE = 20;

export type FloorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function snapValue(value: number, grid = FLOOR_GRID_SIZE) {
  return Math.round(value / grid) * grid;
}

export function normalizeRotation(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function normalizeFloorRect(
  rect: Partial<FloorRect>,
  options: { snap?: boolean; minWidth?: number; minHeight?: number } = {},
): FloorRect {
  const minWidth = options.minWidth ?? 60;
  const minHeight = options.minHeight ?? 50;
  const snap = options.snap ?? false;
  const value = (candidate: number | undefined, fallback: number) =>
    Number.isFinite(candidate) ? (candidate as number) : fallback;
  const applySnap = (candidate: number) => (snap ? snapValue(candidate) : candidate);

  const width = clamp(applySnap(value(rect.width, 120)), minWidth, FLOOR_CANVAS_WIDTH);
  const height = clamp(applySnap(value(rect.height, 90)), minHeight, FLOOR_CANVAS_HEIGHT);
  const x = clamp(applySnap(value(rect.x, 0)), 0, FLOOR_CANVAS_WIDTH - width);
  const y = clamp(applySnap(value(rect.y, 0)), 0, FLOOR_CANVAS_HEIGHT - height);

  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    rotation: Math.round(normalizeRotation(value(rect.rotation, 0)) * 100) / 100,
  };
}
