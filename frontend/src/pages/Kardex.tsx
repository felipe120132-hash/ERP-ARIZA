import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { productosService } from "@/services/productosService";
import {
  inventarioService,
  type TipoMovimiento,
} from "@/services/inventarioService";
import type { Producto, Kardex } from "@/types/schemas";
import { useAuth } from "@/context/AuthContext";
export default function KardexPage() {
  const { perfil } = useAuth();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const raw = params.get("tipo") ?? "",
    tipo = (["ENTRADA", "SALIDA", "AJUSTE"].includes(raw) ? raw : undefined) as
      TipoMovimiento | undefined;
  const page = Math.max(1, Math.floor(Number(params.get("pagina")) || 1));
  const [product, setProduct] = useState<Producto | null>(null),
    [rows, setRows] = useState<Kardex[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setProduct(null);
    setRows([]);
    async function load() {
      try {
        if (!id || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))
          throw new Error("El identificador del producto no es válido.");
        const [p, k] = await Promise.all([
          productosService.obtenerProductoPorId(id),
          inventarioService.listarMovimientos({
            producto_id: id,
            tipo,
            pagina: page,
          }),
        ]);
        if (!active) return;
        if (p.error || !p.data || k.error || !k.data)
          throw new Error(p.error ?? k.error ?? "Producto no encontrado.");
        setProduct(p.data);
        setRows(k.data.movimientos);
        setTotal(k.data.total);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "No pudimos consultar el historial.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id, tipo, page, attempt]);
  const pages = Math.max(1, Math.ceil(total / 20));
  function change(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        value ? next.set(key, value) : next.delete(key);
        if (key === "tipo") next.delete("pagina");
        return next;
      },
      { replace: true },
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">INVENTARIO / KARDEX</span>
          <h1>{product?.nombre ?? "Historial de inventario"}</h1>
          <p>La trazabilidad de cada entrada, salida y ajuste registrado.</p>
        </div>
        <div className="order-actions">
          {perfil?.rol === "ADMIN" && product?.activo && !loading && !error && (
            <Button asChild>
              <Link to={`/inventario/${id}/movimiento`}>
                Preparar movimiento
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/inventario">
              <ArrowLeft size={16} />
              Inventario
            </Link>
          </Button>
          <Button
            variant="outline"
            aria-label="Actualizar movimientos"
            disabled={loading}
            onClick={() => setAttempt((x) => x + 1)}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>
      {product && !loading && (
        <div className="inventory-product-summary">
          <div>
            <span className="eyebrow">
              {product.sku} · {product.activo ? "ACTIVO" : "INACTIVO"}
            </span>
            <h2>{product.categoria}</h2>
            <p>{product.origen ?? "Origen no especificado"}</p>
          </div>
          <div>
            <small>Existencias actuales</small>
            <strong>
              {product.stock_actual.toLocaleString("es-CO")}{" "}
              <span>unidades</span>
            </strong>
          </div>
          <div>
            <small>Stock mínimo</small>
            <strong>{product.stock_minimo.toLocaleString("es-CO")}</strong>
          </div>
        </div>
      )}
      <section className="catalog-panel">
        <div className="catalog-panel-heading">
          <div>
            <h2>Movimientos de inventario</h2>
            <p>Del más reciente al más antiguo.</p>
          </div>
          <select
            className="inventory-type"
            aria-label="Tipo de movimiento"
            value={tipo ?? ""}
            onChange={(e) => change("tipo", e.target.value)}
          >
            <option value="">Todos los movimientos</option>
            <option value="ENTRADA">Entradas</option>
            <option value="SALIDA">Salidas</option>
            <option value="AJUSTE">Ajustes</option>
          </select>
        </div>
        {loading ? (
          <div className="empty-state" role="status">
            Cargando movimientos…
          </div>
        ) : error ? (
          <div className="empty-state" role="alert">
            <p>{error}</p>
            <Button onClick={() => setAttempt((x) => x + 1)}>
              Reintentar movimientos
            </Button>
          </div>
        ) : !rows.length ? (
          <div className="empty-state">
            <Boxes />
            <h3>
              {page > 1
                ? "Esta página no tiene movimientos"
                : "No hay movimientos para mostrar"}
            </h3>
            <p>
              {tipo
                ? "Prueba con otro tipo de movimiento."
                : "Los movimientos aparecerán cuando se registren operaciones de inventario."}
            </p>
            {page > 1 && (
              <Button onClick={() => change("pagina", "1")}>
                Volver a la primera página
              </Button>
            )}
          </div>
        ) : (
          <div className="order-table-wrap">
            <table className="order-table kardex-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento</th>
                  <th>Cantidad</th>
                  <th>Stock resultante</th>
                  <th>Referencia</th>
                  <th>Observación</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id}>
                    <td>{x.created_at.toLocaleString("es-CO")}</td>
                    <td>
                      <span
                        className={`movement-type ${x.tipo_movimiento.toLowerCase()}`}
                      >
                        {x.tipo_movimiento === "ENTRADA"
                          ? "Entrada"
                          : x.tipo_movimiento === "SALIDA"
                            ? "Salida"
                            : "Ajuste"}
                      </span>
                    </td>
                    <td>{x.cantidad.toLocaleString("es-CO")}</td>
                    <td className="balance-cell">
                      {x.stock_resultante.toLocaleString("es-CO")}
                    </td>
                    <td>
                      {x.remision_id ? (
                        <Link
                          className="ledger-link"
                          to={`/remisiones/${x.remision_id}`}
                        >
                          Ver remisión
                        </Link>
                      ) : (
                        "Sin remisión asociada"
                      )}
                    </td>
                    <td>{x.observacion ?? "Sin observación"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="catalog-pagination">
            <span>{total} movimientos</span>
            <div>
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => change("pagina", String(page - 1))}
              >
                Anterior
              </Button>
              <span>
                {page} / {pages}
              </span>
              <Button
                variant="outline"
                disabled={page >= pages}
                onClick={() => change("pagina", String(page + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </section>
      <p className="catalog-footnote">
        El stock resultante corresponde al momento de cada movimiento. Las
        cantidades se muestran tal como fueron registradas; no se recalcula el
        historial.
      </p>
    </>
  );
}
