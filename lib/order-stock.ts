import { Prisma, StockMode, StockMovementType } from "@prisma/client";

type OrderStockDelta = {
  branchId: string;
  orderId: string;
  orderNumber: number;
  orderItemId: string;
  productId: string;
  quantityDelta: Prisma.Decimal.Value;
  userId: string;
};

function addRequirement(map: Map<string, Prisma.Decimal>, productId: string, quantity: Prisma.Decimal) {
  map.set(productId, (map.get(productId) ?? new Prisma.Decimal(0)).add(quantity));
}

export async function applyOrderStockDelta(tx: Prisma.TransactionClient, input: OrderStockDelta) {
  const delta = new Prisma.Decimal(input.quantityDelta).toDecimalPlaces(3);
  if (delta.isZero()) return false;

  const product = await tx.product.findUnique({
    where: { id: input.productId },
    select: {
      id: true,
      stockMode: true,
      recipe: {
        select: {
          yield: true,
          ingredients: { select: { quantity: true, ingredient: { select: { productId: true } } } },
        },
      },
    },
  });
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  if (product.stockMode === StockMode.NONE) return false;

  const requirements = new Map<string, Prisma.Decimal>();
  if (product.stockMode === StockMode.DIRECT) addRequirement(requirements, product.id, delta);
  if (product.stockMode === StockMode.RECIPE && product.recipe && product.recipe.yield.gt(0)) {
    for (const component of product.recipe.ingredients) {
      addRequirement(requirements, component.ingredient.productId, delta.mul(component.quantity).div(product.recipe.yield));
    }
  }
  if (requirements.size === 0) return false;

  const warehouse = await tx.warehouse.findFirst({
    where: { branchId: input.branchId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (!warehouse) throw new Error("WAREHOUSE_NOT_FOUND");

  for (const [stockProductId, rawRequirement] of requirements) {
    const stockChange = rawRequirement.negated().toDecimalPlaces(3);
    if (stockChange.isZero()) continue;
    const stock = await tx.stock.findUnique({
      where: { productId_warehouseId: { productId: stockProductId, warehouseId: warehouse.id } },
    });
    const previous = stock?.quantity ?? new Prisma.Decimal(0);
    const next = previous.add(stockChange).toDecimalPlaces(3);
    if (stock) {
      const changed = await tx.stock.updateMany({
        where: { id: stock.id, version: stock.version },
        data: { quantity: next, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("STOCK_CONFLICT");
    } else {
      await tx.stock.create({ data: { productId: stockProductId, warehouseId: warehouse.id, quantity: next } });
    }
    const isDeduction = stockChange.isNegative();
    await tx.stockMovement.create({
      data: {
        productId: stockProductId,
        warehouseId: warehouse.id,
        userId: input.userId,
        type: isDeduction ? StockMovementType.SALE : StockMovementType.REVERSAL,
        quantity: stockChange,
        previousQty: previous,
        newQty: next,
        reason: isDeduction ? `Consumición agregada al pedido #${input.orderNumber}` : `Consumición reducida del pedido #${input.orderNumber}`,
        referenceType: "ORDER_ITEM",
        referenceId: input.orderItemId,
      },
    });
  }
  return true;
}
