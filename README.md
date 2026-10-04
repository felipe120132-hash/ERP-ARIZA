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

**Modelo y Controlador completos, validados (`npm run validar:modelo`, `npm run probar:servicios`) y endurecidos en seguridad (Supabase Security Advisor revisado). Frontend pendiente de construir.**

| Capa | Contenido | Estado |
|---|---|---|
| **Modelo** | 11 tablas + 2 vistas — schemas Zod, tipos TypeScript, validación con `npm run validar:modelo` | ✅ Completo y validado |
| **Controlador** | 7 servicios (productos, clientes, remisiones, cartera, gastos, documentos, OneDrive) + AuthContext + RutaProtegida + RPCs en Supabase (`crear_remision`, `registrar_abono`, `anular_remision`, `actualizar_pdf_remision`, `resumen_financiero_mensual`) — validado con `npm run probar:servicios` (8 pasos) | ✅ Completo y validado |
| **Seguridad** | RLS activado/forzado, rol `anon` aislado con 0 permisos, `search_path` inmutable, vista con `security_invoker`, RPCs con permisos por rol | 🛡️ Endurecido (Security Advisor) |
| **Frontend** | Páginas, componentes, interfaz de usuario | 🔲 Pendiente de construir |

👉 **Punto de partida para el equipo de Frontend:** Consulta [docs/guia_frontend.md](docs/guia_frontend.md) para ver el inventario completo de servicios, tipos, firmas, ejemplos de uso y manejo de autenticación.

---

## Despliegue de Edge Functions (OneDrive)

```bash
# Configurar secrets ANTES de desplegar
supabase secrets set CLIENT_ID=xxx CLIENT_SECRET=yyy TENANT_ID=zzz

# Desplegar
supabase functions deploy onedrive-auth onedrive-refresh
```

Ver instrucciones completas en [src/services/onedriveService.ts](src/services/onedriveService.ts).

## Frontend — primera fase

La aplicación operativa está en [`frontend/`](frontend/README.md). Conserva sus propias dependencias y configuración para no reemplazar los servicios y herramientas del backend.

```sh
cd frontend
npm ci
# Crear .env.local a partir de .env.example con URL y clave pública de Supabase.
npm run dev
```

Consulta el [listado de pendientes para la próxima fase](frontend/PENDIENTES-FRONTEND.md).
