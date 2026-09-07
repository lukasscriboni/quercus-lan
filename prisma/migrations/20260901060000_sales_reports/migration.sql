CREATE TABLE "SalesReport" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cashShiftId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "cashTotal" DECIMAL(12,2) NOT NULL,
    "virtualTotal" DECIMAL(12,2) NOT NULL,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "saleCount" INTEGER NOT NULL,
    "sales" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesReport_cashShiftId_key" ON "SalesReport"("cashShiftId");
CREATE INDEX "SalesReport_branchId_periodEnd_idx" ON "SalesReport"("branchId", "periodEnd");
CREATE INDEX "SalesReport_createdAt_idx" ON "SalesReport"("createdAt");

ALTER TABLE "SalesReport" ADD CONSTRAINT "SalesReport_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesReport" ADD CONSTRAINT "SalesReport_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesReport" ADD CONSTRAINT "SalesReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
