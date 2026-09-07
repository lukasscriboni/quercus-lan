import { Prisma, StockMode, StockMovementType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { applyOrderStockDelta } from "../lib/order-stock";

function directStockTransaction(quantity: number) {
  return {
    product: { findUnique: vi.fn().mockResolvedValue({ id: "product-1", stockMode: StockMode.DIRECT, recipe: null }) },
    warehouse: { findFirst: vi.fn().mockResolvedValue({ id: "warehouse-1" }) },
    stock: {
      findUnique: vi.fn().mockResolvedValue({ id: "stock-1", quantity: new Prisma.Decimal(quantity), version: 3 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    },
    stockMovement: { create: vi.fn().mockResolvedValue({ id: "movement-1" }) },
  };
}

const baseInput = {
  branchId: "branch-1",
  orderId: "order-1",
  orderNumber: 15,
  orderItemId: "item-1",
  productId: "product-1",
  userId: "user-1",
};

describe("stock de consumiciones", () => {
  it("descuenta stock al aumentar una consumición", async () => {
    const tx = directStockTransaction(10);
    await applyOrderStockDelta(tx as unknown as Prisma.TransactionClient, { ...baseInput, quantityDelta: 2 });

    expect(tx.stock.updateMany.mock.calls[0][0].data.quantity.toString()).toBe("8");
    expect(tx.stockMovement.create.mock.calls[0][0].data.quantity.toString()).toBe("-2");
    expect(tx.stockMovement.create.mock.calls[0][0].data.type).toBe(StockMovementType.SALE);
  });

  it("devuelve stock al reducir o quitar una consumición", async () => {
    const tx = directStockTransaction(8);
    await applyOrderStockDelta(tx as unknown as Prisma.TransactionClient, { ...baseInput, quantityDelta: -1 });

    expect(tx.stock.updateMany.mock.calls[0][0].data.quantity.toString()).toBe("9");
    expect(tx.stockMovement.create.mock.calls[0][0].data.quantity.toString()).toBe("1");
    expect(tx.stockMovement.create.mock.calls[0][0].data.type).toBe(StockMovementType.REVERSAL);
  });
});
