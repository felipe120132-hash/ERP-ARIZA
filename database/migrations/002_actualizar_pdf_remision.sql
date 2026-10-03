-- ==========================================================================
-- Migración 002: actualizar_pdf_remision
-- ==========================================================================
-- Permite que cualquier usuario autenticado (VENDEDOR o ADMIN) actualice
-- ÚNICAMENTE la columna pdf_url de una remisión usando SECURITY DEFINER,
-- sin necesitar permiso de UPDATE general sobre la tabla remisiones
-- (que está restringido a ADMIN por la política RLS remisiones_update_admin).
--
-- Esta función es necesaria para el flujo de generación de PDF:
--   1. VENDEDOR crea remisión (vía RPC crear_remision)
--   2. App sube el PDF a OneDrive
--   3. App llama a esta RPC para guardar la URL en la fila
-- ==========================================================================

CREATE OR REPLACE FUNCTION actualizar_pdf_remision(
  p_remision_id UUID,
  p_pdf_url     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Verificar que la remisión existe (un UPDATE sin coincidencia no lanza error)
  IF NOT EXISTS (
    SELECT 1 FROM remisiones WHERE id = p_remision_id
  ) THEN
    RAISE EXCEPTION 'Remisión con id "%" no encontrada.', p_remision_id;
  END IF;

  -- 2. Actualizar SOLO la columna pdf_url — ningún otro campo es tocado
  UPDATE remisiones
     SET pdf_url = p_pdf_url
   WHERE id = p_remision_id;
END;
$$;

COMMENT ON FUNCTION actualizar_pdf_remision(UUID, TEXT) IS
  'Actualiza únicamente pdf_url de una remisión. SECURITY DEFINER permite que '
  'VENDEDORes llamen a esta función sin necesitar permisos de UPDATE general '
  'sobre la tabla remisiones (restringido a ADMIN por RLS).';
