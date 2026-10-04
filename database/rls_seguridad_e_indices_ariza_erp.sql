-- ==========================================================================
-- ArizaERP — Seguridad, Políticas RLS, Permisos e Índices
-- ==========================================================================
-- Este archivo contiene la configuración completa y definitiva de:
--   1. Función helper de seguridad (obtener_rol_actual)
--   2. Revocación total de permisos al rol anon (tablas, secuencias y funciones)
--   3. Asignación de permisos al rol authenticated
--   4. Activación y forzado de Row Level Security (RLS) en todas las tablas
--   5. Políticas RLS por tabla (con eliminación de INSERT directo en remisiones,
--      detalles_remision y abonos_cartera)
--   6. Políticas RLS para Supabase Storage (bucket productos-imagenes)
--   7. Índices de rendimiento y optimización de claves foráneas
--
-- Ejecutable de forma idempotente en cualquier proyecto Supabase nuevo.
-- ==========================================================================


-- ==========================================================================
-- 1. FUNCIÓN HELPER DE SEGURIDAD
-- ==========================================================================
-- Permite consultar de forma eficiente el rol del usuario autenticado
-- dentro de las políticas RLS y funciones RPC, evitando recursión en perfiles.

CREATE OR REPLACE FUNCTION public.obtener_rol_actual()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.obtener_rol_actual() IS
  'Obtiene el rol (ADMIN / VENDEDOR) del usuario autenticado desde la tabla perfiles. Usada en políticas RLS.';


-- ==========================================================================
-- 2. HARDENING Y REVOCACIÓN DE PERMISOS AL ROL ANON
-- ==========================================================================
-- Por diseño de seguridad, el rol anon (usuarios no autenticados) tiene 0
-- permisos en toda la base de datos: ni lectura de tablas, ni secuencias,
-- ni ejecución de RPCs ni funciones trigger.

-- 2.1 Revocar privilegios sobre tablas, secuencias y rutinas al rol anon
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

-- Asegurar que futuros objetos creados en public no otorguen acceso a anon
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon;

-- 2.2 Revocación explícita de EXECUTE en funciones RPC y triggers a anon y public
DO $$
BEGIN
  -- Helper
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.obtener_rol_actual() FROM anon, public';

  -- RPCs de negocio
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'crear_remision') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.crear_remision FROM anon, public';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_abono') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.registrar_abono FROM anon, public';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resumen_financiero_mensual') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.resumen_financiero_mensual FROM anon, public';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'anular_remision') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.anular_remision FROM anon, public';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_pdf_remision') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.actualizar_pdf_remision FROM anon, public';
  END IF;

  -- Funciones trigger (nunca deben ser invocadas directamente por la API)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_stock_por_remision') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.actualizar_stock_por_remision FROM anon, public';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reingresar_stock_por_anulacion') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.reingresar_stock_por_anulacion FROM anon, public';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_cartera_por_remision') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.actualizar_cartera_por_remision FROM anon, public';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_cartera_por_abono') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.actualizar_cartera_por_abono FROM anon, public';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'revertir_cartera_por_anulacion') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.revertir_cartera_por_anulacion FROM anon, public';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_updated_at') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.actualizar_updated_at FROM anon, public';
  END IF;
END $$;


-- ==========================================================================
-- 3. PERMISOS PARA EL ROL AUTHENTICATED
-- ==========================================================================
-- El rol authenticated tiene permisos sobre el esquema public, pero el
-- acceso efectivo a cada fila está estrictamente gobernado por RLS.

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Asignar EXECUTE explícito a authenticated en las funciones requeridas
GRANT EXECUTE ON FUNCTION public.obtener_rol_actual() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'crear_remision') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.crear_remision TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_abono') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.registrar_abono TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resumen_financiero_mensual') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.resumen_financiero_mensual TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'anular_remision') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.anular_remision TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_pdf_remision') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.actualizar_pdf_remision TO authenticated';
  END IF;
END $$;


-- ==========================================================================
-- 4. ACTIVACIÓN Y FORZADO DE ROW LEVEL SECURITY (RLS)
-- ==========================================================================

ALTER TABLE IF EXISTS public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.perfiles FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.productos FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clientes FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.precios_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.precios_cliente FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.remisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.remisiones FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.detalles_remision ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.detalles_remision FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.kardex ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kardex FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.abonos_cartera ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.abonos_cartera FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.gastos FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.presupuestos FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.documentos FORCE ROW LEVEL SECURITY;


-- ==========================================================================
-- 5. POLÍTICAS ROW LEVEL SECURITY (RLS)
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 5.1 perfiles
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "perfiles_select_propio_o_admin" ON public.perfiles;
CREATE POLICY "perfiles_select_propio_o_admin"
  ON public.perfiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.obtener_rol_actual() = 'ADMIN'
  );

DROP POLICY IF EXISTS "perfiles_insert_admin" ON public.perfiles;
CREATE POLICY "perfiles_insert_admin"
  ON public.perfiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "perfiles_update_admin" ON public.perfiles;
CREATE POLICY "perfiles_update_admin"
  ON public.perfiles
  FOR UPDATE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN')
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "perfiles_delete_admin" ON public.perfiles;
CREATE POLICY "perfiles_delete_admin"
  ON public.perfiles
  FOR DELETE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN');


-- --------------------------------------------------------------------------
-- 5.2 productos
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "productos_select_authenticated" ON public.productos;
CREATE POLICY "productos_select_authenticated"
  ON public.productos
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "productos_insert_admin" ON public.productos;
CREATE POLICY "productos_insert_admin"
  ON public.productos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "productos_update_admin" ON public.productos;
CREATE POLICY "productos_update_admin"
  ON public.productos
  FOR UPDATE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN')
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "productos_delete_admin" ON public.productos;
CREATE POLICY "productos_delete_admin"
  ON public.productos
  FOR DELETE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN');


-- --------------------------------------------------------------------------
-- 5.3 clientes
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "clientes_select_authenticated" ON public.clientes;
CREATE POLICY "clientes_select_authenticated"
  ON public.clientes
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "clientes_insert_admin" ON public.clientes;
CREATE POLICY "clientes_insert_admin"
  ON public.clientes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "clientes_update_admin" ON public.clientes;
CREATE POLICY "clientes_update_admin"
  ON public.clientes
  FOR UPDATE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN')
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "clientes_delete_admin" ON public.clientes;
CREATE POLICY "clientes_delete_admin"
  ON public.clientes
  FOR DELETE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN');


-- --------------------------------------------------------------------------
-- 5.4 precios_cliente
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "precios_cliente_select_authenticated" ON public.precios_cliente;
CREATE POLICY "precios_cliente_select_authenticated"
  ON public.precios_cliente
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "precios_cliente_insert_admin" ON public.precios_cliente;
CREATE POLICY "precios_cliente_insert_admin"
  ON public.precios_cliente
  FOR INSERT
  TO authenticated
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "precios_cliente_update_admin" ON public.precios_cliente;
CREATE POLICY "precios_cliente_update_admin"
  ON public.precios_cliente
  FOR UPDATE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN')
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "precios_cliente_delete_admin" ON public.precios_cliente;
CREATE POLICY "precios_cliente_delete_admin"
  ON public.precios_cliente
  FOR DELETE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN');


-- --------------------------------------------------------------------------
-- 5.5 remisiones
-- --------------------------------------------------------------------------
-- NOTA CRÍTICA DE SEGURIDAD:
-- SE ELIMINÓ LA POLÍTICA DE INSERT DIRECTO PARA EL ROL AUTHENTICATED.
-- La creación de remisiones se realiza EXCLUSIVAMENTE mediante la RPC
-- `crear_remision(...)`. Los INSERTs directos desde el cliente PostgREST
-- quedan bloqueados por RLS para garantizar la integridad transaccional
-- (resolución de precios, cálculo de IVA por línea, descuento de stock y cartera).

DROP POLICY IF EXISTS "remisiones_insert_authenticated" ON public.remisiones;
DROP POLICY IF EXISTS "remisiones_insert_vendedor" ON public.remisiones;
DROP POLICY IF EXISTS "remisiones_insert_admin" ON public.remisiones;

DROP POLICY IF EXISTS "remisiones_select_authenticated" ON public.remisiones;
CREATE POLICY "remisiones_select_authenticated"
  ON public.remisiones
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "remisiones_update_admin" ON public.remisiones;
CREATE POLICY "remisiones_update_admin"
  ON public.remisiones
  FOR UPDATE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN')
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "remisiones_delete_admin" ON public.remisiones;
CREATE POLICY "remisiones_delete_admin"
  ON public.remisiones
  FOR DELETE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN');


-- --------------------------------------------------------------------------
-- 5.6 detalles_remision
-- --------------------------------------------------------------------------
-- NOTA CRÍTICA DE SEGURIDAD:
-- SE ELIMINÓ LA POLÍTICA DE INSERT DIRECTO PARA EL ROL AUTHENTICATED.
-- Las líneas de remisión se insertan EXCLUSIVAMENTE dentro de la función RPC
-- `crear_remision(...)`. Ningún usuario puede insertar detalles directamente.

DROP POLICY IF EXISTS "detalles_remision_insert_authenticated" ON public.detalles_remision;
DROP POLICY IF EXISTS "detalles_remision_insert_vendedor" ON public.detalles_remision;
DROP POLICY IF EXISTS "detalles_remision_insert_admin" ON public.detalles_remision;

DROP POLICY IF EXISTS "detalles_remision_select_authenticated" ON public.detalles_remision;
CREATE POLICY "detalles_remision_select_authenticated"
  ON public.detalles_remision
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "detalles_remision_update_admin" ON public.detalles_remision;
CREATE POLICY "detalles_remision_update_admin"
  ON public.detalles_remision
  FOR UPDATE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN')
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "detalles_remision_delete_admin" ON public.detalles_remision;
CREATE POLICY "detalles_remision_delete_admin"
  ON public.detalles_remision
  FOR DELETE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN');


-- --------------------------------------------------------------------------
-- 5.7 kardex
-- --------------------------------------------------------------------------
-- Tabla de solo lectura para los usuarios. Solo es escrita por triggers internos.
DROP POLICY IF EXISTS "kardex_select_authenticated" ON public.kardex;
CREATE POLICY "kardex_select_authenticated"
  ON public.kardex
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "kardex_insert_authenticated" ON public.kardex;
DROP POLICY IF EXISTS "kardex_update_authenticated" ON public.kardex;
DROP POLICY IF EXISTS "kardex_delete_authenticated" ON public.kardex;


-- --------------------------------------------------------------------------
-- 5.8 abonos_cartera
-- --------------------------------------------------------------------------
-- NOTA CRÍTICA DE SEGURIDAD:
-- SE ELIMINÓ LA POLÍTICA DE INSERT DIRECTO PARA EL ROL AUTHENTICATED.
-- El registro de pagos y abonos se realiza EXCLUSIVAMENTE mediante la RPC
-- `registrar_abono(...)`, asegurando que el trigger descuente saldo_cartera
-- de forma atómica y consistente.

DROP POLICY IF EXISTS "abonos_cartera_insert_authenticated" ON public.abonos_cartera;
DROP POLICY IF EXISTS "abonos_cartera_insert_vendedor" ON public.abonos_cartera;
DROP POLICY IF EXISTS "abonos_cartera_insert_admin" ON public.abonos_cartera;

DROP POLICY IF EXISTS "abonos_cartera_select_authenticated" ON public.abonos_cartera;
CREATE POLICY "abonos_cartera_select_authenticated"
  ON public.abonos_cartera
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "abonos_cartera_update_admin" ON public.abonos_cartera;
CREATE POLICY "abonos_cartera_update_admin"
  ON public.abonos_cartera
  FOR UPDATE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN')
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "abonos_cartera_delete_admin" ON public.abonos_cartera;
CREATE POLICY "abonos_cartera_delete_admin"
  ON public.abonos_cartera
  FOR DELETE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN');


-- --------------------------------------------------------------------------
-- 5.9 gastos
-- --------------------------------------------------------------------------
-- Módulo financiero sensible: lectura y escritura exclusivas para rol ADMIN.
DROP POLICY IF EXISTS "gastos_select_admin" ON public.gastos;
CREATE POLICY "gastos_select_admin"
  ON public.gastos
  FOR SELECT
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "gastos_insert_admin" ON public.gastos;
CREATE POLICY "gastos_insert_admin"
  ON public.gastos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "gastos_update_admin" ON public.gastos;
CREATE POLICY "gastos_update_admin"
  ON public.gastos
  FOR UPDATE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN')
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "gastos_delete_admin" ON public.gastos;
CREATE POLICY "gastos_delete_admin"
  ON public.gastos
  FOR DELETE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN');


-- --------------------------------------------------------------------------
-- 5.10 presupuestos
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "presupuestos_select_admin" ON public.presupuestos;
CREATE POLICY "presupuestos_select_admin"
  ON public.presupuestos
  FOR SELECT
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "presupuestos_insert_admin" ON public.presupuestos;
CREATE POLICY "presupuestos_insert_admin"
  ON public.presupuestos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "presupuestos_update_admin" ON public.presupuestos;
CREATE POLICY "presupuestos_update_admin"
  ON public.presupuestos
  FOR UPDATE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN')
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "presupuestos_delete_admin" ON public.presupuestos;
CREATE POLICY "presupuestos_delete_admin"
  ON public.presupuestos
  FOR DELETE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN');


-- --------------------------------------------------------------------------
-- 5.11 documentos
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "documentos_select_authenticated" ON public.documentos;
CREATE POLICY "documentos_select_authenticated"
  ON public.documentos
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "documentos_insert_admin" ON public.documentos;
CREATE POLICY "documentos_insert_admin"
  ON public.documentos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "documentos_update_admin" ON public.documentos;
CREATE POLICY "documentos_update_admin"
  ON public.documentos
  FOR UPDATE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN')
  WITH CHECK (public.obtener_rol_actual() = 'ADMIN');

DROP POLICY IF EXISTS "documentos_delete_admin" ON public.documentos;
CREATE POLICY "documentos_delete_admin"
  ON public.documentos
  FOR DELETE
  TO authenticated
  USING (public.obtener_rol_actual() = 'ADMIN');


-- ==========================================================================
-- 6. POLÍTICAS STORAGE (Supabase Storage: bucket productos-imagenes)
-- ==========================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    
    -- Lectura de imágenes: cualquier usuario autenticado (para URLs firmadas)
    DROP POLICY IF EXISTS "storage_productos_select_authenticated" ON storage.objects;
    CREATE POLICY "storage_productos_select_authenticated"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'productos-imagenes');

    -- Subida / edición / eliminación de fotos: solo ADMIN
    DROP POLICY IF EXISTS "storage_productos_insert_admin" ON storage.objects;
    CREATE POLICY "storage_productos_insert_admin"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'productos-imagenes'
        AND public.obtener_rol_actual() = 'ADMIN'
      );

    DROP POLICY IF EXISTS "storage_productos_update_admin" ON storage.objects;
    CREATE POLICY "storage_productos_update_admin"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'productos-imagenes'
        AND public.obtener_rol_actual() = 'ADMIN'
      )
      WITH CHECK (
        bucket_id = 'productos-imagenes'
        AND public.obtener_rol_actual() = 'ADMIN'
      );

    DROP POLICY IF EXISTS "storage_productos_delete_admin" ON storage.objects;
    CREATE POLICY "storage_productos_delete_admin"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'productos-imagenes'
        AND public.obtener_rol_actual() = 'ADMIN'
      );

  END IF;
END $$;


-- ==========================================================================
-- 7. ÍNDICES DE RENDIMIENTO Y OPTIMIZACIÓN
-- ==========================================================================

-- perfiles
CREATE INDEX IF NOT EXISTS idx_perfiles_rol ON public.perfiles(rol);
CREATE INDEX IF NOT EXISTS idx_perfiles_activo ON public.perfiles(activo);

-- productos
CREATE INDEX IF NOT EXISTS idx_productos_sku ON public.productos(sku);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON public.productos(categoria);
CREATE INDEX IF NOT EXISTS idx_productos_activo ON public.productos(activo);
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON public.productos(nombre);

-- clientes
CREATE INDEX IF NOT EXISTS idx_clientes_nombre_tienda ON public.clientes(nombre_tienda);
CREATE INDEX IF NOT EXISTS idx_clientes_tipo_cliente ON public.clientes(tipo_cliente);
CREATE INDEX IF NOT EXISTS idx_clientes_en_mora ON public.clientes(en_mora);
CREATE INDEX IF NOT EXISTS idx_clientes_activo ON public.clientes(activo);

-- precios_cliente
CREATE INDEX IF NOT EXISTS idx_precios_cliente_cliente_id ON public.precios_cliente(cliente_id);
CREATE INDEX IF NOT EXISTS idx_precios_cliente_producto_id ON public.precios_cliente(producto_id);
CREATE INDEX IF NOT EXISTS idx_precios_cliente_lookup ON public.precios_cliente(cliente_id, producto_id);

-- remisiones
CREATE INDEX IF NOT EXISTS idx_remisiones_cliente_id ON public.remisiones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_remisiones_vendedor_id ON public.remisiones(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_remisiones_estado ON public.remisiones(estado);
CREATE INDEX IF NOT EXISTS idx_remisiones_tipo_pago ON public.remisiones(tipo_pago);
CREATE INDEX IF NOT EXISTS idx_remisiones_fecha ON public.remisiones(fecha);
CREATE INDEX IF NOT EXISTS idx_remisiones_created_at ON public.remisiones(created_at DESC);

-- detalles_remision
CREATE INDEX IF NOT EXISTS idx_detalles_remision_remision_id ON public.detalles_remision(remision_id);
CREATE INDEX IF NOT EXISTS idx_detalles_remision_producto_id ON public.detalles_remision(producto_id);

-- kardex
CREATE INDEX IF NOT EXISTS idx_kardex_producto_id ON public.kardex(producto_id);
CREATE INDEX IF NOT EXISTS idx_kardex_remision_id ON public.kardex(remision_id);
CREATE INDEX IF NOT EXISTS idx_kardex_tipo_movimiento ON public.kardex(tipo_movimiento);
CREATE INDEX IF NOT EXISTS idx_kardex_created_at ON public.kardex(created_at DESC);

-- abonos_cartera
CREATE INDEX IF NOT EXISTS idx_abonos_cartera_cliente_id ON public.abonos_cartera(cliente_id);
CREATE INDEX IF NOT EXISTS idx_abonos_cartera_remision_id ON public.abonos_cartera(remision_id);
CREATE INDEX IF NOT EXISTS idx_abonos_cartera_fecha ON public.abonos_cartera(fecha);
CREATE INDEX IF NOT EXISTS idx_abonos_cartera_registrado_por ON public.abonos_cartera(registrado_por);

-- gastos
CREATE INDEX IF NOT EXISTS idx_gastos_mes_referencia ON public.gastos(mes_referencia);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON public.gastos(categoria);
CREATE INDEX IF NOT EXISTS idx_gastos_created_at ON public.gastos(created_at DESC);

-- presupuestos
CREATE INDEX IF NOT EXISTS idx_presupuestos_mes_referencia ON public.presupuestos(mes_referencia);

-- documentos
CREATE INDEX IF NOT EXISTS idx_documentos_cliente_id ON public.documentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_documentos_remision_id ON public.documentos(remision_id);
CREATE INDEX IF NOT EXISTS idx_documentos_tipo_documento ON public.documentos(tipo_documento);
CREATE INDEX IF NOT EXISTS idx_documentos_subido_por ON public.documentos(subido_por);


-- ==========================================================================
-- 8. ENDURECIMIENTO POST-SECURITY ADVISOR
-- ==========================================================================
-- Aplica las recomendaciones y correcciones de seguridad de Supabase
-- Security Advisor para prevenir escalamiento de privilegios, inyección
-- de search_path e invocación indebida de funciones trigger y vistas.

-- 8.1 Vista segura con security_invoker
-- Asegura que la vista evalúe las políticas RLS del usuario que ejecuta la consulta
ALTER VIEW IF EXISTS public.vista_alertas_stock SET (security_invoker = true);

-- 8.2 Fijar search_path inmutable en todas las funciones (previene hijacking de esquemas)
DO $$
BEGIN
  -- Helper de seguridad
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'obtener_rol_actual') THEN
    EXECUTE 'ALTER FUNCTION public.obtener_rol_actual() SET search_path = public, pg_temp';
  END IF;

  -- Funciones RPC
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'crear_remision') THEN
    EXECUTE 'ALTER FUNCTION public.crear_remision(UUID, TEXT, JSONB, BOOLEAN) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_abono') THEN
    EXECUTE 'ALTER FUNCTION public.registrar_abono(UUID, NUMERIC, TEXT, UUID) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'anular_remision') THEN
    EXECUTE 'ALTER FUNCTION public.anular_remision(UUID) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_pdf_remision') THEN
    EXECUTE 'ALTER FUNCTION public.actualizar_pdf_remision(UUID, TEXT) SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resumen_financiero_mensual') THEN
    EXECUTE 'ALTER FUNCTION public.resumen_financiero_mensual(DATE) SET search_path = public, pg_temp';
  END IF;

  -- Funciones Trigger
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_descontar_stock') THEN
    EXECUTE 'ALTER FUNCTION public.fn_descontar_stock() SET search_path = public, pg_temp';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_stock_por_remision') THEN
    EXECUTE 'ALTER FUNCTION public.actualizar_stock_por_remision() SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_actualizar_cartera') THEN
    EXECUTE 'ALTER FUNCTION public.fn_actualizar_cartera() SET search_path = public, pg_temp';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_cartera_por_remision') THEN
    EXECUTE 'ALTER FUNCTION public.actualizar_cartera_por_remision() SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_aplicar_abono') THEN
    EXECUTE 'ALTER FUNCTION public.fn_aplicar_abono() SET search_path = public, pg_temp';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_cartera_por_abono') THEN
    EXECUTE 'ALTER FUNCTION public.actualizar_cartera_por_abono() SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_reingresar_stock_por_anulacion') THEN
    EXECUTE 'ALTER FUNCTION public.fn_reingresar_stock_por_anulacion() SET search_path = public, pg_temp';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reingresar_stock_por_anulacion') THEN
    EXECUTE 'ALTER FUNCTION public.reingresar_stock_por_anulacion() SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'revertir_cartera_por_anulacion') THEN
    EXECUTE 'ALTER FUNCTION public.revertir_cartera_por_anulacion() SET search_path = public, pg_temp';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_updated_at') THEN
    EXECUTE 'ALTER FUNCTION public.actualizar_updated_at() SET search_path = public, pg_temp';
  END IF;
END $$;

-- 8.3 Permisos de ejecución de RPCs: REVOKE a PUBLIC + GRANT exclusivo a authenticated
DO $$
BEGIN
  -- obtener_rol_actual
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'obtener_rol_actual') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.obtener_rol_actual() FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.obtener_rol_actual() TO authenticated';
  END IF;

  -- crear_remision
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'crear_remision') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.crear_remision(UUID, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.crear_remision(UUID, TEXT, JSONB, BOOLEAN) TO authenticated';
  END IF;

  -- registrar_abono
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_abono') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.registrar_abono(UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.registrar_abono(UUID, NUMERIC, TEXT, UUID) TO authenticated';
  END IF;

  -- anular_remision
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'anular_remision') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.anular_remision(UUID) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.anular_remision(UUID) TO authenticated';
  END IF;

  -- actualizar_pdf_remision
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_pdf_remision') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.actualizar_pdf_remision(UUID, TEXT) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.actualizar_pdf_remision(UUID, TEXT) TO authenticated';
  END IF;

  -- resumen_financiero_mensual
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resumen_financiero_mensual') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.resumen_financiero_mensual(DATE) FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.resumen_financiero_mensual(DATE) TO authenticated';
  END IF;
END $$;

-- 8.4 Bloqueo total de ejecución en funciones trigger internas (REVOKE a anon y authenticated)
-- Las funciones de trigger solo deben ejecutarse por el motor de base de datos ante eventos DML, nunca vía RPC/API.
DO $$
BEGIN
  -- fn_descontar_stock
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_descontar_stock') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fn_descontar_stock() FROM PUBLIC, anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_stock_por_remision') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.actualizar_stock_por_remision() FROM PUBLIC, anon, authenticated';
  END IF;

  -- fn_actualizar_cartera
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_actualizar_cartera') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fn_actualizar_cartera() FROM PUBLIC, anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_cartera_por_remision') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.actualizar_cartera_por_remision() FROM PUBLIC, anon, authenticated';
  END IF;

  -- fn_aplicar_abono
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_aplicar_abono') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fn_aplicar_abono() FROM PUBLIC, anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_cartera_por_abono') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.actualizar_cartera_por_abono() FROM PUBLIC, anon, authenticated';
  END IF;

  -- fn_reingresar_stock_por_anulacion
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_reingresar_stock_por_anulacion') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fn_reingresar_stock_por_anulacion() FROM PUBLIC, anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reingresar_stock_por_anulacion') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.reingresar_stock_por_anulacion() FROM PUBLIC, anon, authenticated';
  END IF;

  -- Otras funciones trigger
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'revertir_cartera_por_anulacion') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.revertir_cartera_por_anulacion() FROM PUBLIC, anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'actualizar_updated_at') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.actualizar_updated_at() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

