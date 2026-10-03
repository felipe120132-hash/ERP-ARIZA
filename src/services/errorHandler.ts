export interface ServiceResponse<T> {
  data: T | null;
  error: string | null;
}

interface CustomErrorObject {
  message?: string;
  error_description?: string;
  code?: string | number;
  status?: number;
  details?: string;
  hint?: string;
}

/**
 * Procesa y traduce los errores devueltos por supabase-js (.from(), .rpc(), .auth)
 * o excepciones de red a mensajes amigables en español listos para la interfaz de usuario.
 * Siempre registra en consola el detalle completo para depuración.
 */
export function parsearErrorSupabase(error: unknown): string {
  // Registrar el error completo en consola para facilitar la depuración
  console.error('[ArizaERP Error]:', error);

  if (!error) {
    return 'Ocurrió un error desconocido.';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as CustomErrorObject;
    const code = String(err.code || '');
    const status = err.status;
    const message = err.message || err.error_description || '';

    // 1. Error de autenticación / Sesión expirada (HTTP 401 o tokens inválidos)
    if (
      status === 401 ||
      code === '401' ||
      code === 'PGRST301' ||
      message.toLowerCase().includes('jwt expired') ||
      message.toLowerCase().includes('invalid claim')
    ) {
      return 'Tu sesión ha expirado o no es válida. Por favor, inicia sesión nuevamente.';
    }

    // 2. Error de permisos / RLS bloqueada (HTTP 403 o código Postgres 42501)
    if (
      status === 403 ||
      code === '403' ||
      code === '42501' ||
      message.toLowerCase().includes('permission denied')
    ) {
      return 'No tienes permisos suficientes para realizar esta acción.';
    }

    // 3. Error de red / timeout / falla de conexión con el servidor
    if (
      code === 'ETIMEDOUT' ||
      code === 'ENOTFOUND' ||
      code === 'ECONNREFUSED' ||
      message.toLowerCase().includes('failed to fetch') ||
      message.toLowerCase().includes('networkerror') ||
      message.toLowerCase().includes('timeout') ||
      message.toLowerCase().includes('aborted')
    ) {
      return 'Error de conexión con el servidor. Por favor, verifica tu conexión a internet e intenta nuevamente.';
    }

    // 4. Errores de funciones RPC (PostgreSQL RAISE EXCEPTION / código P0001)
    // Los mensajes definidos en las funciones RPC de PostgreSQL ya están redactados en español para el usuario
    if (code === 'P0001' || code === 'raise_exception') {
      return message;
    }

    // 5. Violación de restricción de clave única (código Postgres 23505)
    if (code === '23505') {
      return 'Ya existe un registro con estos datos en el sistema.';
    }

    // 6. Violación de clave foránea (código Postgres 23503)
    if (code === '23503') {
      return 'La operación hace referencia a un registro relacionado que no existe o está bloqueado.';
    }

    // 7. Si hay un mensaje descriptivo disponible
    if (message) {
      return message;
    }
  }

  return 'Ocurrió un error inesperado al procesar la solicitud.';
}

/**
 * Alias de compatibilidad hacia atrás.
 */
export const handleApiError = parsearErrorSupabase;
