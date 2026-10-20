import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ProductoFoto from "@/components/ProductoFoto";
import { AccesoProductos } from "./ProductosAdmin";
import { productosService } from "@/services/productosService";
import {
  datosProducto,
  extensionesFoto,
  GuardadoProductoError,
  productosAdminService,
  type DatosProducto,
} from "@/services/productosAdminService";
import { uuidSchema, type Producto } from "@/types/schemas";
import { formatCOP } from "@/lib/cartera";
import {
  inventarioService,
  type MovimientoInput,
} from "@/services/inventarioService";
const categorias = [
  "Comida",
  "Liquidos",
  "Accesorios",
  "Equipos",
  "Plantas",
  "Hamsters",
];
const origenes = ["Nacional", "Importado"];
type Form = Omit<
  DatosProducto,
  "precio_tienda" | "precio_distribuidor" | "stock_minimo"
> & {
  precio_tienda: string;
  precio_distribuidor: string;
  stock_minimo: string;
};
type Pending = {
  id: string;
  kind: "datos" | "foto";
  values?: DatosProducto;
  path?: string;
  initialMovement?: MovimientoInput;
};
function formFor(p: DatosProducto): Form {
  return {
    ...p,
    precio_tienda: String(p.precio_tienda),
    precio_distribuidor: String(p.precio_distribuidor),
    stock_minimo: String(p.stock_minimo),
  };
}
export default function AdministrarProducto() {
  const { perfil } = useAuth();
  const { id } = useParams();
  return perfil?.rol === "ADMIN" ? (
    <Editor key={id ?? "nuevo"} id={id} />
  ) : (
    <AccesoProductos />
  );
}
function Editor({ id }: { id?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const key = `ariza:producto-pendiente:${user?.id}:${id ?? "nuevo"}`;
  const [creationId, setCreationId] = useState<string>(() =>
    crypto.randomUUID(),
  );
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? "null");
    } catch {
      return null;
    }
  });
  const [product, setProduct] = useState<Producto | null>(null),
    [form, setForm] = useState<Form>(
      formFor({
        sku: "",
        nombre: "",
        categoria: "",
        origen: null,
        precio_tienda: 0,
        precio_distribuidor: 0,
        tasa_iva: 19,
        stock_minimo: 10,
        activo: true,
      }),
    ),
    [loading, setLoading] = useState(!!id),
    [loadError, setLoadError] = useState(""),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [attempt, setAttempt] = useState(0),
    [ack, setAck] = useState(false);
  const lock = useRef(false);
  const [initialQuantity, setInitialQuantity] = useState("0");
  const initialMovementKey = useRef(crypto.randomUUID());
  async function finishCreation(p: Producto, value: Pending) {
    const movement = value.initialMovement;
    if (!movement) {
      clearPending();
      navigate(`/productos/${p.id}/editar`, { replace: true });
      return;
    }
    const movementStorage = `ariza:movimiento:${user!.id}:${p.id}`;
    // Creation and inventory are two transactions. Preserve the entry before attempting it.
    sessionStorage.setItem(movementStorage, JSON.stringify(movement));
    clearPending();
    try {
      await inventarioService.registrarMovimiento(movement);
      sessionStorage.removeItem(movementStorage);
      navigate(`/productos/${p.id}/editar`, { replace: true });
    } catch {
      navigate(`/inventario/${p.id}/movimiento`, {
        replace: true,
        state: { initialEntry: true },
      });
    }
  }
  function accept(p: Producto) {
    setProduct(p);
    setForm(
      formFor({
        sku: p.sku,
        nombre: p.nombre,
        categoria: p.categoria,
        origen: p.origen,
        precio_tienda: p.precio_tienda,
        precio_distribuidor: p.precio_distribuidor,
        tasa_iva: p.tasa_iva,
        stock_minimo: p.stock_minimo,
        activo: p.activo,
      }),
    );
    setReview(false);
  }
  useEffect(() => {
    if (!id) return;
    if (!uuidSchema.safeParse(id).success) {
      setLoadError("Identificador de producto inválido.");
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setLoadError("");
    productosService.obtenerProductoPorId(id).then((r) => {
      if (live) {
        if (!r.data || r.error)
          setLoadError(r.error ?? "Producto no disponible.");
        else accept(r.data);
        setLoading(false);
      }
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
  function remember(value: Pending) {
    sessionStorage.setItem(key, JSON.stringify(value));
    setPending(value);
  }
  function clearPending() {
    sessionStorage.removeItem(key);
    setPending(null);
    setAck(false);
  }
  async function mutate(
    value: Pending,
    run: (sent: () => void) => Promise<Producto>,
  ) {
    if (lock.current || pending) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    let sent = false;
    try {
      const p = await run(() => {
        remember(value);
        sent = true;
      });
      if (!id && value.kind === "datos") {
        await finishCreation(p, value);
        return;
      }
      clearPending();
      if (value.kind === "foto")
        setProduct((old) => (old ? { ...old, imagen_path: p.imagen_path } : p));
      else accept(p);
      setSuccess(
        value.kind === "foto"
          ? "Foto guardada. Ya está disponible en el catálogo."
          : "Producto guardado correctamente.",
      );
      if (!id) navigate(`/productos/${p.id}/editar`, { replace: true });
    } catch (e) {
      if (!sent || (e instanceof GuardadoProductoError && !e.incierto)) {
        if (sent) clearPending();
      }
      setError(
        e instanceof Error ? e.message : "No se pudo confirmar el cambio.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function parsedForm() {
    for (const k of [
      "precio_tienda",
      "precio_distribuidor",
      "stock_minimo",
    ] as const)
      if (!/^\d+(\.\d{1,2})?$/.test(form[k].trim().replace(",", ".")))
        throw new Error(
          "Precios y stock mínimo deben ser números positivos o cero, con máximo dos decimales.",
        );
    return datosProducto.parse({
      ...form,
      precio_tienda: Number(form.precio_tienda.trim().replace(",", ".")),
      precio_distribuidor: Number(
        form.precio_distribuidor.trim().replace(",", "."),
      ),
      stock_minimo: Number(form.stock_minimo.trim().replace(",", ".")),
    });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || pending) return;
    try {
      const values = parsedForm();
      if (
        (!product || form.categoria !== product.categoria) &&
        !categorias.includes(values.categoria)
      )
        throw new Error("Selecciona una categoría de la lista.");
      if (
        (!product || form.origen !== product.origen) &&
        !origenes.includes(values.origen ?? "")
      )
        throw new Error("Selecciona Nacional o Importado como origen.");
      const normInit = initialQuantity.trim().replace(",", ".");
      if (!id && (!/^\d+(\.\d{1,2})?$/.test(normInit) || Number(normInit) > 9999999999.99))
        throw new Error(
          "La cantidad inicial debe ser cero o mayor, con máximo dos decimales.",
        );
      if (!id && Number(normInit) > 0 && !values.activo)
        throw new Error(
          "Activa el producto para registrar su ingreso inicial.",
        );
      if (!review) {
        setReview(true);
        setError("");
        return;
      }
      const target = id ?? creationId;
      const initialMovement: MovimientoInput | undefined =
        !id && Number(normInit) > 0
          ? {
              p_producto_id: target,
              p_tipo: "ENTRADA",
              p_cantidad: Number(normInit),
              p_motivo: "Ingreso inicial al crear el producto",
              p_idempotency_key: initialMovementKey.current,
              p_stock_esperado: null,
            }
          : undefined;
      await mutate(
        { id: target, kind: "datos", values, initialMovement },
        (sent) => productosAdminService.guardar(target, values, product, sent),
      );
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? e.issues[0].message
          : e instanceof Error
            ? e.message
            : "Revisa los datos del producto.",
      );
    }
  }
  async function handleEliminar() {
    if (!product || busy || pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await productosAdminService.eliminarODesactivar(product);
      setConfirmDelete(false);
      if (res.accion === "ELIMINADO") {
        navigate("/productos", { replace: true });
        return;
      }
      if (res.producto) accept(res.producto);
      setSuccess(res.mensaje);
    } catch (e) {
      setConfirmDelete(false);
      setError(
        e instanceof Error ? e.message : "No se pudo eliminar el producto.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function resolve() {
    if (!pending || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await productosService.obtenerProductoPorId(pending.id);
      if (!r.data || r.error)
        throw new Error(
          r.error ??
            "No se encontró el producto. Verifica el listado antes de habilitar otro intento.",
        );
      const p = r.data;
      const matches =
        pending.kind === "foto"
          ? p.imagen_path === pending.path
          : Object.entries(pending.values ?? {}).every(
              ([k, v]) => p[k as keyof Producto] === v,
            );
      if (!matches)
        throw new Error(
          "El producto consultado no refleja los cambios enviados. Revisa sus datos antes de habilitar otro intento.",
        );
      if (!id && pending.kind === "datos") {
        await finishCreation(p, pending);
        return;
      }
      clearPending();
      accept(p);
      setSuccess("El cambio está confirmado en el producto.");
      if (!id) navigate(`/productos/${p.id}/editar`, { replace: true });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos verificar el resultado.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const change = (name: keyof Form, value: unknown) => {
    setForm((f) => ({ ...f, [name]: value }));
    setReview(false);
    setSuccess("");
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN / PRODUCTOS</span>
          <h1>{id ? "Editar producto" : "Nuevo producto"}</h1>
          <p>
            {id
              ? "Mantén su información y fotografía al día."
              : "Prepara una nueva referencia para tu catálogo."}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/productos">Volver a productos</Link>
        </Button>
      </div>
      {success && (
        <p role="status" className="order-success">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {pending && (
        <div className="warning-box product-pending" role="alert">
          <h2>
            {busy
              ? "Guardando cambios…"
              : "Verifica el resultado del último cambio"}
          </h2>
          <p>
            Consulta el producto antes de volver a guardar para evitar
            duplicados.
          </p>
          <Button disabled={busy} onClick={() => void resolve()}>
            Consultar resultado
          </Button>
          <Button asChild variant="outline">
            <Link to="/productos">Revisar listado</Link>
          </Button>
          <label className="finance-check">
            <input
              type="checkbox"
              checked={ack}
              disabled={busy}
              onChange={(e) => setAck(e.target.checked)}
            />
            Revisé el producto y confirmé que el cambio no se guardó.
          </label>
          <Button
            disabled={busy || !ack}
            variant="outline"
            onClick={() => {
              setCreationId(pending.id);
              clearPending();
              setError("");
              setReview(false);
              if (id) setAttempt((v) => v + 1);
            }}
          >
            Habilitar otro intento
          </Button>
        </div>
      )}
      {loading ? (
        <div className="empty-state" role="status">
          Consultando producto…
        </div>
      ) : loadError ? (
        <div className="empty-state" role="alert">
          <p>{loadError}</p>
          <Button onClick={() => setAttempt((v) => v + 1)}>
            Reintentar producto
          </Button>
        </div>
      ) : (
        <div className="product-editor-grid">
          <section className="catalog-panel client-editor">
            <span className="eyebrow">INFORMACIÓN COMERCIAL</span>
            <h2>{product?.nombre ?? "Datos del producto"}</h2>
            <p className="catalog-footnote">
              {product
                ? `Existencias actuales: ${product.stock_actual}.`
                : "Indica las unidades que ingresan al crear la referencia."}{" "}
              Las entradas y salidas se registran mediante movimientos de
              inventario.
            </p>
            <form onSubmit={save}>
              <fieldset
                disabled={busy || !!pending}
                className="client-editor-fields"
              >
                {(
                  [
                    ["sku", "SKU"],
                    ["nombre", "Nombre del producto"],
                  ] as const
                ).map(([name, label]) => (
                  <div key={name}>
                    <Label htmlFor={`producto-${name}`}>{label}</Label>
                    <Input
                      id={`producto-${name}`}
                      value={form[name] ?? ""}
                      required
                      maxLength={name === "nombre" ? 200 : 100}
                      onChange={(e) => change(name, e.target.value)}
                    />
                  </div>
                ))}
                {(
                  [
                    ["categoria", "Categoría", categorias],
                    ["origen", "Origen", origenes],
                  ] as const
                ).map(([name, label, options]) => (
                  <div key={name}>
                    <Label htmlFor={`producto-${name}`}>{label}</Label>
                    <select
                      id={`producto-${name}`}
                      value={form[name] ?? ""}
                      required={!id || !!form[name]}
                      onChange={(e) => change(name, e.target.value || null)}
                    >
                      <option value="" disabled>
                        Seleccionar {label.toLowerCase()}
                      </option>
                      {product &&
                        form[name] &&
                        !options.includes(form[name]!) && (
                          <option value={form[name]!}>
                            {form[name]} (valor actual)
                          </option>
                        )}
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {!id && (
                  <div>
                    <Label htmlFor="producto-cantidad-inicial">
                      Cantidad inicial que ingresa
                    </Label>
                    <Input
                      id="producto-cantidad-inicial"
                      type="number"
                      min="0"
                      max="9999999999.99"
                      step="0.01"
                      required
                      value={initialQuantity}
                      onChange={(e) => {
                        setInitialQuantity(e.target.value);
                        setReview(false);
                      }}
                    />
                    <p className="catalog-footnote">
                      Se registrará una entrada en el kardex. Usa cero si
                      todavía no recibes mercancía.
                    </p>
                  </div>
                )}
                {(
                  [
                    ["precio_tienda", "Precio tienda (COP)"],
                    ["precio_distribuidor", "Precio distribuidor (COP)"],
                    ["stock_minimo", "Stock mínimo"],
                  ] as const
                ).map(([name, label]) => (
                  <div key={name}>
                    <Label htmlFor={`producto-${name}`}>{label}</Label>
                    <Input
                      id={`producto-${name}`}
                      type="number"
                      min="0"
                      max="9999999999.99"
                      step="0.01"
                      required
                      value={form[name]}
                      onChange={(e) => change(name, e.target.value)}
                    />
                  </div>
                ))}
                <div>
                  <Label htmlFor="producto-iva">IVA del producto</Label>
                  <select
                    id="producto-iva"
                    value={form.tasa_iva}
                    onChange={(e) => change("tasa_iva", Number(e.target.value))}
                  >
                    <option value="0">0 %</option>
                    <option value="5">5 %</option>
                    <option value="19">19 %</option>
                  </select>
                </div>
                <label className="finance-check">
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => change("activo", e.target.checked)}
                  />
                  Producto activo
                </label>
                {review && (
                  <div className="client-review">
                    <h3>Revisar producto</h3>
                    <strong>
                      {form.nombre} · {form.sku}
                    </strong>
                    <p>
                      {form.categoria}
                      {form.origen ? ` · ${form.origen}` : ""}
                    </p>
                    <p>
                      Tienda: {formatCOP(Number(form.precio_tienda))} ·
                      Distribuidor:{" "}
                      {formatCOP(Number(form.precio_distribuidor))}
                    </p>
                    <p>
                      IVA: {form.tasa_iva}% · Stock mínimo: {form.stock_minimo}{" "}
                      · {form.activo ? "Activo" : "Inactivo"}
                    </p>
                    {!id && (
                      <p>
                        Ingreso inicial:{" "}
                        {Number(initialQuantity).toLocaleString("es-CO")}{" "}
                        unidades. Primero se crea el producto y después se
                        registra la entrada; si esta no se confirma, podrás
                        recuperarla sin crear otro producto.
                      </p>
                    )}
                    <p>
                      {form.activo
                        ? "Los precios se usarán en ventas futuras, salvo acuerdos especiales por cliente."
                        : "El producto dejará de aparecer en el catálogo de venta. Su historial se conserva."}
                    </p>
                  </div>
                )}
                <div className="client-form-actions receipt-tools">
                  <Button type="submit">
                    {busy
                      ? "Guardando…"
                      : review
                        ? "Confirmar producto"
                        : "Revisar producto"}
                  </Button>
                  {review && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setReview(false)}
                    >
                      Seguir editando
                    </Button>
                  )}
                  {id && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setReview(false);
                        setAttempt((v) => v + 1);
                      }}
                    >
                      Actualizar datos
                    </Button>
                  )}
                </div>
              </fieldset>
            </form>
          </section>
          {product ? (
            <div>
              <section className="catalog-panel product-photo-editor">
                <h2>Existencias</h2>
                <p>
                  {product.stock_actual.toLocaleString("es-CO")} unidades
                  actuales
                </p>
                <div className="receipt-tools">
                  <Button asChild variant="outline">
                    <Link to={`/inventario/${product.id}/movimiento`}>
                      Registrar entrada o ajustar cantidad
                    </Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link to={`/inventario/${product.id}`}>Ver kardex</Link>
                  </Button>
                </div>
              </section>
              <ProductoFoto
                producto={product}
                disabled={busy || !!pending}
                guardar={async (file) => {
                  const path = `productos/${product.id}/${crypto.randomUUID()}.${extensionesFoto[file.type]}`;
                  await mutate({ id: product.id, kind: "foto", path }, (sent) =>
                    productosAdminService.imagen(product, file, path, sent),
                  );
                }}
              />
              <section className="catalog-panel product-photo-editor">
                <h2>Eliminación segura</h2>
                <p className="catalog-footnote">
                  Si el producto tiene movimientos en Kardex, remisiones o
                  existencias, se desactivará lógicamente para conservar el
                  historial. Si no tiene dependencias, se eliminará de forma
                  permanente.
                </p>
                {confirmDelete ? (
                  <div className="receipt-tools">
                    <Button
                      type="button"
                      disabled={busy || !!pending}
                      onClick={() => void handleEliminar()}
                    >
                      Confirmar eliminación
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !!pending}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || !!pending}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Eliminar producto
                  </Button>
                )}
              </section>
            </div>
          ) : (
            <section className="catalog-panel product-photo-editor">
              <span className="eyebrow">FOTOGRAFÍA</span>
              <h2>Primero, su referencia.</h2>
              <p>
                Guarda el producto para subir su foto y verla en el catálogo.
              </p>
            </section>
          )}
        </div>
      )}
    </>
  );
}
