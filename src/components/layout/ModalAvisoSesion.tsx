import React from 'react';
import { createPortal } from 'react-dom';

export interface ModalAvisoSesionProps {
  tipo: 'inactividad' | 'tiempo_maximo';
  segundosRestantes: number;
  onSeguirConectado?: () => void;
  onCerrarSesion?: () => void;
}

export const ModalAvisoSesion: React.FC<ModalAvisoSesionProps> = ({
  tipo,
  segundosRestantes,
  onSeguirConectado,
  onCerrarSesion,
}) => {
  const formatearTiempo = (segundos: number): string => {
    if (segundos < 60) {
      return `${segundos} segundo${segundos === 1 ? '' : 's'}`;
    }
    const mins = Math.floor(segundos / 60);
    const segs = segundos % 60;
    return `${mins} min${segs > 0 ? ` ${segs} s` : ''}`;
  };

  const contenido = (
    <div
      className="modal-sesion-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-sesion-titulo"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '1rem',
      }}
    >
      <div
        className="modal-sesion-contenido"
        style={{
          background: '#ffffff',
          color: '#1f2937',
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          textAlign: 'center',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: tipo === 'inactividad' ? '#fef3c7' : '#fee2e2',
            color: tipo === 'inactividad' ? '#d97706' : '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            margin: '0 auto 1.25rem',
          }}
        >
          {tipo === 'inactividad' ? '⏱️' : '⚠️'}
        </div>

        <h3
          id="modal-sesion-titulo"
          style={{
            margin: '0 0 0.75rem',
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#111827',
          }}
        >
          {tipo === 'inactividad'
            ? 'Tu sesión se cerrará por inactividad'
            : 'Tu sesión está a punto de vencer'}
        </h3>

        <p
          style={{
            margin: '0 0 1.5rem',
            fontSize: '0.95rem',
            lineHeight: 1.5,
            color: '#4b5563',
          }}
        >
          {tipo === 'inactividad' ? (
            <>
              Has estado inactivo. Tu sesión se cerrará automáticamente en{' '}
              <strong style={{ color: '#d97706', fontSize: '1.05rem' }}>
                {formatearTiempo(segundosRestantes)}
              </strong>{' '}
              para proteger tu cuenta.
            </>
          ) : (
            <>
              Por seguridad, las sesiones tienen un límite máximo de 8 horas. Tu sesión se cerrará
              en{' '}
              <strong style={{ color: '#dc2626', fontSize: '1.05rem' }}>
                {formatearTiempo(segundosRestantes)}
              </strong>{' '}
              (sin posibilidad de extender). Guarda tus cambios antes de que finalice.
            </>
          )}
        </p>

        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
            marginTop: '1.5rem',
          }}
        >
          {tipo === 'inactividad' && onSeguirConectado && (
            <button
              type="button"
              onClick={onSeguirConectado}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.65rem 1.5rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1d4ed8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb';
              }}
            >
              Seguir conectado
            </button>
          )}

          {onCerrarSesion && (
            <button
              type="button"
              onClick={onCerrarSesion}
              style={{
                backgroundColor: tipo === 'inactividad' ? '#f3f4f6' : '#dc2626',
                color: tipo === 'inactividad' ? '#374151' : '#ffffff',
                border: tipo === 'inactividad' ? '1px solid #d1d5db' : 'none',
                borderRadius: '8px',
                padding: '0.65rem 1.25rem',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  tipo === 'inactividad' ? '#e5e7eb' : '#b91c1c';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor =
                  tipo === 'inactividad' ? '#f3f4f6' : '#dc2626';
              }}
            >
              Cerrar sesión ahora
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(contenido, document.body) : contenido;
};

export default ModalAvisoSesion;
