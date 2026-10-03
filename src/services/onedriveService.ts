/**
 * src/services/onedriveService.ts
 *
 * Servicio de integración con Microsoft OneDrive / Graph API.
 *
 * Flujo OAuth2 (Authorization Code Flow):
 *   1. Usuario llama a iniciarAutenticacionOneDrive() → es redirigido al login de Microsoft.
 *   2. Microsoft redirige de vuelta a VITE_ONEDRIVE_REDIRECT_URI con un ?code=...
 *   3. El componente captura ese código y llama al Edge Function `onedrive-auth`
 *      (a través de intercambiarCodigoPorToken) para obtener access_token y refresh_token.
 *   4. Los tokens se guardan en localStorage. subirArchivoOneDrive los usa automáticamente,
 *      renovándolos mediante el Edge Function `onedrive-refresh` si han expirado.
 *
 * Variables de entorno del FRONTEND requeridas (en .env, con prefijo VITE_):
 *   VITE_ONEDRIVE_CLIENT_ID    → App (client) ID de la app registrada en Azure AD
 *   VITE_ONEDRIVE_REDIRECT_URI → URI de redirección registrada en Azure AD (ej. http://localhost:5173/onedrive/callback)
 *   VITE_SUPABASE_URL          → URL del proyecto Supabase (ya existente)
 *
 * NOTA: CLIENT_SECRET y TENANT_ID son secrets del Edge Function, NUNCA del frontend.
 */

import { supabase } from './supabaseClient';

// ── Constantes de configuración ──────────────────────────────────────────────

const CLIENT_ID    = import.meta.env.VITE_ONEDRIVE_CLIENT_ID as string | undefined;
const REDIRECT_URI = import.meta.env.VITE_ONEDRIVE_REDIRECT_URI as string | undefined;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// Scopes necesarios: leer/escribir archivos + renovar token sin interacción del usuario
const SCOPES = 'Files.ReadWrite offline_access User.Read';

// Claves de localStorage para persistir tokens entre sesiones de la pestaña
const LS_ACCESS_TOKEN  = 'onedrive_access_token';
const LS_REFRESH_TOKEN = 'onedrive_refresh_token';
const LS_EXPIRES_AT    = 'onedrive_expires_at'; // timestamp Unix en ms

// ── Tipos internos ───────────────────────────────────────────────────────────

interface TokenSet {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
  token_type:    string;
}

interface OneDriveUploadResult {
  /** URL de descarga directa del archivo subido, lista para guardar en la BD. */
  url: string;
  /** Nombre del archivo tal como quedó en OneDrive. */
  nombre: string;
  /** Tamaño del archivo en bytes. */
  tamano: number;
}

interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

// ── Helpers de token storage ─────────────────────────────────────────────────

function guardarTokens(tokens: TokenSet): void {
  const expiresAt = Date.now() + tokens.expires_in * 1000;
  localStorage.setItem(LS_ACCESS_TOKEN,  tokens.access_token);
  localStorage.setItem(LS_REFRESH_TOKEN, tokens.refresh_token);
  localStorage.setItem(LS_EXPIRES_AT,    String(expiresAt));
}

function leerAccessToken(): string | null {
  return localStorage.getItem(LS_ACCESS_TOKEN);
}

function leerRefreshToken(): string | null {
  return localStorage.getItem(LS_REFRESH_TOKEN);
}

function tokenExpirado(): boolean {
  const expiresAt = localStorage.getItem(LS_EXPIRES_AT);
  if (!expiresAt) return true;
  // Considera expirado si faltan menos de 5 minutos
  return Date.now() > Number(expiresAt) - 5 * 60 * 1000;
}

function limpiarTokens(): void {
  localStorage.removeItem(LS_ACCESS_TOKEN);
  localStorage.removeItem(LS_REFRESH_TOKEN);
  localStorage.removeItem(LS_EXPIRES_AT);
}

// ── Llamadas a Edge Functions ─────────────────────────────────────────────────

/**
 * Llama al Edge Function `onedrive-auth` para intercambiar un authorization code
 * por un access_token y refresh_token.
 *
 * Debes llamar a esta función desde el componente que recibe el callback de Microsoft
 * (la ruta VITE_ONEDRIVE_REDIRECT_URI), extrayendo `code` de los query params.
 */
export async function intercambiarCodigoPorToken(
  code: string,
): Promise<ServiceResult<TokenSet>> {
  if (!REDIRECT_URI) {
    return {
      data: null,
      error: 'VITE_ONEDRIVE_REDIRECT_URI no está configurada en el archivo .env.',
    };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const reqHeaders = new Headers({ 'Content-Type': 'application/json' });
    if (sessionData.session?.access_token) {
      reqHeaders.set('Authorization', `Bearer ${sessionData.session.access_token}`);
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/onedrive-auth`, {
      method:  'POST',
      headers: reqHeaders,
      body:    JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
    });

    const json = await response.json();

    if (!response.ok) {
      const msg = typeof json.error === 'string'
        ? json.error
        : (json.error?.error_description ?? 'Error al intercambiar el código con Microsoft.');
      return { data: null, error: msg };
    }

    guardarTokens(json as TokenSet);
    return { data: json as TokenSet, error: null };
  } catch {
    return { data: null, error: 'Error de red al contactar el servidor de autenticación.' };
  }
}

/**
 * Renueva el access_token usando el refresh_token almacenado.
 * Microsoft rota el refresh_token en cada uso, así que el nuevo se guarda automáticamente.
 * Si el refresh_token también ha expirado (máximo 90 días), retorna error
 * y limpia los tokens para forzar un nuevo login.
 */
async function renovarToken(): Promise<ServiceResult<string>> {
  const refreshToken = leerRefreshToken();
  if (!refreshToken) {
    limpiarTokens();
    return {
      data: null,
      error: 'No hay sesión de OneDrive activa. Vuelve a iniciar la autenticación.',
    };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const reqHeaders = new Headers({ 'Content-Type': 'application/json' });
    if (sessionData.session?.access_token) {
      reqHeaders.set('Authorization', `Bearer ${sessionData.session.access_token}`);
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/onedrive-refresh`, {
      method:  'POST',
      headers: reqHeaders,
      body:    JSON.stringify({ refresh_token: refreshToken }),
    });

    const json = await response.json();

    if (!response.ok) {
      // Refresh token expirado o revocado → limpiar y forzar nuevo login
      limpiarTokens();
      const msg = typeof json.error === 'string'
        ? json.error
        : 'La sesión de OneDrive ha expirado. Vuelve a iniciar la autenticación.';
      return { data: null, error: msg };
    }

    const tokens = json as TokenSet;
    guardarTokens(tokens);
    return { data: tokens.access_token, error: null };
  } catch {
    return { data: null, error: 'Error de red al renovar la sesión de OneDrive.' };
  }
}

/**
 * Obtiene un access_token válido, renovándolo automáticamente si ha expirado.
 */
async function obtenerAccessTokenValido(): Promise<ServiceResult<string>> {
  const token = leerAccessToken();

  if (token && !tokenExpirado()) {
    return { data: token, error: null };
  }

  if (leerRefreshToken()) {
    return renovarToken();
  }

  return {
    data: null,
    error: 'No hay sesión de OneDrive activa. Llama a iniciarAutenticacionOneDrive() primero.',
  };
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Redirige al usuario a la pantalla de login de Microsoft para autorizar
 * el acceso a OneDrive.
 *
 * Requiere que VITE_ONEDRIVE_CLIENT_ID y VITE_ONEDRIVE_REDIRECT_URI
 * estén definidas en el .env del frontend.
 *
 * Después del login, Microsoft redirige a VITE_ONEDRIVE_REDIRECT_URI?code=...
 * Tu componente de callback debe capturar ese código y llamar a
 * intercambiarCodigoPorToken(code).
 */
export function iniciarAutenticacionOneDrive(): void {
  if (!CLIENT_ID) {
    throw new Error(
      '[ArizaERP] VITE_ONEDRIVE_CLIENT_ID no está configurada. ' +
      'Agrégala al .env del frontend tras registrar la app en Azure AD.',
    );
  }
  if (!REDIRECT_URI) {
    throw new Error(
      '[ArizaERP] VITE_ONEDRIVE_REDIRECT_URI no está configurada. ' +
      'Agrégala al .env del frontend y regístrala en Azure AD como redirect URI válida.',
    );
  }

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    response_type: 'code',
    redirect_uri:  REDIRECT_URI,
    scope:         SCOPES,
    // response_mode: 'query' es el default para authorization_code flow
  });

  const authUrl =
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;

  window.location.href = authUrl;
}

/**
 * Sube un archivo a OneDrive mediante Microsoft Graph API y retorna la URL
 * de descarga directa, lista para guardar en remisiones.pdf_url o
 * documentos.onedrive_url.
 *
 * @param path  Ruta dentro de OneDrive donde se guardará el archivo,
 *              relativa a la carpeta raíz del usuario.
 *              Ejemplo: "ArizaERP/Remisiones/REM-0042.pdf"
 * @param file  El objeto File o Blob a subir.
 */
export async function subirArchivoOneDrive(
  path: string,
  file: File | Blob,
): Promise<ServiceResult<OneDriveUploadResult>> {
  // 1. Obtener access_token válido (renueva automáticamente si es necesario)
  const { data: accessToken, error: tokenError } = await obtenerAccessTokenValido();
  if (tokenError || !accessToken) {
    return { data: null, error: tokenError ?? 'No se pudo obtener el token de OneDrive.' };
  }

  // 2. Subir el archivo mediante la API de upload de Graph
  //    Para archivos <= 4 MB se usa PUT simple. Para archivos más grandes habría
  //    que usar upload sessions, pero los PDFs de remisiones raramente superan ese límite.
  const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');
  const uploadUrl =
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodedPath}:/content`;

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(uploadUrl, {
      method:  'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': file instanceof File ? file.type : 'application/octet-stream',
      },
      body: file,
    });
  } catch {
    return {
      data: null,
      error: 'Error de red al subir el archivo a OneDrive. Verifica tu conexión.',
    };
  }

  const responseJson = await uploadResponse.json();

  if (!uploadResponse.ok) {
    const msg =
      responseJson?.error?.message ??
      `Error ${uploadResponse.status} al subir el archivo a OneDrive.`;
    return { data: null, error: msg };
  }

  // 3. Extraer la URL de descarga directa (@microsoft.graph.downloadUrl)
  const downloadUrl: string =
    responseJson['@microsoft.graph.downloadUrl'] ??
    responseJson.webUrl ??
    '';

  if (!downloadUrl) {
    return {
      data: null,
      error: 'Archivo subido pero no se pudo obtener la URL de descarga.',
    };
  }

  return {
    data: {
      url:    downloadUrl,
      nombre: responseJson.name as string,
      tamano: responseJson.size as number,
    },
    error: null,
  };
}

/**
 * Cierra la sesión de OneDrive eliminando los tokens del localStorage.
 * No revoca el token en Microsoft (para eso el usuario debe ir a
 * https://account.microsoft.com/privacy/app-access).
 */
export function cerrarSesionOneDrive(): void {
  limpiarTokens();
}
