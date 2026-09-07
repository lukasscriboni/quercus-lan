# Informe de implementación — fase 2: salón

Fecha: 30 de agosto de 2026.

## Alcance completado

La segunda fase incorpora el salón operativo y su editor visual persistente:

- sectores configurables;
- mesas con nombre, capacidad, forma y estado;
- paredes, barras, textos y decoración;
- movimiento por arrastre con `dnd-kit`;
- redimensionado desde el plano;
- rotación libre o en incrementos de 15 grados;
- grilla visible y ajuste opcional cada 20 píxeles;
- validación de límites para impedir objetos fuera del lienzo;
- vista sólo lectura para Caja y Mozo;
- edición exclusiva para usuarios con `floor.manage`;
- actualización automática de todas las terminales mediante SSE local.

## Persistencia y concurrencia

El plano se guarda en `Sector`, `DiningTable` y `FloorElement`. Mesas y elementos usan `version`: cada modificación incluye la versión leída, incrementa el valor de manera atómica y rechaza con HTTP 409 una escritura desactualizada. Así, dos administradores no pueden sobrescribir silenciosamente el mismo objeto.

Las altas, modificaciones y bajas relevantes crean registros en `AuditLog`. Una mesa con pedido abierto o reserva futura no puede eliminarse. Todos los accesos vuelven a comprobar organización y permiso en el servidor.

Un sector puede eliminarse junto con sus mesas y elementos visuales mediante una confirmación que detalla el alcance. La eliminación se bloquea si alguna de sus mesas tiene pedidos abiertos o reservas futuras; los pedidos históricos se conservan.

## Datos iniciales

El seed agrega un plano mínimo no destructivo:

- Salón: 6 mesas, barra y pared;
- Patio: 4 mesas, rótulo y decoración;
- Barra: 3 mesas y mostrador.

Los `upsert` no vuelven a colocar objetos ya existentes, por lo que ejecutar el seed nuevamente no destruye un diseño editado.

## Rutas

- `/floor`: vista operativa y editor visual.
- `GET /api/floor`: plano completo de la sucursal.
- `/api/floor/sectors`: creación y mantenimiento de sectores.
- `/api/floor/tables`: creación y mantenimiento seguro de mesas.
- `/api/floor/elements`: creación y mantenimiento seguro de elementos visuales.

## Próxima fase

La próxima fase recomendada es pedidos y POS: apertura de mesa, catálogo táctil, ítems con precio histórico, envío de comandas por estación y actualización del estado de la mesa. Caja debe abordarse después, con el cobro completo dentro de una transacción serializable.
