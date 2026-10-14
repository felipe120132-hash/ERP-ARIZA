/**
 * src/pages/OneDriveCallback.tsx
 *
 * Página de callback para el flujo OAuth2 de Microsoft OneDrive.
 * Recibe el ?code= de la URL tras la autorización, lo intercambia por tokens
 * mediante intercambiarCodigoPorToken(), y redirige a /catalogo si todo sale
 * bien o muestra el error si falla.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { intercambiarCodigoPorToken } from '../services/onedriveService';

const OneDriveCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');

    if (!code) {
      setError(
        'No se recibió el código de autorización de Microsoft. ' +
        'Intenta conectar OneDrive de nuevo.',
      );
      return;
    }

    let cancelled = false;

    (async () => {
      const result = await intercambiarCodigoPorToken(code);

      if (cancelled) return;

      if (result.error) {
        setError(result.error);
      } else {
        navigate('/catalogo', { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '50vh',
        gap: '1rem',
        padding: '2rem',
      }}>
        <h2 style={{ color: '#dc2626' }}>Error al conectar con OneDrive</h2>
        <p style={{ maxWidth: '480px', textAlign: 'center' }}>{error}</p>
        <button
          onClick={() => navigate('/catalogo', { replace: true })}
          style={{
            padding: '0.5rem 1.5rem',
            cursor: 'pointer',
            borderRadius: '0.375rem',
            border: '1px solid #d1d5db',
            background: '#f9fafb',
          }}
        >
          Volver al Catálogo
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '50vh',
      gap: '1rem',
    }}>
      <p style={{ fontSize: '1.125rem' }}>Conectando con OneDrive...</p>
    </div>
  );
};

export default OneDriveCallback;
