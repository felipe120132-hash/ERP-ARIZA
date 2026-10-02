// Traduce errores de Supabase/RPC a mensajes de usuario amigables
export function handleApiError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Ocurrió un error inesperado al procesar la solicitud.';
}
