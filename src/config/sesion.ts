/**
 * Configuración centralizada de seguridad de sesiones de ArizaERP.
 * Define tiempos de inactividad, duración máxima absoluta, avisos previos y claves de localStorage.
 */

// Prefijo obligatorio para todas las claves en almacenamiento local
export const PREFIJO_SESION = 'ariza_';

// Claves de localStorage
export const CLAVE_ULTIMA_ACTIVIDAD = `${PREFIJO_SESION}ultima_actividad`;
export const CLAVE_INICIO_SESION = `${PREFIJO_SESION}inicio_sesion`;
export const CLAVE_LOGOUT_EVENTO = `${PREFIJO_SESION}logout_evento`;
export const CLAVE_MENSAJE_LOGOUT = `${PREFIJO_SESION}mensaje_logout`;

// Mensajes estándar de cierre de sesión
export const MENSAJE_INACTIVIDAD = 'Tu sesión se cerró por inactividad';
export const MENSAJE_DURACION_MAXIMA =
  'Tu sesión se cerró por haber superado las 8 horas. Inicia sesión de nuevo';

// Helper para leer variables de entorno en Vite (import.meta.env) o en Node/pruebas
const obtenerVarEntorno = (nombre: string): string | undefined => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[nombre] !== undefined) {
      return import.meta.env[nombre];
    }
  } catch {
    // ignore
  }
  try {
    const globalProcess = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
    if (globalProcess?.env && globalProcess.env[nombre] !== undefined) {
      return globalProcess.env[nombre];
    }
  } catch {
    // ignore
  }
  return undefined;
};

// Lectura de variables de entorno con valores predeterminados
const envInactividadMin = obtenerVarEntorno('VITE_SESION_INACTIVIDAD_MIN');
const parsedInactividadMin =
  envInactividadMin !== undefined && envInactividadMin !== ''
    ? Number(envInactividadMin)
    : NaN;

// Tiempo de inactividad (30 minutos por defecto)
export const INACTIVIDAD_MIN =
  !isNaN(parsedInactividadMin) && parsedInactividadMin > 0
    ? parsedInactividadMin
    : 30;

export const INACTIVIDAD_MS = INACTIVIDAD_MIN * 60 * 1000;

const envMaxHoras = obtenerVarEntorno('VITE_SESION_MAXIMA_HORAS');
const parsedMaxHoras =
  envMaxHoras !== undefined && envMaxHoras !== '' ? Number(envMaxHoras) : NaN;

// Duración máxima absoluta de sesión (8 horas por defecto)
export const DURACION_MAXIMA_HORAS =
  !isNaN(parsedMaxHoras) && parsedMaxHoras > 0 ? parsedMaxHoras : 8;

export const DURACION_MAXIMA_MS = DURACION_MAXIMA_HORAS * 60 * 60 * 1000;

// Aviso previo por inactividad: 1 minuto antes (60s). Si la inactividad total es <= 1 minuto (modo pruebas),
// se activa a la mitad del tiempo total (ej. a los 30s para 1 minuto).
export const AVISO_PREVIO_MS =
  INACTIVIDAD_MS <= 60 * 1000
    ? Math.floor(INACTIVIDAD_MS / 2)
    : 60 * 1000;

// Aviso previo por duración máxima absoluta: 5 minutos antes. Si la duración es breve (modo pruebas),
// se activa al tercio restante.
export const AVISO_PREVIO_ABSOLUTO_MS =
  DURACION_MAXIMA_MS <= 10 * 60 * 1000
    ? Math.floor(DURACION_MAXIMA_MS / 3)
    : 5 * 60 * 1000;

// Límite de throttle para registrar eventos de actividad en localStorage (15 segundos)
export const THROTTLE_ACTIVIDAD_MS =
  INACTIVIDAD_MS < 60 * 1000 ? 5 * 1000 : 15 * 1000;

// Frecuencia de comprobación con setInterval (15 segundos por defecto, o 1 segundo en pruebas breves)
export const INTERVALO_COMPROBACION_MS =
  INACTIVIDAD_MS <= 60 * 1000 || DURACION_MAXIMA_MS <= 120 * 1000
    ? 1000
    : 15 * 1000;

export interface EstadoExpiracion {
  expirada: boolean;
  motivo?: 'inactividad' | 'tiempo_maximo';
  mensaje?: string;
  tiempoRestanteInactividadMs?: number;
  tiempoRestanteAbsolutoMs?: number;
}

/**
 * Obtiene o inicializa la marca temporal de inicio de sesión en milisegundos.
 * Prioriza session.user.last_sign_in_at y utiliza ariza_inicio_sesion como respaldo.
 */
export function obtenerInicioSesionMs(user?: { last_sign_in_at?: string | null } | null): number {
  if (user?.last_sign_in_at) {
    const parsed = new Date(user.last_sign_in_at).getTime();
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  try {
    const guardado = localStorage.getItem(CLAVE_INICIO_SESION);
    if (guardado) {
      const parsed = Number(guardado);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    const ahora = Date.now();
    localStorage.setItem(CLAVE_INICIO_SESION, ahora.toString());
    return ahora;
  } catch {
    return Date.now();
  }
}

/**
 * Evalúa si la sesión ha expirado por inactividad o por duración máxima absoluta.
 */
export function comprobarExpiracionSesion(
  user?: { last_sign_in_at?: string | null } | null
): EstadoExpiracion {
  const ahora = Date.now();

  // 1. Cierre forzado absoluto
  const inicioSesionMs = obtenerInicioSesionMs(user);
  const tiempoTranscurrido = ahora - inicioSesionMs;
  const tiempoRestanteAbsolutoMs = DURACION_MAXIMA_MS - tiempoTranscurrido;

  if (tiempoTranscurrido >= DURACION_MAXIMA_MS) {
    return {
      expirada: true,
      motivo: 'tiempo_maximo',
      mensaje: MENSAJE_DURACION_MAXIMA,
      tiempoRestanteInactividadMs: 0,
      tiempoRestanteAbsolutoMs: 0,
    };
  }

  // 2. Cierre por inactividad
  try {
    const ultimaActividadStr = localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD);
    if (ultimaActividadStr) {
      const ultimaActividadMs = Number(ultimaActividadStr);
      if (!isNaN(ultimaActividadMs) && ultimaActividadMs > 0) {
        const tiempoInactivo = ahora - ultimaActividadMs;
        const tiempoRestanteInactividadMs = INACTIVIDAD_MS - tiempoInactivo;

        if (tiempoInactivo >= INACTIVIDAD_MS) {
          return {
            expirada: true,
            motivo: 'inactividad',
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
    // Si localStorage falla, asumimos sesión válida inicial
  }

  return {
    expirada: false,
    tiempoRestanteInactividadMs: INACTIVIDAD_MS,
    tiempoRestanteAbsolutoMs,
  };
}

/**
 * Elimina todas las claves con el prefijo ariza_ de localStorage.
 */
export function limpiarClavesSesionAriza(): void {
  try {
    const clavesABorrar: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIJO_SESION)) {
        clavesABorrar.push(key);
      }
    }
    for (const k of clavesABorrar) {
      localStorage.removeItem(k);
    }
  } catch (err) {
    console.error('Error al limpiar claves ariza_ de localStorage:', err);
  }
}
