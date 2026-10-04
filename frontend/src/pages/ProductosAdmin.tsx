import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Package, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { productosAdminService } from "@/services/productosAdminService";
import type { Producto } from "@/types/schemas";
import { normalize } from "@/lib/catalog";
import { formatCOP } from "@/lib/cartera";
export function AccesoProductos() {
  return (
    <div className="empty-state">
      <h1>Acceso restringido</h1>
      <p>Solo administradores pueden gestionar productos e imágenes.</p>
      <Button asChild>
        <Link to="/catalogo">Volver al catálogo</Link>
      </Button>
    </div>
  );
}
export default function ProductosAdmin() {
  const { perfil } = useAuth();
  return perfil?.rol === "ADMIN" ? <Listado /> : <AccesoProductos />;
}
function Listado() {
  const [rows, setRows] = useState<Producto[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [search, setSearch] = useState(""),
    [activity, setActivity] = useState("todos"),
    [page, setPage] = useState(1);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    productosAdminService
      .listar()
      .then((data) => {
        if (live) setRows(data);
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error ? e.message : "No pudimos cargar los productos.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  const filtered = rows.filter(
    (p) =>
      normalize(`${p.nombre} ${p.sku} ${p.categoria}`).includes(
        normalize(search),
      ) &&
      (activity === "todos" || p.activo === (activity === "activos")),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 15)),
    current = Math.min(page, pages);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN / PRODUCTOS</span>
          <h1>Tu catálogo, al día.</h1>
          <p>Referencias, precios y fotos para la próxima venta.</p>
        </div>
        <div className="receipt-tools">
          <Button asChild variant="outline">
            <Link to="/catalogo">Ver catálogo</Link>
          </Button>
          <Button asChild>
            <Link to="/productos/nuevo">
              <Plus size={16} />
              Nuevo producto
            </Link>
          </Button>
        </div>
      </div>
      <section className="catalog-panel product-admin-list">
        <div className="product-admin-toolbar">
          <Input
            aria-label="Buscar productos para administrar"
            placeholder="Nombre, SKU o categoría…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="Actividad del producto"
            value={activity}
            onChange={(e) => {
              setActivity(e.target.value);
              setPage(1);
            }}
          >
            <option value="todos">Todos los productos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => setAttempt((v) => v + 1)}
          >
            <RefreshCw size={16} />
            Actualizar productos
          </Button>
        </div>
        {loading ? (
          <div className="empty-state" role="status">
            Consultando productos…
          </div>
        ) : error ? (
          <div className="empty-state" role="alert">
            {error}
          </div>
        ) : !filtered.length ? (
          <div className="empty-state">
            <Package size={32} />
            <h2>No hay productos para mostrar</h2>
            <p>Prueba otra búsqueda o crea una referencia.</p>
          </div>
        ) : (
          <>
            <div className="order-table-wrap">
              <table className="order-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Precio tienda</th>
                    <th>Distribuidor</th>
                    <th>Existencias</th>
                    <th>Estado</th>
                    <th>Administrar</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((current - 1) * 15, current * 15).map((p) => (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.nombre}</strong>
                        <small className="product-row-meta">
                          {p.sku} · {p.categoria}
                        </small>
                      </td>
                      <td>{formatCOP(p.precio_tienda)}</td>
                      <td>{formatCOP(p.precio_distribuidor)}</td>
                      <td>{p.stock_actual}</td>
                      <td>
                        <span
                          className={`product-activity ${p.activo ? "active" : "inactive"}`}
                        >
                          {p.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        <Button asChild variant="outline" size="sm">
                          <Link
                            to={`/productos/${p.id}/editar`}
                            aria-label={`Editar ${p.nombre}`}
                          >
                            <Pencil size={14} />
                            Editar
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="product-admin-toolbar">
              <span>
                {filtered.length} referencias · Página {current} de {pages}
              </span>
              <Button
                variant="outline"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
              >
                Siguiente
              </Button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
