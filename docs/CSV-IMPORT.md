# Importación CSV

La ruta `/products/import` trabaja en cuatro pasos: archivo, vista previa, mapeo y confirmación.

## Formatos detectados

- UTF-8, con o sin BOM.
- Windows-1252 como fallback para exportaciones antiguas de Excel.
- Separador `;` o `,`, respetando comillas CSV.
- Importes argentinos: `1500`, `1500,50`, `1.500,50`, `$ 1.500,50`.

## Campos disponibles

SKU, código de barras, nombre, categoría, precio, costo, stock, mínimo, unidad, marca, proveedor, IVA, activo y modo de stock. Todas las columnas pueden corregirse o ignorarse antes de confirmar.

## Reglas

- Nombre es obligatorio.
- Precio/costo no pueden ser negativos.
- El stock inicial no puede ser negativo.
- SKU y código de barras repetidos dentro del archivo producen error.
- Los existentes se buscan por SKU normalizado, luego código de barras y finalmente nombre normalizado.
- Las categorías se normalizan sin distinguir mayúsculas, acentos ni espacios duplicados.
- Con cualquier fila inválida, no se importa ninguna.
- El límite de esta etapa es 10 MB y 5.000 filas por ejecución.

## Persistencia

Una confirmación válida crea un `ImportJob`. Producto, categoría, proveedor, saldo, movimiento y auditoría se guardan en una única transacción PostgreSQL. El stock va al Depósito principal. Un saldo nuevo genera `INITIAL_IMPORT`; cambiar por importación un saldo existente genera `ADJUSTMENT` para conservar la trazabilidad.
