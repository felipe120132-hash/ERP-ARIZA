import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientesService } from "@/services/clientesService";
import { productosService } from "@/services/productosService";
import {
  clientesAdminService,
  datosCliente,
  type DatosCliente,
} from "@/services/clientesAdminService";
import type { Cliente, PrecioCliente, Producto } from "@/types/schemas";
import { formatCOP } from "@/lib/cartera";
export default function AdministrarCliente() {
  const { perfil } = useAuth();
  const { id } = useParams();
  if (perfil?.rol !== "ADMIN")
    return (
      <div className="empty-state">
        <h1>Acceso restringido</h1>
        <p>Solo administradores pueden gestionar clientes.</p>
        <Button asChild>
          <Link to="/cartera">Volver a cartera</Link>
        </Button>
      </div>
    );
  return <Editor key={id ?? "nuevo"} id={id} />;
}
function Editor({ id }: { id?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [creationId] = useState(() => crypto.randomUUID());
  const key = `ariza:cliente-pendiente:${user?.id}:${id ?? "nuevo"}`;
  const [pending, setPending] = useState(() => {
    try {
      return sessionStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });
  const [client, setClient] = useState<Cliente | null>(null),
    [form, setForm] = useState<DatosCliente>({
      nombre_tienda: "",
      contacto: null,
      telefono: null,
      direccion: null,
      tipo_cliente: "TIENDA",
      activo: true,
    }),
    [loading, setLoading] = useState(!!id),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState(""),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [attempt, setAttempt] = useState(0),
    [ack, setAck] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!id) return;
    let live = true;
    setLoading(true);
    setLoadError("");
    clientesService.obtenerClientePorId(id).then((r) => {
      if (!live) return;
      if (r.error || !r.data) setLoadError(r.error ?? "Cliente no encontrado");
      else {
        setClient(r.data);
        setForm({
          nombre_tienda: r.data.nombre_tienda,
          contacto: r.data.contacto,
          telefono: r.data.telefono,
          direccion: r.data.direccion,
          tipo_cliente: r.data.tipo_cliente,
          activo: r.data.activo,
        });
      }
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [id, attempt]);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (lock.current || pending || saved) return;
    const parsed = datosCliente.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (!review) {
      setError("");
      setReview(true);
      return;
    }
    lock.current = true;
    setBusy(true);
    const target = id ?? creationId;
    try {
      sessionStorage.setItem(key, target);
    } catch {}
    try {
      await clientesAdminService.guardar(target, parsed.data, !id);
      try {
        sessionStorage.removeItem(key);
      } catch {}
      setSaved(true);
      navigate(`/cartera/${target}`, { replace: true });
    } catch (e) {
      setPending(target);
      setError(
        e instanceof Error ? e.message : "No se pudo confirmar el guardado.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const field = (name: keyof DatosCliente, value: unknown) => {
    setForm((p) => ({ ...p, [name]: value }));
    setReview(false);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN / CLIENTES</span>
          <h1>{id ? "Administrar cliente" : "Nuevo cliente"}</h1>
          <p>Datos comerciales y acuerdos de precio.</p>
        </div>
        <Button asChild variant="outline">
          <Link to={id ? `/cartera/${id}` : "/cartera"}>
            Volver al historial
          </Link>
        </Button>
      </div>
      {loading ? (
        <div className="empty-state" role="status">
          Consultando cliente…
        </div>
      ) : loadError ? (
        <div className="empty-state" role="alert">
          <p>{loadError}</p>
          <Button onClick={() => setAttempt((x) => x + 1)}>
            Reintentar cliente
          </Button>
        </div>
      ) : (
        <>
          <section className="catalog-panel client-editor">
            <h2>Datos del cliente</h2>
            {client && (
              <p className="catalog-footnote">
                Saldo actual: {formatCOP(client.saldo_cartera)}. Los movimientos
                de cartera mantienen este saldo.
              </p>
            )}
            {pending ? (
              <div className="warning-box" role="alert">
                <h3>Verifica el resultado antes de guardar nuevamente</h3>
                <p>{error || "Hay un guardado anterior sin confirmar."}</p>
                <Button asChild variant="outline">
                  <Link to={`/cartera/${pending}`}>
                    Consultar cliente enviado
                  </Link>
                </Button>
                <label className="finance-check">
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                  />
                  Revisé el cliente y confirmé que los cambios no se guardaron.
                </label>
                <Button
                  disabled={!ack}
                  onClick={() => {
                    try {
                      sessionStorage.removeItem(key);
                    } catch {}
                    setPending("");
                    setError("");
                    setReview(false);
                    setAck(false);
                    if (id) setAttempt((x) => x + 1);
                  }}
                >
                  Habilitar otro intento
                </Button>
              </div>
            ) : (
              <form onSubmit={save}>
                <fieldset disabled={busy} className="client-editor-fields">
                  {review ? (
                    <div className="client-review">
                      <h3>Revisar cambios</h3>
                      <strong>{form.nombre_tienda}</strong>
                      <p>
                        {form.tipo_cliente === "TIENDA"
                          ? "Tienda"
                          : "Distribuidor"}{" "}
                        · {form.activo ? "Activo" : "Inactivo"}
                      </p>
                      <p>
                        {form.contacto || "Sin contacto"} ·{" "}
                        {form.telefono || "Sin teléfono"}
                      </p>
                      <p>{form.direccion || "Sin dirección"}</p>
                      {!form.activo && (
                        <p>
                          El cliente dejará de aparecer para nuevos pedidos. Su
                          saldo y su historial se conservarán.
                        </p>
                      )}
                      <p>
                        El tipo de cliente define el precio base en las ventas
                        futuras. Los precios especiales tienen prioridad.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setReview(false)}
                      >
                        Editar datos
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label htmlFor="client-name">Nombre de la tienda</Label>
                        <Input
                          id="client-name"
                          required
                          maxLength={200}
                          value={form.nombre_tienda}
                          onChange={(e) =>
                            field("nombre_tienda", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="client-contact">Contacto</Label>
                        <Input
                          id="client-contact"
                          maxLength={200}
                          value={form.contacto ?? ""}
                          onChange={(e) =>
                            field(
                              "contacto",
                              e.target.value.trim() ? e.target.value : null,
                            )
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="client-phone">Teléfono</Label>
                        <Input
                          id="client-phone"
                          type="tel"
                          maxLength={50}
                          value={form.telefono ?? ""}
                          onChange={(e) =>
                            field("telefono", e.target.value || null)
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="client-address">Dirección</Label>
                        <Input
                          id="client-address"
                          maxLength={500}
                          value={form.direccion ?? ""}
                          onChange={(e) =>
                            field("direccion", e.target.value || null)
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="client-type">Tipo de cliente</Label>
                        <select
                          id="client-type"
                          value={form.tipo_cliente}
                          onChange={(e) =>
                            field("tipo_cliente", e.target.value)
                          }
                        >
                          <option value="TIENDA">Tienda</option>
                          <option value="DISTRIBUIDOR">Distribuidor</option>
                        </select>
                      </div>
                      <label className="finance-check">
                        <input
                          type="checkbox"
                          checked={form.activo}
                          onChange={(e) => field("activo", e.target.checked)}
                        />
                        Cliente activo
                      </label>
                    </>
                  )}
                  {error && <p role="alert">{error}</p>}
                  <div className="client-form-actions">
                    <Button
                      type="submit"
                      disabled={busy || !form.nombre_tienda.trim()}
                    >
                      {busy
                        ? "Guardando…"
                        : review
                          ? "Confirmar cliente"
                          : "Revisar cliente"}
                    </Button>
                  </div>
                </fieldset>
              </form>
            )}
          </section>
          {id && <Precios key={id} clienteId={id} />}
        </>
      )}
    </>
  );
}
function Precios({ clienteId }: { clienteId: string }) {
  const { user } = useAuth();
  const key = `ariza:precios-pendiente:${user?.id}:${clienteId}`;
  const [pending, setPending] = useState(() => {
      try {
        return sessionStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    }),
    [rows, setRows] = useState<PrecioCliente[]>([]),
    [products, setProducts] = useState<Producto[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [selected, setSelected] = useState(""),
    [amount, setAmount] = useState(""),
    [action, setAction] = useState<"save" | "remove" | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [ack, setAck] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    Promise.all([
      clientesAdminService.precios(clienteId),
      productosService.listarProductos(),
    ])
      .then(([prices, p]) => {
        if (!live) return;
        if (p.error) throw new Error(p.error);
        setRows(prices);
        setProducts(p.data ?? []);
        setLoading(false);
      })
      .catch((e) => {
        if (live) {
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron consultar los precios.",
          );
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [clienteId, attempt]);
  const existing = rows.find((x) => x.producto_id === selected),
    product = products.find((x) => x.id === selected);
  const valid =
    !!product &&
    /^\d+(\.\d{1,2})?$/.test(amount) &&
    Number(amount) <= 9999999999.99;
  async function commit() {
    if (lock.current || pending || !action || loading || !selected) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      sessionStorage.setItem(key, "1");
    } catch {}
    try {
      if (action === "remove") {
        if (!existing) throw new Error("El precio ya no está disponible.");
        await clientesAdminService.quitarPrecio(clienteId, existing);
      } else {
        if (!valid) throw new Error("Precio inválido.");
        await clientesAdminService.guardarPrecio(
          clienteId,
          selected,
          Number(amount),
          existing,
        );
      }
      try {
        sessionStorage.removeItem(key);
      } catch {}
      setAction(null);
      setSelected("");
      setAmount("");
      setNotice(
        "Precio actualizado. Las próximas ventas usarán el acuerdo vigente.",
      );
      setAttempt((x) => x + 1);
    } catch (e) {
      setPending(true);
      setError(
        e instanceof Error ? e.message : "No se pudo confirmar la operación.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="catalog-panel client-editor">
      <h2>Precios especiales</h2>
      <p className="catalog-footnote">
        Importes base en COP. El sistema calcula el IVA al registrar la venta.
        Un precio de cero es un acuerdo gratuito.
      </p>
      {notice && (
        <p role="status" className="order-success">
          {notice}
        </p>
      )}
      {pending && (
        <div className="warning-box" role="alert">
          <h3>Comprueba el precio antes de reintentar</h3>
          <p>
            La operación anterior no tiene confirmación. Actualiza y compara los
            precios.
          </p>
          <label className="finance-check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            Verifiqué el resultado y puedo continuar.
          </label>
          <Button
            disabled={!ack || busy || loading || !!error}
            onClick={() => {
              try {
                sessionStorage.removeItem(key);
              } catch {}
              setPending(false);
              setAction(null);
              setAck(false);
            }}
          >
            Continuar después de verificar
          </Button>
        </div>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <Button
        variant="outline"
        disabled={busy || loading}
        onClick={() => {
          setAction(null);
          setAttempt((x) => x + 1);
        }}
      >
        Actualizar precios
      </Button>
      {loading ? (
        <p role="status">Consultando precios…</p>
      ) : (
        !error && (
          <>
            <div className="order-table-wrap">
              <table className="order-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Precio especial</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((x) => (
                    <tr key={x.id}>
                      <td>
                        {products.find((p) => p.id === x.producto_id)?.nombre ??
                          x.producto_id}
                      </td>
                      <td>{formatCOP(x.precio_especial)}</td>
                      <td>
                        <Button
                          variant="ghost"
                          disabled={busy || pending}
                          onClick={() => {
                            setSelected(x.producto_id);
                            setAmount(String(x.precio_especial));
                            setAction(null);
                          }}
                        >
                          Editar precio
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="catalog-footnote">
                No hay acuerdos especiales. Se aplica el precio base según el
                tipo de cliente.
              </p>
            )}
            <fieldset className="price-editor" disabled={busy || pending}>
              <div>
                <Label htmlFor="special-product">Producto del acuerdo</Label>
                <select
                  id="special-product"
                  value={selected}
                  onChange={(e) => {
                    const x = rows.find(
                      (r) => r.producto_id === e.target.value,
                    );
                    setSelected(e.target.value);
                    setAmount(x ? String(x.precio_especial) : "");
                    setAction(null);
                  }}
                >
                  <option value="">Selecciona un producto</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} · {p.sku}
                      {!p.activo ? " (inactivo)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="special-price">Precio especial (COP)</Label>
                <Input
                  id="special-price"
                  type="number"
                  min="0"
                  step="0.01"
                  max="9999999999.99"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setAction(null);
                  }}
                />
              </div>
              <div className="receipt-tools">
                <Button disabled={!valid} onClick={() => setAction("save")}>
                  Revisar precio
                </Button>
                <Button
                  variant="outline"
                  disabled={!existing}
                  onClick={() => setAction("remove")}
                >
                  Quitar precio especial
                </Button>
              </div>
              {action && (
                <div className="client-review">
                  <h3>
                    {action === "remove"
                      ? "Volver al precio base"
                      : "Confirmar precio especial"}
                  </h3>
                  <p>{product?.nombre ?? selected}</p>
                  <p>
                    {action === "remove"
                      ? "Se eliminará este acuerdo. Las próximas ventas usarán el precio base de tienda o distribuidor."
                      : formatCOP(Number(amount))}
                  </p>
                  <p>Las remisiones ya registradas conservan sus importes.</p>
                  <Button onClick={() => void commit()}>
                    {busy ? "Guardando…" : "Confirmar cambio de precio"}
                  </Button>
                  <Button variant="ghost" onClick={() => setAction(null)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </fieldset>
          </>
        )
      )}
    </section>
  );
}
