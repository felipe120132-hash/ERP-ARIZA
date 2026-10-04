# Guía de Frontend — ArizaERP

> Inventario de todo lo que ya existe en `src/` para que el equipo de frontend
> pueda arrancar sin tener que leer el código fuente.
>
> Documentado a partir del código real en `src/services/`, `src/context/`,
> `src/hooks/` y `src/types/`. No hay nada inventado aquí.

---

## Índice

1. [Regla de oro](#regla-de-oro)
2. [Tipo compartido: `ServiceResponse<T>`](#tipo-compartido-serviceresponset)
3. [Servicios disponibles](#servicios-disponibles)
   - [productosService](#productoservice)
   - [clientesService](#clientesservice)
   - [remisionesService](#remisionesservice)
   - [carteraService](#carteraservice)
   - [gastosService](#gastosservice)
   - [documentosService](#documentosservice)
   - [onedriveService](#onedriveservice)
4. [Autenticación: AuthContext y useAuth](#autenticación-authcontext-y-useauth)
5. [Protección de rutas: RutaProtegida](#protección-de-rutas-rutaprotegida)
6. [Tipos TypeScript exportados](#tipos-typescript-exportados)
7. [Manejo de errores](#manejo-de-errores)

---

## Regla de oro

> ⚠️ **Nunca importes `supabaseClient` directamente desde una pantalla o componente.**
> Todo acceso a datos pasa por los archivos de `src/services/`.
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
> 🔒 **Autenticación requerida:** Todas las funciones RPC y consultas de datos requieren sesión activa (`authenticated`) — ninguna es accesible sin login, confirmado contra Security Advisor.

---

## Tipo compartido: `ServiceResponse<T>`

Todas las funciones de todos los servicios retornan este tipo:

```ts
interface ServiceResponse<T> {
  data: T | null;
  error: string | null;  // mensaje en español listo para mostrar al usuario
}
```

Patrón de uso estándar en un componente:

```tsx
const { data, error } = await productosService.listarProductos();
if (error) {
  setMensajeError(error); // ya está en español
  return;
}
// data es Producto[] aquí, TypeScript lo sabe
```

---

## Servicios disponibles

### `productosService`

**Archivo:** `src/services/productosService.ts`

| Función | Firma | Retorno | Ejemplo |
|---|---|---|---|
| `listarProductos` | `() => Promise<ServiceResponse<Producto[]>>` | Todos los productos ordenados por nombre | `const { data } = await productosService.listarProductos()` |
| `listarAlertasStock` | `(semaforo?: 'ROJO' \| 'AMARILLO' \| 'VERDE') => Promise<ServiceResponse<AlertaStock[]>>` | Alertas de la vista `vista_alertas_stock`, filtrable por semáforo | `const { data } = await productosService.listarAlertasStock('ROJO')` |
| `obtenerProductoPorId` | `(id: string) => Promise<ServiceResponse<Producto>>` | Un producto por UUID | `const { data } = await productosService.obtenerProductoPorId(id)` |

---

### `clientesService`

**Archivo:** `src/services/clientesService.ts`

| Función | Firma | Retorno | Ejemplo |
|---|---|---|---|
| `listarClientes` | `() => Promise<ServiceResponse<Cliente[]>>` | Todos los clientes ordenados por nombre | `const { data } = await clientesService.listarClientes()` |
| `listarClientesEnMora` | `() => Promise<ServiceResponse<Cliente[]>>` | Solo clientes con `en_mora = true` | `const { data } = await clientesService.listarClientesEnMora()` |
| `obtenerClientePorId` | `(id: string) => Promise<ServiceResponse<Cliente>>` | Un cliente por UUID | `const { data } = await clientesService.obtenerClientePorId(id)` |

---

### `remisionesService`

**Archivo:** `src/services/remisionesService.ts`

El tipo `FiltrosRemisiones` permite filtrar por:

```ts
interface FiltrosRemisiones {
  cliente_id?: string;
  estado?: 'PENDIENTE' | 'PAGADA' | 'ANULADA';
  tipo_pago?: 'CONTADO' | 'CREDITO';
}
```

| Función | Firma | Retorno | Ejemplo |
|---|---|---|---|
| `crearRemision` | `(input: CrearRemisionInput) => Promise<ServiceResponse<string>>` | UUID de la remisión creada. Valida input con Zod antes de llamar la RPC. | `const { data: id } = await remisionesService.crearRemision({ p_cliente_id, p_tipo_pago: 'CONTADO', p_items: [...], p_aplica_iva: true })` |
| `anularRemision` | `(remisionId: string) => Promise<ServiceResponse<boolean>>` | `true` si se anuló correctamente | `const { error } = await remisionesService.anularRemision(remisionId)` |
| `listarRemisiones` | `(filtros?: FiltrosRemisiones) => Promise<ServiceResponse<Remision[]>>` | Remisiones ordenadas por fecha descendente | `const { data } = await remisionesService.listarRemisiones({ estado: 'PENDIENTE' })` |
| `obtenerRemisionPorId` | `(id: string) => Promise<ServiceResponse<Remision>>` | Una remisión por UUID | `const { data } = await remisionesService.obtenerRemisionPorId(id)` |
| `obtenerDetallesRemision` | `(remisionId: string) => Promise<ServiceResponse<DetalleRemision[]>>` | Líneas/ítems de una remisión | `const { data } = await remisionesService.obtenerDetallesRemision(remisionId)` |
| `actualizarPdfUrl` | `(remisionId: string, url: string) => Promise<ServiceResponse<boolean>>` | `true` si se actualizó correctamente. Usa RPC `actualizar_pdf_remision` (SECURITY DEFINER) accesible para VENDEDOR y ADMIN. | `const { error } = await remisionesService.actualizarPdfUrl(remisionId, data.url)` |

**Input para `crearRemision`** (validado con `CrearRemisionInputSchema`):

```ts
interface CrearRemisionInput {
  p_cliente_id: string;           // UUID del cliente
  p_tipo_pago: 'CONTADO' | 'CREDITO';
  p_items: Array<{
    producto_id: string;          // UUID del producto
    cantidad: number;             // > 0
  }>;
  p_aplica_iva: boolean;          // default: true
}
```

---

### `carteraService`

**Archivo:** `src/services/carteraService.ts`

| Función | Firma | Retorno | Ejemplo |
|---|---|---|---|
| `registrarAbono` | `(input: RegistrarAbonoInput) => Promise<ServiceResponse<string>>` | UUID del abono creado | `const { data: id } = await carteraService.registrarAbono({ p_cliente_id, p_monto: 50000, p_metodo_pago: 'EFECTIVO' })` |
| `listarAbonos` | `(filtros?: FiltrosAbonos) => Promise<ServiceResponse<AbonoCartera[]>>` | Histórico de abonos ordenado por fecha | `const { data } = await carteraService.listarAbonos({ cliente_id })` |

**Input para `registrarAbono`**:

```ts
interface RegistrarAbonoInput {
  p_cliente_id: string;
  p_monto: number;                              // > 0
  p_metodo_pago?: 'EFECTIVO' | 'TRANSFERENCIA' | 'BANCOLOMBIA';  // default: 'EFECTIVO'
  p_remision_id?: string | null;                // UUID de remisión específica, opcional
}
```

---

### `gastosService`

**Archivo:** `src/services/gastosService.ts`

> 🔒 `listarGastos`, `crearGasto` y `resumenFinancieroMensual` solo son accesibles para usuarios con rol **ADMIN** (restringido por RLS en la BD).

| Función | Firma | Retorno | Ejemplo |
|---|---|---|---|
| `listarGastos` | `(mesReferencia?: string) => Promise<ServiceResponse<Gasto[]>>` | Lista de gastos, filtrable por mes (`'YYYY-MM-01'`) | `const { data } = await gastosService.listarGastos('2025-10-01')` |
| `crearGasto` | `(input: CrearGastoInput) => Promise<ServiceResponse<Gasto>>` | El gasto creado, validado con Zod | `const { data } = await gastosService.crearGasto({ concepto, categoria, monto, mes_referencia, recurrente, registrado_por })` |
| `resumenFinancieroMensual` | `(mes: string) => Promise<ServiceResponse<ResumenFinancieroResult>>` | Resumen de ventas, gastos y utilidad del mes (RPC) | `const { data } = await gastosService.resumenFinancieroMensual('2025-10-01')` |

**Resultado de `resumenFinancieroMensual`:**

```ts
interface ResumenFinancieroResult {
  total_ventas: number;
  total_gastos: number;
  ganancia_neta: number;
  presupuesto_limite: number | null;
  excede_presupuesto: boolean;
}
```

**`CrearGastoInput`** (exportado desde `gastosService.ts`): todos los campos de `Gasto` excepto `id` y `created_at`.

---

### `documentosService`

**Archivo:** `src/services/documentosService.ts`

```ts
interface FiltrosDocumentos {
  cliente_id?: string;
  remision_id?: string;
  tipo_documento?: 'FACTURA_DIAN' | 'COTIZACION_CHINA' | 'LEGAL' | 'OTRO';
}
```

| Función | Firma | Retorno | Ejemplo |
|---|---|---|---|
| `listarDocumentos` | `(filtros?: FiltrosDocumentos) => Promise<ServiceResponse<Documento[]>>` | Documentos ordenados por fecha descendente | `const { data } = await documentosService.listarDocumentos({ tipo_documento: 'FACTURA_DIAN' })` |
| `obtenerDocumentoPorId` | `(id: string) => Promise<ServiceResponse<Documento>>` | Un documento por UUID | `const { data } = await documentosService.obtenerDocumentoPorId(id)` |

---

### `onedriveService`

**Archivo:** `src/services/onedriveService.ts`

Integración con Microsoft OneDrive vía Graph API. Requiere que `VITE_ONEDRIVE_CLIENT_ID` y `VITE_ONEDRIVE_REDIRECT_URI` estén en el `.env`.

| Función exportada | Firma | Descripción |
|---|---|---|
| `iniciarAutenticacionOneDrive` | `() => void` | Redirige al login de Microsoft (OAuth2). Llamar desde un botón "Conectar OneDrive". |
| `intercambiarCodigoPorToken` | `(code: string) => Promise<ServiceResult<TokenSet>>` | Llama al Edge Function `onedrive-auth`. Usar en el componente del callback (`/onedrive/callback`). |
| `subirArchivoOneDrive` | `(path: string, file: File \| Blob) => Promise<ServiceResult<{ url, nombre, tamano }>>` | Sube un archivo y retorna la URL de descarga para guardar en BD. |
| `cerrarSesionOneDrive` | `() => void` | Limpia los tokens de `localStorage`. |

**Flujo de uso típico:**

```tsx
// 1. Botón en cualquier página
<button onClick={iniciarAutenticacionOneDrive}>Conectar OneDrive</button>

// 2. Componente en la ruta /onedrive/callback
const code = new URLSearchParams(location.search).get('code')!;
const { error } = await intercambiarCodigoPorToken(code);

// 3. Al generar un PDF de remisión
const { data } = await subirArchivoOneDrive(`ArizaERP/Remisiones/${nombre}.pdf`, blob);
if (data) {
  // Guarda la URL en la BD — accesible para VENDEDOR y ADMIN vía RPC SECURITY DEFINER
  const { error: pdfError } = await remisionesService.actualizarPdfUrl(remisionId, data.url);
  if (pdfError) toast.error(pdfError);
}
```

> Los tokens se gestionan automáticamente en `localStorage`. `subirArchivoOneDrive` los renueva sin intervención del usuario si han expirado.

---

## Autenticación: AuthContext y useAuth

**Archivos:** `src/context/AuthContext.tsx` · `src/hooks/useAuth.ts`

### Setup en `main.tsx` / `App.tsx`

```tsx
import { AuthProvider } from './context/AuthContext';

<AuthProvider>
  <App />
</AuthProvider>
```

### Lo que expone el contexto

```ts
interface AuthContextType {
  user:    User | null;     // objeto User de Supabase (@supabase/supabase-js)
  perfil:  Perfil | null;   // fila de la tabla perfiles (nombre_completo, rol, activo…)
  rol:     RolUsuario | null; // 'ADMIN' | 'VENDEDOR' | null
  loading: boolean;         // true mientras carga la sesión inicial

  signIn:  (email: string, password: string) => Promise<{ data: User | null; error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
}
```

### Uso en componentes

```tsx
import { useAuth } from '../hooks/useAuth';

function MiComponente() {
  const { user, perfil, rol, loading, signIn, signOut } = useAuth();

  if (loading) return <Spinner />;
  if (!user)   return <Navigate to="/login" />;

  return <p>Hola, {perfil?.nombre_completo} ({rol})</p>;
}
```

> `useAuth()` lanza un error si se usa fuera de `<AuthProvider>`.

### Ejemplo: pantalla de login

```tsx
const { signIn } = useAuth();

const handleSubmit = async (email: string, password: string) => {
  const { error } = await signIn(email, password);
  if (error) setMensajeError(error); // ya en español
  else navigate('/dashboard');
};
```

---

## Protección de rutas: RutaProtegida

**Archivo:** `src/components/layout/RutaProtegida.tsx`

```ts
interface RutaProtegidaProps {
  children?: React.ReactNode;
  rolesPermitidos?: RolUsuario[];           // si omite, solo valida sesión activa
  redireccionSinPermiso?: string;           // default: '/dashboard'
}
```

**Comportamiento:**

| Condición | Acción |
|---|---|
| Cargando sesión | Muestra `"Cargando sesión y permisos..."` |
| Sin sesión | Redirige a `/login`, guarda la ruta previa en `location.state.from` |
| Sesión activa, sin `rolesPermitidos` | Renderiza el contenido |
| Sesión activa, rol no incluido en `rolesPermitidos` | Redirige a `redireccionSinPermiso` |

**Uso con `<Route>` de React Router v6:**

```tsx
// Protege por sesión (todos los usuarios autenticados)
<Route element={<RutaProtegida />}>
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/clientes"  element={<Clientes />} />
</Route>

// Protege por rol (solo ADMIN)
<Route element={<RutaProtegida rolesPermitidos={['ADMIN']} />}>
  <Route path="/gastos"       element={<Gastos />} />
  <Route path="/presupuestos" element={<Presupuestos />} />
</Route>
```

**Con `children` en lugar de `<Outlet />`:**

```tsx
<RutaProtegida rolesPermitidos={['ADMIN']}>
  <BotonEliminar />
</RutaProtegida>
```

---

## Tipos TypeScript exportados

**Archivo:** `src/types/schemas.ts`

| Tipo | Descripción |
|---|---|
| `RolUsuario` | `'ADMIN' \| 'VENDEDOR'` |
| `Perfil` | Fila de la tabla `perfiles` |
| `Producto` | Fila de la tabla `productos` (incluye `tasa_iva: 0 \| 5 \| 19`) |
| `Cliente` | Fila de la tabla `clientes` |
| `PrecioCliente` | Precio especial de un cliente para un producto |
| `Remision` | Fila de la tabla `remisiones` |
| `DetalleRemision` | Línea de ítem de una remisión |
| `Kardex` | Movimiento de inventario |
| `AbonoCartera` | Abono a cuenta de un cliente |
| `Gasto` | Gasto operacional |
| `Presupuesto` | Presupuesto mensual |
| `Documento` | Documento almacenado en OneDrive |
| `AlertaStock` | Fila de la vista `vista_alertas_stock` |
| `ResumenFinancieroResult` | Resultado de la RPC `resumen_financiero_mensual` |

**Archivo:** `src/types/rpcSchemas.ts` — tipos de entrada para las RPCs

| Tipo | Función destino |
|---|---|
| `CrearRemisionInput` | `remisionesService.crearRemision()` |
| `RemisionItem` | Ítem dentro de `CrearRemisionInput.p_items` |
| `RegistrarAbonoInput` | `carteraService.registrarAbono()` |
| `AnularRemisionInput` | (usado internamente por `anularRemision`) |
| `ResumenFinancieroInput` | (usado internamente por `resumenFinancieroMensual`) |

---

## Manejo de errores

Todos los errores ya llegan en español y listos para mostrar al usuario.
No necesitas traducir ni transformar los mensajes.

```tsx
const { data, error } = await remisionesService.crearRemision(input);

if (error) {
  // error ya es un string en español, ej:
  // "Stock insuficiente para el producto XYZ"
  // "No tienes permisos suficientes para realizar esta acción."
  // "Error de conexión con el servidor."
  toast.error(error);
  return;
}
```

El detalle técnico completo siempre se imprime en `console.error('[ArizaERP Error]:', ...)` para debugging, sin exponerlo al usuario.
