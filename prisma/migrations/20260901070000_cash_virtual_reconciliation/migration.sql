ALTER TABLE "CashShift"
ADD COLUMN "virtualClosingAmount" DECIMAL(12,2),
ADD COLUMN "virtualExpectedAmount" DECIMAL(12,2),
ADD COLUMN "virtualDifference" DECIMAL(12,2),
ADD COLUMN "totalDifference" DECIMAL(12,2);

ALTER TABLE "SalesReport"
ADD COLUMN "expectedCash" DECIMAL(12,2),
ADD COLUMN "declaredCash" DECIMAL(12,2),
ADD COLUMN "declaredVirtual" DECIMAL(12,2),
ADD COLUMN "cashDifference" DECIMAL(12,2),
ADD COLUMN "virtualDifference" DECIMAL(12,2),
ADD COLUMN "totalDifference" DECIMAL(12,2);
