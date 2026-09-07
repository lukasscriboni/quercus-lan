import { FloorElementType, PrismaClient, StockMode, StockMovementType, UnitOfMeasure } from "@prisma/client";
import { hash } from "bcryptjs";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../lib/permissions";
import { normalizeText } from "../lib/normalize";

const db = new PrismaClient();

const permissionDescriptions: Record<string, string> = {
  [PERMISSIONS.DASHBOARD_VIEW]: "Ver tablero operativo",
  [PERMISSIONS.PRODUCTS_VIEW]: "Consultar productos y categorías",
  [PERMISSIONS.PRODUCTS_WRITE]: "Crear y modificar productos",
  [PERMISSIONS.PRODUCTS_IMPORT]: "Importar productos por CSV",
  [PERMISSIONS.STOCK_VIEW]: "Consultar stock e historial",
  [PERMISSIONS.STOCK_ADJUST]: "Registrar ajustes de stock",
  [PERMISSIONS.FLOOR_VIEW]: "Consultar salón y mesas",
  [PERMISSIONS.FLOOR_MANAGE]: "Editar sectores y salón",
  [PERMISSIONS.ORDERS_VIEW]: "Consultar pedidos",
  [PERMISSIONS.ORDERS_WRITE]: "Crear y modificar pedidos",
  [PERMISSIONS.KITCHEN_VIEW]: "Consultar comandas",
  [PERMISSIONS.KITCHEN_WRITE]: "Actualizar comandas",
  [PERMISSIONS.CASH_VIEW]: "Consultar caja",
  [PERMISSIONS.CASH_WRITE]: "Operar y cerrar caja",
  [PERMISSIONS.REPORTS_VIEW]: "Consultar reportes",
  [PERMISSIONS.USERS_MANAGE]: "Administrar usuarios y permisos",
  [PERMISSIONS.SETTINGS_MANAGE]: "Administrar configuración",
  [PERMISSIONS.AUDIT_VIEW]: "Consultar auditoría",
};

async function main() {
  const organization = await db.organization.upsert({
    where: { id: "org_quercus" },
    update: { name: "Quercus" },
    create: { id: "org_quercus", name: "Quercus" },
  });
  const branch = await db.branch.upsert({
    where: { id: "branch_principal" },
    update: { name: "Principal" },
    create: { id: "branch_principal", organizationId: organization.id, name: "Principal" },
  });

  for (const key of Object.values(PERMISSIONS)) {
    await db.permission.upsert({
      where: { key },
      update: { description: permissionDescriptions[key] },
      create: { key, description: permissionDescriptions[key] },
    });
  }

  const roles: Record<string, string> = {};
  for (const roleName of Object.keys(ROLE_PERMISSIONS)) {
    const role = await db.role.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: roleName } },
      update: { isSystem: true },
      create: { organizationId: organization.id, name: roleName, isSystem: true },
    });
    roles[roleName] = role.id;
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    const permissionRows = await db.permission.findMany({ where: { key: { in: ROLE_PERMISSIONS[roleName] } } });
    await db.rolePermission.createMany({
      data: permissionRows.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
  }

  const users = [
    ["admin", "Administrador", "admin123", "ADMIN"],
    ["cajero", "Caja", "cajero123", "CASHIER"],
    ["mozo", "Mozo", "mozo123", "WAITER"],
    ["cocina", "Cocina", "cocina123", "KITCHEN"],
  ] as const;
  for (const [username, displayName, password, roleName] of users) {
    await db.user.upsert({
      where: { organizationId_username: { organizationId: organization.id, username } },
      update: { displayName, roleId: roles[roleName], isActive: true },
      create: {
        organizationId: organization.id,
        roleId: roles[roleName],
        username,
        displayName,
        passwordHash: await hash(password, 12),
      },
    });
  }

  const warehouse = await db.warehouse.upsert({
    where: { branchId_name: { branchId: branch.id, name: "Depósito principal" } },
    update: { isDefault: true },
    create: { id: "warehouse_main", branchId: branch.id, name: "Depósito principal", isDefault: true },
  });

  const kitchen = await db.kitchenStation.upsert({
    where: { branchId_name: { branchId: branch.id, name: "COCINA" } },
    update: { type: "KITCHEN" },
    create: { id: "station_kitchen", branchId: branch.id, name: "COCINA", type: "KITCHEN" },
  });
  const bar = await db.kitchenStation.upsert({
    where: { branchId_name: { branchId: branch.id, name: "BAR" } },
    update: { type: "BAR" },
    create: { id: "station_bar", branchId: branch.id, name: "BAR", type: "BAR" },
  });

  const sectors = new Map<string, string>();
  for (const [index, name] of ["Salón", "Patio", "Barra"].entries()) {
    const sector = await db.sector.upsert({
      where: { branchId_name: { branchId: branch.id, name } },
      update: { sortOrder: index },
      create: { branchId: branch.id, name, sortOrder: index },
    });
    sectors.set(name, sector.id);
  }

  const demoTables = [
    ["Salón", "Mesa 1", 4, 100, 100, 110, 90, "ROUND"],
    ["Salón", "Mesa 2", 4, 300, 100, 110, 90, "ROUND"],
    ["Salón", "Mesa 3", 4, 500, 100, 110, 90, "ROUND"],
    ["Salón", "Mesa 4", 6, 170, 300, 160, 90, "RECTANGLE"],
    ["Salón", "Mesa 5", 6, 430, 300, 160, 90, "RECTANGLE"],
    ["Salón", "Mesa 6", 2, 740, 130, 90, 90, "SQUARE"],
    ["Patio", "Patio 1", 4, 120, 120, 110, 90, "ROUND"],
    ["Patio", "Patio 2", 4, 340, 120, 110, 90, "ROUND"],
    ["Patio", "Patio 3", 6, 150, 330, 160, 90, "RECTANGLE"],
    ["Patio", "Patio 4", 6, 430, 330, 160, 90, "RECTANGLE"],
    ["Barra", "Barra 1", 2, 180, 310, 90, 90, "SQUARE"],
    ["Barra", "Barra 2", 2, 360, 310, 90, 90, "SQUARE"],
    ["Barra", "Barra 3", 2, 540, 310, 90, 90, "SQUARE"],
  ] as const;
  for (const [sectorName, name, capacity, x, y, width, height, shape] of demoTables) {
    const sectorId = sectors.get(sectorName);
    if (!sectorId) continue;
    await db.diningTable.upsert({
      where: { sectorId_name: { sectorId, name } },
      update: { capacity },
      create: { sectorId, name, capacity, x, y, width, height, shape },
    });
  }

  const floorElements = [
    { id: "floor_salon_bar", sector: "Salón", type: FloorElementType.BAR, label: "Barra principal", x: 820, y: 80, width: 220, height: 90 },
    { id: "floor_salon_wall", sector: "Salón", type: FloorElementType.WALL, label: null, x: 690, y: 270, width: 300, height: 24 },
    { id: "floor_patio_label", sector: "Patio", type: FloorElementType.TEXT, label: "Patio", x: 760, y: 80, width: 180, height: 50 },
    { id: "floor_patio_decor", sector: "Patio", type: FloorElementType.DECORATION, label: "Planta", x: 780, y: 300, width: 100, height: 100 },
    { id: "floor_bar_counter", sector: "Barra", type: FloorElementType.BAR, label: "Mostrador", x: 110, y: 90, width: 620, height: 100 },
  ];
  for (const element of floorElements) {
    const sectorId = sectors.get(element.sector);
    if (!sectorId) continue;
    await db.floorElement.upsert({
      where: { id: element.id },
      update: { label: element.label },
      create: { id: element.id, sectorId, type: element.type, label: element.label, x: element.x, y: element.y, width: element.width, height: element.height },
    });
  }

  const categories = new Map<string, string>();
  for (const name of ["Cervezas", "Sin alcohol", "Cocina"]) {
    const category = await db.category.upsert({
      where: { organizationId_normalizedName: { organizationId: organization.id, normalizedName: normalizeText(name) } },
      update: { name },
      create: { organizationId: organization.id, name, normalizedName: normalizeText(name) },
    });
    categories.set(name, category.id);
  }

  const demoProducts = [
    { id: "demo_lager", sku: "DEMO-001", name: "Cerveza lager 473 ml", category: "Cervezas", price: 3200, cost: 1450, stock: 24, station: bar.id },
    { id: "demo_ipa", sku: "DEMO-002", name: "Cerveza IPA 473 ml", category: "Cervezas", price: 3900, cost: 1780, stock: 18, station: bar.id },
    { id: "demo_water", sku: "DEMO-003", name: "Agua mineral 500 ml", category: "Sin alcohol", price: 1800, cost: 620, stock: 30, station: bar.id },
    { id: "demo_burger", sku: "DEMO-004", name: "Hamburguesa completa", category: "Cocina", price: 8500, cost: 3100, stock: null, station: kitchen.id },
  ];
  for (const item of demoProducts) {
    const product = await db.product.upsert({
      where: { id: item.id },
      update: { name: item.name, price: item.price, cost: item.cost },
      create: {
        id: item.id,
        organizationId: organization.id,
        categoryId: categories.get(item.category),
        kitchenStationId: item.station,
        name: item.name,
        normalizedName: normalizeText(item.name),
        sku: item.sku,
        normalizedSku: normalizeText(item.sku),
        price: item.price,
        cost: item.cost,
        stockMode: item.stock === null ? StockMode.RECIPE : StockMode.DIRECT,
        unit: UnitOfMeasure.UNIT,
      },
    });
    if (item.stock !== null) {
      const stock = await db.stock.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId: warehouse.id } },
        update: {},
        create: { productId: product.id, warehouseId: warehouse.id, quantity: item.stock, minimum: 6 },
      });
      await db.stockMovement.upsert({
        where: { id: `seed_${product.id}` },
        update: {},
        create: {
          id: `seed_${product.id}`,
          productId: product.id,
          warehouseId: warehouse.id,
          type: StockMovementType.INITIAL_IMPORT,
          quantity: item.stock,
          previousQty: 0,
          newQty: stock.quantity,
          reason: "Stock inicial de demostración",
          referenceType: "SEED",
        },
      });
    }
  }

  await db.cashRegister.upsert({
    where: { branchId_name: { branchId: branch.id, name: "Caja principal" } },
    update: {},
    create: { branchId: branch.id, name: "Caja principal" },
  });
  for (const name of ["Efectivo", "Débito", "Crédito", "Transferencia", "Mercado Pago"]) {
    await db.paymentMethod.upsert({ where: { name }, update: { isActive: true }, create: { name } });
  }

  console.log("Seed completo: Quercus, sucursal Principal, 4 usuarios y 4 productos de demostración.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => db.$disconnect());
