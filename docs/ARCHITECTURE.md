# Arquitectura local

## Flujo de red

```text
PCs / tablets del local
        │ HTTP + SSE, TCP 3000
        ▼
Next.js en PC servidor (0.0.0.0:3000)
        │ Prisma, sólo dentro del servidor
        ▼
PostgreSQL (localhost:5432)
```

No existe conexión esencial a Internet. No hay fuentes, scripts, iconos, autenticación, almacenamiento ni tiempo real servidos por terceros.

## Seguridad

- PostgreSQL escucha solamente en loopback (`localhost`). El puerto 5432 no se publica en la LAN.
- El firewall permite TCP 3000 únicamente en el perfil Privado y desde `LocalSubnet`.
- Las contraseñas se guardan con bcrypt (coste 12), nunca en texto plano.
- La cookie de sesión es `HttpOnly`, `SameSite=Lax` y se vincula a una sesión aleatoria guardada como hash SHA-256 en PostgreSQL.
- Toda autorización se vuelve a verificar en las rutas del servidor. Ocultar un botón nunca reemplaza ese control.
- Los logs de salud no exponen secretos ni URLs de conexión.

## Persistencia y consistencia

- Productos, precios, stock, usuarios, sesiones e importaciones se guardan en PostgreSQL.
- `Product.version`, `Stock.version`, `DiningTable.version`, `Order.version` y otras entidades críticas habilitan concurrencia optimista.
- Los ajustes y transferencias usan transacciones `Serializable` y comparan `version`; un cambio simultáneo devuelve conflicto en lugar de sobrescribir silenciosamente.
- La importación primero valida todas las filas. Con errores no importa ninguna. Una importación válida se ejecuta en una transacción: productos, categorías, proveedores, stocks, movimientos, auditoría y resultado quedan juntos o se revierten juntos.
- `OrderItem.unitPrice` y `costSnapshot` preservan el valor histórico aunque cambie el producto.
- `DiningTable.version` y `FloorElement.version` evitan que dos editores sobrescriban el mismo objeto del salón; el segundo cambio desactualizado recibe HTTP 409 y debe recargar.
- Un índice parcial de PostgreSQL garantiza una sola cuenta activa por mesa. Apertura, cambios de personas, consumiciones, totales y solicitud de cuenta usan transacciones y control de versiones.

## Tiempo real LAN

`/api/events` entrega Server-Sent Events desde el mismo proceso de Next.js. El navegador reintenta automáticamente y la interfaz muestra “Sin conexión con el servidor local” mientras no recibe al servidor. Las operaciones críticas sólo muestran éxito luego de una respuesta HTTP exitosa.

La instalación productiva usa un único proceso de Next.js. Si en el futuro se ejecutaran varios procesos en paralelo, el bus SSE deberá pasar a PostgreSQL `LISTEN/NOTIFY` o a un proceso WebSocket local compartido.

## Modelo de inventario

- `NONE`: sin control de existencias.
- `DIRECT`: una venta descuenta el propio producto.
- `RECIPE`: una venta descuenta los ingredientes de `Recipe`.

`Stock` representa el saldo por producto y depósito. Cada cambio crea un `StockMovement` con cantidad anterior, nueva, usuario, motivo y referencia. Las transferencias generan dos movimientos enlazados: `TRANSFER_OUT` y `TRANSFER_IN`.

## Próxima fase

El salón y las cuentas operativas por mesa ya están implementados. La siguiente fase debe generar comandas por estación y la pantalla de cocina; después se implementará el cobro atómico, movimientos de stock/caja, liberación de mesa y prevención de doble pago.
