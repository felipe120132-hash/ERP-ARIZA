# Contrato de API — ArizaERP

**Backend:** Supabase (PostgreSQL + PostgREST autogenerado)
**Para:** Equipo de Frontend (React)
**Regla de oro:** el frontend nunca arma URLs REST a mano — todo pasa por `supabase-js` (`supabase.from(...)`, `supabase.rpc(...)`). Este documento describe qué hay detrás de esas llamadas para que sepan qué esperar.

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

Además, el frontend casi nunca toca esa URL directamente: con `supabase-js` se escribe `supabase.from('productos').select('*')` y la librería arma URL, headers y autenticación por debajo.

Si el equipo quiere explorar o probar los endpoints "en vivo" (por ejemplo, en Postman, antes de escribir código React):

- **Project Settings → API Docs** (o el botón "API" dentro de cada tabla en el Table Editor) muestra, ya con la URL real del proyecto, ejemplos de código listos para copiar en JavaScript y en `curl` crudo para cada tabla — Supabase lo genera solo a partir del esquema, no hay que escribirlo.
- Esa misma página documenta también las 3 funciones RPC (`crear_remision`, `registrar_abono`, `resumen_financiero_mensual`) con su firma exacta.
- Para importar todo a Postman/Insomnia de una vez: pedir la URL base con el header `Accept: application/openapi+json` devuelve el spec OpenAPI completo, importable directamente.

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
| `productos` | Cualquier autenticado | Solo `ADMIN` | Para el semáforo de stock, usar la vista `vista_alertas_stock`, no calcular el color en el frontend |
| `clientes` | Cualquier autenticado | Solo `ADMIN` | — |
| `precios_cliente` | Cualquier autenticado | Solo `ADMIN` | Rara vez se consulta directo; normalmente el precio ya viene resuelto por el RPC `crear_remision` |
| `remisiones` | Cualquier autenticado | INSERT: cualquiera (pero **usar el RPC `crear_remision`**, no insertar directo — ver sección 4); UPDATE (anular): solo `ADMIN` | — |
| `detalles_remision` | Cualquier autenticado | Igual que remisiones — **nunca insertar directo**, siempre vía `crear_remision` | Insertar manual salta el cálculo de precio/IVA y descuadra el encabezado |
| `kardex` | Cualquier autenticado | Ninguna (solo lo escriben los triggers) | Tabla de solo lectura desde el frontend, sin excepción |
| `abonos_cartera` | Cualquier autenticado | INSERT: cualquiera (mejor vía RPC `registrar_abono`) | — |
| `gastos` | Solo `ADMIN` | Solo `ADMIN` | Un `VENDEDOR` ni siquiera debe ver este menú en la UI |
| `presupuestos` | Solo `ADMIN` | Solo `ADMIN` | — |
| `documentos` | Cualquier autenticado | Solo `ADMIN` | — |
| `vista_alertas_stock` (vista) | Cualquier autenticado | No aplica (es de solo lectura) | Trae `semaforo`: `'ROJO'` / `'AMARILLO'` / `'VERDE'` ya calculado |

**Ejemplo de lectura con filtro:**
```javascript
const { data, error } = await supabase
  .from('vista_alertas_stock')
  .select('*')
  .eq('semaforo', 'ROJO');
```

---

## 4. Funciones RPC (la lógica de negocio real vive aquí)

Se llaman con `supabase.rpc('nombre_funcion', { parametros })`. Estas son las únicas tres — todo lo demás son operaciones CRUD simples de la sección 3.

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

### `resumen_financiero_mensual`
```javascript
const { data, error } = await supabase.rpc('resumen_financiero_mensual', {
  p_mes: '2026-09-01',   // primer día del mes
});
// data[0] -> { total_ventas, total_gastos, ganancia_neta, presupuesto_limite, excede_presupuesto }
```
Solo `ADMIN` obtiene datos reales (las tablas `gastos`/`presupuestos` que consulta por dentro están restringidas); un `VENDEDOR` recibiría el cálculo con `total_gastos = 0`.

---

## 5. Relaciones embebidas (evitar múltiples llamadas)

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

## 6. Storage (imágenes de producto)

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

## 7. Resumen de lo que el frontend NO debe hacer

- No insertar directo en `detalles_remision` o `kardex` — siempre vía `crear_remision`.
- No calcular IVA, semáforo de stock, ni resolución de precio por cliente en el frontend — esos cálculos viven en el backend (triggers/RPC/vista) para que no haya dos fuentes de verdad.
- No asumir que un array vacío significa "no hay datos" en tablas restringidas por rol — puede ser RLS bloqueando.
- No construir URLs públicas para las imágenes de producto — siempre `createSignedUrl()`.
