import { describe, expect, it } from "vitest";
import { findDirectionalTable, type NavigableTable } from "../lib/floor-keyboard";

const tables: NavigableTable[] = [
  { id: "top-left", x: 0, y: 0, width: 100, height: 80 },
  { id: "top-right", x: 220, y: 0, width: 100, height: 80 },
  { id: "bottom-left", x: 0, y: 180, width: 100, height: 80 },
  { id: "bottom-right", x: 220, y: 180, width: 100, height: 80 },
];

describe("navegacion de mesas con teclado", () => {
  it("elige la primera mesa de arriba a la izquierda cuando no hay seleccion", () => {
    expect(findDirectionalTable(tables, "", "ArrowRight")?.id).toBe("top-left");
  });

  it("se mueve horizontalmente hacia la mesa mas cercana", () => {
    expect(findDirectionalTable(tables, "top-left", "ArrowRight")?.id).toBe("top-right");
    expect(findDirectionalTable(tables, "top-right", "ArrowLeft")?.id).toBe("top-left");
  });

  it("se mueve verticalmente hacia la mesa mas cercana", () => {
    expect(findDirectionalTable(tables, "top-left", "ArrowDown")?.id).toBe("bottom-left");
    expect(findDirectionalTable(tables, "bottom-right", "ArrowUp")?.id).toBe("top-right");
  });

  it("mantiene la seleccion si no hay una mesa en esa direccion", () => {
    expect(findDirectionalTable(tables, "top-left", "ArrowLeft")?.id).toBe("top-left");
  });
});
