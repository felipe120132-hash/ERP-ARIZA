-- ==========================================================================
-- ArizaERP — Esquema principal
-- ==========================================================================
-- Este archivo contiene las funciones RPC expuestas al frontend.
-- Las tablas, triggers y políticas RLS se documentan en:
--   docs/diccionario_datos.md
--   database/rls_seguridad_e_indices_ariza_erp.sql
--
-- NOTA DE SEGURIDAD (Post-Security Advisor):
--   - Todas las funciones definen search_path inmutable (SET search_path = public, pg_temp)
--     para prevenir vulnerabilidades de búsqueda de esquemas.
--   - La vista pública vista_alertas_stock usa security_invoker = true.
--   - Permisos de EXECUTE están revocados de PUBLIC y asignados exclusivamente a authenticated.
--   - Los triggers internos tienen revocación total de EXECUTE para anon y authenticated.
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
-- (Implementación en base de datos; invocar vía RPC)


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
-- (Implementación en base de datos; invocar vía RPC)


-- --------------------------------------------------------------------------
-- RPC: resumen_financiero_mensual  (Migración: 003_resumen_financiero_mensual.sql)
-- --------------------------------------------------------------------------
-- Calcula la utilidad neta del mes y si los gastos superaron el presupuesto.
-- SEGURIDAD: guard de rol en la primera línea del cuerpo — solo ADMIN puede llamarla.
--
-- Parámetros:
--   p_mes  DATE (primer día del mes, ej. '2025-10-01')
--
-- Retorna tabla:
--   total_ventas, total_gastos, ganancia_neta, presupuesto_limite, excede_presupuesto
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
SECURITY INVOKER   -- corre con los permisos del usuario que llama (respeta RLS)
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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


-- --------------------------------------------------------------------------
-- RPC: actualizar_pdf_remision  (Migración: 002_actualizar_pdf_remision.sql)
-- --------------------------------------------------------------------------
-- Actualiza ÚNICAMENTE la columna pdf_url de una remisión.
-- SECURITY DEFINER permite que VENDEDORes actualicen pdf_url sin necesitar
-- el permiso de UPDATE general sobre remisiones (restringido a ADMIN por RLS).
--
-- Parámetros:
--   p_remision_id  UUID   — ID de la remisión a actualizar
--   p_pdf_url      TEXT   — URL de descarga del PDF en OneDrive
--
-- Retorna: VOID
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION actualizar_pdf_remision(
  p_remision_id UUID,
  p_pdf_url     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

