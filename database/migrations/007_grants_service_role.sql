-- ==========================================================================
-- Migración 007: Concesión de permisos SELECT a service_role
-- ==========================================================================
-- La Edge Function onedrive usa service_role y necesita leer estas tablas
-- para resolver metadatos y enlaces de documentos/remisiones (evita error 42501).
--
-- Idempotencia: En PostgreSQL, GRANT es idempotente; reejecutarlo no genera error.
-- ==========================================================================

GRANT SELECT ON public.perfiles, public.clientes, public.remisiones, public.documentos TO service_role;
