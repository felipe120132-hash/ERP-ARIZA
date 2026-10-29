# ArizaERP

Sistema de gestión (ERP) para **Distribuidora y Comercializadora Ariza**.
Permite administrar clientes, productos, remisiones de venta, cartera, gastos operacionales y documentos.
→ Ver arquitectura completa y decisiones de diseño en [docs/estructura_proyecto.md](docs/estructura_proyecto.md).

---

## Instalación

### Requisitos previos
- Node.js ≥ 20 y npm ≥ 10
- Acceso al proyecto Supabase de Ariza (URL + clave pública)

### Pasos

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd ERP-ARIZA

# 2. Instalar dependencias
npm install

# 3. Crear y completar el archivo de variables de entorno
cp .env.example .env
```

Edita el `.env` recién creado con los valores reales:

| Variable | Dónde encontrarla |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → **Project Settings → Data API → Project URL** |
| `VITE_SUPABASE_ANON_KEY` | Supabase → **Project Settings → Data API → Project API keys → anon public** |
| `TEST_USER_EMAIL` | Email de un usuario real en **Supabase → Authentication → Users** (rol ADMIN recomendado) |
| `TEST_USER_PASSWORD` | Contraseña del mismo usuario |
| `VITE_SESION_INACTIVIDAD_MIN` | *(Opcional)* Minutos de inactividad antes de cerrar sesión (por defecto `30`) |
| `VITE_SESION_MAXIMA_HORAS` | *(Opcional)* Límite máximo continuo de sesión en horas (por defecto `8`) |

> **Importante:** usa siempre la clave **anon** (pública), nunca la `service_role`. La `service_role` bypasea las RLS y solo debe usarse en Edge Functions.

---

## Scripts de validación

### `npm run validar:modelo`

Conecta a Supabase con las credenciales de prueba, consulta las 11 tablas del modelo de datos y valida cada fila con los esquemas Zod.

**Salida esperada si todo está bien:**

```
✅ perfiles         — 3 filas, 0 errores de validación
✅ productos        — 45 filas, 0 errores de validación
...
✅ documentos       — 2 filas, 0 errores de validación
```

Si ves `❌` en alguna tabla, revisa los detalles de Zod impresos debajo; indican exactamente qué campo no coincide con el schema.

### `npm run probar:servicios`

Ejecuta un flujo end-to-end completo usando los servicios ya implementados:

1. Autenticación con `TEST_USER_EMAIL` / `TEST_USER_PASSWORD`
2. `listarProductos()` y `listarAlertasStock()`
3. Obtener cliente y producto reales de la BD
4. `crearRemision()` con esos IDs
5. `actualizarPdfUrl()` sobre la remisión recién creada
6. `listarRemisiones()` para confirmar que `pdf_url` quedó guardado
7. `anularRemision()` sobre la misma remisión
8. `registrarAbono()` sobre el mismo cliente

**Salida esperada:**

```
✅ Autenticado como: admin@ariza.com
✅ Se recibieron 45 producto(s)
✅ 12 alertas — 🔴 2 ROJO | 🟡 5 AMARILLO | 🟢 5 VERDE
...
✅ Remisión de prueba anulada correctamente
✅ Abono registrado — ID: <uuid>
```

---

## Estado actual

**Modelo, Controlador, Frontend (`frontend/`), Edge Functions (`supabase/functions/onedrive`) y Suite de QA Automatizada completos y validados.**

| Capa | Contenido | Estado |
|---|---|---|
| **Modelo** | 11 tablas + 2 vistas + tablas empresariales OneDrive (`onedrive_empresa`, `onedrive_oauth`, `onedrive_archivos`) — schemas Zod, tipos TypeScript, migraciones `001` a `007` | ✅ Completo y validado |
| **Controlador y RPCs** | Servicios (`productos`, `productosAdmin`, `clientes`, `clientesAdmin`, `remisiones`, `cartera`, `gastos`, `presupuestos`, `inventario`, `documentosEmpresa`) + Edge Function `onedrive` + RPCs en PostgreSQL (`crear_remision`, `registrar_abono`, `editar_abono_cartera`, `anular_remision`, `actualizar_pdf_remision`, `resumen_financiero_mensual`, `registrar_movimiento_inventario`) | ✅ Completo y validado |
| **Seguridad** | RLS activado/forzado, rol `anon` aislado con 0 permisos, `search_path` inmutable, vista con `security_invoker`, RPCs con permisos por rol (`es_admin_activo()`) y cifrado de tokens OneDrive en servidor | 🛡️ Endurecido (Security Advisor) |
| **Frontend (`frontend/`)** | Aplicación completa en React + TypeScript + Vite + Tailwind + shadcn/ui: Resumen, Catálogo/Pedidos, Remisiones (PDF/Impresión/Guardado en OneDrive), Inventario y Kardex (Entradas, Salidas y Ajustes), Administración de Productos e Imágenes, Cartera y Administración de Clientes (con edición controlada de abonos), Finanzas (Presupuestos y CRUD de Gastos), Centro Documental OneDrive y Gestión de Sesión Segura (inactividad 30 min, límite absoluto 8 h, modales de aviso preventivo y sincronización multi-pestaña) | ✅ Completo y validado |
| **QA y Pruebas Automatizadas** | **111 pruebas E2E en Playwright** (`npx playwright test`) + **10 pruebas unitarias del backend OneDrive** (`node --test tests/onedrive-backend.mjs`) cubriendo todas las observaciones de `Test ERP.xlsx` (UI/Zoom/Móvil, Remisiones OneDrive, Inventario/Kardex/Productos, Cartera/Clientes/Abonos, Finanzas/Gastos y Documentos) | ✅ 121/121 pasando |

👉 **Documentación técnica:**
- [docs/estructura_proyecto.md](docs/estructura_proyecto.md) — Arquitectura general y estructura de carpetas.
- [docs/diccionario_datos.md](docs/diccionario_datos.md) — Modelo de datos, tablas, columnas y funciones RPC.
- [docs/contrato_api_ariza_erp.md](docs/contrato_api_ariza_erp.md) — Contrato de API REST (PostgREST), RPCs y reglas de negocio.
- [docs/guia_frontend.md](docs/guia_frontend.md) — Inventario de servicios, firmas y ejemplos de uso.
- [docs/ONEDRIVE-DESPLIEGUE.md](docs/ONEDRIVE-DESPLIEGUE.md) — Contrato y guía de despliegue de la integración empresarial con Microsoft OneDrive.

---

## Despliegue de Edge Functions (OneDrive)

```bash
# Configurar secrets ANTES de desplegar
supabase secrets set CLIENT_ID=xxx CLIENT_SECRET=yyy ONEDRIVE_ENCRYPTION_KEY=zzz

# Desplegar endpoint empresarial y endpoints retirados (HTTP 410)
supabase functions deploy onedrive onedrive-auth onedrive-refresh
```

Ver instrucciones detalladas en [docs/ONEDRIVE-DESPLIEGUE.md](docs/ONEDRIVE-DESPLIEGUE.md).

## Ejecución del Frontend y Suite de Pruebas (`frontend/`)

La aplicación operativa se encuentra en [`frontend/`](frontend/README.md).

```sh
cd frontend
npm ci
# Crear .env.local a partir de .env.example con URL y clave pública de Supabase.
npm run dev

# Compilación de producción (TypeScript + Vite)
npm run build

# Ejecutar las 111 pruebas E2E de Playwright
npx playwright test

# Ejecutar las 10 pruebas unitarias del backend OneDrive
node --test tests/onedrive-backend.mjs
```

Consulta el detalle de entregas y verificaciones en [frontend/README.md](frontend/README.md) y [frontend/PENDIENTES-FRONTEND.md](frontend/PENDIENTES-FRONTEND.md).
