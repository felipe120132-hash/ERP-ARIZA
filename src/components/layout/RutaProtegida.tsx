import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { RolUsuario } from '../../types/schemas';

export interface RutaProtegidaProps {
  children?: React.ReactNode;
  rolesPermitidos?: RolUsuario[];
  redireccionSinPermiso?: string;
}

export const RutaProtegida: React.FC<RutaProtegidaProps> = ({
  children,
  rolesPermitidos,
  redireccionSinPermiso = '/dashboard',
}) => {
  const { user, rol, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <p>Cargando sesión y permisos...</p>
      </div>
    );
  }

  // Si no hay sesión iniciada, redirigir a /login guardando la ruta previa
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Si se especificaron roles permitidos y el rol del usuario no tiene acceso
  if (rolesPermitidos && rolesPermitidos.length > 0) {
    if (!rol || !rolesPermitidos.includes(rol)) {
      return <Navigate to={redireccionSinPermiso} replace />;
    }
  }

  return children ? <>{children}</> : <Outlet />;
};

export default RutaProtegida;
