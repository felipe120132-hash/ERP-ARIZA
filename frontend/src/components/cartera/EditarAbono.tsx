import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  carteraService,
  type TrazaAbonoEditado,
} from "@/services/carteraService";
import { useAuth } from "@/context/AuthContext";
import {
  formatCOP,
  validarMonto,
  calcularSaldosRemision,
} from "@/lib/cartera";
import type { Cliente, Remision, AbonoCartera } from "@/types/schemas";

export default function EditarAbono({
  cliente,
  abono,
  remisiones,
  abonos,
  onClose,
  onUpdated,
}: {
  cliente: Cliente;
  abono: AbonoCartera;
  remisiones: Remision[];
  abonos: AbonoCartera[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { user } = useAuth();
  const storageKey = `ariza:abono-edicion-incierto:${user?.id}:${abono.id}`;
  const [monto, setMonto] = useState(String(abono.monto)),
    [metodo, setMetodo] = useState<AbonoCartera["metodo_pago"]>(
      abono.metodo_pago,
    ),
    [remision, setRemision] = useState(abono.remision_id ?? ""),
    [motivo, setMotivo] = useState(""),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [success, setSuccess] = useState<TrazaAbonoEditado | null>(null);
  const [uncertain, setUncertain] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  const lock = useRef(false);

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const remisionesElegibles = remisiones.filter(
    (x) =>
      x.cliente_id === cliente.id &&
      x.tipo_pago === "CREDITO" &&
      (x.estado !== "ANULADA" || x.id === abono.remision_id),
  );

  const maxCliente =
    Math.round((cliente.saldo_cartera + abono.monto) * 100) / 100;
  const selectedSale = remisionesElegibles.find((x) => x.id === remision);
  const selectedSaleMax = selectedSale
    ? calcularSaldosRemision(selectedSale, abonos, abono.id).pendiente
    : null;

  const normMontoStr = monto.trim().replace(",", ".");
  const normMonto = Number(normMontoStr);
  const amountError = validarMonto(monto, maxCliente, selectedSaleMax);
  const sinCambios =
    Math.round(normMonto * 100) === Math.round(abono.monto * 100) &&
    metodo === abono.metodo_pago &&
    (remision || null) === (abono.remision_id ?? null);
  const motivoError =
    motivo.trim().length > 0 && motivo.trim().length < 5
      ? "Describe el motivo con al menos 5 caracteres."
      : null;

  const nuevoSaldoPrevisto =
    Math.round((cliente.saldo_cartera + abono.monto - normMonto) * 100) / 100;

  const valid =
    !amountError &&
    !sinCambios &&
    motivo.trim().length >= 5 &&
    motivo.trim().length <= 500 &&
    nuevoSaldoPrevisto >= 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || lock.current || uncertain || success) return;
    if (!review) {
      setReview(true);
      setError(null);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {}
    try {
      const res = await carteraService.editarAbono({
        p_abono_id: abono.id,
        p_cliente_id: cliente.id,
        p_monto: normMonto,
        p_metodo_pago: metodo,
        p_remision_id: remision || null,
        p_motivo: motivo.trim(),
        p_monto_anterior: abono.monto,
        p_saldo_esperado: cliente.saldo_cartera,
      });
      if (res.error || !res.data) {
        setError(res.error ?? "No se pudo confirmar la corrección del abono.");
        if (res.incierto) {
          setUncertain(true);
        } else {
          try {
            sessionStorage.removeItem(storageKey);
          } catch {}
        }
        setReview(false);
        return;
      }
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
      setSuccess(res.data);
      onUpdated();
    } catch {
      setError("No pudimos confirmar el resultado de la corrección.");
      setUncertain(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !lock.current) onClose();
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
          <SheetDescription>CARTERA / CORRECCIÓN CONTROLADA</SheetDescription>
          <SheetTitle>Editar abono</SheetTitle>
        </SheetHeader>
        <div className="abono-body">
          <div className="abono-client">
            <span>Comprobante {abono.id}</span>
            <h3>{cliente.nombre_tienda}</h3>
            <small>
              Saldo actual: {formatCOP(cliente.saldo_cartera)} · Abono original:{" "}
              {formatCOP(abono.monto)}
            </small>
            <strong>Máximo aplicable: {formatCOP(maxCliente)}</strong>
          </div>

          {success ? (
            <div className="abono-success" role="status">
              <CheckCircle2 size={34} />
              <h3>Abono actualizado</h3>
              <p>
                Monto anterior: {formatCOP(success.monto_anterior)} → Nuevo
                monto: {formatCOP(success.monto_nuevo)}
              </p>
              <p>
                Nuevo saldo del cliente:{" "}
                <strong>{formatCOP(success.saldo_resultante)}</strong>
              </p>
              <small>Motivo registrado: {success.motivo}</small>
              <Button type="button" onClick={onClose}>
                Cerrar y ver historial
              </Button>
            </div>
          ) : uncertain ? (
            <div className="uncertain-payment" role="alert">
              <h3>Verifica el saldo antes de reintentar</h3>
              <p>
                La conexión se interrumpió durante la corrección. Revisa el
                historial del cliente antes de volver a enviar para evitar
                aplicar el ajuste dos veces.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  try {
                    sessionStorage.removeItem(storageKey);
                  } catch {}
                  setUncertain(false);
                  onClose();
                }}
              >
                Revisar historial
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="abono-form">
              <fieldset disabled={busy}>
                <Label htmlFor="editar-abono-monto">
                  Nuevo monto del abono (COP)
                </Label>
                <Input
                  id="editar-abono-monto"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  max={
                    selectedSaleMax !== null
                      ? Math.min(maxCliente, selectedSaleMax)
                      : maxCliente
                  }
                  value={monto}
                  onChange={(e) => {
                    setMonto(e.target.value);
                    setReview(false);
                    setError(null);
                  }}
                />
                <p className="field-help">
                  {amountError
                    ? amountError
                    : `El saldo resultante del cliente será ${formatCOP(Math.max(0, nuevoSaldoPrevisto))}.`}
                </p>

                <Label htmlFor="editar-abono-metodo">Método de pago</Label>
                <select
                  id="editar-abono-metodo"
                  value={metodo}
                  onChange={(e) => {
                    setMetodo(e.target.value as AbonoCartera["metodo_pago"]);
                    setReview(false);
                  }}
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="BANCOLOMBIA">Bancolombia</option>
                </select>

                <Label htmlFor="editar-abono-remision">
                  Aplicación del abono
                </Label>
                <select
                  id="editar-abono-remision"
                  value={remision}
                  onChange={(e) => {
                    setRemision(e.target.value);
                    setReview(false);
                  }}
                >
                  <option value="">Abono general a la cartera</option>
                  {remisionesElegibles.map((x) => {
                    const s = calcularSaldosRemision(x, abonos, abono.id);
                    return (
                      <option key={x.id} value={x.id}>
                        Remisión #{x.consecutivo} (Disponible:{" "}
                        {formatCOP(s.pendiente)})
                      </option>
                    );
                  })}
                </select>

                <Label htmlFor="editar-abono-motivo">
                  Motivo de la corrección
                </Label>
                <Input
                  id="editar-abono-motivo"
                  required
                  minLength={5}
                  maxLength={500}
                  placeholder="Ej.: error de digitación en soporte bancario…"
                  value={motivo}
                  onChange={(e) => {
                    setMotivo(e.target.value);
                    setReview(false);
                    setError(null);
                  }}
                />
                {motivoError && <p className="field-help">{motivoError}</p>}
                {sinCambios && (
                  <p className="field-help">
                    Modifica el monto, método o aplicación para registrar una
                    corrección.
                  </p>
                )}
              </fieldset>

              {review && (
                <div className="order-review">
                  <strong>Confirmar corrección de abono</strong>
                  <p>
                    Monto anterior: {formatCOP(abono.monto)} → Nuevo monto:{" "}
                    {formatCOP(normMonto)} ({metodo})
                  </p>
                  <p>
                    Saldo anterior del cliente:{" "}
                    {formatCOP(cliente.saldo_cartera)} →{" "}
                    <strong>
                      Saldo resultante: {formatCOP(nuevoSaldoPrevisto)}
                    </strong>
                  </p>
                  <p>Motivo: {motivo.trim()}</p>
                </div>
              )}

              {error && (
                <div className="error-box" role="alert">
                  {error}
                </div>
              )}

              <Button
                className="w-full"
                type="submit"
                disabled={!valid || busy}
              >
                {busy
                  ? "Actualizando abono…"
                  : review
                    ? "Confirmar corrección"
                    : "Revisar corrección"}
              </Button>
              {review && !busy && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setReview(false)}
                >
                  Seguir editando
                </Button>
              )}
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
