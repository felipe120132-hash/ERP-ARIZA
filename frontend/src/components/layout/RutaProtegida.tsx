import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useSesionSegura } from "@/hooks/useSesionSegura";
import {
  CLAVE_MENSAJE_LOGOUT,
  comprobarExpiracionSesion,
  limpiarClavesSesionAriza,
} from "@/config/sesion";
import { authService } from "@/services/authService";

function SesionProtegida() {
  const { sesionValida, modalAviso } = useSesionSegura();
  if (!sesionValida)
    return (
      <div className="session-loading" role="status">
        <div className="brand-mark">A</div>
        <p>Cerrando tu sesión…</p>
      </div>
    );
  return (
    <>
      {modalAviso}
      <Outlet />
    </>
  );
}

export function RutaProtegida() {
  const { user, perfil, loading } = useAuth();
  const location = useLocation();

  if (loading)
    return (
      <div className="session-loading" role="status">
        <div className="brand-mark">A</div>
        <p>Preparando tu espacio…</p>
      </div>
    );

  if (!user || !perfil?.activo)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  const estado = comprobarExpiracionSesion(user);
  if (estado.expirada) {
    limpiarClavesSesionAriza();
    try {
      if (estado.mensaje) {
        sessionStorage.setItem(CLAVE_MENSAJE_LOGOUT, estado.mensaje);
      }
    } catch {
      /* ignore */
    }
    void authService.signOut();
    return <Navigate to="/login" state={{ mensaje: estado.mensaje }} replace />;
  }

  return <SesionProtegida />;
}