import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
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
  return <Outlet />;
}
