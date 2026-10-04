import { usePreciosPedido } from "@/hooks/usePreciosPedido";
import { subtotalPedido } from "@/lib/subtotalPedido";
import { formatCOP } from "@/lib/cartera";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch as SwitchPrimitive } from "radix-ui";
import { clientesService } from "@/services/clientesService";
import { usePedido } from "@/context/PedidoContext";
import { normalize } from "@/lib/catalog";
import type { Cliente, Producto } from "@/types/schemas";
export default function Carrito({
  products,
  loading,
  onCreated,
}: {
  products: Producto[];
  loading: boolean;
  onCreated: () => void;
}) {
  const pedido = usePedido(),
    navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]),
    [search, setSearch] = useState(""),
    [error, setError] = useState<string | null>(null),
    [cargando, setCargando] = useState(true),
    [attempt, setAttempt] = useState(0),
    [review, setReview] = useState(false);
  useEffect(() => {
    let active = true;
    setCargando(true);
    setError(null);
    clientesService
      .listarClientes()
      .then((result) => {
        if (active) {
          setClientes((result.data ?? []).filter((x) => x.activo));
          setError(result.error);
          setCargando(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("No pudimos cargar los clientes.");
          setCargando(false);
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const cliente = clientes.find((x) => x.id === pedido.cliente),
    blocked = pedido.enviando || pedido.incierto;
  const invalid = pedido.lineas.some((line) => {
    const product = products.find((x) => x.id === line.producto.id),
      quantity = Number(line.cantidad);
    return (
      !product ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > product.stock_actual ||
      Math.abs(quantity * 100 - Math.round(quantity * 100)) > 1e-7
    );
  });
  const precios = usePreciosPedido(cliente?.id ?? "");
  let estimate: ReturnType<typeof subtotalPedido> | null = null;
  let estimateError: string | null = null;
  if (cliente && precios.data && !invalid && !loading) {
    try {
      estimate = subtotalPedido(cliente, pedido.lineas, products, precios.data);
    } catch (e) {
      estimateError =
        e instanceof Error ? e.message : "No se pudo calcular el subtotal.";
    }
  }
  const valid =
    !!cliente &&
    !invalid &&
    pedido.lineas.length > 0 &&
    !loading &&
    !cargando &&
    !error &&
    !!estimate;
  return (
    <aside
      id="pedido-en-curso"
      className="order-cart"
      aria-label="Pedido en curso"
    >
      <div className="order-title">
        <ShoppingBag size={20} />
        <div>
          <span className="eyebrow">VENTA NUEVA</span>
          <h2>Pedido en curso</h2>
        </div>
        <span className="order-count">{pedido.lineas.length}</span>
      </div>
      {pedido.creada && (
        <div className="order-success" role="status">
          <CheckCircle2 size={18} />
          Remisión creada.{" "}
          <Link to={`/remisiones/${pedido.creada}`}>Ver detalle</Link>
        </div>
      )}
      <fieldset disabled={blocked} className="order-fields">
        <Label htmlFor="buscar-cliente">Cliente</Label>
        <Input
          id="buscar-cliente"
          placeholder="Buscar cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Seleccionar cliente"
          value={pedido.cliente}
          onChange={(e) => {
            pedido.setCliente(e.target.value);
            setReview(false);
          }}
          disabled={blocked || cargando || !!error}
        >
          <option value="">
            {cargando ? "Cargando clientes…" : "Selecciona un cliente"}
          </option>
          {clientes
            .filter(
              (x) =>
                x.id === pedido.cliente ||
                normalize(x.nombre_tienda).includes(normalize(search)),
            )
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre_tienda}
              </option>
            ))}
        </select>
        {!cargando && !error && !clientes.length && (
          <p>No hay clientes activos disponibles.</p>
        )}
        {error && (
          <div role="alert" className="error-box">
            {error}
            <Button
              type="button"
              variant="outline"
              onClick={() => setAttempt((x) => x + 1)}
            >
              Reintentar clientes
            </Button>
          </div>
        )}
        {cliente && (
          <p className="order-client-info">
            {cliente.tipo_cliente === "TIENDA" ? "Tienda" : "Distribuidor"}
            {cliente.en_mora ? " · Cliente en mora" : ""}
          </p>
        )}
        <div className="order-lines">
          {!pedido.lineas.length ? (
            <div className="order-empty">
              <ShoppingBag size={28} />
              <p>Tu próximo pedido empieza aquí.</p>
              <small>Agrega productos desde el catálogo.</small>
            </div>
          ) : (
            pedido.lineas.map((line) => {
              const product = products.find((x) => x.id === line.producto.id);
              const importe = estimate?.detalle.get(line.producto.id);
              return (
                <div className="order-line" key={line.producto.id}>
                  <strong>{line.producto.nombre}</strong>
                  <small>
                    {line.producto.sku} ·{" "}
                    {product
                      ? `${product.stock_actual} disponibles`
                      : "Producto no disponible"}
                  </small>
                  {importe && (
                    <small className="order-line-price">
                      {formatCOP(importe.precio)} por unidad ·{" "}
                      {importe.especial ? "Precio especial" : "Precio base"}
                      <br />
                      Subtotal: {formatCOP(importe.subtotal)}
                    </small>
                  )}
                  <div>
                    <Label
                      className="sr-only"
                      htmlFor={`qty-${line.producto.id}`}
                    >
                      Cantidad de {line.producto.nombre}
                    </Label>
                    <Input
                      id={`qty-${line.producto.id}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={product?.stock_actual}
                      value={line.cantidad}
                      onChange={(e) => {
                        pedido.cantidad(line.producto.id, e.target.value);
                        setReview(false);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar ${line.producto.nombre}`}
                      onClick={() => {
                        pedido.quitar(line.producto.id);
                        setReview(false);
                      }}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <Label htmlFor="tipo-pago">Forma de pago</Label>
        <select
          id="tipo-pago"
          value={pedido.pago}
          onChange={(e) => {
            pedido.setPago(e.target.value as "CONTADO" | "CREDITO");
            setReview(false);
          }}
        >
          <option value="CONTADO">Contado</option>
          <option value="CREDITO">Crédito · Cartera</option>
        </select>
        <div className="order-iva">
          <Label htmlFor="aplica-iva">Aplicar IVA</Label>
          <SwitchPrimitive.Root
            id="aplica-iva"
            checked={pedido.iva}
            onCheckedChange={(value) => {
              pedido.setIva(value);
              setReview(false);
            }}
            className="iva-switch"
          >
            <SwitchPrimitive.Thumb />
          </SwitchPrimitive.Root>
        </div>
      </fieldset>
      <div
        className="order-subtotal"
        aria-label="Resumen del importe del pedido"
        aria-live="polite"
      >
        <small>Subtotal estimado · sin IVA</small>
        <strong data-testid="pedido-subtotal">
          {estimate ? formatCOP(estimate.subtotal) : "—"}
        </strong>
        {!cliente ? (
          <p>Selecciona un cliente para consultar sus precios.</p>
        ) : precios.loading ? (
          <p>Consultando precios del cliente…</p>
        ) : precios.error || estimateError ? (
          <p role="alert">{precios.error ?? estimateError}</p>
        ) : invalid ? (
          <p>Corrige las cantidades para ver el subtotal.</p>
        ) : (
          <p>
            {pedido.iva
              ? "IVA no incluido en este subtotal."
              : "Pedido sin IVA."}{" "}
            El importe definitivo se confirma al registrar la remisión.
          </p>
        )}
        {cliente && (
          <Button
            variant="ghost"
            disabled={blocked || precios.loading}
            onClick={() => {
              setReview(false);
              precios.refresh();
            }}
          >
            Actualizar precios del pedido
          </Button>
        )}
      </div>{" "}
      {invalid && !loading && (
        <p role="alert" className="error-box">
          Revisa las cantidades: deben ser positivas, tener hasta dos decimales
          y no superar las existencias.
        </p>
      )}
      {pedido.error && (
        <div role="alert" className="error-box">
          {pedido.error}
        </div>
      )}
      {pedido.incierto ? (
        <div className="warning-box">
          No podemos confirmar si el pedido se registró. Para evitar duplicados,
          revisa las remisiones antes de iniciar otro pedido.
          <Button asChild variant="outline">
            <Link to="/remisiones">Revisar historial</Link>
          </Button>
        </div>
      ) : (
        <>
          {review && valid && (
            <div className="order-review">
              <strong>¿Registrar esta venta?</strong>
              <span className="review-subtotal">
                Subtotal estimado:{" "}
                {estimate ? formatCOP(estimate.subtotal) : "—"}
              </span>
              <p>
                {cliente?.nombre_tienda} · {pedido.lineas.length} referencias ·{" "}
                {pedido.pago === "CONTADO" ? "Contado" : "Crédito"} ·{" "}
                {pedido.iva ? "Con IVA" : "Sin IVA"}. Al confirmar se descontará
                el stock
                {pedido.pago === "CREDITO"
                  ? " y se actualizará la cartera"
                  : ""}
                .
              </p>
            </div>
          )}
          <Button
            className="w-full"
            disabled={!valid || blocked}
            onClick={async () => {
              if (!review) {
                setReview(true);
                return;
              }
              const id = await pedido.confirmar();
              setReview(false);
              if (id) {
                onCreated();
                navigate(`/remisiones/${id}`);
              }
            }}
          >
            {pedido.enviando
              ? "Registrando venta…"
              : review
                ? "Confirmar venta"
                : "Revisar pedido"}
          </Button>
          {review && !blocked && (
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setReview(false)}
            >
              Seguir editando
            </Button>
          )}
        </>
      )}
    </aside>
  );
}
