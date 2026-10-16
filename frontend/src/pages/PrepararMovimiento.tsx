import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { productosService } from "@/services/productosService";
import type { Producto } from "@/types/schemas";
import { inventarioService, ErrorMovimiento, movimientoInputSchema, type MovimientoInput } from "@/services/inventarioService";

const units = (value: number) =>
  value.toLocaleString("es-CO", { maximumFractionDigits: 2 });
export default function PrepararMovimiento() {
  const { perfil, user } = useAuth();
  const { id } = useParams();
  if (perfil?.rol !== "ADMIN")
    return (
      <div className="empty-state">
        <h1>Acceso restringido</h1>
        <p>Solo administradores pueden preparar movimientos de inventario.</p>
        <Button asChild>
          <Link to="/inventario">Volver a inventario</Link>
        </Button>
      </div>
    );
  return <Formulario key={`${user?.id}:${id}`} id={id ?? ""} userId={user!.id} />;
}
function Formulario({ id, userId }: { id: string; userId: string }) {
  const location = useLocation();
  const storageKey = `ariza:movimiento:${userId}:${id}`;
  const [recovery] = useState(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return { data: null, corrupt: false };
      const parsed = movimientoInputSchema.safeParse(JSON.parse(raw));
      if (!parsed.success || parsed.data.p_producto_id !== id) return { data: null, corrupt: true };
      return { data: parsed.data, corrupt: false };
    } catch { return { data: null, corrupt: true }; }
  });
  const [pending, setPending] = useState<MovimientoInput | null>(recovery.data);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const sending = useRef(false);
  const key = useRef(crypto.randomUUID());
  async function guardar() {
    if (sending.current || recovery.corrupt || (!pending && (!review || !product))) return;
    const input: MovimientoInput = pending ?? {
      p_producto_id: id, p_tipo: tipo, p_cantidad: Number(cantidad), p_motivo: motivo.trim(),
      p_idempotency_key: key.current, p_stock_esperado: tipo === "AJUSTE" ? product!.stock_actual : null,
    };
    sending.current = true; setBusy(true); setError(""); setSuccess("");
    try {
      // Persist the exact payload before sending. An uncertain request must never be edited.
      sessionStorage.setItem(storageKey, JSON.stringify(input));
      setPending(input);
    } catch {
      setError("No podemos conservar la solicitud en esta pestaña. Habilita el almacenamiento antes de registrar.");
      sending.current = false; setBusy(false); return;
    }
    try {
      const r = await inventarioService.registrarMovimiento(input);
      sessionStorage.removeItem(storageKey); setPending(null);
      key.current = crypto.randomUUID(); setCantidad(""); setMotivo(""); setReview(false);
      setSuccess(`${r.repetido ? "Movimiento recuperado sin duplicarlo" : "Movimiento registrado"}. Stock resultante del movimiento: ${units(r.stock_resultante)} unidades.`);
      setAttempt(x => x + 1);
    } catch (e) {
      if (e instanceof ErrorMovimiento && !e.incierto) {
        sessionStorage.removeItem(storageKey); setPending(null); setReview(false);
        if (e.conflicto) { setCantidad(""); setAttempt(x => x + 1); }
      }
      setError(e instanceof Error ? e.message : "No pudimos confirmar el movimiento. Reintenta la misma solicitud.");
    } finally { sending.current = false; setBusy(false); }
  }
  const [product, setProduct] = useState<Producto | null>(null),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [tipo, setTipo] = useState<"ENTRADA" | "AJUSTE">("ENTRADA"),
    [cantidad, setCantidad] = useState(""),
    [motivo, setMotivo] = useState(""),
    [error, setError] = useState(""),
    [review, setReview] = useState(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setLoadError("");
    setReview(false);
    setProduct(null);
    if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) {
      setLoadError("El identificador del producto no es válido.");
      setLoading(false);
      return;
    }
    productosService.obtenerProductoPorId(id).then((r) => {
      if (!live) return;
      if (r.error || !r.data)
        setLoadError(r.error ?? "Producto no disponible.");
      else setProduct(r.data);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [id, attempt]);
  const stockCents = product ? Math.round(product.stock_actual * 100) : 0;
  const quantityCents = Math.round(Number(cantidad) * 100);
  const result =
    tipo === "ENTRADA" ? stockCents + quantityCents : quantityCents;
  const delta = result - stockCents;
  function revisar(e: FormEvent) {
    e.preventDefault();
    setReview(false);
    setError("");
    if (!product?.activo || loading || loadError) return;
    if (
      !/^\d+(\.\d{1,2})?$/.test(cantidad) ||
      !Number.isSafeInteger(quantityCents) ||
      quantityCents < 0 ||
      (tipo === "ENTRADA" && quantityCents === 0)
    ) {
      setError(
        "Escribe una cantidad válida con hasta dos decimales. Las entradas deben ser mayores que cero.",
      );
      return;
    }
    if (result > 999999999999) {
      setError("El stock resultante supera el límite permitido.");
      return;
    }
    if (tipo === "AJUSTE" && delta === 0) {
      setError(
        "El conteo coincide con las existencias; no hace falta un ajuste.",
      );
      return;
    }
    if (motivo.trim().length < 5 || motivo.trim().length > 500) {
      setError("Describe el motivo con entre 5 y 500 caracteres.");
      return;
    }
    setReview(true);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">INVENTARIO / PREPARACIÓN</span>
          <h1>Entradas y ajustes</h1>
          <p>Revisa el movimiento antes de registrarlo.</p>
        </div>
        <Button asChild variant="outline">
          <Link to={`/inventario/${id}`}>Volver al kardex</Link>
        </Button>
      </div>
      {success && <div className="warning-box" role="status">{success}</div>}
      {location.state?.initialEntry && pending && <p role="status" className="warning-box">El producto ya fue creado. Falta confirmar su ingreso inicial; reintenta el mismo movimiento para recuperarlo sin duplicar existencias.</p>}
      {recovery.corrupt && <p role="alert">No pudimos recuperar una solicitud anterior. Revisa el kardex con el administrador antes de registrar otro movimiento.</p>}
      {pending && <div className="warning-box" role="status"><strong>Movimiento pendiente de confirmar</strong><p>{pending.p_tipo}: {units(pending.p_cantidad)} unidades. {pending.p_motivo}</p><p>Conservamos los datos originales para evitar duplicados, incluso al recargar esta pestaña.</p><Button disabled={busy} onClick={() => void guardar()}>{busy ? "Confirmando…" : "Reintentar mismo movimiento"}</Button></div>}
      {error && <p className="error-box" role="alert">{error}</p>}
      {loading ? (
        <div className="empty-state" role="status">
          Consultando existencias…
        </div>
      ) : loadError ? (
        <div className="empty-state" role="alert">
          <p>{loadError}</p>
          <Button onClick={() => setAttempt((x) => x + 1)}>
            Reintentar consulta
          </Button>
        </div>
      ) : (
        product && (
          <section className="catalog-panel client-editor movement-editor">
            <span className="eyebrow">
              {product.sku} · {product.categoria}
            </span>
            <h2>{product.nombre}</h2>
            <div className="inventory-product-summary">
              <div>
                <small>Existencias consultadas</small>
                <strong>{units(product.stock_actual)} unidades</strong>
              </div>
              <Button
                variant="outline"
                disabled={busy || !!pending}
                onClick={() => setAttempt((x) => x + 1)}
              >
                Actualizar existencias
              </Button>
            </div>
            {!product.activo && (
              <p role="alert" className="error-box">
                Este producto está inactivo. Actívalo antes de preparar un
                movimiento.
              </p>
            )}
            <form onSubmit={revisar}>
              <fieldset
                className="client-editor-fields"
                disabled={!product.activo || busy || !!pending || recovery.corrupt}
              >
                <div>
                  <Label htmlFor="movimiento-tipo">Tipo de movimiento</Label>
                  <select
                    id="movimiento-tipo"
                    value={tipo}
                    onChange={(e) => {
                      setTipo(e.target.value as "ENTRADA" | "AJUSTE");
                      setCantidad("");
                      setReview(false);
                      setError("");
                    }}
                  >
                    <option value="ENTRADA">Entrada de mercancía</option>
                    <option value="AJUSTE">Ajuste por conteo físico</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="movimiento-cantidad">
                    {tipo === "ENTRADA"
                      ? "Unidades recibidas"
                      : "Existencias contadas"}
                  </Label>
                  <Input
                    id="movimiento-cantidad"
                    type="number"
                    min={tipo === "ENTRADA" ? "0.01" : "0"}
                    max="9999999999.99"
                    step="0.01"
                    required
                    value={cantidad}
                    onChange={(e) => {
                      setCantidad(e.target.value);
                      setReview(false);
                    }}
                  />
                  <p className="catalog-footnote">
                    {tipo === "ENTRADA"
                      ? "Cantidad que se sumaría al inventario."
                      : "Total de unidades encontradas. Puede ser cero; la diferencia se muestra al revisar."}
                  </p>
                </div>
                <div className="client-form-actions">
                  <Label htmlFor="movimiento-motivo">
                    Motivo u observación
                  </Label>
                  <textarea
                    id="movimiento-motivo"
                    required
                    minLength={5}
                    maxLength={500}
                    rows={3}
                    value={motivo}
                    placeholder="Ej.: recepción del proveedor, daño o diferencia de conteo…"
                    onChange={(e) => {
                      setMotivo(e.target.value);
                      setReview(false);
                    }}
                  />
                </div>
                <div className="client-form-actions">
                  <Button type="submit">Revisar movimiento</Button>
                </div>
              </fieldset>
            </form>
            {review && (
              <div className="client-review movement-review">
                <span className="eyebrow">VISTA PREVIA · NO REGISTRADO</span>
                <h3>
                  {tipo === "ENTRADA"
                    ? "Entrada de mercancía"
                    : "Ajuste por conteo físico"}
                </h3>
                <dl>
                  <div>
                    <dt>Existencias consultadas</dt>
                    <dd>{units(stockCents / 100)}</dd>
                  </div>
                  <div>
                    <dt>
                      {delta < 0 ? "Unidades a descontar" : "Unidades a sumar"}
                    </dt>
                    <dd>{units(Math.abs(delta) / 100)}</dd>
                  </div>
                  <div>
                    <dt>Stock previsto</dt>
                    <dd data-testid="stock-previsto">{units(result / 100)}</dd>
                  </div>
                </dl>
                <p>{motivo.trim()}</p>
                <p>
                  Esta vista previa usa las existencias consultadas. El
                  resultado definitivo deberá verificarse al registrar.
                </p>
                <Button disabled={busy || !!pending || recovery.corrupt} onClick={() => void guardar()}>Confirmar y registrar</Button>
              </div>
            )}
          </section>
        )
      )}
    </>
  );
}
