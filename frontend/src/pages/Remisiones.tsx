import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { remisionesService } from "@/services/remisionesService";
import { clientesService } from "@/services/clientesService";
import type { Cliente, Remision } from "@/types/schemas";
import { normalize } from "@/lib/catalog";
const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
export default function Remisiones() {
  const [rows, setRows] = useState<Remision[]>([]),
    [clientes, setClientes] = useState<Cliente[]>([]),
    [error, setError] = useState<string | null>(null),
    [warning, setWarning] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0);
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "",
    estado = params.get("estado") ?? "",
    pago = params.get("pago") ?? "",
    cliente = params.get("cliente") ?? "";
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setWarning(null);
    Promise.all([
      remisionesService.listarRemisiones(),
      clientesService.listarClientes(),
    ])
      .then(([result, clients]) => {
        if (active) {
          setRows(result.data ?? []);
          setError(result.error);
          setClientes(clients.data ?? []);
          if (clients.error)
            setWarning(
              "No pudimos cargar los nombres de clientes. Se muestran sus identificadores.",
            );
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError("No pudimos cargar las remisiones.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const names = new Map(clientes.map((x) => [x.id, x.nombre_tienda]));
  const filtered = rows.filter(
    (x) =>
      (!estado || x.estado === estado) &&
      (!pago || x.tipo_pago === pago) &&
      (!cliente || x.cliente_id === cliente) &&
      normalize(
        `${x.consecutivo} ${names.get(x.cliente_id) ?? x.cliente_id}`,
      ).includes(normalize(search)),
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
          <span className="eyebrow">VENTAS / HISTORIAL</span>
          <h1>Remisiones</h1>
          <p>Cada venta, con su detalle y sus importes definitivos.</p>
        </div>
        <div className="order-actions">
          <Button
            variant="outline"
            onClick={() => setAttempt((x) => x + 1)}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Actualizar
          </Button>
          <Button asChild>
            <Link to="/catalogo">
              <Plus size={16} />
              Nuevo pedido
            </Link>
          </Button>
        </div>
      </div>
      <section className="catalog-panel">
        <div className="history-filters">
          <Input
            aria-label="Buscar remisión o cliente"
            placeholder="Buscar consecutivo o cliente…"
            value={search}
            onChange={(e) => change("q", e.target.value)}
          />
          <select
            aria-label="Estado de remisión"
            value={estado}
            onChange={(e) => change("estado", e.target.value)}
          >
            <option value="">Todos los estados</option>
            {["PENDIENTE", "PAGADA", "ANULADA"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            aria-label="Forma de pago"
            value={pago}
            onChange={(e) => change("pago", e.target.value)}
          >
            <option value="">Todos los pagos</option>
            <option>CONTADO</option>
            <option>CREDITO</option>
          </select>
          <select
            aria-label="Filtrar cliente"
            value={cliente}
            onChange={(e) => change("cliente", e.target.value)}
          >
            <option value="">Todos los clientes</option>
            {clientes.map((x) => (
              <option value={x.id} key={x.id}>
                {x.nombre_tienda}
              </option>
            ))}
          </select>
        </div>
        {warning && (
          <p className="warning-box" role="status">
            {warning}
          </p>
        )}
        {loading ? (
          <div className="empty-state" role="status">
            Cargando remisiones…
          </div>
        ) : error ? (
          <div className="empty-state" role="alert">
            <p>{error}</p>
            <Button onClick={() => setAttempt((x) => x + 1)}>
              Volver a intentar
            </Button>
          </div>
        ) : !filtered.length ? (
          <div className="empty-state">
            <h2>No hay remisiones para mostrar</h2>
            <p>Crea un pedido o modifica los filtros.</p>
            <Button variant="outline" onClick={() => setParams({})}>
              Limpiar filtros
            </Button>
          </div>
        ) : (
          <>
            <div className="order-table-wrap">
              <table className="order-table remisiones-table">
                <thead>
                  <tr role="row">
                    <th role="columnheader">Remisión</th>
                    <th role="columnheader">Cliente</th>
                    <th role="columnheader">Fecha</th>
                    <th role="columnheader">Pago</th>
                    <th role="columnheader">Estado</th>
                    <th role="columnheader">Total</th>
                    <th role="columnheader">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((page - 1) * 15, page * 15).map((row) => (
                    <tr key={row.id} role="row">
                      <td role="cell" data-label="Remisión">
                        <strong>#{row.consecutivo}</strong>
                      </td>
                      <td role="cell" data-label="Cliente">
                        {names.get(row.cliente_id) ?? row.cliente_id}
                      </td>
                      <td role="cell" data-label="Fecha">
                        {row.fecha.toLocaleDateString("es-CO")}
                      </td>
                      <td role="cell" data-label="Pago">
                        {row.tipo_pago === "CREDITO" ? "Crédito" : "Contado"}
                      </td>
                      <td role="cell" data-label="Estado">
                        <span
                          className={`remision-status ${row.estado.toLowerCase()}`}
                        >
                          {row.estado}
                        </span>
                      </td>
                      <td role="cell" data-label="Total" className="remision-total-cell">
                        {money(row.total)}
                      </td>
                      <td role="cell" data-label="Acción" className="remision-action-cell">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="remision-modify-btn"
                        >
                          <Link
                            aria-label={`Modificar remisión ${row.consecutivo} · Ver remisión ${row.consecutivo}`}
                            title={`Modificar remisión #${row.consecutivo}`}
                            to={`/remisiones/${row.id}`}
                          >
                            <Pencil size={14} />
                            Modificar
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="catalog-pagination">
              <span>{filtered.length} remisiones</span>
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
    </>
  );
}
