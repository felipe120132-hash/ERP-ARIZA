import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { completarAutenticacionOneDrive } from "@/services/onedriveService";

export default function OneDriveCallback() {
  const { user, perfil, loading } = useAuth();
  const [query] = useState(() => window.location.search);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => {
    // Remove the authorization code from the address bar and browser history.
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);
  useEffect(() => {
    if (loading || !user || !perfil?.activo || perfil.rol !== "ADMIN") return;
    let active = true;
    completarAutenticacionOneDrive(query, user.id).then(
      () => { if (active) setResult({ ok: true, message: "El OneDrive de la empresa quedó conectado. El equipo ya puede consultar sus documentos." }); },
      (e: unknown) => { if (active) setResult({ ok: false, message: e instanceof Error ? e.message : "No pudimos completar la conexión. Vuelve a iniciarla desde Documentos." }); },
    );
    return () => { active = false; };
  }, [loading, user, perfil, query]);
  const denied = !loading && (!user || !perfil?.activo || perfil.rol !== "ADMIN");
  return <main id="contenido" className="pending-panel" style={{ maxWidth: 700, margin: "8vh auto", padding: "clamp(24px, 5vw, 64px)" }}>
    <div className="pending-symbol"><Cloud size={38} /></div>
    <span className="eyebrow">DISTRIBUCIONES ARIZA / ONEDRIVE</span>
    <h1>{denied ? "Necesitamos verificar tu sesión" : result?.ok ? "Conexión completada" : result ? "No se completó la conexión" : "Conectando OneDrive…"}</h1>
    <p role={denied || result?.ok === false ? "alert" : "status"}>{denied ? "Inicia sesión en el ERP y vuelve a conectar OneDrive desde Documentos." : result?.message ?? "Estamos verificando la autorización de Microsoft."}</p>
    {(denied || result) && <Button asChild><Link to={denied ? "/login" : "/documentos"} state={denied ? { from: "/documentos" } : undefined}>{denied ? "Ir al inicio de sesión" : "Volver a Documentos"}</Link></Button>}
  </main>;
}
