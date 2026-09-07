const {
  OrderItemStatus,
  OrderStatus,
  Prisma,
  PrismaClient,
  StockMode,
  StockMovementType,
} = require("@prisma/client");

const db = new PrismaClient();
const activeStatuses = [OrderStatus.OPEN, OrderStatus.IN_PROGRESS, OrderStatus.READY, OrderStatus.BILL_REQUESTED];

function addRequirement(map, productId, quantity) {
  map.set(productId, (map.get(productId) ?? new Prisma.Decimal(0)).add(quantity));
}

async function adjustItem(tx, item) {
  const recorded = await tx.stockMovement.findFirst({
    where: { referenceType: "ORDER_ITEM", referenceId: item.id },
    select: { id: true },
  });
  if (recorded) return false;

  const product = await tx.product.findUnique({
    where: { id: item.productId },
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
  if (!product || product.stockMode === StockMode.NONE) return false;

  const requirements = new Map();
  if (product.stockMode === StockMode.DIRECT) addRequirement(requirements, product.id, item.quantity);
  if (product.stockMode === StockMode.RECIPE && product.recipe && product.recipe.yield.gt(0)) {
    for (const component of product.recipe.ingredients) {
      addRequirement(requirements, component.ingredient.productId, item.quantity.mul(component.quantity).div(product.recipe.yield));
    }
  }
  if (requirements.size === 0) return false;

  const warehouse = await tx.warehouse.findFirst({
    where: { branchId: item.order.branchId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (!warehouse) throw new Error("No hay una ubicación de stock configurada");

  for (const [productId, requirement] of requirements) {
    const stockChange = requirement.negated().toDecimalPlaces(3);
    const stock = await tx.stock.findUnique({
      where: { productId_warehouseId: { productId, warehouseId: warehouse.id } },
    });
    const previous = stock?.quantity ?? new Prisma.Decimal(0);
    const next = previous.add(stockChange).toDecimalPlaces(3);
    if (stock) {
      await tx.stock.update({ where: { id: stock.id }, data: { quantity: next, version: { increment: 1 } } });
    } else {
      await tx.stock.create({ data: { productId, warehouseId: warehouse.id, quantity: next } });
    }
    await tx.stockMovement.create({
      data: {
        productId,
        warehouseId: warehouse.id,
        userId: item.order.openedById,
        type: StockMovementType.SALE,
        quantity: stockChange,
        previousQty: previous,
        newQty: next,
        reason: `Consumición agregada al pedido #${item.order.number}`,
        referenceType: "ORDER_ITEM",
        referenceId: item.id,
      },
    });
  }
  return true;
}

async function main() {
  const items = await db.orderItem.findMany({
    where: { status: { not: OrderItemStatus.CANCELLED }, order: { status: { in: activeStatuses } } },
    include: { order: { select: { id: true, branchId: true, number: true, openedById: true } } },
    orderBy: { createdAt: "asc" },
  });
  let adjusted = 0;
  let skipped = 0;

  for (const item of items) {
    const changed = await db.$transaction(async (tx) => adjustItem(tx, item), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 15_000,
    });
    if (changed) adjusted += 1;
    else skipped += 1;
  }

  console.log(`Reconciliación completa: ${adjusted} consumiciones ajustadas, ${skipped} sin impacto pendiente.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
