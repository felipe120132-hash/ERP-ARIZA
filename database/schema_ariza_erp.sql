-- ==========================================================================
-- ArizaERP — Esquema principal
-- ==========================================================================
-- Este archivo contiene las funciones RPC expuestas al frontend.
-- Las tablas, triggers y políticas RLS se documentan en:
--   docs/diccionario_datos.md
--   database/rls_seguridad_e_indices_ariza_erp.sql
--
-- Cada cambio nuevo se versiona primero como migración en database/migrations/
-- y luego se refleja aquí para mantener el archivo como referencia consolidada.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- RPC: crear_remision
-- --------------------------------------------------------------------------
-- Resuelve precio (especial > distribuidor/tienda), calcula IVA por línea,
-- valida stock, e inserta encabezado + detalles en una transacción atómica.
--
-- Parámetros:
--   p_cliente_id   UUID
--   p_tipo_pago    TEXT  ('CONTADO' | 'CREDITO')
--   p_items        JSONB [{ producto_id, cantidad }]
--   p_aplica_iva   BOOLEAN (default TRUE)
--
-- Retorna: UUID de la remisión creada.
-- --------------------------------------------------------------------------
-- (Implementación pendiente de migrar desde Supabase Dashboard)


-- --------------------------------------------------------------------------
-- RPC: registrar_abono
-- --------------------------------------------------------------------------
-- Registra un pago a la cartera de un cliente; descuenta saldo_cartera
-- automáticamente vía trigger.
--
-- Parámetros:
--   p_cliente_id   UUID
--   p_monto        NUMERIC
--   p_metodo_pago  TEXT (default 'EFECTIVO')
--   p_remision_id  UUID (opcional)
--
-- Retorna: UUID del abono creado.
-- --------------------------------------------------------------------------
-- (Implementación pendiente de migrar desde Supabase Dashboard)


-- --------------------------------------------------------------------------
-- RPC: resumen_financiero_mensual
-- --------------------------------------------------------------------------
-- Calcula la utilidad neta del mes y si los gastos superaron el presupuesto.
--
-- Parámetros:
--   p_mes  DATE (primer día del mes)
--
-- Retorna tabla:
--   total_ventas, total_gastos, ganancia_neta, presupuesto_limite, excede_presupuesto
-- --------------------------------------------------------------------------
-- (Implementación pendiente de migrar desde Supabase Dashboard)


-- --------------------------------------------------------------------------
-- RPC: anular_remision  (Migración: 001_anular_remision.sql)
-- --------------------------------------------------------------------------
-- Marca una remisión como ANULADA. Los triggers existentes
-- (trg_reingresar_stock_por_anulacion) se encargan de reingresar stock y
-- revertir cartera automáticamente al detectar el UPDATE de estado.
--
-- Parámetros:
--   p_remision_id  UUID
--
-- Retorna: VOID
-- --------------------------------------------------------------------------

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
