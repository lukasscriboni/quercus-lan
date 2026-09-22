import { KitchenTicketStatus, OrderItemStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { itemStatusForTicket, nextKitchenTicketStatus } from "../lib/kitchen";

describe("flujo de comandas", () => {
  it("avanza únicamente por el circuito operativo", () => {
    expect(nextKitchenTicketStatus(KitchenTicketStatus.NEW)).toBe(KitchenTicketStatus.DELIVERED);
    expect(nextKitchenTicketStatus(KitchenTicketStatus.PREPARING)).toBe(KitchenTicketStatus.DELIVERED);
    expect(nextKitchenTicketStatus(KitchenTicketStatus.READY)).toBe(KitchenTicketStatus.DELIVERED);
    expect(nextKitchenTicketStatus(KitchenTicketStatus.DELIVERED)).toBeNull();
    expect(nextKitchenTicketStatus(KitchenTicketStatus.CANCELLED)).toBeNull();
  });

  it("sincroniza el estado de los productos con la comanda", () => {
    expect(itemStatusForTicket(KitchenTicketStatus.NEW)).toBe(OrderItemStatus.SENT);
    expect(itemStatusForTicket(KitchenTicketStatus.PREPARING)).toBe(OrderItemStatus.PREPARING);
    expect(itemStatusForTicket(KitchenTicketStatus.READY)).toBe(OrderItemStatus.READY);
    expect(itemStatusForTicket(KitchenTicketStatus.DELIVERED)).toBe(OrderItemStatus.DELIVERED);
    expect(itemStatusForTicket(KitchenTicketStatus.CANCELLED)).toBe(OrderItemStatus.CANCELLED);
  });
});
