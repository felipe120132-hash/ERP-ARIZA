import AccionesRemision from "@/components/remisiones/AccionesRemision";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { remisionesService } from "@/services/remisionesService";
import { productosService } from "@/services/productosService";
import { clientesService } from "@/services/clientesService";
import type { Remision, DetalleRemision } from "@/types/schemas";
import { usePedido } from "@/context/PedidoContext";
const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
export default function DetalleRemisionPage() {
  const { id } = useParams();
  const pedido = usePedido();
  const [remision, setRemision] = useState<Remision | null>(null),
    [lines, setLines] = useState<DetalleRemision[]>([]),
    [names, setNames] = useState<Record<string, string>>({}),
    [client, setClient] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [warning, setWarning] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const changingRemision = !remision || remision.id !== id;
    if (changingRemision) {
      setLoading(true);
      setRemision(null);
      setLines([]);
      setClient("");
    }
    setError(null);
    setWarning(null);
    async function load() {
      try {
        if (!id || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) {
          throw new Error("El identificador de la remisión no es válido.");
        }
        const [header, details, products] = await Promise.all([
          remisionesService.obtenerRemisionPorId(id),
          remisionesService.obtenerDetallesRemision(id),
          productosService.listarProductos(),
        ]);
        if (!active) return;
        if (header.error || !header.data)
          throw new Error(header.error ?? "Remisión no encontrada.");
        if (details.error) throw new Error(details.error);
        setRemision(header.data);
        setLines(details.data ?? []);
        setNames(
          Object.fromEntries(
            (products.data ?? []).map((x) => [x.id, x.nombre]),
          ),
        );
        const result = await clientesService.obtenerClientePorId(
          header.data.cliente_id,
        );
        if (active) {
          setClient(result.data?.nombre_tienda ?? header.data.cliente_id);
          if (products.error || result.error)
            setWarning(
              "Algunos nombres no están disponibles. Se muestran los identificadores originales.",
            );
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "No pudimos cargar el detalle.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id, attempt]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">VENTAS / REMISIÓN</span>
          <h1>
            {remision
              ? `Remisión #${remision.consecutivo}`
              : "Detalle de remisión"}
          </h1>
          <p>Importes registrados por el sistema.</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/remisiones">
            <ArrowLeft size={16} />
            Historial
          </Link>
        </Button>
      </div>
      {pedido.creada === id && (
        <div className="order-success" role="status">
          La venta se registró correctamente. Puedes consultar su detalle sin
          volver a enviarla.
        </div>
      )}
      {loading ? (
        <div className="empty-state" role="status">
          Cargando remisión…
        </div>
      ) : error ? (
        <div className="empty-state" role="alert">
          <p>{error}</p>
          <Button onClick={() => setAttempt((x) => x + 1)}>
            Reintentar lectura
          </Button>
        </div>
      ) : (
        remision && (
          <section className="catalog-panel receipt">
            <div className="receipt-heading">
              <div>
                <span className="eyebrow">DISTRIBUCIONES ARIZA</span>
                <h2>{client}</h2>
                <p>{remision.fecha.toLocaleString("es-CO")}</p>
              </div>
              <span
                className={`remision-status ${remision.estado.toLowerCase()}`}
              >
                {remision.estado}
              </span>
            </div>
            <AccionesRemision
              key={remision.id}
              remision={remision}
              onUpdated={() => setAttempt((x) => x + 1)}
            />
            <div className="receipt-meta">
              <span>
                Pago:{" "}
                <strong>
                  {remision.tipo_pago === "CREDITO" ? "Crédito" : "Contado"}
                </strong>
              </span>
              <span>
                IVA:{" "}
                <strong>
                  {remision.aplica_iva
                    ? "Aplicado por producto"
                    : "No aplicado"}
                </strong>
              </span>
              {remision.pdf_url && (
                <span>
                  OneDrive:{" "}
                  <strong>
                    <a
                      href={remision.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: "underline" }}
                    >
                      PDF principal guardado
                    </a>
                  </strong>
                </span>
              )}
            </div>
            {warning && <p className="warning-box">{warning}</p>}
            <div className="order-table-wrap">
              <table className="order-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Precio unitario</th>
                    <th>Subtotal</th>
                    <th>IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td>{names[line.producto_id] ?? line.producto_id}</td>
                      <td>{line.cantidad.toLocaleString("es-CO")}</td>
                      <td>{money(line.precio_unitario)}</td>
                      <td>{money(line.subtotal_linea)}</td>
                      <td>
                        {money(line.iva_linea)}{" "}
                        <small>({line.tasa_iva_aplicada}%)</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!lines.length && (
              <p className="error-box">
                No se encontraron líneas para esta remisión.
              </p>
            )}
            <dl className="receipt-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{money(remision.subtotal)}</dd>
              </div>
              <div>
                <dt>IVA</dt>
                <dd>{money(remision.iva)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{money(remision.total)}</dd>
              </div>
            </dl>
            <div className="receipt-footer">
              <p>
                El PDF se genera con los datos vigentes de la remisión para
                descarga, impresión o guardado directo en el OneDrive de la
                empresa.
              </p>
              <Button asChild>
                <Link to="/catalogo">
                  <Plus size={16} />
                  Ir al catálogo
                </Link>
              </Button>
            </div>
          </section>
        )
      )}
    </>
  );
}
