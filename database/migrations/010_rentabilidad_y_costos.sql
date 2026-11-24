-- ==========================================================================
-- Migración 010: Módulo de Rentabilidad y Costos de Llegada
-- ==========================================================================
-- Incorpora el control confidencial de precios de llegada (costos de compra)
-- y el cálculo exacto de ganancias por producto y por venta (remisión):
--   1. Tabla costos_producto: precio de llegada vigente por SKU (solo ADMIN).
--   2. Tabla costos_detalle_remision: congela el costo unitario y total de
--      cada línea vendida al momento de crear una remisión (solo lectura ADMIN).
--   3. Trigger trg_congelar_costo_por_remision: captura automáticamente el
--      costo vigente en cada inserción sobre detalles_remision sin exponer
--      costos al rol VENDEDOR.
--   4. Función RPC guardar_costo_producto(): alta/edición atómica del precio
--      de llegada validando rol ADMIN activo (es_admin_activo()).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. Tabla: costos_producto (costo actual de llegada por producto)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.costos_producto (
  producto_id     UUID PRIMARY KEY REFERENCES public.productos(id) ON DELETE CASCADE,
  costo_llegada   NUMERIC(12,2) NOT NULL CHECK (costo_llegada >= 0),
  actualizado_por UUID REFERENCES public.perfiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.costos_producto IS
  'Precio de llegada (costo unitario de compra) vigente por producto. Información financiera sensible restringida exclusivamente a ADMIN.';

CREATE INDEX IF NOT EXISTS idx_costos_producto_actualizado_por
  ON public.costos_producto(actualizado_por);

-- --------------------------------------------------------------------------
-- 2. Tabla: costos_detalle_remision (snapshot histórico por línea vendida)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.costos_detalle_remision (
  detalle_remision_id UUID PRIMARY KEY REFERENCES public.detalles_remision(id) ON DELETE CASCADE,
  remision_id         UUID NOT NULL REFERENCES public.remisiones(id) ON DELETE CASCADE,
  producto_id         UUID NOT NULL REFERENCES public.productos(id),
  costo_unitario      NUMERIC(12,2) NOT NULL CHECK (costo_unitario >= 0),
  costo_linea         NUMERIC(12,2) NOT NULL CHECK (costo_linea >= 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.costos_detalle_remision IS
  'Costo unitario y subtotal de costo congelados en el instante de la venta (detalles_remision) para preservar la ganancia histórica aunque cambie el precio de llegada.';

CREATE INDEX IF NOT EXISTS idx_costos_detalle_remision_remision_id
  ON public.costos_detalle_remision(remision_id);

CREATE INDEX IF NOT EXISTS idx_costos_detalle_remision_producto_id
  ON public.costos_detalle_remision(producto_id);

-- --------------------------------------------------------------------------
-- 3. Seguridad RLS y Privilegios
-- --------------------------------------------------------------------------

ALTER TABLE public.costos_producto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.costos_producto FORCE ROW LEVEL SECURITY;

ALTER TABLE public.costos_detalle_remision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.costos_detalle_remision FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.costos_producto FROM anon, PUBLIC;
REVOKE ALL ON public.costos_detalle_remision FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.costos_producto TO authenticated;
GRANT SELECT ON public.costos_detalle_remision TO authenticated;

DROP POLICY IF EXISTS costos_producto_admin_all ON public.costos_producto;
CREATE POLICY costos_producto_admin_all
  ON public.costos_producto
  FOR ALL
  TO authenticated
  USING (es_admin_activo())
  WITH CHECK (es_admin_activo());

DROP POLICY IF EXISTS costos_detalle_remision_admin_select ON public.costos_detalle_remision;
CREATE POLICY costos_detalle_remision_admin_select
  ON public.costos_detalle_remision
  FOR SELECT
  TO authenticated
  USING (es_admin_activo());

-- --------------------------------------------------------------------------
-- 4. Trigger: congelar costo de llegada al insertar líneas en detalles_remision
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.congelar_costo_por_remision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_costo NUMERIC(12,2);
BEGIN
  SELECT cp.costo_llegada
    INTO v_costo
    FROM public.costos_producto cp
   WHERE cp.producto_id = NEW.producto_id;

  IF FOUND AND v_costo IS NOT NULL THEN
    INSERT INTO public.costos_detalle_remision (
      detalle_remision_id,
      remision_id,
      producto_id,
      costo_unitario,
      costo_linea
    )
    VALUES (
      NEW.id,
      NEW.remision_id,
      NEW.producto_id,
      v_costo,
      ROUND(v_costo * NEW.cantidad, 2)
    )
    ON CONFLICT (detalle_remision_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.congelar_costo_por_remision() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.congelar_costo_por_remision() IS
  'Trigger interno SECURITY DEFINER: congela el costo_llegada vigente de costos_producto al crear una línea en detalles_remision, incluso cuando vende un VENDEDOR.';

DROP TRIGGER IF EXISTS trg_congelar_costo_por_remision ON public.detalles_remision;
CREATE TRIGGER trg_congelar_costo_por_remision
  AFTER INSERT ON public.detalles_remision
  FOR EACH ROW
  EXECUTE FUNCTION public.congelar_costo_por_remision();

-- --------------------------------------------------------------------------
-- 5. Función RPC: guardar_costo_producto
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guardar_costo_producto(
  p_producto_id   UUID,
  p_costo_llegada NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_costo_redondeado NUMERIC(12,2);
  v_registro         public.costos_producto%ROWTYPE;
BEGIN
  IF NOT es_admin_activo() THEN
    RAISE EXCEPTION 'Solo administradores activos pueden gestionar costos de productos.';
  END IF;

  IF p_producto_id IS NULL THEN
    RAISE EXCEPTION 'El identificador del producto es obligatorio.';
  END IF;

  IF p_costo_llegada IS NULL OR p_costo_llegada < 0 THEN
    RAISE EXCEPTION 'El costo de llegada debe ser un número mayor o igual a cero.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.productos WHERE id = p_producto_id) THEN
    RAISE EXCEPTION 'Producto no encontrado.';
  END IF;

  v_costo_redondeado := ROUND(p_costo_llegada, 2);

  INSERT INTO public.costos_producto (
    producto_id,
    costo_llegada,
    actualizado_por,
    updated_at
  )
  VALUES (
    p_producto_id,
    v_costo_redondeado,
    auth.uid(),
    now()
  )
  ON CONFLICT (producto_id) DO UPDATE
    SET costo_llegada   = EXCLUDED.costo_llegada,
        actualizado_por = EXCLUDED.actualizado_por,
        updated_at      = now()
  RETURNING * INTO v_registro;

  RETURN jsonb_build_object(
    'producto_id',     v_registro.producto_id,
    'costo_llegada',   v_registro.costo_llegada,
    'actualizado_por', v_registro.actualizado_por,
    'created_at',      v_registro.created_at,
    'updated_at',      v_registro.updated_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guardar_costo_producto(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_costo_producto(UUID, NUMERIC) TO authenticated;

COMMENT ON FUNCTION public.guardar_costo_producto(UUID, NUMERIC) IS
  'Registra o actualiza el costo unitario de llegada de un producto (exclusivo ADMIN activo).';
