import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useSesionSegura } from '../../hooks/useSesionSegura';

const ContenidoProtegidoConSesion: React.FC = () => {
  const { modalAviso, sesionValida } = useSesionSegura();

  // Si la sesión ha vencido (por inactividad o tiempo absoluto), no renderizar contenido
  if (!sesionValida) {
    return null;
  }

  return (
    <>
      {modalAviso}
      <Outlet />
    </>
  );
};

export const LayoutProtegido: React.FC = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '50vh',
        }}
      >
        <p>Cargando sesión y permisos...</p>
      </div>
    );
  }

  // Si no hay usuario autenticado, redirigir al login guardando la ruta previa
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Montado una sola vez con sesión activa
  return <ContenidoProtegidoConSesion />;
};

export default LayoutProtegido;
