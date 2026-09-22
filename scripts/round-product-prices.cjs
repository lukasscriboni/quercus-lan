const { Prisma, PrismaClient } = require("@prisma/client");

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const products = await db.product.findMany({ select: { id: true, organizationId: true, name: true, price: true, version: true } });
  const changes = products.flatMap((product) => {
    const rounded = product.price.div(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).mul(100);
    return rounded.eq(product.price) ? [] : [{ ...product, rounded }];
  });
  console.log(JSON.stringify({ products: products.length, toUpdate: changes.length, increases: changes.filter((p) => p.rounded.gt(p.price)).length, decreases: changes.filter((p) => p.rounded.lt(p.price)).length, apply }));
  if (!apply || changes.length === 0) return;

  await db.$transaction(async (tx) => {
    for (const product of changes) {
      const updated = await tx.product.updateMany({
        where: { id: product.id, version: product.version, price: product.price },
        data: { price: product.rounded, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new Error(`El precio cambió durante el ajuste: ${product.id}`);
    }
    await tx.auditLog.createMany({
      data: changes.map((product) => ({
        organizationId: product.organizationId,
        action: "PRODUCT_PRICE_CHANGED",
        entityType: "Product",
        entityId: product.id,
        before: { price: product.price.toString() },
        after: { price: product.rounded.toString() },
        metadata: { reason: "Ajuste a múltiplos de 100", method: "nearest_half_up" },
      })),
    });
  }, { maxWait: 10000, timeout: 120000 });
  console.log(`Actualizados: ${changes.length}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
