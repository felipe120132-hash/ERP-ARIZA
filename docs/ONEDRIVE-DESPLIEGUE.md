# Entrega Documentos / OneDrive — Actualizado 20 de octubre de 2026

## Estado y alcance

Implementación completa y verificada mediante pruebas automatizadas de extremo a extremo y pruebas unitarias del backend (`node --test tests/onedrive-backend.mjs` y `npx playwright test tests/documentos.spec.ts tests/remision-acciones.spec.ts`).

Incluye:
- Conexión única de empresa por `ADMIN`, tokens cifrados en servidor con AES-GCM (`ONEDRIVE_ENCRYPTION_KEY`), OAuth2 con `state` ligado al usuario y PKCE.
- Consulta paginada, búsqueda y filtros por tipo de documento, cliente y remisión.
- Subida de PDF/JPG/PNG de hasta 5 MB, asociación a cliente/remisión y recuperación idempotente de subidas interrumpidas.
- **Guardado directo de PDF de remisión en OneDrive desde `/remisiones/:id` (`AccionesRemision.tsx`)**: genera el PDF real con el identificador y consecutivo de la remisión seleccionada, lo sube a OneDrive mediante `/functions/v1/onedrive` con `pdf_remision: true`, actualiza `remisiones.pdf_url` y muestra confirmación o error en la misma vista sin redirigir falsamente al módulo de documentos.
- **Eliminación controlada de documentos (`action: "delete"`)**: exclusiva para `ADMIN` activo con confirmación previa. Protege documentos vinculados a remisiones (`remision_id !== null`) y documentos fiscales (`tipo_documento === 'FACTURA_DIAN'`). Para documentos eliminables, borra primero el archivo en Microsoft Graph (tratando `404` como ya inexistente) y luego limpia `onedrive_archivos` y `documentos`, evitando archivos huérfanos o referencias rotas.
- **Interfaz adaptable (Escritorio, Tablet y Móvil)**: botón «Subir documento» ubicado en el encabezado principal antes del listado y tarjetas adaptables en pantallas móviles con acciones de descarga y eliminación accesibles.

## Archivos en ERP-ARIZA

- `database/migrations/006_onedrive_empresa.sql`: tablas privadas mediante permisos/RLS (`onedrive_empresa`, `onedrive_oauth`, `onedrive_archivos`), bloqueo con caducidad y transacción de registro documental.
- `supabase/functions/onedrive/index.ts`: punto de entrada empresarial (`status`, `list`, `references`, `start`, `complete`, `disconnect`, `recover`, `file`, `delete` y subida `multipart/form-data`).
- `supabase/functions/onedrive-auth/index.ts` y `onedrive-refresh/index.ts`: sustituciones que retiran los endpoints antiguos (HTTP 410). Nunca volver a desplegar las versiones que entregaban tokens al navegador.
- `frontend/`: aplicación React lista para desplegar en Vercel (`frontend/src/pages/Documentos.tsx`, `frontend/src/components/remisiones/AccionesRemision.tsx`, `frontend/src/services/documentosEmpresaService.ts`).

## Orden de despliegue

1. Revisar/aplicar las migraciones `005`, `006` y `007` en Supabase SQL Editor.
2. Configurar en Supabase Secrets `CLIENT_ID` y `CLIENT_SECRET` de la aplicación Azure existente y `ONEDRIVE_ENCRYPTION_KEY`: 32 bytes aleatorios criptográficos codificados en base64. Guardarla en el gestor de secretos del equipo. No subirla a Git ni ponerla en variables `VITE_`.
3. Verificar que `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` estén disponibles en el runtime de Edge Functions.
4. Desplegar `supabase functions deploy onedrive` y los endpoints retirados `supabase functions deploy onedrive-auth onedrive-refresh`.
5. Publicar el frontend desde Root Directory `frontend`, build `npm run build`, salida `dist`. Conservar `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_ONEDRIVE_REDIRECT_URI=https://erp-ariza.vercel.app/onedrive/callback`.
6. Iniciar sesión con `ADMIN`, ir a Documentos y conectar la cuenta Microsoft corporativa.

## Contrato de la función (`/functions/v1/onedrive`)

- `POST /functions/v1/onedrive` con JWT ERP y clave pública Supabase.
- Acciones JSON (`action`):
  - `status`: estado de conexión (`NO_CONECTADO`, `CONECTADO`, `REQUIERE_RECONEXION`, `ERROR_CONFIGURACION`).
  - `list`: listado paginado y filtrado de documentos con datos de cliente y remisión.
  - `references`: clientes y remisiones para selectores de asociación.
  - `start` / `complete` / `disconnect`: flujo OAuth2 + PKCE empresarial (solo `ADMIN`).
  - `recover`: consulta/reintento de una subida interrumpida por UUID.
  - `file`: descarga autenticada del binario desde Graph (`ADMIN` y `VENDEDOR`).
  - `delete`: eliminación en Microsoft Graph + limpieza en `onedrive_archivos` y `documentos` (solo `ADMIN`, bloqueado para `FACTURA_DIAN` o documentos con `remision_id`).
- Subida `multipart/form-data`: campos `metadata` (JSON con `id`, `nombre`, `tipo_documento`, `cliente_id`, `remision_id`, `pdf_remision`) y `file` (binario PDF/JPG/PNG hasta 5 MB).

## Verificación local ejecutada

Desde `frontend/`:
- `npm run build` (`tsc --noEmit && vite build`): 0 errores.
- `node --test tests/onedrive-backend.mjs`: **10/10 pruebas unitarias aprobadas** (incluyendo eliminación en Graph + BD, protección de remisiones y `FACTURA_DIAN`, bloqueo a `VENDEDOR` y manejo de fallo parcial de Graph).
- `npx playwright test tests/documentos.spec.ts tests/remision-acciones.spec.ts`: **17/17 pruebas E2E aprobadas**.
