# Guía de Frontend — ArizaERP

> Inventario de servicios, firmas y ejemplos de uso de `frontend/src/` y `src/`.
>
> Documentado a partir del código real en `frontend/src/services/`, `frontend/src/context/` y `frontend/src/types/`.

---

## Índice

1. [Regla de oro](#regla-de-oro)
2. [Tipo compartido: `ServiceResponse<T>`](#tipo-compartido-serviceresponset)
3. [Servicios disponibles](#servicios-disponibles)
   - [productosService y productosAdminService](#productosservice-y-productosadminservice)
   - [clientesService y clientesAdminService](#clientesservice-y-clientesadminservice)
   - [remisionesService](#remisionesservice)
   - [carteraService](#carteraservice)
   - [gastosService y presupuestosService](#gastosservice-y-presupuestosservice)
   - [inventarioService](#inventarioservice)
   - [documentosEmpresaService](#documentosempresaservice)
4. [Autenticación: AuthContext, useAuth y authService](#autenticación-authcontext-useauth-y-authservice)
5. [Seguridad de sesiones y protección de rutas](#seguridad-de-sesiones-y-protección-de-rutas)
6. [Tipos TypeScript exportados](#tipos-typescript-exportados)
7. [Manejo de errores](#manejo-de-errores)

---

## Regla de oro

> ⚠️ **Nunca importes `supabaseClient` directamente desde una pantalla o componente.**
> Todo acceso a datos pasa por los archivos de `services/`.
>
> ```ts
> // ❌ Prohibido en componentes/páginas
> import { supabase } from '../services/supabaseClient';
>
> // ✅ Correcto
> import { productosService } from '../services/productosService';
> ```
>
> Esta regla garantiza que la validación Zod, el manejo de errores en español
> y los tipos seguros funcionen de forma consistente en toda la app.
>
> 🔒 **Autenticación requerida:** Todas las funciones RPC y consultas de datos requieren sesión activa (`authenticated`).

---

## Tipo compartido: `ServiceResponse<T>`

Todas las funciones de todos los servicios retornan este tipo:

```ts
interface ServiceResponse<T> {
  data: T | null;
  error: string | null;  // mensaje en español listo para mostrar al usuario
}
```

---

## Servicios disponibles

### `productosService` y `productosAdminService`

**Archivos:** `frontend/src/services/productosService.ts` · `frontend/src/services/productosAdminService.ts`

| Función | Firma | Descripción |
|---|---|---|
| `listarProductos` | `() => Promise<ServiceResponse<Producto[]>>` | Todos los productos ordenados por SKU/nombre |
| `listarAlertasStock` | `(semaforo?: 'ROJO' \| 'AMARILLO' \| 'VERDE') => Promise<ServiceResponse<AlertaStock[]>>` | Alertas de la vista `vista_alertas_stock` |
| `obtenerProductoPorId` | `(id: string) => Promise<ServiceResponse<Producto>>` | Un producto por UUID |
| `crearProducto` | `(input: ProductoAdminInput, id?: string) => Promise<ServiceResponse<Producto>>` | Crea un producto validando SKU único y rol `ADMIN` activo |
| `actualizarProducto` | `(id: string, input: ProductoAdminInput, original: Producto) => Promise<ServiceResponse<Producto>>` | Edita un producto con control de concurrencia sobre sus campos comerciales |
| `eliminarODesactivar` | `(producto: Producto) => Promise<ServiceResponse<ResultadoEliminacionProducto>>` | Verifica dependencias en `kardex` y `detalles_remision`: si no tiene historial ni stock lo elimina físicamente; si tiene movimientos históricos lo desactiva lógicamente (`activo = false`) sin perder historial |

---

### `clientesService` y `clientesAdminService`

**Archivos:** `frontend/src/services/clientesService.ts` · `frontend/src/services/clientesAdminService.ts`

| Función | Firma | Descripción |
|---|---|---|
| `listarClientes` | `() => Promise<ServiceResponse<Cliente[]>>` | Todos los clientes ordenados por nombre |
| `listarClientesEnMora` | `() => Promise<ServiceResponse<Cliente[]>>` | Solo clientes con `en_mora = true` |
| `obtenerClientePorId` | `(id: string) => Promise<ServiceResponse<Cliente>>` | Un cliente por UUID |
| `crearCliente` | `(input: ClienteComercialInput, id?: string) => Promise<ServiceResponse<Cliente>>` | Crea un cliente validando duplicados por nombre/teléfono normalizados |
| `actualizarCliente` | `(id: string, input: ClienteComercialInput, original: Cliente) => Promise<ServiceResponse<Cliente>>` | Actualiza datos comerciales validando duplicados y concurrencia |
| `cambiarEstadoActivo` | `(cliente: Cliente, activo: boolean) => Promise<ServiceResponse<Cliente>>` | Activa o desactiva rápidamente un cliente conservando su historial y saldo |
| `eliminarODesactivar` | `(cliente: Cliente) => Promise<ServiceResponse<ResultadoEliminacionCliente>>` | Elimina físicamente al cliente solo cuando `saldo_cartera = 0` y no existen remisiones, abonos ni documentos asociados; de lo contrario aplica desactivación lógica (`activo = false`) |

---

### `remisionesService`

**Archivo:** `frontend/src/services/remisionesService.ts`

| Función | Firma | Descripción |
|---|---|---|
| `crearRemision` | `(input: CrearRemisionInput) => Promise<ServiceResponse<string>>` | Crea una remisión vía RPC `crear_remision` y retorna su UUID |
| `anularRemision` | `(remisionId: string) => Promise<ServiceResponse<boolean>>` | Anula una remisión vía RPC `anular_remision` (exclusivo `ADMIN`) |
| `listarRemisiones` | `(filtros?: FiltrosRemisiones) => Promise<ServiceResponse<Remision[]>>` | Remisiones ordenadas por fecha descendente |
| `obtenerRemisionPorId` | `(id: string) => Promise<ServiceResponse<Remision>>` | Obtiene una remisión por UUID |
| `obtenerDetallesRemision` | `(remisionId: string) => Promise<ServiceResponse<DetalleRemision[]>>` | Líneas de una remisión |
| `actualizarPdfUrl` | `(remisionId: string, url: string) => Promise<ServiceResponse<boolean>>` | Actualiza `pdf_url` vía RPC `actualizar_pdf_remision` |

---

### `carteraService`

**Archivo:** `frontend/src/services/carteraService.ts`

| Función | Firma | Descripción |
|---|---|---|
| `registrarAbono` | `(input: RegistrarAbonoInput) => Promise<ServiceResponse<string>>` | Registra un abono vía RPC `registrar_abono` |
| `editarAbono` | `(input: EditarAbonoInput) => Promise<ServiceResponse<EditarAbonoRespuesta>>` | Corrige un abono registrado vía RPC `editar_abono_cartera` (exclusivo `ADMIN` activo), recalculando el saldo del cliente y validando el disponible de la remisión |
| `listarAbonos` | `(filtros?: FiltrosAbonos) => Promise<ServiceResponse<AbonoCartera[]>>` | Histórico de abonos ordenado por fecha |
| `obtenerAuditoriaAbonos` | `(clienteId: string) => Record<string, AuditoriaEdicionAbono>` | Trazabilidad local complementaria de correcciones de abonos por cliente |

---

### `gastosService` y `presupuestosService`

**Archivos:** `frontend/src/services/gastosService.ts` · `frontend/src/services/presupuestosService.ts`

> 🔒 Exclusivo para usuarios con rol **ADMIN** activo.

| Función | Firma | Descripción |
|---|---|---|
| `listarGastos` | `(mesReferencia?: string) => Promise<ServiceResponse<Gasto[]>>` | Lista completa de gastos del mes (`'YYYY-MM-01'`) |
| `crearGasto` | `(input: CrearGastoInput) => Promise<ServiceResponse<Gasto>>` | Registra un gasto operacional validado con Zod |
| `actualizarGasto` | `(id: string, input: ActualizarGastoInput, original: Gasto, motivo?: string) => Promise<ServiceResponse<Gasto>>` | Edita un gasto verificando concurrencia sobre los valores previos |
| `eliminarGasto` | `(gasto: Gasto) => Promise<ServiceResponse<{ id: string }>>` | Elimina un gasto verificando concurrencia para que el total gastado y el saldo disponible del presupuesto se recalculen inmediatamente |
| `resumenFinancieroMensual` | `(mes: string) => Promise<ServiceResponse<ResumenFinancieroResult>>` | Resumen de ventas, gastos, utilidad neta y estado del presupuesto (RPC) |

---

### `inventarioService`

**Archivo:** `frontend/src/services/inventarioService.ts`

Gestiona las entradas de mercancía, ajustes de existencias y consulta paginada del historial de kardex.

| Función | Firma | Descripción |
|---|---|---|
| `registrarMovimiento` | `(input: MovimientoInventarioInput) => Promise<ServiceResponse<MovimientoInventarioRespuesta>>` | Registra una `ENTRADA` (`> 0`) o `AJUSTE` (`>= 0`, incluido `0` y conteos sin diferencia) vía RPC atómica e idempotente `registrar_movimiento_inventario` |
| `listarKardexProducto` | `(productoId: string) => Promise<ServiceResponse<Kardex[]>>` | Historial de movimientos del producto |
| `listarKardexProductoPaginado` | `(productoId: string, pagina: number, porPagina?: number) => Promise<ServiceResponse<KardexPaginado>>` | Historial paginado con conteo exacto |

---

### `documentosEmpresaService`

**Archivo:** `frontend/src/services/documentosEmpresaService.ts`

Cliente del endpoint empresarial `/functions/v1/onedrive` para la gestión documental en Microsoft OneDrive.

| Función | Firma | Descripción |
|---|---|---|
| `obtenerEstado` | `() => Promise<ServiceResponse<EstadoOneDrive>>` | Consulta el estado de la conexión Microsoft OneDrive de la empresa |
| `listar` | `(params) => Promise<ServiceResponse<ListaDocumentosRespuesta>>` | Consulta paginada con búsqueda, filtro por tipo, cliente y remisión |
| `subir` | `(input: SubirDocumentoInput) => Promise<ServiceResponse<{ documento: DocumentoListado; repetido: boolean }>>` | Sube un archivo PDF/JPG/PNG a OneDrive y registra sus metadatos (o actualiza `pdf_url` si `pdf_remision = true`) |
| `recuperar` | `(id: string) => Promise<ServiceResponse<RecuperacionSubida>>` | Recupera una subida con respuesta incierta sin duplicar el archivo |
| `descargar` | `(documentoId: string, nombreSugerido: string) => Promise<ServiceResponse<boolean>>` | Descarga autenticada del archivo a través de la Edge Function |
| `eliminar` | `(documentoId: string) => Promise<ServiceResponse<{ deleted: boolean; id: string }>>` | Elimina el archivo en Microsoft Graph y su registro en `onedrive_archivos` y `documentos` (bloqueado si es `FACTURA_DIAN` o tiene `remision_id` asociado) |
| `evaluarProteccionDocumento` | `(doc) => { protegido: boolean; motivo: string \| null }` | Determina si un documento está protegido por vínculo histórico o fiscal |

---

## Autenticación: AuthContext, useAuth y authService

**Archivos:** `frontend/src/context/AuthContext.tsx` · `frontend/src/hooks/useAuth.ts` · `frontend/src/services/authService.ts`

```ts
interface AuthContextType {
  user:    User | null;
  perfil:  Perfil | null;
  loading: boolean;
  error:   string | null;
  retry:   () => void;
  signOut: () => Promise<void>;
}
```

- **`authService.signIn(email, password)`**: Autentica al usuario en Supabase y ejecuta `reiniciarMarcasSesion()`, fijando `ariza_ultima_actividad` y `ariza_inicio_sesion` con `Date.now()`.
- **`authService.signOut()`**: Limpia de inmediato todas las claves con prefijo `ariza_` mediante `limpiarClavesSesionAriza()` y llama a `supabase.auth.signOut({ scope: 'local' })`.

---

## Seguridad de sesiones y protección de rutas

**Archivos:** `frontend/src/components/layout/RutaProtegida.tsx` · `frontend/src/config/sesion.ts` · `frontend/src/hooks/useSesionSegura.ts` · `frontend/src/components/layout/ModalSesionAviso.tsx`

La aplicación implementa una capa continua de seguridad de sesión en el frontend para evitar accesos indebidos en terminales desatendidas:

### 1. `RutaProtegida.tsx`
- Verifica autenticación activa en Supabase y estado de cuenta activo (`perfil?.activo`).
- Evalúa sincrónicamente `comprobarExpiracionSesion(user)` **antes** de renderizar pantallas protegidas:
  - Si la sesión ha vencido, limpia claves `ariza_*`, almacena el mensaje en `sessionStorage`, ejecuta `authService.signOut()` y retorna `<Navigate to="/login" state={{ mensaje: estado.mensaje }} replace />`.
  - Si la sesión está vigente, renderiza `SesionProtegida`, que activa `useSesionSegura()` y proyecta `{modalAviso}` sobre el `<Outlet />`.

### 2. `useSesionSegura.ts`
- **Control de inactividad (30 min por defecto):** detecta interacción (`mousedown`, `keydown`, `touchstart`, `scroll`, `visibilitychange`, `focus`) y actualiza `ariza_ultima_actividad` en `localStorage` con un throttle de 15 s.
- **Límite absoluto (8 h por defecto):** calculado desde `user.last_sign_in_at` (con respaldo en `ariza_inicio_sesion`).
- **Verificación dual (temporizada y reactiva):** `setInterval` periódico cada 15 s (o cada 1 s con modal abierto) y evaluación reactiva al recuperar el foco o visibilidad de la pestaña (`visibilitychange` / `focus`), comparando diferencias temporales contra `Date.now()`.
- **Sincronización multi-pestaña:** escucha el evento `storage` en `window` para propagar actividad del usuario y cierres coordinados (`ariza_logout_evento`).

### 3. `ModalSesionAviso.tsx`
- **Aviso por inactividad:** modal mostrado 1 minuto antes con cuenta regresiva en segundos y botón **«Seguir conectado»** (que restablece la ventana de actividad).
- **Aviso por límite absoluto:** modal informativo 5 minutos antes que alerta del vencimiento inapelable para permitir guardar cambios pendientes.

### 4. Variables de entorno (sobrescribibles en `.env.local` / `.env.example`):
- `VITE_SESION_INACTIVIDAD_MIN`: minutos de inactividad tolerados (default `30`).
- `VITE_SESION_MAXIMA_HORAS`: duración máxima continua en horas (default `8`).

---

## Tipos TypeScript exportados

- **`frontend/src/types/schemas.ts`**: `RolUsuario`, `Perfil`, `Producto`, `Cliente`, `PrecioCliente`, `Remision`, `DetalleRemision`, `Kardex`, `AbonoCartera`, `Gasto`, `Presupuesto`, `Documento`, `AlertaStock`, `ResumenFinancieroResult`.
- **`frontend/src/types/rpcSchemas.ts`**: `CrearRemisionInput`, `RegistrarAbonoInput`, `EditarAbonoInput`, `EditarAbonoRespuesta`, `AnularRemisionInput`, `ResumenFinancieroInput`, `MovimientoInventarioInput`, `MovimientoInventarioRespuesta`.
- **`frontend/src/config/sesion.ts`**: `MotivoExpiracion`, `EstadoExpiracion`.
- **`frontend/src/hooks/useSesionSegura.ts`**: `MotivoCierre`, `UseSesionSeguraReturn`.
- **`frontend/src/components/layout/ModalSesionAviso.tsx`**: `ModalSesionAvisoProps`.

---

## Manejo de errores

Todos los servicios retornan `{ data, error }` con mensajes en español listos para presentar en la interfaz.
