-- ==========================================================================
-- Migración 009: Endurecimiento de seguridad en actualizar_pdf_remision
-- ==========================================================================
-- Exige perfil autenticado y activo, valida que la URL sea HTTPS y no exceda
-- los 2048 caracteres, verifica existencia de la remisión y fija search_path.
--
-- Idempotencia: CREATE OR REPLACE FUNCTION reemplaza la definición atómicamente.
-- Regla crítica: Conservar siempre el SET search_path TO 'public', 'pg_temp'.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.actualizar_pdf_remision(p_remision_id uuid, p_pdf_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND activo) THEN
    RAISE EXCEPTION 'No autorizado para actualizar el PDF de una remisión.';
  END IF;
  IF p_pdf_url IS NULL OR length(p_pdf_url) > 2048 OR p_pdf_url !~* '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'La URL del PDF no es válida (debe empezar por https://).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM remisiones WHERE id = p_remision_id) THEN
    RAISE EXCEPTION 'Remisión con id "%" no encontrada.', p_remision_id;
  END IF;
  UPDATE remisiones SET pdf_url = p_pdf_url WHERE id = p_remision_id;
END;
$function$;

COMMENT ON FUNCTION public.actualizar_pdf_remision(uuid, text) IS
  'Actualiza la URL de PDF de una remisión tras subirlo a OneDrive. Exige perfil activo, valida URL https con longitud máxima de 2048 caracteres y previene path hijacking.';
