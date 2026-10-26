import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { supabase } from '../services/supabaseClient';
import {
  CLAVE_ULTIMA_ACTIVIDAD,
  CLAVE_INICIO_SESION,
  CLAVE_LOGOUT_EVENTO,
  CLAVE_MENSAJE_LOGOUT,
  MENSAJE_INACTIVIDAD,
  MENSAJE_DURACION_MAXIMA,
  AVISO_PREVIO_MS,
  AVISO_PREVIO_ABSOLUTO_MS,
  THROTTLE_ACTIVIDAD_MS,
  INTERVALO_COMPROBACION_MS,
  comprobarExpiracionSesion,
  limpiarClavesSesionAriza,
} from '../config/sesion';
import { ModalAvisoSesion } from '../components/layout/ModalAvisoSesion';
import React from 'react';

export type MotivoCierre = 'inactividad' | 'tiempo_maximo' | 'manual' | 'remoto';

export interface UseSesionSeguraReturn {
  sesionValida: boolean;
  modalAviso: React.ReactNode;
  reiniciarActividad: () => void;
  cerrarSesion: (motivo?: MotivoCierre) => Promise<void>;
}

export function useSesionSegura(): UseSesionSeguraReturn {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [sesionValida, setSesionValida] = useState<boolean>(() => {
    if (!user) return false;
    const resultado = comprobarExpiracionSesion(user);
    return !resultado.expirada;
  });

  const [tipoAviso, setTipoAviso] = useState<'inactividad' | 'tiempo_maximo' | null>(null);
  const [segundosRestantes, setSegundosRestantes] = useState<number>(0);

  const ultimaEscrituraRef = useRef<number>(Date.now());
  const cerrandoSesionRef = useRef<boolean>(false);

  // Cierre de sesión centralizado
  const cerrarSesion = useCallback(
    async (motivo: MotivoCierre = 'manual') => {
      if (cerrandoSesionRef.current) return;
      cerrandoSesionRef.current = true;
      setSesionValida(false);
      setTipoAviso(null);

      let mensaje: string | undefined;
      if (motivo === 'inactividad') {
        mensaje = MENSAJE_INACTIVIDAD;
      } else if (motivo === 'tiempo_maximo') {
        mensaje = MENSAJE_DURACION_MAXIMA;
      }

      // 1. Guardar mensaje para la pantalla de Login
      if (mensaje) {
        try {
          sessionStorage.setItem(CLAVE_MENSAJE_LOGOUT, mensaje);
        } catch {
          // ignore
        }
      }

      // 2. Si no es cierre remoto, notificar a las demás pestañas vía storage
      if (motivo !== 'remoto') {
        try {
          localStorage.setItem(
            CLAVE_LOGOUT_EVENTO,
            JSON.stringify({ timestamp: Date.now(), motivo })
          );
        } catch {
          // ignore
        }
      }

      // 3. Limpiar todas las claves de localStorage con prefijo ariza_
      limpiarClavesSesionAriza();

      // 4. Cerrar sesión en el backend de Supabase
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Error al cerrar sesión en Supabase:', err);
      }

      // 5. Redirigir al usuario al Login
      navigate('/login', {
        replace: true,
        state: mensaje ? { mensaje } : undefined,
      });
    },
    [navigate]
  );

  // Registro de actividad con limitación (throttle) de 15 segundos
  const registrarActividad = useCallback(() => {
    if (!user || cerrandoSesionRef.current) return;
    const ahora = Date.now();
    if (ahora - ultimaEscrituraRef.current >= THROTTLE_ACTIVIDAD_MS) {
      ultimaEscrituraRef.current = ahora;
      try {
        localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, ahora.toString());
      } catch {
        // ignore
      }
    }
  }, [user]);

  // Acción explícita para el botón "Seguir conectado" del aviso
  const reiniciarActividad = useCallback(() => {
    if (cerrandoSesionRef.current) return;
    const ahora = Date.now();
    ultimaEscrituraRef.current = ahora;
    try {
      localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, ahora.toString());
    } catch {
      // ignore
    }
    setTipoAviso(null);
  }, []);

  // Función principal de verificación de expiración y umbrales de aviso
  const verificarEstado = useCallback(() => {
    if (!user || cerrandoSesionRef.current) return;

    const estado = comprobarExpiracionSesion(user);

    if (estado.expirada) {
      void cerrarSesion(estado.motivo);
      return;
    }

    const { tiempoRestanteAbsolutoMs, tiempoRestanteInactividadMs } = estado;

    // Prioridad 1: Aviso de duración máxima (sin posibilidad de extensión)
    if (
      tiempoRestanteAbsolutoMs !== undefined &&
      tiempoRestanteAbsolutoMs <= AVISO_PREVIO_ABSOLUTO_MS
    ) {
      setTipoAviso('tiempo_maximo');
      setSegundosRestantes(Math.max(0, Math.ceil(tiempoRestanteAbsolutoMs / 1000)));
      return;
    }

    // Prioridad 2: Aviso de inactividad
    if (
      tiempoRestanteInactividadMs !== undefined &&
      tiempoRestanteInactividadMs <= AVISO_PREVIO_MS
    ) {
      setTipoAviso('inactividad');
      setSegundosRestantes(Math.max(0, Math.ceil(tiempoRestanteInactividadMs / 1000)));
      return;
    }

    // Si los tiempos están dentro de los márgenes seguros, ocultar aviso
    setTipoAviso(null);
  }, [user, cerrarSesion]);

  useEffect(() => {
    if (!user) return;

    // 1. Verificación inmediata al montar
    const estadoInicial = comprobarExpiracionSesion(user);
    if (estadoInicial.expirada) {
      void cerrarSesion(estadoInicial.motivo);
      return;
    }

    // Asegurar registro inicial de actividad si no existía
    if (!localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD)) {
      const ahora = Date.now().toString();
      try {
        localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, ahora);
        if (!localStorage.getItem(CLAVE_INICIO_SESION)) {
          localStorage.setItem(CLAVE_INICIO_SESION, ahora);
        }
      } catch {
        // ignore
      }
    }

    // 2. Escucha de eventos de actividad del usuario
    const eventosActividad: (keyof WindowEventMap)[] = [
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];

    const manejadorActividad = () => {
      registrarActividad();
    };

    eventosActividad.forEach((ev) => {
      window.addEventListener(ev, manejadorActividad, { passive: true });
    });

    // 3. Manejo de reingreso a la pestaña (visibilitychange y focus)
    const manejadorVisibilidad = () => {
      if (document.visibilityState === 'visible') {
        verificarEstado();
        registrarActividad();
      }
    };

    const manejadorFoco = () => {
      verificarEstado();
    };

    document.addEventListener('visibilitychange', manejadorVisibilidad);
    window.addEventListener('focus', manejadorFoco);

    // 4. Manejo de sincronización entre pestañas (evento 'storage')
    const manejadorStorage = (e: StorageEvent) => {
      // Si otra pestaña cerró sesión
      if (e.key === CLAVE_LOGOUT_EVENTO && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as { motivo?: MotivoCierre };
          void cerrarSesion(parsed.motivo || 'remoto');
        } catch {
          void cerrarSesion('remoto');
        }
        return;
      }

      // Si otra pestaña eliminó las claves de sesión
      if (e.key === CLAVE_ULTIMA_ACTIVIDAD && e.newValue === null) {
        void cerrarSesion('manual');
        return;
      }

      // Si otra pestaña registró actividad: se sincroniza y se oculta el aviso de inactividad
      if (e.key === CLAVE_ULTIMA_ACTIVIDAD && e.newValue) {
        const ms = Number(e.newValue);
        if (!isNaN(ms) && ms > 0) {
          ultimaEscrituraRef.current = ms;
          setTipoAviso((prev) => (prev === 'inactividad' ? null : prev));
        }
      }
    };

    window.addEventListener('storage', manejadorStorage);

    // 5. Intervalo periódico de verificación (setInterval)
    // Cuando el modal de aviso está activo se actualiza cada segundo para una cuenta regresiva fluida
    const intervaloMs = tipoAviso !== null ? 1000 : INTERVALO_COMPROBACION_MS;
    const intervalId = window.setInterval(() => {
      verificarEstado();
    }, intervaloMs);

    return () => {
      eventosActividad.forEach((ev) => {
        window.removeEventListener(ev, manejadorActividad);
      });
      document.removeEventListener('visibilitychange', manejadorVisibilidad);
      window.removeEventListener('focus', manejadorFoco);
      window.removeEventListener('storage', manejadorStorage);
      window.clearInterval(intervalId);
    };
  }, [user, tipoAviso, registrarActividad, verificarEstado, cerrarSesion]);

  const modalAviso =
    tipoAviso !== null
      ? React.createElement(ModalAvisoSesion, {
          tipo: tipoAviso,
          segundosRestantes,
          onSeguirConectado: tipoAviso === 'inactividad' ? reiniciarActividad : undefined,
          onCerrarSesion: () => {
            void cerrarSesion('manual');
          },
        })
      : null;

  return {
    sesionValida,
    modalAviso,
    reiniciarActividad,
    cerrarSesion,
  };
}

export default useSesionSegura;
