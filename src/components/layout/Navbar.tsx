import React from 'react';
import { useAuth } from '../../hooks/useAuth';

export const Navbar: React.FC = () => {
  const { user, perfil, signOut } = useAuth();

  const handleCerrarSesion = async () => {
    await signOut();
  };

  return (
    <header
      className="navbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#ffffff',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#111827' }}>ArizaERP</h1>

      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '0.875rem', color: '#4b5563' }}>
            {perfil?.nombre_completo ? `${perfil.nombre_completo} (${perfil.rol})` : user.email}
          </span>
          <button
            type="button"
            onClick={handleCerrarSesion}
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.85rem',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e5e7eb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
            }}
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </header>
  );
};

export default Navbar;
