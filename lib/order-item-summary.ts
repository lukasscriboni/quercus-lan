type QuantityValue = number | string | { toString(): string };

type QuantityItem = { quantity: QuantityValue };
type KitchenItem = QuantityItem & { kitchenStationId: string | null; status: string };
type ProductItem = QuantityItem & { productId: string };

function quantityAsNumber(value: QuantityValue) {
  const quantity = Number(value.toString());
  return Number.isFinite(quantity) ? quantity : 0;
}

export function sumItemQuantities(items: QuantityItem[]) {
  return items.reduce((total, item) => total + quantityAsNumber(item.quantity), 0);
}

export function itemQuantitiesByProduct(items: ProductItem[]) {
  return items.reduce<Record<string, number>>((quantities, item) => {
    quantities[item.productId] = (quantities[item.productId] ?? 0) + quantityAsNumber(item.quantity);
    return quantities;
  }, {});
}

export function summarizePendingKitchenItems(items: KitchenItem[]) {
  const pending = items.filter((item) => item.status === "PENDING");
  return {
    lines: pending.length,
    quantity: sumItemQuantities(pending),
  };
}
