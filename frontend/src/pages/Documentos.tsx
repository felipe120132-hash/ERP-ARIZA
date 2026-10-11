import { useState } from "react";
import { Cloud, FileText, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cerrarSesionOneDrive, configuracionOneDrive, iniciarAutenticacionOneDrive, tieneConexionOneDrive } from "@/services/onedriveService";

export default function Documentos() {
  const { user } = useAuth();
  const [connected, setConnected] = useState(() => !!user && tieneConexionOneDrive(user.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const config = configuracionOneDrive();
  async function connect() {
    if (!user) return;
    setBusy(true); setError(null);
    try { await iniciarAutenticacionOneDrive(user.id); }
    catch (e) { setError(e instanceof Error ? e.message : "No pudimos iniciar la conexión."); setBusy(false); }
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow">ARIZA ONE / DOCUMENTOS</span><h1>Centro documental</h1><p>Conecta el espacio donde guardarás los documentos de tu operación.</p></div></div>
    <section className="pending-panel" aria-labelledby="onedrive-title">
      <div className="pending-symbol"><Cloud size={38} strokeWidth={1.5} /></div>
      <span className="eyebrow">MICROSOFT ONEDRIVE</span>
      <h2 id="onedrive-title">{connected ? "OneDrive conectado en esta pestaña" : "Tus documentos, con un lugar propio."}</h2>
      <p>{connected ? "La autorización está guardada para tu usuario mientras esta pestaña permanezca abierta. Desconectar aquí elimina el acceso guardado, sin revocar el permiso en Microsoft." : "Autoriza tu cuenta de Microsoft para preparar el almacenamiento de documentos de Distribuciones Ariza."}</p>
      {config.error && <p role="status">{config.error}</p>}
      {error && <p role="alert">{error}</p>}
      {connected ? <Button variant="outline" onClick={() => { cerrarSesionOneDrive(); setConnected(false); }}>Desconectar OneDrive</Button> : <Button disabled={!!config.error || busy} onClick={() => void connect()}><Link2 size={16} />{busy ? "Abriendo Microsoft…" : "Conectar OneDrive"}</Button>}
    </section>
    <section className="pending-panel"><FileText size={28} aria-hidden="true" /><h2>El archivo documental será el siguiente paso</h2><p>La subida, el listado y la vinculación de archivos a remisiones todavía están pendientes. Puedes seguir descargando los PDF desde cada remisión.</p></section>
  </>;
}
