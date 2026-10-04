import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Boxes,
  CircleAlert,
  CircleCheck,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { productosService } from "@/services/productosService";
import type { Producto, AlertaStock } from "@/types/schemas";
import { normalize } from "@/lib/catalog";
const stateLabels = {
  ROJO: "Crítico",
  AMARILLO: "Por agotarse",
  VERDE: "Disponible",
};
export default function Inventario() {
  const [products, setProducts] = useState<Producto[]>([]),
    [alerts, setAlerts] = useState<AlertaStock[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [warning, setWarning] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0);
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "",
    category = params.get("categoria") ?? "todos",
    status = params.get("estado") ?? "todos",
    active = params.get("actividad") ?? "activos";
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setWarning(null);
    Promise.all([
      productosService.listarProductos(),
      productosService.listarAlertasStock(),
    ])
      .then(([p, a]) => {
        if (live) {
          setProducts(p.data ?? []);
          setAlerts(a.data ?? []);
          setError(p.error);
          setWarning(
            a.error
              ? "No pudimos consultar las alertas. Puedes consultar las existencias y volver a intentar cargar los estados."
              : null,
          );
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) {
          setError("No pudimos cargar el inventario.");
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  const map = new Map(alerts.map((x) => [x.id, x.semaforo])),
    actives = products.filter((x) => x.activo),
    complete = !warning && actives.every((x) => map.has(x.id));
  const categories = [...new Set(products.map((x) => x.categoria))].sort();
  const filtered = products.filter(
    (x) =>
      (active === "todos" ||
        (active === "activos" && x.activo) ||
        (active === "inactivos" && !x.activo)) &&
      (category === "todos" || x.categoria === category) &&
      normalize(`${x.nombre} ${x.sku}`).includes(normalize(q)) &&
      (status === "todos" ||
        (status === "sin-estado" && !map.has(x.id)) ||
        map.get(x.id) === status),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 15)),
    page = Math.min(
      pages,
      Math.max(1, Math.floor(Number(params.get("pagina")) || 1)),
    );
  function change(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        value ? next.set(key, value) : next.delete(key);
        if (key !== "pagina") next.delete("pagina");
        return next;
      },
      { replace: true },
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">OPERACIÓN / INVENTARIO</span>
          <h1>Cada unidad cuenta.</h1>
          <p>Existencias, alertas y trazabilidad de tus productos.</p>
        </div>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => setAttempt((x) => x + 1)}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Actualizar
        </Button>
      </div>
      <div className="catalog-stats">
        <div>
          <span className="stat-icon">
            <Boxes size={20} />
          </span>
          <div>
            <small>Referencias activas</small>
            <strong>
              {loading || error ? "—" : actives.length}
              <span>productos</span>
            </strong>
          </div>
        </div>
        <div>
          <span className="stat-icon">
            <CircleCheck size={20} />
          </span>
          <div>
            <small>Stock disponible</small>
            <strong>
              {loading || error || !complete
                ? "—"
                : actives.filter((x) => map.get(x.id) === "VERDE").length}
              <span>referencias activas</span>
            </strong>
          </div>
        </div>
        <div>
          <span className="stat-icon amber">
            <CircleAlert size={20} />
          </span>
          <div>
            <small>Stock crítico</small>
            <strong>
              {loading || error || !complete
                ? "—"
                : actives.filter((x) => map.get(x.id) === "ROJO").length}
              <span>referencias activas</span>
            </strong>
          </div>
        </div>
      </div>
      <section className="catalog-panel">
        <div className="catalog-panel-heading">
          <div>
            <h2>Existencias y alertas</h2>
            <p>Los estados se consultan directamente al sistema.</p>
          </div>
        </div>
        <div className="history-filters inventory-filters">
          <Input
            aria-label="Buscar producto en inventario"
            placeholder="Buscar nombre o SKU…"
            value={q}
            onChange={(e) => change("q", e.target.value)}
          />
          <select
            aria-label="Categoría de inventario"
            value={category}
            onChange={(e) => change("categoria", e.target.value)}
          >
            <option value="todos">Todas las categorías</option>
            {categories.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            aria-label="Estado de stock"
            value={status}
            onChange={(e) => change("estado", e.target.value)}
          >
            <option value="todos">Todos los estados</option>
            <option value="ROJO">Crítico</option>
            <option value="AMARILLO">Por agotarse</option>
            <option value="VERDE">Disponible</option>
            <option value="sin-estado">Sin estado disponible</option>
          </select>
          <select
            aria-label="Actividad del producto"
            value={active}
            onChange={(e) => change("actividad", e.target.value)}
          >
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Activos e inactivos</option>
          </select>
        </div>
        {warning && !loading && (
          <div className="warning-box" role="status">
            {warning}
            <Button variant="outline" onClick={() => setAttempt((x) => x + 1)}>
              Reintentar alertas
            </Button>
          </div>
        )}
        {loading ? (
          <div className="empty-state" role="status">
            Cargando inventario…
          </div>
        ) : error ? (
          <div className="empty-state" role="alert">
            <p>{error}</p>
            <Button onClick={() => setAttempt((x) => x + 1)}>
              Reintentar inventario
            </Button>
          </div>
        ) : warning && status !== "todos" ? (
          <div className="empty-state">
            <h3>No se puede evaluar el filtro de estado</h3>
            <Button variant="outline" onClick={() => change("estado", "todos")}>
              Mostrar existencias sin filtrar por estado
            </Button>
          </div>
        ) : !filtered.length ? (
          <div className="empty-state">
            <Boxes />
            <h3>No hay productos para mostrar</h3>
            <p>Revisa los filtros o busca otra referencia.</p>
            <Button variant="outline" onClick={() => setParams({})}>
              Limpiar filtros
            </Button>
          </div>
        ) : (
          <>
            <div className="order-table-wrap">
              <table className="order-table inventory-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Origen</th>
                    <th>Existencias</th>
                    <th>Mínimo</th>
                    <th>Estado</th>
                    <th>Historial</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((page - 1) * 15, page * 15).map((x) => (
                    <tr key={x.id}>
                      <td>
                        <strong>{x.nombre}</strong>
                        <small>
                          {x.sku} · {x.categoria}
                          {!x.activo ? " · Inactivo" : ""}
                        </small>
                      </td>
                      <td>{x.origen ?? "Sin especificar"}</td>
                      <td className="balance-cell">
                        {x.stock_actual.toLocaleString("es-CO")}
                      </td>
                      <td>{x.stock_minimo.toLocaleString("es-CO")}</td>
                      <td>
                        <span
                          className={`inventory-state ${(map.get(x.id) ?? "").toLowerCase()}`}
                        >
                          <i />
                          {map.has(x.id)
                            ? stateLabels[map.get(x.id)!]
                            : "Sin estado disponible"}
                        </span>
                      </td>
                      <td>
                        <Button asChild variant="ghost" size="icon">
                          <Link
                            to={`/inventario/${x.id}`}
                            aria-label={`Ver movimientos de ${x.nombre}`}
                          >
                            <ArrowUpRight size={18} />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="catalog-pagination">
              <span>{filtered.length} referencias</span>
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
                  disabled={page === pages}
                  onClick={() => change("pagina", String(page + 1))}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
      <p className="catalog-footnote">
        Consulta de inventario. Las ventas y sus anulaciones generan los
        movimientos correspondientes desde el backend.
      </p>
    </>
  );
}
