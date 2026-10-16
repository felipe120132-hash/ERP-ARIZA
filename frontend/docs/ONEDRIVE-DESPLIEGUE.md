# Entrega Documentos / OneDrive — 15 de octubre de 2026

## Estado y alcance

Implementación lista para desplegar por el equipo de backend. No se aplicó esta migración a Supabase, no se desplegaron las funciones nuevas y no se autorizó una cuenta Microsoft real durante las pruebas. Las pruebas de servidor usan adaptadores HTTP simulados; no sustituyen la prueba en Supabase/Deno ni la comprobación del SQL contra el esquema desplegado.

Incluye conexión única de empresa por ADMIN, tokens cifrados en servidor, OAuth con state ligado al usuario y PKCE, consulta paginada, búsqueda y filtros, subida de PDF/JPG/PNG de hasta 5 MB, asociación a cliente/remisión, PDF principal de remisión, descarga autenticada y recuperación de subidas interrumpidas. VENDEDOR activo puede consultar/descargar; solo ADMIN activo puede conectar, desconectar y subir. No se crean enlaces públicos ni se comparten permisos en Microsoft.

## Archivos en ERP-ARIZA

- `database/migrations/006_onedrive_empresa.sql`: tablas privadas mediante permisos/RLS, bloqueo con caducidad y transacción de registro documental.
- `supabase/functions/onedrive/index.ts`: nuevo punto de entrada empresarial.
- `supabase/functions/onedrive-auth/index.ts` y `onedrive-refresh/index.ts`: sustituciones que retiran los endpoints antiguos (HTTP 410). Nunca volver a desplegar las versiones que entregaban tokens al navegador.
- `frontend/`: aplicación que debe desplegar Vercel. La copia antigua de React en `src/` de la raíz no es el frontend de esta entrega.

En el espacio de trabajo local también existe el paquete fuente en `backend/onedrive/`.

## Orden de despliegue

1. Revisar/aplicar la migración 006 después de la 005 en una base de pruebas con el esquema del ERP. En el proyecto actual las migraciones están en `database/migrations/`, no asumir que `supabase db push` las descubrirá automáticamente. Ejecutar el archivo con el procedimiento SQL del equipo.
2. Configurar en Supabase Secrets `CLIENT_ID` y `CLIENT_SECRET` de la aplicación Azure existente y una **nueva** `ONEDRIVE_ENCRYPTION_KEY`: 32 bytes aleatorios criptográficos codificados en base64. Guardarla en el gestor de secretos del equipo. No subirla a Git ni ponerla en variables `VITE_`. Si se pierde/cambia sin migrar el cifrado, no se podrán descifrar las credenciales existentes.
3. El runtime de Supabase suministra `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`; comprobar que estén disponibles en la función. La clave de servicio se utiliza únicamente en el servidor. Cada petición verifica JWT mediante `getUser` y consulta el perfil activo antes de usarla.
4. Desde la raíz del repositorio conectado al proyecto, desplegar `supabase functions deploy onedrive`. Mantener la verificación JWT del gateway habilitada y comprobar compatibilidad con las sesiones del proyecto; la función además valida el usuario por sí misma.
5. En la misma ventana de entrega desplegar los endpoints retirados: `supabase functions deploy onedrive-auth` y `supabase functions deploy onedrive-refresh`. El frontend antiguo dejará de conectar durante la transición; esto evita mantener endpoints que exponen tokens.
6. Publicar el frontend desde Root Directory `frontend`, build `npm run build`, salida `dist`. Conservar URL/clave pública Supabase y `VITE_ONEDRIVE_REDIRECT_URI=https://erp-ariza.vercel.app/onedrive/callback`. El Client ID ahora se utiliza en el servidor; el frontend ya no necesita `VITE_ONEDRIVE_CLIENT_ID`.
7. Iniciar sesión con ADMIN, ir a Documentos y conectar la cuenta Microsoft personal **de la empresa**. La autorización debe hacerla el titular. Comprobar después el flujo completo en staging antes de usar documentos reales.

Orígenes permitidos en la función: `https://erp-ariza.vercel.app` y `http://localhost:5173`. Azure debe conservar ambos retornos `/onedrive/callback` como aplicación Web para el intercambio mediante servidor con secreto y PKCE. Los dominios de preview y `127.0.0.1` no están autorizados. `npm run dev` utiliza localhost:5173 fijo. Para otros dominios modificar explícitamente la lista del servidor y Azure.

## Contrato de la función

POST `/functions/v1/onedrive` con JWT ERP y clave pública Supabase. JSON con `action` para `status`, `list`, `references`, `start`, `complete`, `disconnect`, `recover` y `file`. Subida mediante multipart con `metadata` JSON y `file` binario. `start` devuelve URL Microsoft/state; `complete` devuelve solo `{connected:true}`. Nunca devuelve access_token ni refresh_token. `file` transmite el archivo como adjunto después de comprobar acceso; no requiere que cada vendedor inicie sesión en Microsoft.

`metadata`: UUID `id`, `nombre`, `tipo_documento` (FACTURA_DIAN/COTIZACION_CHINA/LEGAL/OTRO), `cliente_id`, `remision_id` y `pdf_remision`. La remisión determina su cliente; se rechazan asociaciones contradictorias. `pdf_remision=true` actualiza el enlace principal de esa remisión dentro de la misma transacción que inserta documentos. Los registros anteriores se conservan.

Los archivos se guardan en la carpeta `ArizaERP`, con nombre UUID y extensión. El nombre descriptivo está en el ERP. Se conserva `webUrl` y el identificador del archivo, nunca `downloadUrl` temporal. La cuenta queda ligada al drive_id original: conectar otra cuenta requiere una migración explícita de documentos por el equipo, no un cambio silencioso.

## Recuperación y límites

La subida a Graph y la transacción PostgreSQL son operaciones separadas. Se reserva una solicitud por UUID/usuario y huella del contenido/metadatos. Al reintentar se utiliza la misma ruta y los mismos bytes. Si la base ya confirmó el documento, se devuelve ese registro sin subir otra copia. Un error entre Graph y PostgreSQL puede dejar un archivo pendiente: no borrar reservas ni archivos sin consultar primero sus referencias. La interfaz conserva el archivo y los metadatos en IndexedDB por usuario para consultar el resultado o reintentar tras recargar. Se eliminan del navegador tras confirmar el éxito; no se guardan tokens Microsoft allí.

Un bloqueo compartido con caducidad serializa renovación de tokens, cambios de conexión y operaciones con Graph. Si otra operación está en curso se solicita reintentar. No es una cola para cargas masivas. No incluye borrado de archivos, cambio automático de cuenta, antivirus ni migración automática de enlaces documentales anteriores. Los documentos anteriores sin correspondencia en `onedrive_archivos` necesitan que el backend registre drive/item verificados antes de descargarlos por este módulo.

## Comprobaciones antes de producción

- Aplicar SQL y confirmar que anon/authenticated no pueden leer las tres tablas privadas ni ejecutar las funciones service-only.
- ADMIN conecta; revisar que navegador, respuestas y almacenamiento local no contengan tokens Microsoft. Desactivar el usuario y comprobar rechazo.
- VENDEDOR real puede listar/descargar, pero no subir, iniciar OAuth ni desconectar.
- Subir PDF de prueba, consultar su registro, descargarlo y verificar contenido. Asociarlo a una remisión de prueba y comprobar `pdf_url` permanente.
- Reintentar el mismo UUID: un documento/archivo. Repetirlo con metadatos distintos: rechazo. Probar red interrumpida y recarga.
- Forzar expiración del access token en staging para verificar renovación y persistencia cifrada. Probar dos solicitudes simultáneas.
- Desconectar/reconectar la misma cuenta; verificar que no se borran documentos. Probar OAuth cancelado, state vencido y callback directo.

Pruebas locales desde `frontend/`: `npm run build`; `node --test tests/onedrive-backend.mjs`; `node node_modules/@playwright/test/cli.js test tests/documentos.spec.ts tests/remision-acciones.spec.ts` con Vite activo; `node node_modules/@playwright/test/cli.js test --config playwright.onedrive.config.ts`. El runner backend transpila TypeScript y prueba el handler con HTTP simulado en Node; Deno y PostgreSQL deben verificarse en staging.

Referencias: [Microsoft Graph: subida de archivos](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0), [Supabase: autenticación de Edge Functions](https://supabase.com/docs/guides/functions/auth-legacy-jwt).
