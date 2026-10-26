import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { CLAVE_MENSAJE_LOGOUT } from '../config/sesion';

export const Login: React.FC = () => {
  const { signIn, user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorLogin, setErrorLogin] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mensajeSesion, setMensajeSesion] = useState<string | null>(null);

  useEffect(() => {
    // Si ya está autenticado y no está cargando, redirigir al dashboard
    if (user && !loading) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    // 1. Obtener mensaje proveniente del estado de navegación de react-router
    const estado = location.state as { mensaje?: string } | null;
    if (estado?.mensaje) {
      setMensajeSesion(estado.mensaje);
      return;
    }

    // 2. Fallback de persistencia en sessionStorage
    try {
      const guardado = sessionStorage.getItem(CLAVE_MENSAJE_LOGOUT);
      if (guardado) {
        setMensajeSesion(guardado);
        sessionStorage.removeItem(CLAVE_MENSAJE_LOGOUT);
      }
    } catch {
      // ignore
    }
  }, [location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorLogin(null);

    if (!email || !password) {
      setErrorLogin('Por favor ingresa correo y contraseña.');
      return;
    }

    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    setIsSubmitting(false);

    if (error) {
      setErrorLogin(error);
    } else {
      navigate('/dashboard', { replace: true });
    }
  };

  return (
    <div
      className="page login-page"
      style={{
        maxWidth: '420px',
        margin: '3rem auto',
        padding: '2rem',
        borderRadius: '10px',
        backgroundColor: '#ffffff',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      }}
    >
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#111827' }}>
        Iniciar Sesión
      </h2>

      {/* Banner de aviso cuando la sesión fue cerrada automáticamente */}
      {mensajeSesion && (
        <div
          role="alert"
          style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            color: '#92400e',
            padding: '0.875rem 1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            fontSize: '0.925rem',
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <span>{mensajeSesion}</span>
        </div>
      )}

      {errorLogin && (
        <div
          role="alert"
          style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            color: '#991b1b',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            marginBottom: '1.25rem',
            fontSize: '0.9rem',
          }}
        >
          {errorLogin}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label
            htmlFor="email-input"
            style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 500, color: '#374151' }}
          >
            Correo Electrónico
          </label>
          <input
            id="email-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="usuario@arizaerp.com"
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.95rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="password-input"
            style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', fontWeight: 500, color: '#374151' }}
          >
            Contraseña
          </label>
          <input
            id="password-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.95rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || loading}
          style={{
            marginTop: '0.5rem',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '0.75rem',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: isSubmitting || loading ? 'not-allowed' : 'pointer',
            opacity: isSubmitting || loading ? 0.7 : 1,
            transition: 'background-color 0.2s',
          }}
        >
          {isSubmitting ? 'Iniciando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
};

export default Login;
