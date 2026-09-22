import { Prisma } from "@prisma/client";
import { roundDownToPriceStep } from "./pricing";

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
  if (type === "NONE") return { subtotal, discount, total: subtotal };
  const total = roundDownToPriceStep(subtotal.sub(discount));
  discount = subtotal.sub(total).toDecimalPlaces(2);
  return { subtotal, discount, total };
}
