-- ==========================================================================
-- Migración 008: Políticas explícitas de denegación en tablas internas OneDrive
-- ==========================================================================
-- Estas tablas guardan tokens OAuth, verifiers PKCE y referencias internas;
-- solo deben ser accedidas por la Edge Function con service_role.
--
-- Idempotencia:
--   - DROP POLICY IF EXISTS elimina políticas previas antes de crearlas.
--   - REVOKE ALL es una operación idempotente en PostgreSQL.
-- ==========================================================================

-- 1. Tabla onedrive_archivos
ALTER TABLE public.onedrive_archivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onedrive_archivos_denegar_todo ON public.onedrive_archivos;
CREATE POLICY onedrive_archivos_denegar_todo ON public.onedrive_archivos
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- 2. Tabla onedrive_empresa
ALTER TABLE public.onedrive_empresa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onedrive_empresa_denegar_todo ON public.onedrive_empresa;
CREATE POLICY onedrive_empresa_denegar_todo ON public.onedrive_empresa
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- 3. Tabla onedrive_oauth
ALTER TABLE public.onedrive_oauth ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onedrive_oauth_denegar_todo ON public.onedrive_oauth;
CREATE POLICY onedrive_oauth_denegar_todo ON public.onedrive_oauth
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Revocar permisos para anon y authenticated
REVOKE ALL ON public.onedrive_archivos, public.onedrive_empresa, public.onedrive_oauth FROM anon, authenticated;
