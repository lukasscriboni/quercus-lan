import { Prisma } from "@prisma/client";

export type DiscountType = "NONE" | "PERCENT" | "FIXED";

export function calculateDiscount(
  subtotalValue: Prisma.Decimal.Value,
  type: DiscountType,
  rawValue: Prisma.Decimal.Value = 0,
) {
  const subtotal = Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(subtotalValue)).toDecimalPlaces(2);
  const value = Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(rawValue));
  let discount = new Prisma.Decimal(0);
  if (type === "PERCENT") discount = subtotal.mul(Prisma.Decimal.min(value, 100)).div(100);
  if (type === "FIXED") discount = Prisma.Decimal.min(value, subtotal);
  discount = discount.toDecimalPlaces(2);
  return { subtotal, discount, total: subtotal.sub(discount).toDecimalPlaces(2) };
}
