-- Apply after migration 005. Credentials and upload reservations are service-only.
BEGIN;
CREATE TABLE IF NOT EXISTS public.onedrive_empresa (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  tokens_cifrados text, expires_at timestamptz, drive_id text, cuenta text,
  conectado_por uuid REFERENCES public.perfiles(id),
  lock_owner uuid, lock_until timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO public.onedrive_empresa(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.onedrive_oauth (
  state_hash text PRIMARY KEY, usuario_id uuid NOT NULL REFERENCES public.perfiles(id),
  redirect_uri text NOT NULL, verifier_cifrado text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS public.onedrive_archivos (
  id uuid PRIMARY KEY, usuario_id uuid NOT NULL REFERENCES public.perfiles(id),
  fingerprint text NOT NULL, metadata jsonb NOT NULL,
  drive_id text NOT NULL, item_id text, web_url text,
  mime_type text NOT NULL, bytes bigint NOT NULL CHECK(bytes > 0 AND bytes <= 5242880),
  creado_en timestamptz NOT NULL DEFAULT now(), finalizado boolean NOT NULL DEFAULT false
);
ALTER TABLE public.onedrive_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onedrive_empresa FORCE ROW LEVEL SECURITY;
ALTER TABLE public.onedrive_oauth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onedrive_oauth FORCE ROW LEVEL SECURITY;
ALTER TABLE public.onedrive_archivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onedrive_archivos FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.onedrive_empresa, public.onedrive_oauth, public.onedrive_archivos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.onedrive_empresa, public.onedrive_oauth, public.onedrive_archivos TO service_role;

CREATE OR REPLACE FUNCTION public.onedrive_lock(p_owner uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE onedrive_empresa SET lock_owner=p_owner, lock_until=clock_timestamp()+interval '120 seconds'
  WHERE id AND lock_until < clock_timestamp();
  RETURN FOUND;
END; $$;

-- Fence the final database transaction: no stale worker can finalize an upload.
CREATE OR REPLACE FUNCTION public.onedrive_finalizar(p_id uuid, p_owner uuid, p_actor uuid, p_item text, p_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a onedrive_archivos%ROWTYPE; d documentos%ROWTYPE; c uuid; r uuid;
BEGIN
  PERFORM 1 FROM onedrive_empresa WHERE id AND lock_owner=p_owner AND lock_until>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La operación expiró. Reintenta con la misma solicitud.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM perfiles WHERE id=p_actor AND rol='ADMIN' AND activo) THEN RAISE EXCEPTION 'Acceso restringido.'; END IF;
  SELECT * INTO STRICT a FROM onedrive_archivos WHERE id=p_id AND usuario_id=p_actor FOR UPDATE;
  IF a.finalizado THEN SELECT * INTO STRICT d FROM documentos WHERE id=p_id; RETURN to_jsonb(d); END IF;
  IF p_url !~ '^https://' OR length(p_item)=0 THEN RAISE EXCEPTION 'Archivo inválido.'; END IF;
  c := NULLIF(a.metadata->>'cliente_id','')::uuid;
  r := NULLIF(a.metadata->>'remision_id','')::uuid;
  IF r IS NOT NULL THEN
    PERFORM 1 FROM remisiones WHERE id=r AND cliente_id=c FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La remisión no corresponde al cliente.'; END IF;
  END IF;
  INSERT INTO documentos(id,tipo_documento,nombre,onedrive_url,cliente_id,remision_id,subido_por)
  VALUES(p_id,a.metadata->>'tipo_documento',a.metadata->>'nombre',p_url,c,r,p_actor) RETURNING * INTO d;
  IF COALESCE((a.metadata->>'pdf_remision')::boolean,false) THEN
    IF r IS NULL OR a.mime_type <> 'application/pdf' THEN RAISE EXCEPTION 'Selecciona una remisión y un PDF.'; END IF;
    UPDATE remisiones SET pdf_url=p_url WHERE id=r;
  END IF;
  UPDATE onedrive_archivos SET item_id=p_item,web_url=p_url,finalizado=true WHERE id=p_id;
  RETURN to_jsonb(d);
END; $$;
REVOKE ALL ON FUNCTION public.onedrive_lock(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.onedrive_finalizar(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.onedrive_lock(uuid), public.onedrive_finalizar(uuid,uuid,uuid,text,text) TO service_role;
COMMIT;
