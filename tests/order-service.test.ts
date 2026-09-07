import { OrderStatus, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { getTableReleaseBlocker, lineTotal } from "../lib/order-service";

describe("cálculos de cuenta", () => {
  it("calcula cantidad por precio conservando decimales", () => {
    expect(lineTotal("3200.50", "2").toString()).toBe("6401");
  });

  it("aplica descuentos al total de la línea", () => {
    expect(lineTotal(new Prisma.Decimal(1000), 3, 250).toString()).toBe("2750");
  });

  it("nunca genera un total negativo", () => {
    expect(lineTotal(100, 1, 500).toString()).toBe("0");
  });
});

describe("liberación segura de mesa", () => {
  it("permite cancelar una cuenta activa completamente vacía", () => {
    expect(getTableReleaseBlocker(OrderStatus.OPEN, 0, 0)).toBeNull();
  });

  it("bloquea una cuenta con consumiciones", () => {
    expect(getTableReleaseBlocker(OrderStatus.IN_PROGRESS, 1, 0)).toBe("NOT_EMPTY");
  });

  it("bloquea una cuenta con pagos", () => {
    expect(getTableReleaseBlocker(OrderStatus.OPEN, 0, 1)).toBe("HAS_PAYMENT");
  });

  it("bloquea una cuenta cerrada", () => {
    expect(getTableReleaseBlocker(OrderStatus.PAID, 0, 0)).toBe("CLOSED");
  });
});
