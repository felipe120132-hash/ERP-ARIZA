# Conexión OneDrive

Implementado localmente: `/documentos` inicia autorización y `/onedrive/callback` recibe el retorno. Valida `state` aleatorio, usuario ERP, antigüedad máxima de diez minutos y URI; consume la solicitud antes de intercambiar el código una sola vez. Retira los parámetros de la barra de direcciones. La sesión Microsoft se guarda en sessionStorage por usuario y se elimina al desconectar o cerrar sesión ERP; no se revocan permisos en Microsoft.

## Configuración pendiente

El usuario confirmó que aún no dispone de los valores públicos. Solicitar al responsable de Azure:

- `VITE_ONEDRIVE_CLIENT_ID`: identificador de la aplicación registrada, correspondiente al CLIENT_ID de las Edge Functions.
- `VITE_ONEDRIVE_REDIRECT_URI`: URL HTTPS del frontend seguida de `/onedrive/callback`, registrada exactamente en Azure. Para desarrollo puede ser `http://127.0.0.1:5173/onedrive/callback`; localhost y 127.0.0.1 son orígenes distintos.

Añadirlos en `.env.local` y en las variables del proyecto Vercel para el entorno correspondiente. Reiniciar Vite o reconstruir/desplegar después: las variables VITE se incorporan al build. No colocar CLIENT_SECRET en el frontend.

Se conserva el contrato del backend existente: POST autenticado a `onedrive-auth`, cuerpo `{code, redirect_uri}`; devuelve `access_token`, `refresh_token`, `expires_in`, `token_type`. `onedrive-refresh` recibe `{refresh_token}`. Los secretos CLIENT_ID, CLIENT_SECRET y TENANT_ID quedan en Supabase. Confirmar despliegue, permisos Microsoft y configuración de la plataforma de redirección para este intercambio mediante servidor con secreto. El backend actual no recibe `code_verifier`; no se implementó un flujo SPA con PKCE incompatible con ese contrato.

`vercel.json` debe quedar en la raíz del frontend desplegado (carpeta `frontend/` del repositorio de publicación). Incluye fallback de SPA para que abrir directamente `/onedrive/callback` cargue React. Usar el dominio estable donde se inició el proceso, no otro dominio de preview.

## Verificación

Pruebas aisladas: `node node_modules/@playwright/test/cli.js test --config playwright.onedrive.config.ts`. Inician Vite en 5174 con valores públicos ficticios e interceptan Supabase/Microsoft. No autorizan una cuenta Microsoft real ni suben documentos.

Después de configurar y publicar, comprobar con una cuenta autorizada: conectar desde Documentos, conceder permiso, volver al callback y confirmar éxito; probar cancelación y desconexión. La subida, listado y asociación de documentos/remisiones siguen pendientes. El estado conectado indica autorización guardada, no una comprobación permanente de disponibilidad de Microsoft.

Referencias: [flujo de autorización Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite).
