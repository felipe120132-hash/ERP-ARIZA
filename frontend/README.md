# Ariza One — Frontend (`frontend/`)

Aplicación web del ERP de **Distribuciones Ariza** en React + TypeScript + Vite, Tailwind CSS y componentes de shadcn/ui (Radix). Conserva la identidad visual minimalista en tonos azules de Distribuciones Ariza.

## Ejecutar localmente

1. `npm install`
2. Copiar `.env.example` a `.env.local` y completar únicamente la URL y clave pública de Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ONEDRIVE_REDIRECT_URI`). Opcionalmente se pueden configurar `VITE_SESION_INACTIVIDAD_MIN` (por defecto 30 min) y `VITE_SESION_MAXIMA_HORAS` (por defecto 8 h).
3. `npm run dev` — levanta el servidor de desarrollo en `http://localhost:5173`.
4. `npm run build` — verifica TypeScript (`tsc --noEmit`) y compila el bundle de producción.
5. `npx playwright test` — ejecuta la suite completa de **111 pruebas E2E**.
6. `node --test tests/onedrive-backend.mjs` — ejecuta las **10 pruebas unitarias** del backend OneDrive.

No colocar `service_role`, contraseñas de prueba ni secretos de Microsoft en variables `VITE_`. `.env.local` está excluido de Git.

---

## Módulos y funcionalidades implementadas

### 1. Interfaz, Zoom y Navegación Adaptable (`AppLayout.tsx`, `select.tsx`, `sheet.tsx`, `index.css`)
- Menús desplegables (`Select`) con posicionamiento dinámico (`popper`), `collisionPadding`, altura máxima adaptable (`max-h-[min(22rem,var(--radix-select-content-available-height))]`) y scroll interno + botones de desplazamiento para niveles de zoom de 100%, 125%, 150% y 175%.
- Barra lateral móvil (`Sheet`) con alto contraste en tonos azules (`#0d2d48`), tarjeta de perfil visible, botón explícito para contraer el menú y botón de cierre de sesión accesible en pantallas verticales y horizontales compactas.

### 2. Catálogo, Pedidos y Remisiones (`Catalogo.tsx`, `Remisiones.tsx`, `DetalleRemision.tsx`, `AccionesRemision.tsx`)
- Catálogo con búsqueda sin tildes, filtros por categoría/origen, vista de tarjetas/lista, semáforo de stock del backend e imágenes firmadas del bucket privado.
- Carrito con cliente activo buscable, estimación de subtotal sin IVA según precio especial o tarifa tienda/distribuidor, y creación transaccional mediante `crear_remision`.
- **Detalle de Remisión (`/remisiones/:id`)**:
  - **Descargar PDF** e **Imprimir** en formato A4 con identidad de marca y paginación.
  - **Guardar PDF en OneDrive**: genera el PDF real correspondiente al ID y consecutivo de la remisión activa, lo sube mediante `/functions/v1/onedrive` con `pdf_remision: true`, actualiza `remisiones.pdf_url` y muestra confirmación en la misma vista sin redirecciones engañosas. Si OneDrive no está conectado, informa claramente en pantalla y ofrece un enlace secundario opcional a `/documentos`.
  - **Anulación de remisión** para `ADMIN` con confirmación por consecutivo.

### 3. Inventario, Kardex y Administración de Productos (`Inventario.tsx`, `Kardex.tsx`, `PrepararMovimiento.tsx`, `ProductosAdmin.tsx`, `AdministrarProducto.tsx`)
- Botones directos de **+ Entrada**, **Ajustar** y **Kardex** en cada fila/tarjeta de `/inventario` para administradores, y accesos claros a **Registrar entrada** y **Realizar ajuste** en `/inventario/:id`.
- Registro atómico e idempotente de entradas y ajustes mediante `registrar_movimiento_inventario` (soportando existencias contadas en `0` y conteos de auditoría sin diferencia).
- Administración de productos (`/productos/admin`): creación con cantidad inicial opcional, edición con control de concurrencia, carga de fotos en Storage privado, filtro de activos/inactivos y **eliminación segura o desactivación lógica automática** según existan dependencias en `kardex` o `detalles_remision`.

### 4. Cartera, Administración de Clientes y Edición de Abonos (`Cartera.tsx`, `ClienteDetalle.tsx`, `AdministrarCliente.tsx`, `RegistrarAbono.tsx`, `EditarAbono.tsx`)
- Acceso directo en el encabezado de `/cartera` a **Administrar clientes** (desplazamiento al directorio con búsqueda y filtros) y **+ Nuevo cliente**.
- Botón de navegación rotulado explícitamente (**Ver detalle →** / **Ver detalle y abonos**) con `title` y `aria-label` descriptivos.
- Creación, consulta, edición, activación/desactivación rápida, gestión de precios especiales, validación contra clientes duplicados (nombre o teléfono normalizados) y **eliminación condicional o desactivación lógica** cuando existen remisiones, abonos, documentos o saldo pendiente.
- **Edición controlada de abonos (`EditarAbono.tsx` + RPC `editar_abono_cartera`)**: permite corregir importe, método de pago y remisión a crédito asociada con motivo obligatorio (mín. 5 caracteres), recalculando el saldo del cliente y el disponible por remisión sin permitir saldos negativos ni sobrepagos, y conservando trazabilidad de la corrección.

### 5. Finanzas, Presupuestos y Gastos (`Finanzas.tsx`, `gastosService.ts`, `presupuestosService.ts`)
- Resumen mensual del servidor (`resumen_financiero_mensual`), gestión de presupuesto mensual y cálculo de saldo disponible o exceso.
- Creación, **edición controlada** (con verificación de concurrencia y motivo opcional de auditoría) y **eliminación con confirmación previa** de gastos operacionales, recalculando de inmediato el total gastado, la ganancia neta y el saldo disponible del presupuesto.

### 6. Centro Documental y Microsoft OneDrive (`Documentos.tsx`, `documentosEmpresaService.ts`, `supabase/functions/onedrive/index.ts`)
- Botón **«Subir documento»** ubicado al inicio de la página en escritorio y móvil, antes de los filtros y de la lista de documentos.
- Subida de PDF/JPG/PNG hasta 5 MB con recuperación de envíos interrumpidos en IndexedDB y descarga autenticada.
- **Eliminación de documentos**: acción visible para `ADMIN` con diálogo de confirmación, eliminación real en Microsoft Graph y limpieza en `onedrive_archivos` y `documentos`, bloqueando la eliminación de documentos vinculados a remisiones (`remision_id`) o de tipo `'FACTURA_DIAN'`.

### 7. Seguridad de Sesión y Control de Inactividad (`config/sesion.ts`, `hooks/useSesionSegura.ts`, `ModalSesionAviso.tsx`, `RutaProtegida.tsx`)
- **Cierre por inactividad:** 30 minutos sin interacción del usuario (`mousedown`, `keydown`, `touchstart`, `scroll`, `visibilitychange`, `focus`) con throttle de 15 s sobre la clave `ariza_ultima_actividad` en `localStorage`.
- **Cierre absoluto:** límite de 8 horas continuas a partir de `session.user.last_sign_in_at` (con respaldo en `ariza_inicio_sesion`).
- **Comprobación periódica y reactiva:** evaluación cada 15 s (o cada 1 s durante la cuenta regresiva del modal) y al reingresar a la pestaña (`visibilitychange` y `focus`) comparando diferencias temporales contra `Date.now()`, sin depender exclusivamente de temporizadores en segundo plano.
- **Avisos modales preventivos (`ModalSesionAviso.tsx`):**
  - **Inactividad:** aviso 1 minuto antes con cuenta regresiva en segundos y botón **«Seguir conectado»** (que restablece la ventana de actividad de inmediato).
  - **Límite absoluto:** aviso informativo 5 minutos antes advirtiendo del cierre inminente para guardar cambios, sin posibilidad de extensión.
- **Sincronización multi-pestaña:** propagación inmediata de actividad y de eventos de cierre (`ariza_logout_evento`) entre pestañas abiertas mediante el evento `window.storage`.
- **Protección previa al render:** `RutaProtegida` verifica si la sesión ya venció al recargar o cargar una URL; si venció, limpia las claves `ariza_*`, invoca `authService.signOut()` y redirige de inmediato a `/login` con el mensaje correspondiente antes de renderizar cualquier pantalla protegida.
- **Variables configurables:** los tiempos por defecto pueden sobrescribirse mediante `VITE_SESION_INACTIVIDAD_MIN` (minutos) y `VITE_SESION_MAXIMA_HORAS` (horas) en `.env.local` / `.env.example`.
