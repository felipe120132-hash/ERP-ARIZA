-- ==========================================================================
-- Migración 004: Corrección de validaciones de rol nulo (IS DISTINCT FROM)
-- ==========================================================================
-- Corrige dos vulnerabilidades potenciales en funciones RPC de seguridad:
--
-- 1. anular_remision:
--    Agrega validación obligatoria de rol ADMIN. Anteriormente carecía de guard
--    de rol en la función (aunque RLS bloqueaba UPDATEs directos, la función RPC
--    con SECURITY DEFINER permitía ejecución a cualquier usuario autenticado).
--
-- 2. resumen_financiero_mensual:
--    Reemplaza "obtener_rol_actual() <> ''ADMIN''" por
--    "obtener_rol_actual() IS DISTINCT FROM ''ADMIN''". En SQL estándar,
--    "NULL <> ''ADMIN''" evalúa a NULL (falsy en IF), lo que permitía una
--    falla abierta si el usuario no tenía fila en perfiles.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. anular_remision (con guard ADMIN seguro ante NULL)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION anular_remision(p_remision_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_estado_actual TEXT;
BEGIN
  -- 0. Guard: solo administradores pueden anular remisiones (seguro ante NULL)
  IF obtener_rol_actual() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo los administradores pueden anular remisiones.';
  END IF;

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
  'Marca una remisión como ANULADA (solo ADMIN). Los triggers existentes se encargan de reingresar stock y revertir cartera automáticamente.';


-- --------------------------------------------------------------------------
-- 2. resumen_financiero_mensual (con guard ADMIN seguro ante NULL)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION resumen_financiero_mensual(p_mes DATE)
RETURNS TABLE(
  total_ventas        NUMERIC,
  total_gastos        NUMERIC,
  ganancia_neta       NUMERIC,
  presupuesto_limite  NUMERIC,
  excede_presupuesto  BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ventas      NUMERIC := 0;
  v_gastos      NUMERIC := 0;
  v_presupuesto NUMERIC;
BEGIN
  -- Guard: solo administradores pueden consultar el resumen financiero (seguro ante NULL)
  IF obtener_rol_actual() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'Solo los administradores pueden consultar el resumen financiero.';
  END IF;

  -- Total de ventas del mes (remisiones no anuladas)
  SELECT COALESCE(SUM(r.total), 0)
    INTO v_ventas
    FROM remisiones r
   WHERE r.fecha >= date_trunc('month', p_mes)
     AND r.fecha <  date_trunc('month', p_mes) + INTERVAL '1 month'
     AND r.estado <> 'ANULADA';

  -- Total de gastos operacionales del mes
  SELECT COALESCE(SUM(g.monto), 0)
    INTO v_gastos
    FROM gastos g
   WHERE g.mes_referencia = date_trunc('month', p_mes)::DATE;

  -- Presupuesto del mes (puede no existir)
  SELECT p.presupuesto_limite
    INTO v_presupuesto
    FROM presupuestos p
   WHERE p.mes_referencia = date_trunc('month', p_mes)::DATE
   LIMIT 1;

  RETURN QUERY SELECT
    v_ventas                                    AS total_ventas,
    v_gastos                                    AS total_gastos,
    (v_ventas - v_gastos)                       AS ganancia_neta,
    v_presupuesto                               AS presupuesto_limite,
    CASE
      WHEN v_presupuesto IS NOT NULL
       AND v_gastos > v_presupuesto THEN TRUE
      ELSE FALSE
    END                                         AS excede_presupuesto;
END;
$$;

COMMENT ON FUNCTION resumen_financiero_mensual(DATE) IS
  'Calcula ventas, gastos y utilidad neta del mes indicado (solo ADMIN). '
  'Restringido mediante guard obtener_rol_actual() IS DISTINCT FROM ''ADMIN''.';
