import { describe, expect, it } from "vitest";
import {
  FLOOR_CANVAS_HEIGHT,
  FLOOR_CANVAS_WIDTH,
  normalizeFloorRect,
  normalizeRotation,
  snapValue,
} from "../lib/floor";

describe("geometría del salón", () => {
  it("ajusta posiciones a una grilla configurable", () => {
    expect(snapValue(31, 20)).toBe(40);
    expect(snapValue(29, 20)).toBe(20);
  });

  it("impide que una mesa salga de los límites del plano", () => {
    const rect = normalizeFloorRect({ x: 1080, y: 640, width: 120, height: 90, rotation: 0 });
    expect(rect.x + rect.width).toBeLessThanOrEqual(FLOOR_CANVAS_WIDTH);
    expect(rect.y + rect.height).toBeLessThanOrEqual(FLOOR_CANVAS_HEIGHT);
  });

  it("respeta tamaños mínimos y descarta valores no finitos", () => {
    const rect = normalizeFloorRect({ x: Number.NaN, y: -100, width: 1, height: 2, rotation: Number.NaN }, { minWidth: 70, minHeight: 60 });
    expect(rect).toMatchObject({ x: 0, y: 0, width: 70, height: 60, rotation: 0 });
  });

  it("normaliza rotaciones negativas y mayores a una vuelta", () => {
    expect(normalizeRotation(-15)).toBe(345);
    expect(normalizeRotation(390)).toBe(30);
  });

  it("aplica snap también al tamaño sin exceder el lienzo", () => {
    const rect = normalizeFloorRect({ x: 43, y: 57, width: 133, height: 97, rotation: 0 }, { snap: true });
    expect(rect).toMatchObject({ x: 40, y: 60, width: 140, height: 100 });
  });
});
