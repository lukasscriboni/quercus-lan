CREATE TYPE "CurrentAccountHolderType" AS ENUM ('CUSTOMER', 'EMPLOYEE');

CREATE TABLE "CurrentAccount" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerId" TEXT,
    "employeeId" TEXT,
    "holderType" "CurrentAccountHolderType" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CurrentAccount_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order" ADD COLUMN "currentAccountId" TEXT;

CREATE INDEX "CurrentAccount_branchId_isActive_name_idx" ON "CurrentAccount"("branchId", "isActive", "name");
CREATE INDEX "CurrentAccount_customerId_idx" ON "CurrentAccount"("customerId");
CREATE INDEX "CurrentAccount_employeeId_idx" ON "CurrentAccount"("employeeId");
CREATE INDEX "Order_currentAccountId_status_idx" ON "Order"("currentAccountId", "status");

ALTER TABLE "CurrentAccount" ADD CONSTRAINT "CurrentAccount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CurrentAccount" ADD CONSTRAINT "CurrentAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CurrentAccount" ADD CONSTRAINT "CurrentAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_currentAccountId_fkey" FOREIGN KEY ("currentAccountId") REFERENCES "CurrentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
