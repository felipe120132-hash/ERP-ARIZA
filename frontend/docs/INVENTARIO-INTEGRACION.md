# Entradas y ajustes — 14 de octubre de 2026

Revisada la migración 005 de origin/main (7e32441). El frontend invoca registrar_movimiento_inventario con producto, tipo, cantidad, motivo, clave UUID y stock esperado. Conserva la consulta paginada de kardex existente.

Entrada suma unidades positivas; ajuste envía conteo absoluto y stock consultado. Revisión antes de confirmar, motivo de 5 a 500 caracteres, hasta dos decimales. Respuesta validada por producto, tipo, cantidades y relación entre stock anterior y resultante. El kardex muestra ajustes con signo y admite registrado_por e idempotency_key.

La solicitud exacta se guarda en sessionStorage por usuario/producto antes del envío. Si la respuesta es incierta se bloquea su edición y se ofrece reintentar con los mismos parámetros y UUID, incluso tras recargar. Solo un éxito genera una clave nueva. Ante conflicto se consulta nuevamente stock y se exige recontar. No se calcula un nuevo ajuste automáticamente sobre el conteo anterior.

## Validación

- 17 pruebas simuladas: inventario, kardex, formulario, registro, ajuste a cero, concurrencia, respuestas inválidas e idempotencia tras recarga.
- Prueba real sobre SKU-PRUEBA: stock inicial 15, entrada +1, repetición de la misma clave sin duplicado, rechazo de ajuste con stock desactualizado, ajuste -1 para volver a 15. Dos registros nuevos en kardex con el usuario de prueba. Ningún otro producto modificado.
- Rechazo con un VENDEDOR real sigue pendiente; interfaz y respuestas de rechazo cubiertas por pruebas simuladas.

## Observaciones para backend

El SQL revisado busca una clave repetida por producto/tipo, sin comparar cantidad, motivo ni registrado_por con la solicitud original. Por eso el frontend congela y conserva el payload; sería conveniente que el servidor rechazase también el mismo UUID con un payload o autor diferente. Las garantías del frontend no cubren llamadas directas a la API.

anular_remision y resumen_financiero_mensual ya usan es_admin_activo en la migración nueva. Esto no demuestra por sí solo que todas las demás políticas RLS rechacen usuarios desactivados.
