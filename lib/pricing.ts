import { Prisma } from "@prisma/client";
import { PRICE_STEP } from "./pricing-rules";

export function roundDownToPriceStep(value: Prisma.Decimal.Value) {
  const amount = Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(value));
  return amount.div(PRICE_STEP).floor().mul(PRICE_STEP);
}

export function roundToNearestPriceStep(value: Prisma.Decimal.Value) {
  const amount = Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(value));
  return amount.div(PRICE_STEP).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).mul(PRICE_STEP);
}
