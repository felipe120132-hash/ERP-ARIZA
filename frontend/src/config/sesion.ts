/**
 * Tiempos de inactividad, duración máxima absoluta, avisos previos y claves de almacenamiento.
 */

export const PREFIJO_SESION = "ariza_";

export const CLAVE_ULTIMA_ACTIVIDAD = `${PREFIJO_SESION}ultima_actividad`;
export const CLAVE_INICIO_SESION = `${PREFIJO_SESION}inicio_sesion`;
export const CLAVE_LOGOUT_EVENTO = `${PREFIJO_SESION}logout_evento`;
export const CLAVE_MENSAJE_LOGOUT = `${PREFIJO_SESION}mensaje_logout`;

export const MENSAJE_INACTIVIDAD = "Tu sesión se cerró por inactividad.";
export const MENSAJE_DURACION_MAXIMA =
  "Tu sesión se cerró por haber superado las 8 horas. Inicia sesión de nuevo.";

const leerEntorno = (nombre: string): string | undefined => {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env) {
      const valor = import.meta.env[nombre];
      if (typeof valor === "string") return valor;
    }
  } catch {
    /* entorno no disponible */
  }
  try {
    const globalProcess = (
      globalThis as unknown as {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process;
    const valor = globalProcess?.env?.[nombre];
    if (typeof valor === "string") return valor;
  } catch {
    /* Node no disponible */
  }
  return undefined;
};

const minutosInactividad = Number(leerEntorno("VITE_SESION_INACTIVIDAD_MIN"));
export const INACTIVIDAD_MIN =
  Number.isFinite(minutosInactividad) && minutosInactividad > 0
    ? minutosInactividad
    : 30;
export const INACTIVIDAD_MS = INACTIVIDAD_MIN * 60 * 1000;

const horasMaximas = Number(leerEntorno("VITE_SESION_MAXIMA_HORAS"));
export const DURACION_MAXIMA_HORAS =
  Number.isFinite(horasMaximas) && horasMaximas > 0 ? horasMaximas : 8;
export const DURACION_MAXIMA_MS = DURACION_MAXIMA_HORAS * 60 * 60 * 1000;

export const AVISO_PREVIO_MS =
  INACTIVIDAD_MS <= 60 * 1000
    ? Math.floor(INACTIVIDAD_MS / 2)
    : 60 * 1000;

export const AVISO_PREVIO_ABSOLUTO_MS =
  DURACION_MAXIMA_MS <= 10 * 60 * 1000
    ? Math.floor(DURACION_MAXIMA_MS / 3)
    : 5 * 60 * 1000;

export const THROTTLE_ACTIVIDAD_MS = 15 * 1000;

export const INTERVALO_COMPROBACION_MS =
  INACTIVIDAD_MS <= 60 * 1000 || DURACION_MAXIMA_MS <= 120 * 1000
    ? 1000
    : 15 * 1000;

export type MotivoExpiracion = "inactividad" | "tiempo_maximo";

export interface EstadoExpiracion {
  expirada: boolean;
  motivo?: MotivoExpiracion;
  mensaje?: string;
  tiempoRestanteInactividadMs?: number;
  tiempoRestanteAbsolutoMs?: number;
}

export function obtenerInicioSesionMs(
  user?: { last_sign_in_at?: string | null } | null,
): number {
  if (user?.last_sign_in_at) {
    const parsed = new Date(user.last_sign_in_at).getTime();
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  try {
    const guardado = localStorage.getItem(CLAVE_INICIO_SESION);
    if (guardado) {
      const parsed = Number(guardado);
      if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }
    const ahora = Date.now();
    localStorage.setItem(CLAVE_INICIO_SESION, ahora.toString());
    return ahora;
  } catch {
    return Date.now();
  }
}

export function comprobarExpiracionSesion(
  user?: { last_sign_in_at?: string | null } | null,
): EstadoExpiracion {
  const ahora = Date.now();
  const inicioSesionMs = obtenerInicioSesionMs(user);
  const tiempoRestanteAbsolutoMs = DURACION_MAXIMA_MS - (ahora - inicioSesionMs);

  if (tiempoRestanteAbsolutoMs <= 0) {
    return {
      expirada: true,
      motivo: "tiempo_maximo",
      mensaje: MENSAJE_DURACION_MAXIMA,
      tiempoRestanteInactividadMs: 0,
      tiempoRestanteAbsolutoMs: 0,
    };
  }

  try {
    const ultimaActividadStr = localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD);
    if (ultimaActividadStr) {
      const ultimaActividadMs = Number(ultimaActividadStr);
      if (!Number.isNaN(ultimaActividadMs) && ultimaActividadMs > 0) {
        const tiempoRestanteInactividadMs =
          INACTIVIDAD_MS - (ahora - ultimaActividadMs);
        if (tiempoRestanteInactividadMs <= 0) {
          return {
            expirada: true,
            motivo: "inactividad",
            mensaje: MENSAJE_INACTIVIDAD,
            tiempoRestanteInactividadMs: 0,
            tiempoRestanteAbsolutoMs,
          };
        }
        return {
          expirada: false,
          tiempoRestanteInactividadMs,
          tiempoRestanteAbsolutoMs,
        };
      }
    }
  } catch {
    /* localStorage no disponible: se trata como sesión vigente */
  }

  return {
    expirada: false,
    tiempoRestanteInactividadMs: INACTIVIDAD_MS,
    tiempoRestanteAbsolutoMs,
  };
}

export function limpiarClavesSesionAriza(): void {
  try {
    const claves: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIJO_SESION)) claves.push(key);
    }
    for (const key of claves) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function reiniciarMarcasSesion(): void {
  const ahora = Date.now().toString();
  try {
    localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, ahora);
    localStorage.setItem(CLAVE_INICIO_SESION, ahora);
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(CLAVE_MENSAJE_LOGOUT);
  } catch {
    /* ignore */
  }
}
