-- Add the number of guests to each account.
ALTER TABLE "Order" ADD COLUMN "guestCount" INTEGER NOT NULL DEFAULT 1;

-- PostgreSQL partial index: a table can have only one active account.
CREATE UNIQUE INDEX "Order_one_active_per_table"
ON "Order"("diningTableId")
WHERE "diningTableId" IS NOT NULL
  AND "status" IN ('OPEN', 'IN_PROGRESS', 'READY', 'BILL_REQUESTED');
