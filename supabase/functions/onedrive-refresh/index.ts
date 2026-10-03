// supabase/functions/onedrive-refresh/index.ts
//
// Edge Function: Renovación de Access Token mediante Refresh Token (OAuth2).
//
// IMPORTANTE: CLIENT_ID, CLIENT_SECRET y TENANT_ID se configuran como secrets
// en el dashboard de Supabase (Settings → Edge Functions → Secrets), o con:
//   supabase secrets set CLIENT_ID=xxx CLIENT_SECRET=yyy TENANT_ID=zzz
//
// Estas variables se obtienen al registrar la aplicación en Azure AD:
//   https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps
// Nunca las escribas directamente en este archivo.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── Leer variables de entorno del Edge Function ──────────────────────────
  const clientId     = Deno.env.get('CLIENT_ID');
  const clientSecret = Deno.env.get('CLIENT_SECRET');
  const tenantId     = Deno.env.get('TENANT_ID');

  if (!clientId || !clientSecret || !tenantId) {
    return new Response(
      JSON.stringify({
        error:
          'Configuración incompleta del servidor. ' +
          'Verifica que CLIENT_ID, CLIENT_SECRET y TENANT_ID estén ' +
          'definidos como secrets del Edge Function en el dashboard de Supabase.',
      }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  }

  // ── Leer body ─────────────────────────────────────────────────────────────
  let body: { refresh_token?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido. Se esperaba JSON.' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const { refresh_token } = body;

  if (!refresh_token) {
    return new Response(
      JSON.stringify({ error: 'Se requiere el campo "refresh_token".' }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  }

  // ── Renovar el token con Microsoft Identity Platform ─────────────────────
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    grant_type:    'refresh_token',
    refresh_token,
    scope:         'Files.ReadWrite offline_access User.Read',
  });

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(tokenUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });
  } catch {
    return new Response(
      JSON.stringify({ error: 'Error de red al contactar Microsoft Identity Platform.' }),
      {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  }

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    // El refresh_token puede haber expirado (normalmente válido 90 días).
    // En ese caso el frontend debe redirigir al usuario a iniciarAutenticacionOneDrive().
    return new Response(JSON.stringify({ error: tokenData }), {
      status: tokenResponse.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // ── Devolver el nuevo par de tokens al frontend ───────────────────────────
  return new Response(
    JSON.stringify({
      access_token:  tokenData.access_token,
      refresh_token: tokenData.refresh_token,   // Microsoft rota el refresh_token en cada uso
      expires_in:    tokenData.expires_in,
      token_type:    tokenData.token_type,
    }),
    {
      status:  200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    },
  );
});
