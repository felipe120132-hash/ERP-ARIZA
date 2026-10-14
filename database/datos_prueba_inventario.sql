-- ==========================================================================
-- ArizaERP — Datos de prueba: Inventario
-- ==========================================================================
-- Este archivo NO es una migración. Se utiliza para sembrar datos de prueba
-- requeridos al ejecutar los tests de integración de servicios y RPCs de
-- inventario (scripts/probar-servicios.ts).
--
-- Crea o actualiza un producto con SKU 'SKU-PRUEBA', activo y con stock 0.
-- ==========================================================================

INSERT INTO public.productos (
  sku,
  nombre,
  categoria,
  origen,
  precio_tienda,
  precio_distribuidor,
  tasa_iva,
  stock_actual,
  stock_minimo,
  activo
) VALUES (
  'SKU-PRUEBA',
  'Producto de Prueba Inventario',
  'Pruebas',
  'Nacional',
  10000.00,
  8000.00,
  19.00,
  0,
  5,
  true
)
ON CONFLICT (sku) DO UPDATE
SET stock_actual = 0,
    activo = true,
    updated_at = now();
