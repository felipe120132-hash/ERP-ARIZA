import { useEffect, useRef, useState } from "react";
import { Download, Printer, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import { remisionesService } from "@/services/remisionesService";
import { cargarDocumentoRemision } from "@/services/documentoRemisionService";
import type { Remision } from "@/types/schemas";
import { formatCOP } from "@/lib/cartera";
export default function AccionesRemision({
  remision,
  onUpdated,
}: {
  remision: Remision;
  onUpdated: () => void;
}) {
  const { perfil } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [cancel, setCancel] = useState(false);
  const lock = useRef(false);
  async function pdf(print: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const preview = print ? window.open("about:blank", "_blank") : null;
    if (print && !preview) {
      setError("Permite abrir una nueva pestaña para ver e imprimir el PDF.");
      lock.current = false;
      setBusy(false);
      return;
    }
    if (preview) {
      preview.opener = null;
      preview.document.title = "Preparando remisión";
      preview.document.body.textContent = "Preparando PDF…";
    }
    try {
      const [data, { generarRemisionPdf }] = await Promise.all([
        cargarDocumentoRemision(remision.id),
        import("@/lib/remisionPdf"),
      ]);
      const doc = generarRemisionPdf(data);
      if (preview) {
        const url = URL.createObjectURL(doc.output("blob"));
        preview.location.replace(url);
        window.setTimeout(() => URL.revokeObjectURL(url), 300000);
      } else
        doc.save(
          `remision-${data.remision.consecutivo}${data.remision.estado === "ANULADA" ? "-anulada" : ""}.pdf`,
        );
    } catch (e) {
      preview?.close();
      setError(e instanceof Error ? e.message : "No pudimos generar el PDF.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="receipt-tools">
        <Button
          variant="outline"
          disabled={busy || cancel}
          onClick={() => void pdf(false)}
        >
          <Download size={16} />
          {busy ? "Preparando PDF…" : "Descargar PDF"}
        </Button>
        <Button
          variant="outline"
          disabled={busy || cancel}
          onClick={() => void pdf(true)}
        >
          <Printer size={16} />
          Abrir PDF para imprimir
        </Button>
        {perfil?.rol === "ADMIN" && remision.estado !== "ANULADA" && (
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => setCancel(true)}
          >
            <Ban size={16} />
            Anular remisión
          </Button>
        )}
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {cancel && (
        <AnularRemision
          remision={remision}
          onClose={() => setCancel(false)}
          onUpdated={onUpdated}
        />
      )}
    </>
  );
}
function AnularRemision({
  remision,
  onClose,
  onUpdated,
}: {
  remision: Remision;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { user, perfil } = useAuth();
  const key = `ariza:anulacion:${user?.id}:${remision.id}`;
  const [current, setCurrent] = useState<Remision | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [typed, setTyped] = useState(""),
    [success, setSuccess] = useState(false),
    [ack, setAck] = useState(false),
    [uncertain, setUncertain] = useState(() => {
      try {
        return sessionStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    });
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    remisionesService
      .obtenerRemisionPorId(remision.id)
      .then((r) => {
        if (!live) return;
        setCurrent(r.data);
        setError(r.error);
        setLoading(false);
        if (r.data?.estado === "ANULADA") {
          setSuccess(true);
          try {
            sessionStorage.removeItem(key);
          } catch {}
        }
      })
      .catch(() => {
        if (live) {
          setError("No pudimos verificar el estado actual.");
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [remision.id, key]);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  async function verify() {
    setLoading(true);
    setError(null);
    try {
      const r = await remisionesService.obtenerRemisionPorId(remision.id);
      if (r.error || !r.data)
        throw new Error(r.error ?? "No se pudo consultar el estado.");
      setCurrent(r.data);
      if (r.data.estado === "ANULADA") {
        setSuccess(true);
        setUncertain(false);
        try {
          sessionStorage.removeItem(key);
        } catch {}
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo verificar el estado.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function submit() {
    if (
      lock.current ||
      loading ||
      uncertain ||
      success ||
      !current ||
      typed !== String(current.consecutivo) ||
      perfil?.rol !== "ADMIN"
    )
      return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      sessionStorage.setItem(key, "1");
    } catch {}
    try {
      const result = await remisionesService.anularRemision(remision.id);
      if (result.error) {
        setError(result.error);
        if (result.incierto) setUncertain(true);
        else {
          try {
            sessionStorage.removeItem(key);
          } catch {}
          setTyped("");
        }
        return;
      }
      setUncertain(true);
      await verify();
    } catch {
      setError(
        "No recibimos confirmación de la anulación. Consulta el estado antes de intentar nuevamente.",
      );
      setUncertain(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v && !lock.current) {
          if (success) onUpdated();
          onClose();
        }
      }}
    >
      <SheetContent
        className="abono-sheet"
        showCloseButton={!busy}
        onEscapeKeyDown={(e) => {
          if (lock.current) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (lock.current) e.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetDescription>VENTAS / ANULACIÓN</SheetDescription>
          <SheetTitle>Anular remisión #{remision.consecutivo}</SheetTitle>
        </SheetHeader>
        <div className="abono-body">
          {success ? (
            <div role="status" className="empty-state">
              <h2>Remisión anulada</h2>
              <p>El estado fue confirmado por el sistema.</p>
              <Button
                onClick={() => {
                  onUpdated();
                  onClose();
                }}
              >
                Volver al detalle
              </Button>
            </div>
          ) : (
            <>
              <p>
                Esta acción cambiará el estado de la remisión y aplicará las
                reversiones definidas por el sistema. No puede deshacerse desde
                esta pantalla.
              </p>
              <div className="finance-review">
                <strong>{formatCOP((current ?? remision).total)}</strong>
                <p>
                  {current?.estado ?? "Verificando estado…"} ·{" "}
                  {remision.tipo_pago}
                </p>
              </div>
              <p className="catalog-footnote">
                Si existen abonos, revisa la cartera del cliente. Anular no
                equivale a devolver dinero ni a eliminar pagos registrados.
              </p>
              {error && (
                <p className="error-box" role="alert">
                  {error}
                </p>
              )}
              {loading ? (
                <p role="status">Verificando estado…</p>
              ) : uncertain ? (
                <div className="warning-box">
                  <h3>Hay una solicitud sin confirmar</h3>
                  <p>
                    Consulta el estado. No vuelvas a enviar mientras la
                    operación pueda seguir en curso.
                  </p>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => void verify()}
                  >
                    Consultar estado
                  </Button>
                  <label className="finance-check">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                    />
                    Confirmé que la operación anterior terminó sin anular la
                    remisión.
                  </label>
                  <Button
                    disabled={!ack || busy || !current || !!error}
                    onClick={() => {
                      try {
                        sessionStorage.removeItem(key);
                      } catch {}
                      setUncertain(false);
                      setTyped("");
                      setAck(false);
                    }}
                  >
                    Habilitar otro intento
                  </Button>
                </div>
              ) : !current ? (
                <Button onClick={() => void verify()}>Reintentar estado</Button>
              ) : (
                <>
                  <label className="cancel-label" htmlFor="cancel-number">
                    Escribe {current.consecutivo} para confirmar
                  </label>
                  <input
                    className="cancel-input"
                    id="cancel-number"
                    inputMode="numeric"
                    value={typed}
                    disabled={busy}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                  <div className="receipt-tools">
                    <Button variant="outline" disabled={busy} onClick={onClose}>
                      Conservar remisión
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={busy || typed !== String(current.consecutivo)}
                      onClick={() => void submit()}
                    >
                      {busy ? "Anulando…" : "Confirmar anulación"}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
