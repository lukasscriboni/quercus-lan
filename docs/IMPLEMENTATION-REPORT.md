# Informe de implementación — etapa 1

Fecha: 29 de agosto de 2026.

## Resultado

Se construyó desde cero `quercus-lan`, una aplicación Next.js/PostgreSQL preparada para funcionar exclusivamente dentro de la LAN. El proyecto fuente recibido estaba vacío: sólo contenía el texto del pedido. No había una aplicación anterior que adaptar ni un CSV de artículos para analizar.

## Arquitectura implementada

- Next.js 15 App Router, React 19 y TypeScript estricto.
- Servidor productivo en `0.0.0.0:3000`.
- Prisma conectado mediante `DATABASE_URL` a `localhost:5432`.
- PostgreSQL nunca se conecta desde los navegadores cliente.
- Login local con sesiones persistidas, cookies `HttpOnly`, contraseñas bcrypt y permisos revisados en el servidor.
- Eventos SSE servidos por el mismo Next.js, con reconexión y aviso de pérdida de red.
- Sin Google Fonts, CDN, scripts remotos, APIs externas ni servicios cloud.
- Scripts Windows para firewall restringido a perfil Privado/`LocalSubnet`, inicio automático, backup y restore.

## Base de datos

La migración inicial contiene 41 tablas, 24 índices únicos y 34 índices adicionales. El modelo cubre:

- organización, sucursal, usuarios, roles, permisos, empleados y sesiones;
- categorías, productos, proveedores, depósito, stock, movimientos, importaciones e inventarios físicos;
- sectores, mesas y elementos del salón;
- pedidos, ítems, modificadores, estaciones y tickets de cocina;
- ingredientes, recetas e insumos;
- cajas, turnos, movimientos, medios de pago y pagos;
- compras, clientes, direcciones, reservas y auditoría.

Entidades críticas incluyen `version` para concurrencia optimista. Ajustes, transferencias, cierre de inventario e importación usan transacciones serializables o atómicas. El cierre de cobros será parte de la etapa de pedidos/caja; el schema ya está preparado, pero esa operación no se expuso antes de implementar el POS.

## CSV real

No se encontró ningún `.csv` en el repositorio ni en el adjunto. Por lo tanto:

- nombre, encoding, delimitador, filas y columnas reales: no disponibles;
- artículos reales detectados: 0;
- artículos reales importados: 0;
- errores de filas reales: no aplicable;
- el archivo original no fue modificado porque no existía.

El importador quedó preparado para detectar UTF-8, BOM UTF-8, Windows-1252, `;` o `,`; mostrar 20 filas; proponer y corregir mapeo; normalizar importes ARS; detectar duplicados; comparar nuevos/existentes/errores y confirmar todo en una transacción.

## Stock inicial

No se cargó stock real por ausencia de CSV y de un servidor PostgreSQL en este entorno. Al ejecutar el seed en la PC servidor se crean sólo cuatro productos de demostración:

- Lager 473 ml: 24 unidades.
- IPA 473 ml: 18 unidades.
- Agua 500 ml: 30 unidades.
- Hamburguesa completa: modo `RECIPE`, sin stock directo.

Total directo de demostración: 72 unidades. Cada saldo directo tiene un movimiento `INITIAL_IMPORT`. El importador real cargará el stock en `Depósito principal` con la misma trazabilidad.

## Interfaz entregada

- `/login`: acceso local.
- `/dashboard`: estado operativo y métricas desde PostgreSQL.
- `/products`: catálogo, categorías y alta manual.
- `/products/import`: asistente CSV de cuatro pasos.
- `/stock`: saldos, mínimos, alertas, ajustes, mermas, transferencias e historial.
- `/stock/inventory`: inicio e historial de conteos físicos.
- `/stock/inventory/[id]`: conteo, diferencias y cierre transaccional.
- `/api/health`: estado de aplicación y base.
- `/api/events`: sincronización SSE LAN.

## Verificaciones ejecutadas

- `pnpm test`: 19/19 pruebas aprobadas.
- `pnpm lint`: aprobado, sin errores ni advertencias.
- `pnpm typecheck`: aprobado.
- `pnpm db:validate`: schema válido.
- `pnpm db:generate`: cliente Prisma generado.
- `prisma migrate diff`: migración SQL inicial generada e inspeccionada.
- `pnpm build`: compilación de producción aprobada.
- `pnpm start`: servidor productivo inició en `0.0.0.0:3000`.
- `GET /login`: HTTP 200.
- `GET /api/health`: HTTP 503 con `database: unavailable`, resultado esperado porque esta máquina no tiene PostgreSQL en ejecución.
- búsqueda de URLs/CDN en código de ejecución: no se encontraron recursos externos.

No se ejecutaron `prisma migrate deploy` ni `prisma db seed` contra una base real porque PostgreSQL no estaba instalado en el entorno de construcción. Se ejecutan en la PC servidor siguiendo `docs/INSTALL-LAN.md`.

## Incidencias encontradas

- No había repositorio previo ni CSV real.
- Node.js y PostgreSQL no estaban instalados globalmente; la construcción se validó con el runtime local de trabajo.
- Se corrigió una relación inversa faltante en el schema durante `prisma validate`.
- Se corrigió una utilidad Tailwind detectada por la primera compilación.
- Se actualizó Next.js a la versión de mantenimiento 15.5.24 para incluir los parches de seguridad disponibles.
- Se evitó `output: standalone`, que no es necesario para `next start` y causaba creación de enlaces simbólicos restringidos en Windows; la compilación estándar funciona correctamente.

## Archivos principales

- `prisma/schema.prisma`, `prisma/seed.ts` y `prisma/migrations/`.
- `app/` con páginas y rutas API.
- `components/` con navegación, marca y estado de conexión.
- `lib/` con autenticación, CSV, inventario, normalización, permisos, Prisma y SSE.
- `tests/csv-import.test.ts`.
- `scripts/` con backup, restore, inicio automático, firewall y tareas programadas.
- `docs/INSTALL-LAN.md`, `docs/ARCHITECTURE.md` y `docs/CSV-IMPORT.md`.

## Puesta en marcha

En el servidor:

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm start
```

Desde la segunda PC, conectada al mismo router, abrir `http://IP-DEL-SERVIDOR:3000`; por ejemplo `http://192.168.1.100:3000`.

## Siguiente fase recomendada

Implementar en este orden: editor visual de salón con dnd-kit; mesas/pedidos; POS táctil; generación y pantalla de comandas; caja/cobro atómico; recetas y descuento de ingredientes; compras; reportes con Recharts. Antes de caja se debe completar el servicio de cobro con transacción serializable, comprobación de orden abierta, prevención de segundo pago, movimientos de stock/caja, liberación de mesa y auditoría en un único commit.
