# Diccionario de Datos — ArizaERP

**Base de datos:** PostgreSQL sobre Supabase
**Cliente:** Distribuciones Ariza
**Última actualización de esquema:** módulos de catálogo, cartera (edición controlada de abonos), precios por cliente, IVA variable, kardex (entradas y ajustes idempotentes), finanzas/gastos y centro documental empresarial OneDrive

---

## 1. Reglas de Convención y Consumo API

- **Arquitectura:** el Frontend en React consume directamente las APIs REST autogeneradas por Supabase (PostgREST). No existe servidor intermedio en Node/Express ni capa de traducción de nombres de variables.
- **Nomenclatura:** todos los nombres de tablas, columnas, funciones y las respuestas JSON de la API REST están estrictamente en `snake_case`. **Nunca** se traduce a `camelCase` — React consume los campos tal cual vienen de PostgREST (ej. `cliente_id`, `saldo_cartera`, `tasa_iva`, no `clienteId` ni `saldoCartera`).
- **Llaves primarias:** todas las tablas usan `UUID` generado con `gen_random_uuid()` (excepto `perfiles`, cuyo `id` referencia directamente a `auth.users`).
- **Dinero / valores financieros:** siempre `NUMERIC(12,2)`. Nunca `FLOAT` ni `REAL`, para evitar errores de redondeo en el cálculo del IVA (19% o 5% según el producto).
- **Fechas:** siempre `TIMESTAMPTZ` en UTC (ISO 8601), salvo los campos de referencia mensual (`mes_referencia`) que son `DATE` porque representan un período, no un instante.
- **Archivos / PDFs:** la base de datos **nunca** almacena binarios. Los documentos (remisiones en PDF, facturas DIAN, cotizaciones) se suben a Microsoft OneDrive vía Microsoft Graph API (a través de la Edge Function empresarial `/functions/v1/onedrive`), y en PostgreSQL solo se guarda el enlace en una columna `TEXT` (`pdf_url`, `onedrive_url`) y su correspondencia verificada en `onedrive_archivos`.
- **Imágenes de producto:** se almacenan en **Supabase Storage**, no en OneDrive ni en la base de datos. El bucket `productos-imagenes` es privado; en `productos.imagen_path` solo se guarda la ruta del objeto (ej. `sku/ABC123.jpg`), y el frontend obtiene la imagen llamando a `supabase.storage.from('productos-imagenes').createSignedUrl(path, expiresIn)` — nunca una URL pública fija, porque el bucket no es público.
- **Listas de estados (`CHECK`):** siempre en mayúsculas sostenidas, ej. `'PENDIENTE'`, `'PAGADA'`, `'ANULADA'`, `'CONTADO'`, `'CREDITO'`, `'TIENDA'`, `'DISTRIBUIDOR'`, `'ADMIN'`, `'VENDEDOR'`.
- **Seguridad (RLS):** toda tabla tiene `ROW LEVEL SECURITY` activado y forzado (`FORCE ROW LEVEL SECURITY`). El rol `anon` no tiene ningún privilegio (`REVOKE ALL ... FROM anon`); todo el acceso pasa por `authenticated`, filtrado según el rol de negocio (`ADMIN` / `VENDEDOR`) almacenado en `perfiles`. Todas las funciones RPC y triggers operan con `search_path` fijo inmutable (`SET search_path = public, pg_temp`), y los permisos `EXECUTE` están revocados de `PUBLIC` y limitados exclusivamente a `authenticated` (nunca `anon`).
- **Lógica transaccional en el motor:** el descuento de stock, el cálculo de IVA por línea, la resolución de precio por cliente y la actualización de cartera **no** se calculan en React — viven en triggers y funciones RPC de PostgreSQL, invocadas desde el frontend con `supabase.rpc(...)`. Las funciones que ejecutan mutaciones críticas usan `SECURITY DEFINER` con search_path explícito.

---

## 2. Entidades

### 2.1 `perfiles`

Usuarios del sistema y su rol de negocio. Extiende `auth.users` de Supabase Auth.

| Campo / Propiedad API | Tipo de Dato | Nulo (Sí/No) | Clave (PK/FK/Check) | Descripción / Regla de Negocio |
|---|---|---|---|---|
| `id` | `UUID` | No | PK, FK → `auth.users(id)` | Mismo ID que el usuario de Supabase Auth. `ON DELETE CASCADE`. |
| `nombre_completo` | `TEXT` | No | — | Nombre para mostrar en la interfaz. |
| `rol` | `TEXT` | No | Check: `'ADMIN'`, `'VENDEDOR'` | Determina qué políticas RLS y qué acciones del frontend están disponibles. |
| `activo` | `BOOLEAN` | No | Default `TRUE` | Permite desactivar un usuario sin borrar su historial de remisiones/gastos. |
| `created_at` | `TIMESTAMPTZ` | No | Default `now()` | Fecha de creación del perfil. |

---

### 2.2 `productos`

Catálogo (97 SKUs). Contiene los dos precios base y la tasa de IVA propia de cada producto.

| Campo / Propiedad API | Tipo de Dato | Nulo (Sí/No) | Clave (PK/FK/Check) | Descripción / Regla de Negocio |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Identificador del producto. |
| `sku` | `TEXT` | No | Unique | Código único de referencia del catálogo. |
| `nombre` | `TEXT` | No | — | Nombre comercial del producto. |
| `categoria` | `TEXT` | No | — | Líquidos, Alimentos, Accesorios, etc. Usado en los filtros del catálogo. |
| `origen` | `TEXT` | Sí | — | Nacional / China / etc. Informativo, apoya la orden de compra a proveedores. |
| `precio_tienda` | `NUMERIC(12,2)` | No | Check `>= 0` | Precio base para clientes con `tipo_cliente = 'TIENDA'`. |
| `precio_distribuidor` | `NUMERIC(12,2)` | No | Check `>= 0` | Precio base para clientes con `tipo_cliente = 'DISTRIBUIDOR'`. |
| `tasa_iva` | `NUMERIC(4,2)` | No | Check `IN (0, 5, 19)`, Default `19.00` | Tasa de IVA propia del producto (algunos productos van al 5%, otros al 19%). |
| `imagen_path` | `TEXT` | Sí | — | Ruta del objeto dentro del bucket privado `productos-imagenes` de Supabase Storage (ej. `sku/ABC123.jpg`). No es una URL pública: se resuelve en el frontend con `createSignedUrl()`. Nulo si el producto aún no tiene foto cargada. |
| `stock_actual` | `NUMERIC(12,2)` | No | Check `>= 0`, Default `0` | Existencias actuales. Se actualiza únicamente vía triggers de `detalles_remision` y `kardex`. |
| `stock_minimo` | `NUMERIC(12,2)` | No | Check `>= 0`, Default `10` | Umbral configurable para el semáforo de stock (2.3). |
| `activo` | `BOOLEAN` | No | Default `TRUE` | Productos con movimientos históricos o remisiones se desactivan (`FALSE`) en vez de borrarse físicamente. |
| `created_at` | `TIMESTAMPTZ` | No | Default `now()` | Fecha de alta del producto. |
| `updated_at` | `TIMESTAMPTZ` | No | Default `now()` | Se actualiza en cada movimiento de stock. |

**Vista relacionada:** `vista_alertas_stock` — expone `id, sku, nombre, categoria, stock_actual, stock_minimo, semaforo` (`'ROJO'` / `'AMARILLO'` / `'VERDE'`), calculado a partir de `stock_minimo`.

---

### 2.3 `clientes`

Las 200 tiendas/distribuidores. Define el tipo de precio base que aplica por defecto.

| Campo / Propiedad API | Tipo de Dato | Nulo (Sí/No) | Clave (PK/FK/Check) | Descripción / Regla de Negocio |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Identificador del cliente/tienda. |
| `nombre_tienda` | `TEXT` | No | — | Razón social o nombre comercial de la tienda. |
| `contacto` | `TEXT` | Sí | — | Persona de contacto. |
| `telefono` | `TEXT` | Sí | — | Teléfono / WhatsApp para envío de remisiones. |
| `direccion` | `TEXT` | Sí | — | Dirección de entrega. |
| `tipo_cliente` | `TEXT` | No | Check: `'TIENDA'`, `'DISTRIBUIDOR'`; Default `'TIENDA'` | Define si el precio base es `precio_tienda` o `precio_distribuidor` cuando no hay precio especial en `precios_cliente`. |
| `saldo_cartera` | `NUMERIC(12,2)` | No | Check `>= 0`, Default `0` | Saldo adeudado acumulado. Se actualiza automáticamente por trigger al crear remisiones a crédito y al registrar o editar abonos. |
| `en_mora` | `BOOLEAN` | No | Default `FALSE` | Se marca manualmente desde el módulo de cartera (no existe cupo de crédito automático). |
| `activo` | `BOOLEAN` | No | Default `TRUE` | Tiendas con historial o saldo se desactivan en vez de borrarse físicamente. |
| `created_at` | `TIMESTAMPTZ` | No | Default `now()` | Fecha de alta del cliente. |
| `updated_at` | `TIMESTAMPTZ` | No | Default `now()` | Se actualiza con cada movimiento de cartera. |

---

### 2.4 `precios_cliente`

Precio especial negociado por cliente y producto. Tabla de excepciones (solo tiene fila cuando hay un acuerdo puntual); si no existe fila, aplica el precio base de `productos` según `clientes.tipo_cliente`.

| Campo / Propiedad API | Tipo de Dato | Nulo (Sí/No) | Clave (PK/FK/Check) | Descripción / Regla de Negocio |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Identificador del registro de precio especial. |
| `cliente_id` | `UUID` | No | FK → `clientes(id)`, `ON DELETE CASCADE` | Cliente al que aplica el precio especial. |
| `producto_id` | `UUID` | No | FK → `productos(id)`, `ON DELETE CASCADE` | Producto con precio negociado. |
| `precio_especial` | `NUMERIC(12,2)` | No | Check `>= 0` | Precio que reemplaza a `precio_tienda`/`precio_distribuidor` para este cliente. Máxima prioridad en la resolución de precio. |
| `created_at` | `TIMESTAMPTZ` | No | Default `now()` | Fecha en que se pactó el precio. |
| `updated_at` | `TIMESTAMPTZ` | No | Default `now()` | Última renegociación. |
| — | — | — | Unique `(cliente_id, producto_id)` | Un cliente no puede tener dos precios especiales activos para el mismo producto. |

---

### 2.5 `remisiones`

Encabezado del pedido/venta.

| Campo / Propiedad API | Tipo de Dato | Nulo (Sí/No) | Clave (PK/FK/Check) | Descripción / Regla de Negocio |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Identificador de la remisión. |
| `consecutivo` | `BIGSERIAL` | No | — | Número secuencial legible para el documento impreso. |
| `cliente_id` | `UUID` | No | FK → `clientes(id)` | Tienda que realiza el pedido. |
| `vendedor_id` | `UUID` | No | FK → `perfiles(id)` | Usuario que registró la venta. Se asigna con `auth.uid()` dentro del RPC `crear_remision`. |
| `tipo_pago` | `TEXT` | No | Check: `'CONTADO'`, `'CREDITO'` | Determina si afecta `clientes.saldo_cartera`. |
| `aplica_iva` | `BOOLEAN` | No | Default `TRUE` | Toggle activado/desactivado desde el frontend. `FALSE` = remisión sin IVA discriminado (todas las líneas quedan con `iva_linea = 0`). |
| `subtotal` | `NUMERIC(12,2)` | No | Check `>= 0`, Default `0` | Suma de `detalles_remision.subtotal_linea`. |
| `iva` | `NUMERIC(12,2)` | No | Check `>= 0`, Default `0` | Suma de `detalles_remision.iva_linea`. Es un valor derivado/cacheado calculado una sola vez por el RPC `crear_remision`, no una segunda fuente de verdad. |
| `total` | `NUMERIC(12,2)` | No | Check `>= 0`, Default `0` | `subtotal + iva`. |
| `estado` | `TEXT` | No | Check: `'PENDIENTE'`, `'PAGADA'`, `'ANULADA'`; Default `'PENDIENTE'` | Al pasar a `'ANULADA'` se dispara el reingreso automático de stock y la reversión de cartera. |
| `pdf_url` | `TEXT` | Sí | — | Enlace al PDF de la remisión almacenado en Microsoft OneDrive. |
| `fecha` | `TIMESTAMPTZ` | No | Default `now()` | Fecha de la venta (usada en reportes financieros mensuales). |
| `created_at` | `TIMESTAMPTZ` | No | Default `now()` | Fecha de creación del registro. |

---

### 2.6 `detalles_remision`

Líneas del pedido. Cada línea guarda su propio precio e IVA resuelto, porque ambos pueden variar por producto y por cliente.

| Campo / Propiedad API | Tipo de Dato | Nulo (Sí/No) | Clave (PK/FK/Check) | Descripción / Regla de Negocio |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Identificador de la línea. |
| `remision_id` | `UUID` | No | FK → `remisiones(id)`, `ON DELETE CASCADE` | Remisión a la que pertenece la línea. |
| `producto_id` | `UUID` | No | FK → `productos(id)` | Producto vendido en esta línea. |
| `cantidad` | `NUMERIC(12,2)` | No | Check `> 0` | Unidades vendidas. Dispara el trigger de descuento de stock. |
| `precio_unitario` | `NUMERIC(12,2)` | No | Check `>= 0` | Precio ya resuelto en el momento de la venta (precio especial > distribuidor/tienda). Congelado aunque el precio del catálogo cambie después. |
| `subtotal_linea` | `NUMERIC(12,2)` | No | Check `>= 0` | `precio_unitario * cantidad`. |
| `tasa_iva_aplicada` | `NUMERIC(4,2)` | No | Default `0` | Tasa de IVA usada en esta línea (0 si la remisión desactivó IVA; si no, la `tasa_iva` del producto en ese momento). |
| `iva_linea` | `NUMERIC(12,2)` | No | Check `>= 0`, Default `0` | IVA calculado para esta línea según `tasa_iva_aplicada`. |
| `created_at` | `TIMESTAMPTZ` | No | Default `now()` | Fecha de inserción de la línea. |

---

### 2.7 `kardex`

Histórico inmutable de movimientos de inventario. Escrito automáticamente por triggers de ventas y por la función RPC `registrar_movimiento_inventario` (entradas y ajustes manuales por ADMIN). Nunca por `INSERT` directo del cliente.

| Campo / Propiedad API | Tipo de Dato | Nulo (Sí/No) | Clave (PK/FK/Check) | Descripción / Regla de Negocio |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Identificador del movimiento. |
| `producto_id` | `UUID` | No | FK → `productos(id)` | Producto afectado. |
| `remision_id` | `UUID` | Sí | FK → `remisiones(id)` | Remisión que originó el movimiento (nulo en entradas y ajustes manuales). |
| `tipo_movimiento` | `TEXT` | No | Check: `'ENTRADA'`, `'SALIDA'`, `'AJUSTE'` | Naturaleza del movimiento. |
| `cantidad` | `NUMERIC(12,2)` | No | — | Cantidad movida. En `ENTRADA` y `SALIDA` es positiva; en `AJUSTE` guarda la **diferencia con signo** (`conteo_físico - stock_anterior`), positiva si hay sobrante, negativa si hay faltante, o `0` si el conteo confirma el saldo actual. |
| `stock_resultante` | `NUMERIC(12,2)` | No | — | Foto del stock después de aplicar el movimiento. Útil para auditoría sin recalcular históricos. |
| `observacion` | `TEXT` | Sí | — | Justificación o motivo del movimiento (ej. `"Descuento por remisión"`, `"Reingreso por anulación"`, `"Compra factura #123"`). Mínimo 5 caracteres en movimientos manuales. |
| `registrado_por` | `UUID` | Sí | FK → `perfiles(id)` | Usuario administrador que registró el movimiento manual. Nulo en movimientos originados por triggers del sistema. |
| `idempotency_key` | `UUID` | Sí | Unique parcial (`WHERE idempotency_key IS NOT NULL`) | Clave única generada por el frontend para garantizar idempotencia en la RPC `registrar_movimiento_inventario`. Nulo en triggers. |
| `created_at` | `TIMESTAMPTZ` | No | Default `now()` | Momento exacto del movimiento. |

---

### 2.8 `abonos_cartera`

Pagos parciales o totales aplicados al saldo de un cliente.

| Campo / Propiedad API | Tipo de Dato | Nulo (Sí/No) | Clave (PK/FK/Check) | Descripción / Regla de Negocio |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Identificador del abono. |
| `cliente_id` | `UUID` | No | FK → `clientes(id)` | Cliente que realiza el pago. |
| `remision_id` | `UUID` | Sí | FK → `remisiones(id)` | Remisión puntual que cubre el abono (opcional; puede ser un abono general a la cartera). |
| `monto` | `NUMERIC(12,2)` | No | Check `> 0` | Valor abonado. Descuenta automáticamente `clientes.saldo_cartera` vía trigger al crearse, o se ajusta vía RPC `editar_abono_cartera`. |
| `metodo_pago` | `TEXT` | No | Check: `'EFECTIVO'`, `'TRANSFERENCIA'`, `'BANCOLOMBIA'`; Default `'EFECTIVO'` | Forma de pago del abono. |
| `fecha` | `TIMESTAMPTZ` | No | Default `now()` | Fecha del pago. |
| `registrado_por` | `UUID` | No | FK → `perfiles(id)` | Usuario que registró el abono. |
| `created_at` | `TIMESTAMPTZ` | No | Default `now()` | Fecha de creación del registro. |

---

### 2.9 `gastos`

Gastos operacionales fijos y variables. Información financiera sensible — solo accesible por `ADMIN`. Soporta creación, edición con control de concurrencia y eliminación con recálculo inmediato del resumen mensual.

| Campo / Propiedad API | Tipo de Dato | Nulo (Sí/No) | Clave (PK/FK/Check) | Descripción / Regla de Negocio |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Identificador del gasto. |
| `concepto` | `TEXT` | No | — | Ej. arriendo, nómina, fletes, servicios, mantenimiento. |
| `categoria` | `TEXT` | No | — | Agrupación para reportes. |
| `monto` | `NUMERIC(12,2)` | No | Check `>= 0` | Valor del gasto. |
| `mes_referencia` | `DATE` | No | — | Primer día del mes al que corresponde el gasto (ej. `2026-09-01`). Base del cálculo de ganancia mensual. |
| `recurrente` | `BOOLEAN` | No | Default `TRUE` | Marca si es un gasto fijo mensual o un gasto puntual. |
| `registrado_por` | `UUID` | No | FK → `perfiles(id)` | Usuario `ADMIN` que registró el gasto. |
| `created_at` | `TIMESTAMPTZ` | No | Default `now()` | Fecha de registro. |

---

### 2.10 `presupuestos`

Configuración del tope de gasto mensual, usado para disparar la alerta financiera del Dashboard.

| Campo / Propiedad API | Tipo de Dato | Nulo (Sí/No) | Clave (PK/FK/Check) | Descripción / Regla de Negocio |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Identificador del presupuesto. |
| `mes_referencia` | `DATE` | No | Unique | Mes al que aplica el límite (una sola fila por mes). |
| `presupuesto_limite` | `NUMERIC(12,2)` | No | Check `>= 0` | Tope de gasto. Si `SUM(gastos.monto)` del mes lo supera, `resumen_financiero_mensual()` devuelve `excede_presupuesto = TRUE`. |
| `created_at` | `TIMESTAMPTZ` | No | Default `now()` | Fecha de configuración. |

---

### 2.11 `documentos`

Enlaces a archivos alojados en Microsoft OneDrive (facturas DIAN, cotizaciones de China, archivos legales). La base de datos nunca almacena el binario.

| Campo / Propiedad API | Tipo de Dato | Nulo (Sí/No) | Clave (PK/FK/Check) | Descripción / Regla de Negocio |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | Identificador del documento. |
| `tipo_documento` | `TEXT` | No | Check: `'FACTURA_DIAN'`, `'COTIZACION_CHINA'`, `'LEGAL'`, `'OTRO'` | Clasificación del archivo. Los documentos `'FACTURA_DIAN'` o asociados a una remisión están protegidos contra eliminación accidental. |
| `nombre` | `TEXT` | No | — | Nombre descriptivo del documento. |
| `onedrive_url` | `TEXT` | No | — | Enlace directo al archivo en OneDrive corporativo. |
| `cliente_id` | `UUID` | Sí | FK → `clientes(id)` | Asociación opcional a una tienda (ej. contrato o archivo legal general del cliente). |
| `remision_id` | `UUID` | Sí | FK → `remisiones(id)` | Asociación opcional a un pedido puntual (ej. la factura DIAN o el PDF de esa remisión específica). |
| `subido_por` | `UUID` | No | FK → `perfiles(id)` | Usuario `ADMIN` que subió el documento. |
| `created_at` | `TIMESTAMPTZ` | No | Default `now()` | Fecha de carga. |

---

## 3. Funciones RPC expuestas a React (`supabase.rpc(...)`)

| Función | Parámetros | Retorna | Descripción |
|---|---|---|---|
| `crear_remision` | `p_cliente_id UUID, p_tipo_pago TEXT, p_items JSONB, p_aplica_iva BOOLEAN = TRUE` | `UUID` (id de la remisión) | Resuelve precio (especial > distribuidor/tienda), calcula IVA por línea según la tasa de cada producto, respeta el toggle de IVA, e inserta encabezado + detalles en una transacción atómica. |
| `registrar_abono` | `p_cliente_id UUID, p_monto NUMERIC, p_metodo_pago TEXT = 'EFECTIVO', p_remision_id UUID = NULL` | `UUID` (id del abono) | Registra un pago a la cartera de un cliente; descuenta `saldo_cartera` vía trigger. |
| `editar_abono_cartera` | `p_abono_id UUID, p_cliente_id UUID, p_monto NUMERIC, p_metodo_pago TEXT, p_remision_id UUID = NULL, p_motivo TEXT = NULL, p_monto_anterior NUMERIC = NULL` | `JSONB` (`abono_id, cliente_id, monto_anterior, monto_nuevo, saldo_anterior, saldo_resultante, motivo`) | Corrige de forma atómica y con bloqueo pesimista (`FOR UPDATE`) un abono registrado, recalculando `clientes.saldo_cartera` y validando el saldo pendiente de la remisión a crédito sin permitir saldos negativos ni sobrepagos (`SECURITY DEFINER`, exclusivo `ADMIN` activo). |
| `registrar_movimiento_inventario` | `p_producto_id UUID, p_tipo TEXT, p_cantidad NUMERIC, p_motivo TEXT, p_idempotency_key UUID, p_stock_esperado NUMERIC = NULL` | `JSONB` (`kardex_id, producto_id, tipo_movimiento, cantidad, stock_anterior, stock_resultante, repetido`) | Registra entradas (`ENTRADA`) o conteos físicos (`AJUSTE`, permitiendo `0` existencias e incluyendo ajustes cuando el conteo coincide con el stock actual) de forma atómica e idempotente (`SECURITY DEFINER`, exclusivo `ADMIN` activo). |
| `resumen_financiero_mensual` | `p_mes DATE` | Tabla: `total_ventas, total_gastos, ganancia_neta, presupuesto_limite, excede_presupuesto` | Calcula la utilidad neta del mes y si los gastos superaron el presupuesto configurado (exclusivo rol `ADMIN`). |
| `anular_remision` | `p_remision_id UUID` | `VOID` | Marca la remisión como ANULADA. Triggers reingresan stock y revierten cartera automáticamente (`SECURITY DEFINER`, exclusivo `ADMIN` activo). |
| `actualizar_pdf_remision` | `p_remision_id UUID, p_pdf_url TEXT` | `VOID` | Actualiza la columna `pdf_url` tras subir el archivo a OneDrive (`SECURITY DEFINER` para permitir a VENDEDOR y ADMIN). |

---

## 4. Tablas internas de integración OneDrive (Migración 006 — Service-only)

Las siguientes tablas almacenan el estado de conexión empresarial con Microsoft OneDrive, el flujo OAuth/PKCE y la correspondencia de archivos en Graph. Tienen `RLS` forzado y **0 permisos** para `anon` y `authenticated`; solo son accesibles desde la Edge Function `/functions/v1/onedrive` con `service_role`:

- **`onedrive_empresa`**: Fila única (`id = TRUE`) con `estado`, `cuenta_correo`, `drive_id`, tokens cifrados (`access_token_cifrado`, `refresh_token_cifrado`) y bloqueo de concurrencia con caducidad (`operacion_id`, `operacion_expira_en`).
- **`onedrive_oauth`**: Estados efímeros OAuth2 + PKCE (`state`, `usuario_id`, `code_verifier_cifrado`, `expira_en`).
- **`onedrive_archivos`**: Reserva e inventario de archivos en Microsoft Graph (`id`, `documento_id`, `remision_id`, `drive_id`, `item_id`, `ruta_onedrive`, `web_url`, `sha256`, `estado`).

---

## 5. Almacenamiento (Supabase Storage)

| Bucket | Público | Contenido | Regla de acceso (RLS sobre `storage.objects`) |
|---|---|---|---|
| `productos-imagenes` | No (privado) | Fotos de producto, una por SKU. Ruta guardada en `productos.imagen_path`. | `SELECT` para cualquier `authenticated`; `INSERT`/`UPDATE`/`DELETE` solo para `ADMIN`. `anon` no tiene ninguna política, por lo tanto 0 acceso. |

El frontend nunca construye una URL pública directa: siempre pide una URL firmada con vencimiento corto (`supabase.storage.from('productos-imagenes').createSignedUrl(imagen_path, expiresIn)`), consistente con la regla de que todo en el sistema es privado.
