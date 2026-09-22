export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  PRODUCTS_VIEW: "products.view",
  PRODUCTS_WRITE: "products.write",
  PRODUCTS_IMPORT: "products.import",
  STOCK_VIEW: "stock.view",
  STOCK_ADJUST: "stock.adjust",
  FLOOR_VIEW: "floor.view",
  FLOOR_MANAGE: "floor.manage",
  ORDERS_VIEW: "orders.view",
  ORDERS_WRITE: "orders.write",
  KITCHEN_VIEW: "kitchen.view",
  KITCHEN_WRITE: "kitchen.write",
  CASH_VIEW: "cash.view",
  CASH_WRITE: "cash.write",
  REPORTS_VIEW: "reports.view",
  USERS_MANAGE: "users.manage",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_VIEW: "audit.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: ReadonlyArray<{
  key: PermissionKey;
  group: string;
  label: string;
  description: string;
}> = [
  { key: PERMISSIONS.DASHBOARD_VIEW, group: "General", label: "Ver resumen", description: "Acceder al tablero operativo y sus indicadores." },
  { key: PERMISSIONS.PRODUCTS_VIEW, group: "Productos", label: "Ver productos", description: "Consultar productos, categorías, precios y datos asociados." },
  { key: PERMISSIONS.PRODUCTS_WRITE, group: "Productos", label: "Modificar productos", description: "Crear productos y editar sus datos." },
  { key: PERMISSIONS.PRODUCTS_IMPORT, group: "Productos", label: "Importar productos", description: "Cargar productos y existencias mediante archivos CSV." },
  { key: PERMISSIONS.STOCK_VIEW, group: "Stock", label: "Ver stock", description: "Consultar existencias, movimientos e ingresos de mercadería." },
  { key: PERMISSIONS.STOCK_ADJUST, group: "Stock", label: "Modificar stock", description: "Ingresar mercadería y realizar ajustes manuales de existencias." },
  { key: PERMISSIONS.FLOOR_VIEW, group: "Salón y pedidos", label: "Ver salón", description: "Consultar sectores, mesas y su estado." },
  { key: PERMISSIONS.FLOOR_MANAGE, group: "Salón y pedidos", label: "Editar salón", description: "Crear, mover o eliminar sectores, mesas y elementos del plano." },
  { key: PERMISSIONS.ORDERS_VIEW, group: "Salón y pedidos", label: "Ver pedidos", description: "Consultar pedidos y consumiciones abiertas." },
  { key: PERMISSIONS.ORDERS_WRITE, group: "Salón y pedidos", label: "Modificar pedidos", description: "Crear pedidos y agregar, quitar o cambiar consumiciones." },
  { key: PERMISSIONS.KITCHEN_VIEW, group: "Cocina y barra", label: "Ver comandas", description: "Consultar las comandas enviadas a Cocina y Barra." },
  { key: PERMISSIONS.KITCHEN_WRITE, group: "Cocina y barra", label: "Actualizar comandas", description: "Cambiar el estado de preparación en Cocina y Barra." },
  { key: PERMISSIONS.CASH_VIEW, group: "Caja y reportes", label: "Ver caja", description: "Consultar caja, ventas directas y operaciones cobradas." },
  { key: PERMISSIONS.CASH_WRITE, group: "Caja y reportes", label: "Operar caja", description: "Abrir, operar y cerrar caja, además de cobrar ventas." },
  { key: PERMISSIONS.REPORTS_VIEW, group: "Caja y reportes", label: "Ver reportes", description: "Consultar reportes de ventas y cierres de caja." },
  { key: PERMISSIONS.USERS_MANAGE, group: "Administración", label: "Administrar roles", description: "Configurar las funciones permitidas para cada rol." },
  { key: PERMISSIONS.SETTINGS_MANAGE, group: "Administración", label: "Administrar configuración", description: "Modificar la configuración general de la aplicación." },
  { key: PERMISSIONS.AUDIT_VIEW, group: "Administración", label: "Ver auditoría", description: "Consultar el registro de acciones realizadas en el sistema." },
];

export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  ADMIN: Object.values(PERMISSIONS),
  CASHIER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.STOCK_VIEW,
    PERMISSIONS.FLOOR_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_WRITE,
    PERMISSIONS.CASH_VIEW,
    PERMISSIONS.CASH_WRITE,
  ],
  WAITER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.FLOOR_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_WRITE,
    PERMISSIONS.KITCHEN_VIEW,
  ],
  KITCHEN: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.KITCHEN_VIEW, PERMISSIONS.KITCHEN_WRITE],
};
