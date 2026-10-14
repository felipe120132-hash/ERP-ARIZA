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
-- Función de seguridad interna: es_admin_activo  (Migración: 005_entradas_y_ajustes_inventario.sql)
-- --------------------------------------------------------------------------
-- Retorna true solo si el usuario autenticado tiene perfil con rol 'ADMIN' y activo = true.
-- No accesible directamente por API (REVOKE de PUBLIC, anon y authenticated).
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION es_admin_activo()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles
    WHERE id = auth.uid()
      AND rol = 'ADMIN'
      AND activo = true
  );
$$;

REVOKE EXECUTE ON FUNCTION es_admin_activo() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION es_admin_activo() IS
  'Retorna true únicamente si el usuario autenticado tiene perfil con rol ADMIN y activo = true. Nunca NULL. Solo invocable internamente desde funciones SECURITY DEFINER.';


-- --------------------------------------------------------------------------
-- RPC: resumen_financiero_mensual  (Migración: 003_resumen_financiero_mensual.sql / 005_entradas_y_ajustes_inventario.sql)
-- --------------------------------------------------------------------------
-- Calcula la utilidad neta del mes y si los gastos superaron el presupuesto.
-- SEGURIDAD: guard de rol es_admin_activo() en la primera línea del cuerpo.
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
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ventas      NUMERIC := 0;
  v_gastos      NUMERIC := 0;
  v_presupuesto NUMERIC;
BEGIN
  -- Guard: solo administradores activos pueden consultar el resumen financiero
  IF NOT es_admin_activo() THEN
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
  'Restringido a rol ADMIN activo mediante guard es_admin_activo() en el cuerpo de la función.';


-- --------------------------------------------------------------------------
-- RPC: anular_remision  (Migración: 001_anular_remision.sql / 005_entradas_y_ajustes_inventario.sql)
-- --------------------------------------------------------------------------
-- Marca una remisión como ANULADA. Los triggers existentes
-- (trg_reingresar_stock_por_anulacion) se encargan de reingresar stock y
-- revertir cartera automáticamente al detectar el UPDATE de estado.
-- Solo accesible por administradores activos.
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
  -- 0. Guard: solo administradores activos pueden anular remisiones
  IF NOT es_admin_activo() THEN
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
  'Marca una remisión como ANULADA (solo ADMIN activo). Los triggers existentes se encargan de reingresar stock y revertir cartera automáticamente.';


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


-- --------------------------------------------------------------------------
-- RPC: registrar_movimiento_inventario (Migración: 005_entradas_y_ajustes_inventario.sql)
-- --------------------------------------------------------------------------
-- Registra entradas de mercancía y ajustes de inventario de forma atómica e idempotente.
-- Exclusivo para administradores activos (guard es_admin_activo()).
--
-- Parámetros:
--   p_producto_id     UUID     — ID del producto afectado
--   p_tipo            TEXT     — 'ENTRADA' | 'AJUSTE'
--   p_cantidad        NUMERIC  — ENTRADA: unidades a sumar (> 0); AJUSTE: existencia contada (>= 0)
--   p_motivo          TEXT     — Justificación del movimiento (mínimo 5 caracteres)
--   p_idempotency_key UUID     — Clave única de la operación para prevenir duplicidad
--   p_stock_esperado  NUMERIC  — Obligatorio en AJUSTE para validar concurrencia
--
-- Retorna: JSONB { kardex_id, producto_id, tipo_movimiento, cantidad, stock_anterior, stock_resultante, repetido }
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION registrar_movimiento_inventario(
  p_producto_id     UUID,
  p_tipo            TEXT,
  p_cantidad        NUMERIC,
  p_motivo          TEXT,
  p_idempotency_key UUID,
  p_stock_esperado  NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stock_actual     NUMERIC;
  v_activo           BOOLEAN;
  v_kardex_id        UUID;
  v_diferencia       NUMERIC;
  v_cantidad_kardex  NUMERIC;
  v_stock_anterior   NUMERIC;
  v_stock_nuevo      NUMERIC;
  v_kardex_existente RECORD;
BEGIN
  -- 1. Guard de rol: solo administradores activos
  IF NOT es_admin_activo() THEN
    RAISE EXCEPTION 'Solo administradores activos pueden registrar movimientos de inventario.';
  END IF;

  -- 2. Validaciones de entrada
  IF p_tipo IS NULL OR p_tipo NOT IN ('ENTRADA', 'AJUSTE') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido. Debe ser ENTRADA o AJUSTE.';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'La clave de idempotencia es obligatoria.';
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 5 caracteres.';
  END IF;

  IF p_tipo = 'ENTRADA' THEN
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
      RAISE EXCEPTION 'La cantidad para una ENTRADA debe ser mayor a cero.';
    END IF;
  ELSIF p_tipo = 'AJUSTE' THEN
    IF p_cantidad IS NULL OR p_cantidad < 0 THEN
      RAISE EXCEPTION 'La cantidad física contada para un AJUSTE no puede ser negativa.';
    END IF;
    IF p_stock_esperado IS NULL THEN
      RAISE EXCEPTION 'El stock esperado es obligatorio para un AJUSTE.';
    END IF;
  END IF;

  -- 3. Bloqueo pesimista y obtención del producto
  SELECT stock_actual, activo
    INTO v_stock_actual, v_activo
    FROM productos
   WHERE id = p_producto_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto con id "%" no encontrado.', p_producto_id;
  END IF;

  -- 4. Idempotencia DESPUÉS del bloqueo de fila
  SELECT id, producto_id, tipo_movimiento, cantidad, stock_resultante
    INTO v_kardex_existente
    FROM kardex
   WHERE idempotency_key = p_idempotency_key;

  IF v_kardex_existente.id IS NOT NULL THEN
    IF v_kardex_existente.producto_id = p_producto_id AND v_kardex_existente.tipo_movimiento = p_tipo THEN
      RETURN jsonb_build_object(
        'kardex_id',        v_kardex_existente.id,
        'producto_id',     v_kardex_existente.producto_id,
        'tipo_movimiento', v_kardex_existente.tipo_movimiento,
        'cantidad',        v_kardex_existente.cantidad,
        'stock_anterior',  v_kardex_existente.stock_resultante - v_kardex_existente.cantidad,
        'stock_resultante', v_kardex_existente.stock_resultante,
        'repetido',        true
      );
    ELSE
      RAISE EXCEPTION 'La clave de idempotencia ya fue usada en otro movimiento.';
    END IF;
  END IF;

  -- 5. Reglas de negocio según tipo de movimiento
  v_stock_anterior := v_stock_actual;

  IF p_tipo = 'ENTRADA' THEN
    IF NOT v_activo THEN
      RAISE EXCEPTION 'No se puede registrar una entrada para un producto inactivo.';
    END IF;

    v_cantidad_kardex := p_cantidad;
    v_stock_nuevo     := v_stock_actual + p_cantidad;

  ELSIF p_tipo = 'AJUSTE' THEN
    IF p_stock_esperado <> v_stock_actual THEN
      RAISE EXCEPTION 'El stock cambió desde que lo consultaste (ahora: %). Recuenta y vuelve a enviar.', v_stock_actual;
    END IF;

    v_diferencia := p_cantidad - v_stock_actual;
    IF v_diferencia = 0 THEN
      RAISE EXCEPTION 'La existencia contada coincide con el sistema; no hay nada que ajustar.';
    END IF;

    v_cantidad_kardex := v_diferencia;
    v_stock_nuevo     := p_cantidad;
  END IF;

  -- 6. Actualizar existencias en productos e insertar registro en kardex
  UPDATE productos
     SET stock_actual = v_stock_nuevo,
         updated_at   = now()
   WHERE id = p_producto_id;

  BEGIN
    INSERT INTO kardex (
      producto_id,
      remision_id,
      tipo_movimiento,
      cantidad,
      stock_resultante,
      observacion,
      registrado_por,
      idempotency_key
    ) VALUES (
      p_producto_id,
      NULL,
      p_tipo,
      v_cantidad_kardex,
      v_stock_nuevo,
      trim(p_motivo),
      auth.uid(),
      p_idempotency_key
    )
    RETURNING id INTO v_kardex_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'La clave de idempotencia ya fue usada en otro movimiento.';
  END;

  -- 7. Retorno consolidado
  RETURN jsonb_build_object(
    'kardex_id',        v_kardex_id,
    'producto_id',     p_producto_id,
    'tipo_movimiento', p_tipo,
    'cantidad',        v_cantidad_kardex,
    'stock_anterior',  v_stock_anterior,
    'stock_resultante', v_stock_nuevo,
    'repetido',        false
  );
END;
$$;

COMMENT ON FUNCTION registrar_movimiento_inventario(UUID, TEXT, NUMERIC, TEXT, UUID, NUMERIC) IS
  'Registra entradas y ajustes de inventario de forma atómica e idempotente. Exclusivo para administradores activos.';

