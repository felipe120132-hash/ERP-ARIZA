-- ==========================================================================
-- ArizaERP — Función RPC: anular_remision
-- ==========================================================================
-- Cambia el estado de una remisión a 'ANULADA'.
-- Los triggers existentes (trg_reingresar_stock_por_anulacion) se encargan
-- automáticamente de revertir stock y cartera al detectar el UPDATE de estado.
--
-- Uso desde el frontend:
--   const { data, error } = await supabase.rpc('anular_remision', {
--     p_remision_id: 'uuid-de-la-remision'
--   });
-- ==========================================================================

CREATE OR REPLACE FUNCTION anular_remision(p_remision_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado_actual TEXT;
BEGIN
  -- 1. Buscar la remisión y bloquear la fila para evitar condiciones de carrera
  SELECT estado INTO v_estado_actual
  FROM remisiones
  WHERE id = p_remision_id
  FOR UPDATE;

  -- 2. Validar que la remisión existe
  IF v_estado_actual IS NULL THEN
    RAISE EXCEPTION 'Remisión con id "%" no encontrada.', p_remision_id;
  END IF;

  -- 3. Validar que no esté ya anulada
  IF v_estado_actual = 'ANULADA' THEN
    RAISE EXCEPTION 'La remisión "%" ya se encuentra anulada.', p_remision_id;
  END IF;

  -- 4. Validar que el estado actual permita anulación
  IF v_estado_actual NOT IN ('PENDIENTE', 'PAGADA') THEN
    RAISE EXCEPTION 'No se puede anular una remisión con estado "%". Solo se pueden anular remisiones con estado PENDIENTE o PAGADA.', v_estado_actual;
  END IF;

  -- 5. Actualizar estado — los triggers reaccionan automáticamente a este UPDATE
  UPDATE remisiones
  SET estado = 'ANULADA'
  WHERE id = p_remision_id;
END;
$$;

COMMENT ON FUNCTION anular_remision(UUID) IS
  'Marca una remisión como ANULADA. Los triggers existentes se encargan de reingresar stock y revertir cartera automáticamente.';
