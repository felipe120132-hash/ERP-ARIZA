# Contrato de API — ArizaERP

**Backend:** Supabase (PostgreSQL + PostgREST autogenerado + Edge Function `/functions/v1/onedrive`)
**Para:** Equipo de Frontend (React)
**Regla de oro:** el frontend nunca arma URLs REST a mano — todo pasa por `supabase-js` (`supabase.from(...)`, `supabase.rpc(...)`, `supabase.functions.invoke(...)`). Este documento describe qué hay detrás de esas llamadas para que sepan qué esperar.

---

## 1. Fundamentos de conexión

```javascript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

- **Base URL real:** `https://<project-ref>.supabase.co/rest/v1/` — supabase-js ya la arma sola.
- **Autenticación:** después de `supabase.auth.signInWithPassword(...)`, el cliente adjunta automáticamente el JWT del usuario en cada request. No hay que manejar tokens a mano.
- **Nombres de campo:** siempre `snake_case`, idénticos al esquema (`cliente_id`, `saldo_cartera`, `tasa_iva`). Nunca se traducen a `camelCase` en ningún punto del contrato.
- **RLS es invisible pero real:** cada request ya viene filtrada por las políticas de seguridad. Si un `VENDEDOR` pide `gastos`, no recibe un error — recibe un array vacío `[]`, como si la tabla no tuviera filas. El frontend debe tratar "0 resultados" en tablas restringidas como posible bloqueo de permisos, no como "no existe nada".

### 1.1 Cómo se estructuran los endpoints (para quien necesite verlos "en vivo")

No es una lista de endpoints que haya que memorizar o que alguien tenga que escribir a mano — PostgREST los genera automáticamente a partir del esquema, y siguen una fórmula fija y predecible:

```
https://<tu-proyecto>.supabase.co/rest/v1/<nombre_de_la_tabla>
```

Si la tabla se llama `productos`, el endpoint es `/rest/v1/productos`. Si se llama `remisiones`, es `/rest/v1/remisiones` — sin excepciones, sin configuración adicional. Por eso, en la práctica, saber "la API" es lo mismo que saber los nombres de tabla/columna de la sección 3 de este documento.

---

## 2. Formato de respuesta y manejo de errores

| Situación | Qué devuelve supabase-js |
|---|---|
| Consulta exitosa | `{ data: [...], error: null }` |
| RLS bloquea las filas | `{ data: [], error: null }` — array vacío, sin error explícito |
| Trigger o función rechaza la operación (ej. stock insuficiente) | `{ data: null, error: { message, details, hint, code } }` |
| Sin sesión / JWT inválido | `error.status === 401` |
| Escritura sin permiso (ej. VENDEDOR intentando insertar en `gastos`) | `error.status === 403` (o 0 filas afectadas en UPDATE/DELETE) |

El `error.message` de las funciones RPC es el mismo texto que definimos en cada `RAISE EXCEPTION` del backend (ej. `"Stock insuficiente para el producto..."`) — es seguro mostrarlo directo al usuario, ya está en español y pensado para leerse.

---

## 3. Endpoints de tablas (CRUD autogenerado por PostgREST)

Todas se consumen con `supabase.from('nombre_tabla')`. La columna "Escritura" indica qué rol puede insertar/editar/borrar según las políticas RLS ya configuradas — el frontend debe ocultar o deshabilitar esos controles en la UI según el rol del usuario logueado (`perfiles.rol`), no solo confiar en que el backend rechace la escritura.

| Tabla | Lectura | Escritura | Notas para el frontend |
|---|---|---|---|
| `perfiles` | Su propio perfil, o todos si es `ADMIN` | Solo `ADMIN` | Usar para saber el rol del usuario logueado: `supabase.from('perfiles').select('rol').eq('id', user.id).single()` |
| `productos` | Cualquier autenticado | Solo `ADMIN` | Para el semáforo de stock, usar la vista `vista_alertas_stock`, no calcular el color en el frontend. Si tiene kardex o remisiones asociadas, se desactiva lógicamente (`activo = false`) en lugar de eliminarse. |
| `clientes` | Cualquier autenticado | Solo `ADMIN` | Si tiene remisiones, abonos, documentos o saldo pendiente, se desactiva lógicamente (`activo = false`) en lugar de eliminarse. |
| `precios_cliente` | Cualquier autenticado | Solo `ADMIN` | Rara vez se consulta directo; normalmente el precio ya viene resuelto por el RPC `crear_remision` |
| `remisiones` | Cualquier autenticado | INSERT: vía RPC `crear_remision`; UPDATE (anular): vía RPC `anular_remision` (`ADMIN`) | — |
| `detalles_remision` | Cualquier autenticado | Igual que remisiones — **nunca insertar directo**, siempre vía `crear_remision` | Insertar manual salta el cálculo de precio/IVA y descuadra el encabezado |
| `kardex` | Cualquier autenticado | Ninguna directa (triggers de ventas o RPC `registrar_movimiento_inventario`) | Tabla de solo lectura para SELECT; entradas y ajustes manuales se ejecutan exclusivamente vía RPC |
| `abonos_cartera` | Cualquier autenticado | INSERT vía RPC `registrar_abono`; UPDATE vía RPC `editar_abono_cartera` (`ADMIN`) | — |
| `gastos` | Solo `ADMIN` | Solo `ADMIN` (INSERT, UPDATE con verificación de concurrencia, DELETE) | Un `VENDEDOR` ni siquiera debe ver este menú en la UI |
| `presupuestos` | Solo `ADMIN` | Solo `ADMIN` | — |
| `documentos` | Cualquier autenticado | Solo `ADMIN` (vía Edge Function `/functions/v1/onedrive`) | Los documentos `FACTURA_DIAN` o vinculados a remisiones (`remision_id`) están protegidos contra eliminación |
| `vista_alertas_stock` (vista) | Cualquier autenticado | No aplica (es de solo lectura) | Trae `semaforo`: `'ROJO'` / `'AMARILLO'` / `'VERDE'` ya calculado |

---

## 4. Funciones RPC (la lógica de negocio real vive aquí)

Se llaman con `supabase.rpc('nombre_funcion', { parametros })`. Todo lo demás son operaciones CRUD simples de la sección 3.

### `crear_remision`
Crea un pedido completo: resuelve precio por cliente, calcula IVA por línea, descuenta stock, valida todo en una transacción.

```javascript
const { data: remisionId, error } = await supabase.rpc('crear_remision', {
  p_cliente_id: 'uuid-del-cliente',
  p_tipo_pago: 'CONTADO',        // o 'CREDITO'
  p_items: [
    { producto_id: 'uuid-producto-1', cantidad: 2 },
    { producto_id: 'uuid-producto-2', cantidad: 1 },
  ],
  p_aplica_iva: true,             // toggle de "discriminar IVA" en pantalla
});
// data -> UUID de la remisión creada, listo para generar el PDF
```
Errores esperables: `"Producto ... no encontrado"`, `"Stock insuficiente para el producto ..."`, `"tipo_pago inválido: ..."`.

### `registrar_abono`
```javascript
const { data: abonoId, error } = await supabase.rpc('registrar_abono', {
  p_cliente_id: 'uuid-del-cliente',
  p_monto: 100000,
  p_metodo_pago: 'TRANSFERENCIA',   // 'EFECTIVO' | 'TRANSFERENCIA' | 'BANCOLOMBIA'
  p_remision_id: 'uuid-remision',   // opcional, puede omitirse
});
```

### `editar_abono_cartera`
Permite a un administrador activo (`ADMIN`) corregir un abono previamente registrado (importe, método de pago, remisión a crédito vinculada y motivo de corrección) dentro de una transacción atómica con bloqueo pesimista (`FOR UPDATE`).

```javascript
const { data, error } = await supabase.rpc('editar_abono_cartera', {
  p_abono_id: 'uuid-del-abono',
  p_cliente_id: 'uuid-del-cliente',
  p_monto: 75000,                   // Nuevo importe (> 0)
  p_metodo_pago: 'BANCOLOMBIA',     // 'EFECTIVO' | 'TRANSFERENCIA' | 'BANCOLOMBIA'
  p_remision_id: 'uuid-remision',   // Opcional (null para abono general)
  p_motivo: 'Corrección por error de digitación en recibo', // Mínimo 5 caracteres
  p_monto_anterior: 100000,         // Monto actual leído en pantalla (control de concurrencia)
});
```
- Recalcula `clientes.saldo_cartera` (`saldo_actual + monto_anterior - nuevo_monto`) impidiendo que quede negativo.
- Si el abono se vincula a una remisión a crédito, valida que la suma de abonos de esa remisión no supere su `total`.

### `resumen_financiero_mensual`
```javascript
const { data, error } = await supabase.rpc('resumen_financiero_mensual', {
  p_mes: '2026-09-01',   // primer día del mes
});
// data[0] -> { total_ventas, total_gastos, ganancia_neta, presupuesto_limite, excede_presupuesto }
```
Solo administradores activos (`ADMIN`) obtienen datos reales (protegido por guard `es_admin_activo()`).

### `anular_remision`
Marca una remisión como ANULADA. Los triggers de base de datos reingresan stock y revierten cartera automáticamente. Exclusivo para administradores activos.

```javascript
const { error } = await supabase.rpc('anular_remision', {
  p_remision_id: 'uuid-de-la-remision',
});
```

### `registrar_movimiento_inventario`
Registra entradas de inventario o ajustes físicos de existencias de forma atómica e idempotente. Exclusivo para administradores activos (`ADMIN`).

```javascript
const { data, error } = await supabase.rpc('registrar_movimiento_inventario', {
  p_producto_id: 'uuid-del-producto',
  p_tipo: 'ENTRADA',                      // 'ENTRADA' | 'AJUSTE'
  p_cantidad: 10,                         // ENTRADA: unidades a sumar (> 0). AJUSTE: existencia contada (>= 0)
  p_motivo: 'Ingreso factura proveedor', // Justificación (mínimo 5 caracteres tras trim)
  p_idempotency_key: 'uuid-v4',          // Clave de idempotencia única para la operación
  p_stock_esperado: null,                 // Obligatorio en AJUSTE con el stock leído antes del conteo
});
```

**Respuesta JSONB (`data`):**
```json
{
  "kardex_id": "uuid-del-kardex",
  "producto_id": "uuid-del-producto",
  "tipo_movimiento": "ENTRADA",
  "cantidad": 10,
  "stock_anterior": 0,
  "stock_resultante": 10,
  "repetido": false
}
```

- **Idempotencia:** Si se reintenta el envío con la misma clave `p_idempotency_key` para el mismo producto y tipo, la función retorna el mismo JSONB con `"repetido": true` sin duplicar el movimiento ni alterar el stock nuevamente.
- **Ajustes:** En movimientos de tipo `'AJUSTE'`, `cantidad` en la respuesta y en `kardex` almacena la diferencia con signo (`p_cantidad - stock_anterior`), y el stock del producto pasa a ser exactamente la existencia contada (`p_cantidad`), incluyendo `0` cuando se verifica agotamiento físico o `diferencia = 0` cuando se deja constancia de auditoría física. Si `p_stock_esperado` difiere del stock bloqueado al momento de aplicar la transacción, se rechaza la operación para prevenir inconsistencias concurrentes.
- **Errores esperables:**
  - `"Solo administradores activos pueden registrar movimientos de inventario."`
  - `"Tipo de movimiento inválido. Debe ser ENTRADA o AJUSTE."`
  - `"La clave de idempotencia es obligatoria."`
  - `"El motivo debe tener al menos 5 caracteres."`
  - `"La cantidad para una ENTRADA debe ser mayor a cero."`
  - `"La cantidad física contada para un AJUSTE no puede ser negativa."`
  - `"El stock esperado es obligatorio para un AJUSTE."`
  - `"El stock cambió desde que lo consultaste (ahora: X). Recuenta y vuelve a enviar."`
  - `"No se puede registrar una entrada para un producto inactivo."`
  - `"La clave de idempotencia ya fue usada en otro movimiento."`

---

## 5. Edge Function `/functions/v1/onedrive`

Gestiona la conexión empresarial con Microsoft OneDrive, subida de documentos y PDFs de remisiones, descarga autenticada y eliminación segura:

- `action: "status" | "list" | "references" | "start" | "complete" | "disconnect" | "recover" | "file" | "delete"`.
- Subida `multipart/form-data` con `metadata` (`id, nombre, tipo_documento, cliente_id, remision_id, pdf_remision`) y binario `file`.
- Eliminación (`action: "delete"`, `documento_id`): exclusivo para `ADMIN` activo. Rechaza la eliminación si el documento tiene `remision_id` asociado o es de tipo `'FACTURA_DIAN'`. Elimina primero el archivo en Microsoft Graph (aceptando `404` como ya inexistente) y luego elimina `onedrive_archivos` y `documentos`, evitando archivos huérfanos o referencias rotas.

---

## 6. Relaciones embebidas (evitar múltiples llamadas)

PostgREST permite traer datos relacionados en una sola consulta usando el nombre de la tabla foránea, sin necesidad de un JOIN manual ni de una segunda llamada:

```javascript
// Detalle de una remisión con el nombre y SKU del producto ya incluido
const { data } = await supabase
  .from('detalles_remision')
  .select('*, productos(nombre, sku)')
  .eq('remision_id', remisionId);

// Remisión con los datos del cliente embebidos
const { data } = await supabase
  .from('remisiones')
  .select('*, clientes(nombre_tienda, tipo_cliente)')
  .eq('estado', 'PENDIENTE');
```

---

## 7. Storage (imágenes de producto)

El bucket `productos-imagenes` es privado — nunca se construye una URL pública a mano.

```javascript
const { data, error } = await supabase.storage
  .from('productos-imagenes')
  .createSignedUrl(producto.imagen_path, 3600); // URL válida 1 hora
// data.signedUrl -> usar como src de la imagen
```

Para subir (solo disponible en pantallas de `ADMIN`):
```javascript
const { error } = await supabase.storage
  .from('productos-imagenes')
  .upload(`sku/${sku}.jpg`, file, { upsert: true });
```

---

## 8. Resumen de lo que el frontend NO debe hacer

- No insertar directo en `detalles_remision` o `kardex` — siempre vía `crear_remision` o `registrar_movimiento_inventario`.
- No calcular IVA, semáforo de stock, ni resolución de precio por cliente en el frontend — esos cálculos viven en el backend (triggers/RPC/vista) para que no haya dos fuentes de verdad.
- No asumir que un array vacío significa "no hay datos" en tablas restringidas por rol — puede ser RLS bloqueando.
- No construir URLs públicas para las imágenes de producto — siempre `createSignedUrl()`.
- No exponer tokens OAuth de Microsoft OneDrive en el navegador — toda operación con Graph pasa por `/functions/v1/onedrive`.
