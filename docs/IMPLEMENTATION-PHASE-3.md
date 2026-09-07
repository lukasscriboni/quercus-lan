# Informe de implementación — fase 3: cuentas por mesa

Fecha: 30 de agosto de 2026.

## Flujo operativo

En la vista normal de `/floor`, sin activar el editor, el panel operativo permanece a la derecha del plano. Un usuario autorizado puede tocar una mesa y:

1. indicar la cantidad de personas;
2. abrir una cuenta persistida en PostgreSQL;
3. buscar productos con resultados actualizados mientras escribe o filtrarlos por categoría;
4. agregar consumiciones;
5. aumentar, disminuir o quitar cantidades;
6. cambiar la cantidad de personas;
7. consultar subtotal, total y valor por persona;
8. solicitar la cuenta o reabrirla para corregirla.

El botón **Editar plano** continúa reservado exclusivamente para cambiar sectores, posición, tamaño y forma de las mesas.

## Consistencia

- `Order.guestCount` almacena la cantidad de personas.
- Un índice parcial de PostgreSQL impide más de una cuenta activa por mesa.
- La apertura de cuenta cambia la mesa a `OCCUPIED` dentro de la misma transacción.
- Cada consumición copia nombre, precio y costo vigentes a `OrderItem`, preservando el valor histórico.
- Los totales se recalculan en el servidor dentro de transacciones serializables.
- `version` evita sobrescribir cuentas o consumiciones modificadas desde otra terminal.
- Solicitar la cuenta cambia pedido y mesa a `BILL_REQUESTED` de forma atómica.
- Todas las operaciones generan auditoría y eventos SSE para las demás terminales LAN.

## Alcance pendiente

La cuenta ya se genera y acumula consumiciones. El cobro, los medios de pago, el movimiento de caja, el descuento definitivo de stock y la liberación automática de la mesa corresponden a la fase Caja y deben ejecutarse juntos en una única transacción.
