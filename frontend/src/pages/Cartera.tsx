import { useAuth } from "@/context/AuthContext";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Wallet,
  Users,
  CircleAlert,
  RefreshCw,
  ArrowUpRight,
  Plus,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientesService } from "@/services/clientesService";
import RegistrarAbono from "@/components/cartera/RegistrarAbono";
import { formatCOP } from "@/lib/cartera";
import { normalize } from "@/lib/catalog";
import type { Cliente } from "@/types/schemas";
export default function Cartera() {
  const { perfil } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0),
    [pay, setPay] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const latestParams = useRef(new URLSearchParams(params));
  useEffect(() => {
    latestParams.current = new URLSearchParams(params);
  }, [params]);
  const q = params.get("q") ?? "",
    estado = params.get("estado") ?? "todos",
    tipo = params.get("tipo") ?? "todos",
    actividad = params.get("actividad") ?? "todos";
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    clientesService
      .listarClientes()
      .then((result) => {
        if (active) {
          setClientes(result.data ?? []);
          setError(result.error);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("No pudimos cargar la cartera.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const filtered = clientes.filter(
    (x) =>
      normalize(
        `${x.nombre_tienda} ${x.contacto ?? ""} ${x.telefono ?? ""}`,
      ).includes(normalize(q)) &&
      (tipo === "todos" || x.tipo_cliente === tipo) &&
      (actividad === "todos" ||
        (actividad === "activos" && x.activo) ||
        (actividad === "inactivos" && !x.activo)) &&
      (estado === "todos" ||
        (estado === "saldo" && x.saldo_cartera > 0) ||
        (estado === "mora" && x.en_mora) ||
        (estado === "sin-saldo" && x.saldo_cartera === 0)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 15)),
    page = Math.min(
      pages,
      Math.max(1, Math.floor(Number(params.get("pagina")) || 1)),
    );
  const saldo =
      clientes.reduce((sum, x) => sum + Math.round(x.saldo_cartera * 100), 0) /
      100,
    mora =
      clientes
        .filter((x) => x.en_mora)
        .reduce((sum, x) => sum + Math.round(x.saldo_cartera * 100), 0) / 100;
  function change(key: string, value: string) {
    const next = new URLSearchParams(latestParams.current);
    value ? next.set(key, value) : next.delete(key);
    if (key !== "pagina") next.delete("pagina");
    latestParams.current = next;
    setParams(next, { replace: true });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CARTERA / CLIENTES</span>
          <h1>Cuentas claras.</h1>
          <p>
            Consulta saldos, revisa movimientos y registra los pagos recibidos.
          </p>
        </div>
        <div className="receipt-tools">
          {perfil?.rol === "ADMIN" && (
            <Button asChild>
              <Link to="/cartera/nuevo">
                <Plus size={16} />
                Crear cliente
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setAttempt((x) => x + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Actualizar
          </Button>
        </div>
      </div>
      <div className="catalog-stats portfolio-stats">
        <div>
          <span className="stat-icon">
            <Wallet size={20} />
          </span>
          <div>
            <small>Cartera total</small>
            <strong>{loading || error ? "—" : formatCOP(saldo)}</strong>
          </div>
        </div>
        <div>
          <span className="stat-icon amber">
            <CircleAlert size={20} />
          </span>
          <div>
            <small>Saldo de clientes en mora</small>
            <strong>{loading || error ? "—" : formatCOP(mora)}</strong>
          </div>
        </div>
        <div>
          <span className="stat-icon">
            <Users size={20} />
          </span>
          <div>
            <small>Clientes con saldo</small>
            <strong>
              {loading || error
                ? "—"
                : clientes.filter((x) => x.saldo_cartera > 0).length}
              <span>de {clientes.length}</span>
            </strong>
          </div>
        </div>
      </div>
      <section className="catalog-panel">
        <div className="catalog-panel-heading">
          <div>
            <h2>Cartera y clientes</h2>
            <p>
              Incluye clientes activos e inactivos con historial. La mora es la
              informada por el sistema.
            </p>
          </div>
        </div>
        <div className="history-filters inventory-filters">
          <Input
            aria-label="Buscar cliente"
            placeholder="Nombre, contacto o teléfono…"
            value={q}
            onChange={(e) => change("q", e.target.value)}
          />
          <select
            aria-label="Estado de cartera"
            value={estado}
            onChange={(e) => change("estado", e.target.value)}
          >
            <option value="todos">Todos los clientes</option>
            <option value="saldo">Con saldo</option>
            <option value="mora">En mora</option>
            <option value="sin-saldo">Sin saldo</option>
          </select>
          <select
            aria-label="Tipo de cliente"
            value={tipo}
            onChange={(e) => change("tipo", e.target.value)}
          >
            <option value="todos">Todos los tipos</option>
            <option value="TIENDA">Tienda</option>
            <option value="DISTRIBUIDOR">Distribuidor</option>
          </select>
          <select
            aria-label="Actividad del cliente"
            value={actividad}
            onChange={(e) => change("actividad", e.target.value)}
          >
            <option value="todos">Activos e inactivos</option>
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
          </select>
        </div>
        {loading ? (
          <div className="empty-state" role="status">
            Cargando cartera…
          </div>
        ) : error ? (
          <div className="empty-state" role="alert">
            <p>{error}</p>
            <Button onClick={() => setAttempt((x) => x + 1)}>
              Reintentar cartera
            </Button>
          </div>
        ) : !filtered.length ? (
          <div className="empty-state">
            <Users />
            <h2>No hay clientes para mostrar</h2>
            <p>
              {clientes.length
                ? "Prueba con otra búsqueda o modifica los filtros."
                : "Los clientes aparecerán aquí cuando estén registrados."}
            </p>
            {clientes.length > 0 && (
              <Button variant="outline" onClick={() => setParams({})}>
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="order-table-wrap">
              <table className="order-table cartera-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Saldo</th>
                    <th>Mora</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((page - 1) * 15, page * 15).map((x) => (
                    <tr key={x.id}>
                      <td>
                        <strong>{x.nombre_tienda}</strong>
                        <small>
                          {x.contacto ?? "Sin contacto"}
                          {!x.activo ? " · Inactivo" : ""}
                        </small>
                      </td>
                      <td>
                        {x.tipo_cliente === "TIENDA"
                          ? "Tienda"
                          : "Distribuidor"}
                      </td>
                      <td className="balance-cell">
                        {formatCOP(x.saldo_cartera)}
                      </td>
                      <td>
                        <span
                          className={`remision-status ${x.en_mora ? "pendiente" : "pagada"}`}
                        >
                          {x.en_mora ? "En mora" : "Sin marca de mora"}
                        </span>
                      </td>
                      <td>
                        <div className="client-actions">
                          <Button asChild variant="outline" size="sm">
                            <Link
                              to={`/cartera/${x.id}`}
                              aria-label={`Ver historial de ${x.nombre_tienda}`}
                              title={`Ver historial, remisiones y abonos de ${x.nombre_tienda}`}
                            >
                              <ArrowUpRight size={15} />
                              Historial
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={x.saldo_cartera <= 0}
                            aria-label={`Registrar abono a ${x.nombre_tienda}`}
                            onClick={() => setPay(x.id)}
                          >
                            <Plus size={15} />
                            Abonar
                          </Button>
                          {perfil?.rol === "ADMIN" && (
                            <Button asChild variant="ghost" size="sm">
                              <Link
                                to={`/cartera/${x.id}/administrar`}
                                aria-label={`Administrar ${x.nombre_tienda}`}
                                title={`Editar datos, estado y precios especiales de ${x.nombre_tienda}`}
                              >
                                <Pencil size={14} />
                                Administrar
                              </Link>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="catalog-pagination">
              <span>{filtered.length} clientes</span>
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
        El saldo se consulta al servidor. Registrar un abono no cambia desde
        esta pantalla el estado de las remisiones.
      </p>
      {pay && (
        <RegistrarAbono
          key={pay}
          clienteId={pay}
          onClose={() => setPay(null)}
          onRecorded={() => setAttempt((x) => x + 1)}
        />
      )}
    </>
  );
}
