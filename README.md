# Quercus LAN

Sistema de gestión gastronómica preparado para funcionar dentro de la red local de un bar, sin depender de Internet ni de servicios cloud.

## Alcance implementado

- Next.js App Router, React y TypeScript estricto.
- PostgreSQL local como única fuente de verdad, accedido sólo por Prisma desde el servidor.
- Acceso por usuario/contraseña, sesiones locales, hash bcrypt y permisos por rol.
- Productos, categorías, depósitos, stock, movimientos y transferencias.
- Salón operativo con sectores, mesas y editor visual persistente con drag, resize, rotate, grilla y snap.
- Cuentas por mesa desde el plano normal: personas, catálogo táctil, consumiciones, cantidades y total en tiempo real.
- Importador CSV guiado con detección de encoding/delimitador, mapeo, preview, validación y transacción.
- Stock inicial trazable mediante `StockMovement`.
- Server-Sent Events locales con reconexión para refrescar terminales.
- Health check en `/api/health`.
- Scripts de backup, restauración, firewall e inicio automático en Windows.
- Modelo Prisma preparado para pedidos, cocina, caja, recetas, compras, clientes, reservas, reportes y auditoría.

## Inicio rápido

La instalación completa está en [docs/INSTALL-LAN.md](docs/INSTALL-LAN.md).

```powershell
Copy-Item .env.example .env
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm start
```

El servidor escucha en `0.0.0.0:3000`. En la misma PC se abre `http://localhost:3000`; desde otra terminal se usa `http://IP-DEL-SERVIDOR:3000`.

## Usuarios iniciales

| Rol | Usuario | Contraseña inicial |
| --- | --- | --- |
| Administrador | `admin` | `admin123` |
| Caja | `cajero` | `cajero123` |
| Mozo | `mozo` | `mozo123` |
| Cocina | `cocina` | `cocina123` |

Cambiar estas contraseñas antes de la puesta en producción.

## Verificación

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm build
```
