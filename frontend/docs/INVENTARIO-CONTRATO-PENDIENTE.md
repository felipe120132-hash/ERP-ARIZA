# Entradas y ajustes de inventario — integración pendiente

Revisión: 10 de octubre de 2026.

## Estado comprobado

El repositorio remoto main (d70e1a5) y el backend del escritorio no documentan una RPC de entradas o ajustes. El contrato actual declara kardex de solo lectura y prohíbe editar stock desde el frontend. El usuario indica que la función podría existir directamente en Supabase. La conexión se restableció: autenticación ADMIN activa, lectura de productos/kardex/presupuestos y resumen financiero responden correctamente. OpenAPI devuelve HTTP 401: Only secret API keys can be used for this endpoint. No se solicitó una clave secreta ni se ejecutaron movimientos. Esto NO demuestra que la función no exista.

La URL configurada ya responde. Se necesita la definición SQL de la función, incluidos parámetros, respuesta, permisos y triggers implicados. No aplicar una migración nueva sin revisar primero los triggers existentes: podría duplicar la modificación de stock.

## Frontend preparado

Ruta /inventario/:id/movimiento, acceso ADMIN desde el kardex del producto. Consulta existencias, prepara ENTRADA con unidades recibidas o AJUSTE con total contado, solicita motivo y muestra diferencia y stock previsto. Es una vista previa temporal: no persiste un borrador ni envía ninguna escritura. Registro deshabilitado expresamente hasta confirmar el contrato real.

## Contrato propuesto para contrastar con la función existente

Estos nombres son una propuesta, NO una API disponible ni una migración para ejecutar.

RPC registrar_movimiento_inventario:
- p_operacion_id UUID: clave de idempotencia generada por cliente, reutilizada en reintentos del mismo movimiento.
- p_producto_id UUID.
- p_tipo ENTRADA | AJUSTE.
- p_cantidad NUMERIC: unidades positivas para ENTRADA; existencias físicas finales, incluidas cero, para AJUSTE. Máximo dos decimales y límite NUMERIC(12,2).
- p_stock_esperado NUMERIC: stock consultado durante la revisión; rechazar si cambió, especialmente para ajustes por conteo.
- p_motivo TEXT: obligatorio, 5–500 caracteres después de trim.

Respuesta verificable: operacion_id, movimiento_id, producto_id, tipo, stock_anterior, cantidad_movida, stock_resultante, registrado_por, created_at. El sentido de un ajuste debe ser explícito; el kardex actual documenta cantidad positiva y no tiene columna de responsable. Definir dónde se guarda el responsable y cómo se relaciona con el kardex antes de integrar.

## Garantías necesarias en servidor

- Validar auth.uid(), perfil ADMIN activo y producto activo dentro de la operación; no confiar en el rol mostrado por la interfaz.
- Rechazar nulos, valores no finitos, cantidades inválidas, ajuste sin diferencia y stock negativo o superior al rango.
- Bloquear la fila del producto y escribir stock, kardex y auditoría en una sola transacción. Revisar triggers existentes para aplicar cada cambio una única vez.
- Resolver idempotencia de forma transaccional. Una misma clave con datos diferentes debe rechazarse; repetir los mismos datos devuelve el resultado original sin otro movimiento. Mantener autorización incluso al consultar/repetir resultados.
- Registrar responsable desde auth.uid() y fecha desde servidor. Preservar observación y trazabilidad inmutable. No confiar en un responsable enviado por el navegador.
- Mantener el kardex sin INSERT/UPDATE/DELETE públicos y restringir la ejecución de la función. Si usa SECURITY DEFINER, revisar propietario, search_path fijo y permisos mínimos.
- Ofrecer una consulta de solo lectura por operacion_id para resolver respuestas inciertas sin repetir el movimiento.

## Pruebas de integración antes de habilitar

Entradas decimales, ajustes al alza/a la baja/a cero, motivo obligatorio, producto inactivo, usuario vendedor/desactivado, concurrencia con una venta, stock desactualizado, rollback si falla kardex, repetición de clave, clave con otros datos y recuperación después de una respuesta perdida. Ejecutarlas en una base de pruebas.
