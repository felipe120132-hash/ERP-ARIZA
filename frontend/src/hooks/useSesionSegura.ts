import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ModalSesionAviso } from "@/components/layout/ModalSesionAviso";
import { authService } from "@/services/authService";
import {
  AVISO_PREVIO_ABSOLUTO_MS,
  AVISO_PREVIO_MS,
  CLAVE_LOGOUT_EVENTO,
  CLAVE_MENSAJE_LOGOUT,
  CLAVE_ULTIMA_ACTIVIDAD,
  INTERVALO_COMPROBACION_MS,
  MENSAJE_DURACION_MAXIMA,
  MENSAJE_INACTIVIDAD,
  THROTTLE_ACTIVIDAD_MS,
  comprobarExpiracionSesion,
  limpiarClavesSesionAriza,
  type MotivoExpiracion,
} from "@/config/sesion";

export type MotivoCierre = MotivoExpiracion | "manual" | "remoto";

export interface UseSesionSeguraReturn {
  sesionValida: boolean;
  modalAviso: ReactNode;
  reiniciarActividad: () => void;
  cerrarSesion: (motivo?: MotivoCierre) => Promise<void>;
}

function leerMotivoStorage(valor: string): MotivoCierre {
  try {
    const parsed: unknown = JSON.parse(valor);
    if (typeof parsed !== "object" || parsed === null || !("motivo" in parsed)) {
      return "remoto";
    }
    const motivo = (parsed as { motivo?: unknown }).motivo;
    if (
      motivo === "inactividad" ||
      motivo === "tiempo_maximo" ||
      motivo === "manual" ||
      motivo === "remoto"
    ) {
      return motivo;
    }
  } catch {
    /* ignore */
  }
  return "remoto";
}

export function useSesionSegura(): UseSesionSeguraReturn {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sesionValida, setSesionValida] = useState(() => {
    if (!user) return false;
    return !comprobarExpiracionSesion(user).expirada;
  });
  const [tipoAviso, setTipoAviso] = useState<MotivoExpiracion | null>(null);
  const [segundosRestantes, setSegundosRestantes] = useState(0);
  const ultimaEscrituraRef = useRef(Date.now());
  const cerrandoRef = useRef(false);

  const cerrarSesion = useCallback(
    async (motivo: MotivoCierre = "manual", esRemoto = false) => {
      if (cerrandoRef.current) return;
      cerrandoRef.current = true;
      setSesionValida(false);
      setTipoAviso(null);

      const mensaje =
        motivo === "inactividad"
          ? MENSAJE_INACTIVIDAD
          : motivo === "tiempo_maximo"
            ? MENSAJE_DURACION_MAXIMA
            : undefined;

      if (mensaje) {
        try {
          sessionStorage.setItem(CLAVE_MENSAJE_LOGOUT, mensaje);
        } catch {
          /* ignore */
        }
      }

      if (!esRemoto && motivo !== "remoto") {
        try {
          localStorage.setItem(
            CLAVE_LOGOUT_EVENTO,
            JSON.stringify({ timestamp: Date.now(), motivo }),
          );
        } catch {
          /* ignore */
        }
      }

      limpiarClavesSesionAriza();

      try {
        await authService.signOut();
      } catch {
        /* el redirect a login ocurre igual */
      }

      navigate("/login", {
        replace: true,
        state: mensaje ? { mensaje } : undefined,
      });
    },
    [navigate],
  );

  const registrarActividad = useCallback(() => {
    if (!user || cerrandoRef.current) return;
    const ahora = Date.now();
    if (ahora - ultimaEscrituraRef.current < THROTTLE_ACTIVIDAD_MS) return;
    ultimaEscrituraRef.current = ahora;
    try {
      localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, ahora.toString());
    } catch {
      /* ignore */
    }
  }, [user]);

  const reiniciarActividad = useCallback(() => {
    if (cerrandoRef.current) return;
    const ahora = Date.now();
    ultimaEscrituraRef.current = ahora;
    try {
      localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, ahora.toString());
    } catch {
      /* ignore */
    }
    setTipoAviso(null);
  }, []);

  const verificarEstado = useCallback(() => {
    if (!user || cerrandoRef.current) return;
    const estado = comprobarExpiracionSesion(user);
    if (estado.expirada) {
      void cerrarSesion(estado.motivo ?? "inactividad");
      return;
    }
    const { tiempoRestanteAbsolutoMs, tiempoRestanteInactividadMs } = estado;
    if (
      tiempoRestanteAbsolutoMs !== undefined &&
      tiempoRestanteAbsolutoMs <= AVISO_PREVIO_ABSOLUTO_MS
    ) {
      setTipoAviso("tiempo_maximo");
      setSegundosRestantes(Math.max(0, Math.ceil(tiempoRestanteAbsolutoMs / 1000)));
      return;
    }
    if (
      tiempoRestanteInactividadMs !== undefined &&
      tiempoRestanteInactividadMs <= AVISO_PREVIO_MS
    ) {
      setTipoAviso("inactividad");
      setSegundosRestantes(
        Math.max(0, Math.ceil(tiempoRestanteInactividadMs / 1000)),
      );
      return;
    }
    setTipoAviso(null);
  }, [user, cerrarSesion]);

  useEffect(() => {
    if (!user) return;

    const estadoInicial = comprobarExpiracionSesion(user);
    if (estadoInicial.expirada) {
      void cerrarSesion(estadoInicial.motivo ?? "inactividad");
      return;
    }

    try {
      if (!localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD)) {
        localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, Date.now().toString());
      }
    } catch {
      /* ignore */
    }

    const eventosActividad = [
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
    ] as const;
    const onActividad = () => {
      registrarActividad();
    };
    for (const evento of eventosActividad) {
      window.addEventListener(evento, onActividad, { passive: true });
    }

    const onVisibilidad = () => {
      if (document.visibilityState === "visible") {
        verificarEstado();
        registrarActividad();
      }
    };
    const onFoco = () => {
      verificarEstado();
      registrarActividad();
    };
    const onStorage = (evento: StorageEvent) => {
      if (evento.key === CLAVE_LOGOUT_EVENTO && evento.newValue) {
        void cerrarSesion(leerMotivoStorage(evento.newValue), true);
        return;
      }
      if (evento.key === CLAVE_ULTIMA_ACTIVIDAD && evento.newValue === null) {
        void cerrarSesion("remoto", true);
        return;
      }
      if (evento.key === CLAVE_ULTIMA_ACTIVIDAD && evento.newValue) {
        const ms = Number(evento.newValue);
        if (!Number.isNaN(ms) && ms > 0) {
          ultimaEscrituraRef.current = ms;
          setTipoAviso((prev) => (prev === "inactividad" ? null : prev));
        }
      }
    };

    document.addEventListener("visibilitychange", onVisibilidad);
    window.addEventListener("focus", onFoco);
    window.addEventListener("storage", onStorage);

    const intervaloMs = tipoAviso !== null ? 1000 : INTERVALO_COMPROBACION_MS;
    const intervalId = window.setInterval(() => {
      verificarEstado();
    }, intervaloMs);

    return () => {
      for (const evento of eventosActividad) {
        window.removeEventListener(evento, onActividad);
      }
      document.removeEventListener("visibilitychange", onVisibilidad);
      window.removeEventListener("focus", onFoco);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(intervalId);
    };
  }, [user, tipoAviso, registrarActividad, verificarEstado, cerrarSesion]);

  const modalAviso =
    tipoAviso !== null
      ? createElement(ModalSesionAviso, {
          tipo: tipoAviso,
          segundosRestantes,
          onSeguirConectado:
            tipoAviso === "inactividad" ? reiniciarActividad : undefined,
          onCerrarSesion: () => {
            void cerrarSesion("manual");
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