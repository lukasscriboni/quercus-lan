export const PRICE_STEP = 100;

export function isValidProductPrice(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value % PRICE_STEP === 0;
}
