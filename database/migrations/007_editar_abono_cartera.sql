-- ==========================================================================
-- Migración 007: Edición Controlada de Abonos de Cartera e Integridad Financiera
-- ==========================================================================
-- Permite a administradores activos corregir un abono registrado en
-- abonos_cartera de forma atómica, validando:
--   1. Rol ADMIN activo (es_admin_activo()).
--   2. Existencia del abono y bloqueo pesimista (FOR UPDATE) de cliente y abono.
--   3. Concurrencia sobre el monto anterior del abono y el saldo del cliente.
--   4. Que el nuevo saldo del cliente (saldo_actual + monto_anterior - nuevo_monto)
--      nunca sea negativo.
--   5. Si el abono se asocia a una remisión a crédito, que la suma de abonos
--      de esa remisión no supere el total de la remisión ni se asocie a una
--      remisión ANULADA.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.editar_abono_cartera(
  p_abono_id        UUID,
  p_cliente_id      UUID,
  p_monto           NUMERIC,
  p_metodo_pago     TEXT,
  p_remision_id     UUID DEFAULT NULL,
  p_motivo          TEXT DEFAULT NULL,
  p_monto_anterior  NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_abono            RECORD;
  v_saldo_actual     NUMERIC;
  v_saldo_nuevo      NUMERIC;
  v_remision         RECORD;
  v_otros_abonos_rem NUMERIC := 0;
BEGIN
  -- 1. Guard de rol: solo administradores activos
  IF NOT es_admin_activo() THEN
    RAISE EXCEPTION 'Solo administradores activos pueden editar abonos de cartera.';
  END IF;

  -- 2. Validaciones básicas de entrada
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser mayor a cero.';
  END IF;

  IF p_metodo_pago IS NULL OR p_metodo_pago NOT IN ('EFECTIVO', 'TRANSFERENCIA', 'BANCOLOMBIA') THEN
    RAISE EXCEPTION 'Método de pago inválido.';
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'Debes indicar un motivo de corrección de al menos 5 caracteres.';
  END IF;

  -- 3. Bloquear cliente y abono en orden determinístico
  SELECT saldo_cartera
    INTO v_saldo_actual
    FROM public.clientes
   WHERE id = p_cliente_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente no encontrado.';
  END IF;

  SELECT id, cliente_id, remision_id, monto, metodo_pago
    INTO v_abono
    FROM public.abonos_cartera
   WHERE id = p_abono_id
     AND cliente_id = p_cliente_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El abono indicado no existe o no pertenece a este cliente.';
  END IF;

  IF p_monto_anterior IS NOT NULL AND v_abono.monto <> p_monto_anterior THEN
    RAISE EXCEPTION 'El abono cambió desde que lo consultaste (monto actual: %). Actualiza el historial antes de editar.', v_abono.monto;
  END IF;

  -- 4. Validar integridad del saldo del cliente (nunca negativo)
  v_saldo_nuevo := v_saldo_actual + v_abono.monto - p_monto;
  IF v_saldo_nuevo < 0 THEN
    RAISE EXCEPTION 'El nuevo monto supera el saldo adeudado por el cliente (máximo permitido: %).', (v_saldo_actual + v_abono.monto);
  END IF;

  -- 5. Validar integridad respecto a la remisión si aplica
  IF p_remision_id IS NOT NULL THEN
    SELECT id, cliente_id, tipo_pago, estado, total
      INTO v_remision
      FROM public.remisiones
     WHERE id = p_remision_id
       FOR UPDATE;

    IF NOT FOUND OR v_remision.cliente_id <> p_cliente_id THEN
      RAISE EXCEPTION 'La remisión seleccionada no pertenece a este cliente.';
    END IF;

    IF v_remision.tipo_pago <> 'CREDITO' OR v_remision.estado = 'ANULADA' THEN
      RAISE EXCEPTION 'Solo se pueden asociar abonos a remisiones a crédito no anuladas.';
    END IF;

    SELECT COALESCE(SUM(a.monto), 0)
      INTO v_otros_abonos_rem
      FROM public.abonos_cartera a
     WHERE a.remision_id = p_remision_id
       AND a.id <> p_abono_id;

    IF (v_otros_abonos_rem + p_monto) > v_remision.total THEN
      RAISE EXCEPTION 'El monto supera el saldo pendiente de la remisión (disponible: %).', (v_remision.total - v_otros_abonos_rem);
    END IF;
  END IF;

  -- 6. Actualizar el abono y el saldo del cliente
  UPDATE public.abonos_cartera
     SET monto       = p_monto,
         metodo_pago = p_metodo_pago,
         remision_id = p_remision_id
   WHERE id = p_abono_id;

  UPDATE public.clientes
     SET saldo_cartera = v_saldo_nuevo,
         en_mora       = CASE WHEN v_saldo_nuevo = 0 THEN false ELSE en_mora END,
         updated_at    = now()
   WHERE id = p_cliente_id;

  RETURN jsonb_build_object(
    'abono_id',       p_abono_id,
    'cliente_id',     p_cliente_id,
    'monto_anterior', v_abono.monto,
    'monto_nuevo',    p_monto,
    'saldo_anterior', v_saldo_actual,
    'saldo_resultante', v_saldo_nuevo,
    'motivo',         trim(p_motivo)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.editar_abono_cartera(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_abono_cartera(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, NUMERIC) TO authenticated;

COMMENT ON FUNCTION public.editar_abono_cartera(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, NUMERIC) IS
  'Corrige un abono de cartera de forma atómica y trazable (solo ADMIN activo), actualizando el saldo del cliente y validando límites por remisión.';
