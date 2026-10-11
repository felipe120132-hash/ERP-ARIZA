import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  presupuestosService,
  ErrorPresupuesto,
} from "@/services/presupuestosService";
import type { Presupuesto } from "@/types/schemas";
import { formatCOP } from "@/lib/cartera";
export default function PresupuestoEditor({
  month,
  userId,
  onClose,
  onRecorded,
}: {
  month: string;
  userId: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const mes = month + "-01",
    key = `ariza:presupuesto-pendiente:${userId}:${month}`;
  const [previous, setPrevious] = useState<Presupuesto | null>(null),
    [amount, setAmount] = useState(""),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState(""),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  });
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError("");
    setReview(false);
    presupuestosService
      .consultar(mes)
      .then((p) => {
        if (live) {
          setPrevious(p);
          setAmount(p ? String(p.presupuesto_limite) : "");
        }
      })
      .catch((e) => {
        if (live)
          setLoadError(
            e instanceof Error ? e.message : "Consulta no disponible.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [mes, attempt]);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  const valid =
    /^\d+(\.\d{1,2})?$/.test(amount) &&
    Number(amount) <= 9999999999.99 &&
    Number(amount) >= 0;
  function clear() {
    sessionStorage.removeItem(key);
    setPending(null);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      !valid ||
      lock.current ||
      pending !== null ||
      loading ||
      loadError ||
      saved
    )
      return;
    if (!review) {
      setReview(true);
      setError("");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    let sent = false;
    try {
      await presupuestosService.guardar(mes, Number(amount), previous, () => {
        sessionStorage.setItem(key, amount);
        setPending(amount);
        sent = true;
      });
      clear();
      setSaved(true);
      onRecorded();
    } catch (e) {
      if (sent && e instanceof ErrorPresupuesto && !e.incierto) {
        clear();
        setLoadError("Actualiza la consulta antes de volver a guardar.");
      }
      setError(
        e instanceof Error ? e.message : "No se pudo confirmar el guardado.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function reconcile() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const p = await presupuestosService.consultar(mes);
      if (p && p.presupuesto_limite === Number(pending)) {
        clear();
        setAmount(String(p.presupuesto_limite));
        setSaved(true);
        onRecorded();
      } else {
        setPrevious(p);
        setAmount(p ? String(p.presupuesto_limite) : "");
        clear();
        setReview(false);
        setError(
          "El importe enviado no aparece en la consulta actual. Revisa el valor vigente antes de preparar otro cambio.",
        );
        onRecorded();
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos comprobar el presupuesto.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v && !lock.current) onClose();
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
          <SheetDescription>FINANZAS / LÍMITE MENSUAL</SheetDescription>
          <SheetTitle>Gestionar presupuesto</SheetTitle>
        </SheetHeader>
        <div className="abono-body">
          <p className="catalog-footnote">
            Mes: {month} · Valores en pesos colombianos.
          </p>
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          {saved ? (
            <div className="empty-state" role="status">
              <h2>Presupuesto guardado</h2>
              <strong>{formatCOP(Number(amount))}</strong>
              <p>Mes {month}. El resumen se está consultando de nuevo.</p>
              <Button onClick={onClose}>Volver a finanzas</Button>
            </div>
          ) : pending !== null ? (
            <div className="warning-box" role="alert">
              <h3>Guardado pendiente de verificar</h3>
              <p>
                Importe enviado: {formatCOP(Number(pending))}. Consulta el
                resultado antes de volver a guardar.
              </p>
              <Button disabled={busy} onClick={() => void reconcile()}>
                Consultar resultado del presupuesto
              </Button>
            </div>
          ) : loading ? (
            <p role="status">Consultando presupuesto…</p>
          ) : loadError ? (
            <div role="alert">
              <p>{loadError}</p>
              <Button
                onClick={() => {
                  setError("");
                  setAttempt((x) => x + 1);
                }}
              >
                Reintentar presupuesto
              </Button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <fieldset className="finance-form" disabled={busy}>
                {review ? (
                  <div className="finance-review">
                    <span className="eyebrow">REVISIÓN DEL PRESUPUESTO</span>
                    <h2>{month}</h2>
                    <p>
                      Actual:{" "}
                      {previous
                        ? formatCOP(previous.presupuesto_limite)
                        : "Sin presupuesto definido"}
                    </p>
                    <strong>{formatCOP(Number(amount))}</strong>
                    <p>
                      Este será el límite de gastos del mes. No modifica gastos
                      ni ventas registrados.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setReview(false)}
                    >
                      Editar límite
                    </Button>
                  </div>
                ) : (
                  <>
                    <Label htmlFor="budget-amount">Límite mensual (COP)</Label>
                    <Input
                      id="budget-amount"
                      type="number"
                      required
                      min="0"
                      max="9999999999.99"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <p className="catalog-footnote">
                      Un límite de cero es válido: cualquier gasto positivo lo
                      excederá.
                    </p>
                  </>
                )}
                <Button disabled={!valid || busy} type="submit">
                  {busy
                    ? "Guardando…"
                    : review
                      ? "Confirmar presupuesto"
                      : "Revisar presupuesto"}
                </Button>
              </fieldset>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
