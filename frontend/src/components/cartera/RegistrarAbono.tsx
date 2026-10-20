import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ArrowRight } from "lucide-react";
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
import { clientesService } from "@/services/clientesService";
import { remisionesService } from "@/services/remisionesService";
import { carteraService } from "@/services/carteraService";
import { useAuth } from "@/context/AuthContext";
import {
  formatCOP,
  validarMonto,
  calcularSaldosRemision,
} from "@/lib/cartera";
import type { Cliente, Remision, AbonoCartera } from "@/types/schemas";
import type { RegistrarAbonoInput } from "@/types/rpcSchemas";
export default function RegistrarAbono({
  clienteId,
  onClose,
  onRecorded,
}: {
  clienteId: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const { user } = useAuth();
  const storageKey = `ariza:abono-incierto:${user?.id}:${clienteId}`;
  const [cliente, setCliente] = useState<Cliente | null>(null),
    [remisiones, setRemisiones] = useState<Remision[]>([]),
    [abonos, setAbonos] = useState<AbonoCartera[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0);
  const [monto, setMonto] = useState(""),
    [metodo, setMetodo] =
      useState<NonNullable<RegistrarAbonoInput["p_metodo_pago"]>>("EFECTIVO"),
    [remision, setRemision] = useState(""),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [success, setSuccess] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      clientesService.obtenerClientePorId(clienteId),
      remisionesService.listarRemisiones({
        cliente_id: clienteId,
        tipo_pago: "CREDITO",
        estado: "PENDIENTE",
      }),
      carteraService.listarAbonos({ cliente_id: clienteId }),
    ])
      .then(([customer, sales, payments]) => {
        if (!active) return;
        setCliente(customer.data);
        setRemisiones(
          (sales.data ?? []).filter(
            (x) =>
              x.cliente_id === clienteId &&
              x.tipo_pago === "CREDITO" &&
              x.estado === "PENDIENTE",
          ),
        );
        setAbonos(
          (payments.data ?? []).filter((x) => x.cliente_id === clienteId),
        );
        setLoadError(customer.error ?? sales.error);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setLoadError("No pudimos verificar el saldo y las remisiones.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [clienteId, attempt]);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  function markUncertain() {
    setUncertain(true);
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* In-memory guard remains active. */
    }
  }
  const selectedSale = remisiones.find((x) => x.id === remision);
  const selectedSaleBalance = selectedSale
    ? calcularSaldosRemision(selectedSale, abonos).pendiente
    : null;
  const amountError = validarMonto(
      monto,
      cliente?.saldo_cartera ?? 0,
      selectedSaleBalance,
    ),
    invalidRemision = !!remision && !remisiones.some((x) => x.id === remision);
  const valid =
    !!cliente && !loading && !loadError && !amountError && !invalidRemision;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || lock.current || uncertain || success) return;
    if (!review) {
      setReview(true);
      return;
    }
    lock.current = true;
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* In-memory lock remains available. */
    }
    setBusy(true);
    setError(null);
    const normMonto = Number(monto.trim().replace(",", "."));
    try {
      const result = await carteraService.registrarAbono({
        p_cliente_id: clienteId,
        p_monto: normMonto,
        p_metodo_pago: metodo,
        p_remision_id: remision || null,
      });
      if (result.error || !result.data) {
        setError(result.error ?? "No recibimos una confirmación.");
        if (result.incierto) markUncertain();
        else {
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
      setSuccess(result.data);
      onRecorded();
    } catch {
      setError("No pudimos confirmar el resultado del abono.");
      markUncertain();
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
          <SheetDescription>CARTERA / NUEVO MOVIMIENTO</SheetDescription>
          <SheetTitle>Registrar abono</SheetTitle>
        </SheetHeader>
        <div className="abono-body">
          {loading ? (
            <p role="status">Verificando saldo y remisiones…</p>
          ) : loadError ? (
            <div className="error-box" role="alert">
              {loadError}
              <Button
                variant="outline"
                onClick={() => setAttempt((x) => x + 1)}
              >
                Reintentar consulta
              </Button>
            </div>
          ) : (
            cliente && (
              <>
                <div className="abono-client">
                  <span>
                    {cliente.tipo_cliente === "TIENDA"
                      ? "Tienda"
                      : "Distribuidor"}
                    {!cliente.activo ? " · Inactivo" : ""}
                  </span>
                  <h3>{cliente.nombre_tienda}</h3>
                  <small>Saldo actual</small>
                  <strong>{formatCOP(cliente.saldo_cartera)}</strong>
                </div>
                {success ? (
                  <div className="abono-success" role="status">
                    <CheckCircle2 size={34} />
                    <h3>Abono registrado</h3>
                    <p>
                      {formatCOP(Number(monto.trim().replace(",", ".")))} ·{" "}
                      {metodo}
                    </p>
                    <p>
                      El saldo y el historial se vuelven a consultar al
                      servidor.
                    </p>
                    <small>Comprobante: {success}</small>
                    <Button asChild onClick={onClose}>
                      <Link to={`/cartera/${clienteId}`}>
                        Ver historial del cliente <ArrowRight size={16} />
                      </Link>
                    </Button>
                  </div>
                ) : uncertain ? (
                  <div className="uncertain-payment" role="alert">
                    <h3>Comprueba el historial antes de repetir el abono</h3>
                    <p>
                      La conexión no permitió confirmar el resultado. El pago
                      podría estar registrado; el reenvío está bloqueado para
                      evitar duplicarlo.
                    </p>
                    <Button asChild variant="outline" onClick={onClose}>
                      <Link to={`/cartera/${clienteId}`}>
                        Revisar historial de abonos
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        try {
                          sessionStorage.removeItem(storageKey);
                        } catch {}
                        setUncertain(false);
                        setError(null);
                        setReview(false);
                        setAttempt((x) => x + 1);
                      }}
                    >
                      Ya verifiqué que no se registró
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={submit} className="abono-form">
                    <fieldset disabled={busy}>
                      <Label htmlFor="abono-monto">Monto recibido (COP)</Label>
                      <Input
                        id="abono-monto"
                        type="number"
                        inputMode="decimal"
                        min="0.01"
                        step="0.01"
                        max={
                          selectedSaleBalance !== null
                            ? Math.min(
                                cliente.saldo_cartera,
                                selectedSaleBalance,
                              )
                            : cliente.saldo_cartera
                        }
                        placeholder="0,00"
                        value={monto}
                        onChange={(e) => {
                          setMonto(e.target.value);
                          setReview(false);
                          setError(null);
                        }}
                        aria-describedby="monto-ayuda"
                      />
                      <p id="monto-ayuda" className="field-help">
                        {monto && amountError
                          ? amountError
                          : "Registra únicamente el dinero recibido, hasta el saldo del cliente."}
                      </p>
                      <Label htmlFor="abono-metodo">Método de pago</Label>
                      <select
                        id="abono-metodo"
                        value={metodo}
                        onChange={(e) => {
                          setMetodo(e.target.value as typeof metodo);
                          setReview(false);
                        }}
                      >
                        <option value="EFECTIVO">Efectivo</option>
                        <option value="TRANSFERENCIA">Transferencia</option>
                        <option value="BANCOLOMBIA">Bancolombia</option>
                      </select>
                      <Label htmlFor="abono-remision">
                        Aplicación del abono
                      </Label>
                      <select
                        id="abono-remision"
                        value={remision}
                        onChange={(e) => {
                          setRemision(e.target.value);
                          setReview(false);
                        }}
                      >
                        <option value="">Abono general a la cartera</option>
                        {remisiones.map((x) => {
                          const s = calcularSaldosRemision(x, abonos);
                          return (
                            <option key={x.id} value={x.id}>
                              Remisión #{x.consecutivo} (Saldo:{" "}
                              {formatCOP(s.pendiente)})
                            </option>
                          );
                        })}
                      </select>
                      <p className="field-help">
                        {selectedSale
                          ? `Saldo pendiente de la Remisión #${selectedSale.consecutivo}: ${formatCOP(selectedSaleBalance ?? 0)}.`
                          : "Puedes asociarlo a una remisión a crédito pendiente o aplicarlo al saldo general."}
                      </p>
                    </fieldset>
                    {review && (
                      <div className="order-review">
                        <strong>
                          Confirmar recepción de{" "}
                          {formatCOP(Number(monto.trim().replace(",", ".")))}
                        </strong>
                        <p>
                          {cliente.nombre_tienda} · {metodo} ·{" "}
                          {remision
                            ? `Remisión #${remisiones.find((x) => x.id === remision)?.consecutivo}`
                            : "Cartera general"}
                          . El abono reducirá su saldo.
                        </p>
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
                        ? "Registrando abono…"
                        : review
                          ? "Confirmar abono"
                          : "Revisar abono"}
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
              </>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
