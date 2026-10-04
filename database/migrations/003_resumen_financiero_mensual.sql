-- ==========================================================================
-- Migración 003: resumen_financiero_mensual (con guard de rol ADMIN)
-- ==========================================================================
-- Crea/reemplaza la función RPC resumen_financiero_mensual.
-- Calcula ventas totales, gastos totales, ganancia neta y si se excedió
-- el presupuesto del mes indicado.
--
-- SEGURIDAD: La primera línea del cuerpo verifica que el usuario autenticado
-- tenga rol ADMIN mediante obtener_rol_actual(). Si no, lanza RAISE EXCEPTION.
-- Esto complementa las políticas RLS de la tabla gastos (solo ADMIN puede leer).
-- ==========================================================================

CREATE OR REPLACE FUNCTION resumen_financiero_mensual(p_mes DATE)
RETURNS TABLE(
  total_ventas        NUMERIC,
  total_gastos        NUMERIC,
  ganancia_neta       NUMERIC,
  presupuesto_limite  NUMERIC,
  excede_presupuesto  BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER   -- corre con los permisos del usuario que llama (respeta RLS)
AS $$
DECLARE
  v_ventas      NUMERIC := 0;
  v_gastos      NUMERIC := 0;
  v_presupuesto NUMERIC;
BEGIN
  -- Guard: solo administradores pueden consultar el resumen financiero
  IF obtener_rol_actual() <> 'ADMIN' THEN
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
  'Calcula ventas, gastos y utilidad neta del mes indicado. '
  'Restringido a rol ADMIN mediante guard obtener_rol_actual() en el cuerpo de la función.';
