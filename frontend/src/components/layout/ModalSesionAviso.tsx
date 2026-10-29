import { createPortal } from "react-dom";

export interface ModalSesionAvisoProps {
  tipo: "inactividad" | "tiempo_maximo";
  segundosRestantes: number;
  onSeguirConectado?: () => void;
  onCerrarSesion?: () => void;
}

function formatearTiempo(segundos: number): string {
  const valor = Math.max(0, segundos);
  if (valor < 60) {
    return `${valor} segundo${valor === 1 ? "" : "s"}`;
  }
  const mins = Math.floor(valor / 60);
  const segs = valor % 60;
  return `${mins} min${segs > 0 ? ` ${segs} s` : ""}`;
}

export function ModalSesionAviso({
  tipo,
  segundosRestantes,
  onSeguirConectado,
  onCerrarSesion,
}: ModalSesionAvisoProps) {
  const inactividad = tipo === "inactividad";
  const contenido = (
    <div
      className="sesion-aviso-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sesion-aviso-titulo"
    >
      <div className={`sesion-aviso-panel ${inactividad ? "inactividad" : "limite"}`}>
        <div className="sesion-aviso-icono" aria-hidden="true">
          {inactividad ? "⏱" : "!"}
        </div>
        <h3 id="sesion-aviso-titulo">
          {inactividad
            ? "Tu sesión se cerrará por inactividad"
            : "Tu sesión está a punto de vencer"}
        </h3>
        <p>
          {inactividad ? (
            <>
              Has estado inactivo. Tu sesión se cerrará automáticamente en{" "}
              <strong>{formatearTiempo(segundosRestantes)}</strong> para proteger
              tu cuenta.
            </>
          ) : (
            <>
              Por seguridad, las sesiones tienen un límite máximo de 8 horas. Tu
              sesión se cerrará en <strong>{formatearTiempo(segundosRestantes)}</strong>{" "}
              (sin posibilidad de extender). Guarda tus cambios antes de que
              finalice.
            </>
          )}
        </p>
        <div className="sesion-aviso-acciones">
          {inactividad && onSeguirConectado && (
            <button
              type="button"
              className="sesion-aviso-seguir"
              onClick={onSeguirConectado}
            >
              Seguir conectado
            </button>
          )}
          {onCerrarSesion && (
            <button
              type="button"
              className={
                inactividad ? "sesion-aviso-cerrar" : "sesion-aviso-cerrar-ahora"
              }
              onClick={onCerrarSesion}
            >
              Cerrar sesión ahora
            </button>
          )}
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined"
    ? createPortal(contenido, document.body)
    : contenido;
}
