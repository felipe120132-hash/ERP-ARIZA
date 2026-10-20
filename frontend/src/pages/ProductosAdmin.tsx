import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Pencil,
  Package,
  RefreshCw,
  ArrowUpRight,
  Trash2,
  Power,
} from "lucide-react";
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
    [actionMessage, setActionMessage] = useState(""),
    [actionError, setActionError] = useState(""),
    [busyId, setBusyId] = useState<string | null>(null),
    [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null),
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

  async function toggleActivo(producto: Producto) {
    if (busyId) return;
    setBusyId(producto.id);
    setActionError("");
    setActionMessage("");
    try {
      const updated = await productosAdminService.cambiarEstadoActivo(
        producto,
        !producto.activo,
      );
      setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setActionMessage(
        updated.activo
          ? `Producto "${updated.nombre}" activado correctamente.`
          : `Producto "${updated.nombre}" desactivado. Su historial se conserva.`,
      );
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : "No se pudo cambiar el estado del producto.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function ejecutarEliminar(producto: Producto) {
    if (busyId) return;
    setBusyId(producto.id);
    setActionError("");
    setActionMessage("");
    try {
      const res = await productosAdminService.eliminarODesactivar(producto);
      setConfirmDeleteId(null);
      if (res.accion === "ELIMINADO") {
        setRows((prev) => prev.filter((x) => x.id !== producto.id));
      } else if (res.producto) {
        setRows((prev) =>
          prev.map((x) => (x.id === res.producto!.id ? res.producto! : x)),
        );
      }
      setActionMessage(res.mensaje);
    } catch (e) {
      setConfirmDeleteId(null);
      setActionError(
        e instanceof Error ? e.message : "No se pudo eliminar el producto.",
      );
    } finally {
      setBusyId(null);
    }
  }

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
          <p>
            Administración centralizada de referencias, precios, estado e
            inventario.
          </p>
        </div>
        <div className="receipt-tools">
          <Button asChild variant="outline">
            <Link to="/inventario">Ver inventario</Link>
          </Button>
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
      {actionMessage && (
        <p role="status" className="order-success">
          {actionMessage}
        </p>
      )}
      {actionError && (
        <p role="alert" className="error-box">
          {actionError}
        </p>
      )}
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
                        {confirmDeleteId === p.id ? (
                          <div className="receipt-tools table-action-group">
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId === p.id}
                              onClick={() => void ejecutarEliminar(p)}
                            >
                              Confirmar eliminación
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busyId === p.id}
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <div className="receipt-tools table-action-group">
                            <Button asChild variant="outline" size="sm">
                              <Link
                                to={`/productos/${p.id}/editar`}
                                aria-label={`Editar ${p.nombre}`}
                              >
                                <Pencil size={14} />
                                Editar
                              </Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link
                                to={`/inventario/${p.id}`}
                                aria-label={`Ver kardex de ${p.nombre}`}
                              >
                                <ArrowUpRight size={14} />
                                Kardex
                              </Link>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busyId === p.id}
                              aria-label={`${p.activo ? "Desactivar" : "Activar"} ${p.nombre}`}
                              onClick={() => void toggleActivo(p)}
                            >
                              <Power size={14} />
                              {p.activo ? "Desactivar" : "Activar"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="table-action-danger"
                              disabled={busyId === p.id}
                              aria-label={`Eliminar ${p.nombre}`}
                              onClick={() => setConfirmDeleteId(p.id)}
                            >
                              <Trash2 size={14} />
                              Eliminar
                            </Button>
                          </div>
                        )}
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
