import { useAuth } from "@/context/AuthContext";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Phone,
  MapPin,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientesService } from "@/services/clientesService";
import { carteraService } from "@/services/carteraService";
import { remisionesService } from "@/services/remisionesService";
import RegistrarAbono from "@/components/cartera/RegistrarAbono";
import { formatCOP } from "@/lib/cartera";
import type { Cliente, AbonoCartera, Remision } from "@/types/schemas";
export default function ClienteDetalle() {
  const { perfil } = useAuth();
  const { id } = useParams();
  const [cliente, setCliente] = useState<Cliente | null>(null),
    [abonos, setAbonos] = useState<AbonoCartera[]>([]),
    [sales, setSales] = useState<Remision[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0),
    [pay, setPay] = useState(false),
    [tab, setTab] = useState<"abonos" | "remisiones">("abonos"),
    [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setCliente(null);
    async function load() {
      try {
        if (!id || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))
          throw new Error("El identificador del cliente no es válido.");
        const [customer, payments, orders] = await Promise.all([
          clientesService.obtenerClientePorId(id),
          carteraService.listarAbonos({ cliente_id: id }),
          remisionesService.listarRemisiones({ cliente_id: id }),
        ]);
        if (!active) return;
        if (customer.error || !customer.data || payments.error || orders.error)
          throw new Error(
            customer.error ??
              payments.error ??
              orders.error ??
              "Cliente no encontrado.",
          );
        setCliente(customer.data);
        setAbonos((payments.data ?? []).filter((x) => x.cliente_id === id));
        setSales((orders.data ?? []).filter((x) => x.cliente_id === id));
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "No pudimos cargar el historial.",
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
  const count = tab === "abonos" ? abonos.length : sales.length,
    pages = Math.max(1, Math.ceil(count / 10)),
    current = Math.min(page, pages),
    saleNames = new Map(sales.map((x) => [x.id, x.consecutivo]));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CARTERA / HISTORIAL</span>
          <h1>{cliente?.nombre_tienda ?? "Detalle del cliente"}</h1>
          <p>Un recorrido por sus remisiones y pagos.</p>
        </div>
        <div className="order-actions">
          {perfil?.rol === "ADMIN" && cliente && (
            <Button asChild variant="outline">
              <Link to={`/cartera/${cliente.id}/administrar`}>
                Administrar cliente
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/cartera">
              <ArrowLeft size={16} />
              Clientes
            </Link>
          </Button>
          <Button
            variant="outline"
            aria-label="Actualizar historial"
            disabled={loading}
            onClick={() => setAttempt((x) => x + 1)}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="empty-state" role="status">
          Cargando historial…
        </div>
      ) : error ? (
        <div className="empty-state" role="alert">
          <p>{error}</p>
          <Button onClick={() => setAttempt((x) => x + 1)}>
            Reintentar historial
          </Button>
        </div>
      ) : (
        cliente && (
          <>
            <section className="client-summary">
              <div>
                <span className="eyebrow">
                  {cliente.tipo_cliente === "TIENDA"
                    ? "TIENDA"
                    : "DISTRIBUIDOR"}{" "}
                  · {cliente.activo ? "ACTIVO" : "INACTIVO"}
                </span>
                <h2>Información del cliente</h2>
                <p>
                  <UserRound size={15} />
                  {cliente.contacto ?? "Contacto no registrado"}
                </p>
                <p>
                  <Phone size={15} />
                  {cliente.telefono ?? "Teléfono no registrado"}
                </p>
                <p>
                  <MapPin size={15} />
                  {cliente.direccion ?? "Dirección no registrada"}
                </p>
              </div>
              <div className="client-balance">
                <small>Saldo en cartera</small>
                <strong>{formatCOP(cliente.saldo_cartera)}</strong>
                <span
                  className={`remision-status ${cliente.en_mora ? "pendiente" : "pagada"}`}
                >
                  {cliente.en_mora ? "En mora" : "Sin marca de mora"}
                </span>
                <Button
                  disabled={cliente.saldo_cartera <= 0}
                  onClick={() => setPay(true)}
                >
                  <Plus size={16} />
                  Registrar abono
                </Button>
              </div>
            </section>
            <section className="catalog-panel">
              <div className="client-history-heading">
                <h2>Movimientos del cliente</h2>
                <div
                  className="ledger-switch"
                  role="group"
                  aria-label="Tipo de historial"
                >
                  <Button
                    variant={tab === "abonos" ? "secondary" : "ghost"}
                    aria-pressed={tab === "abonos"}
                    onClick={() => {
                      setTab("abonos");
                      setPage(1);
                    }}
                  >
                    Abonos ({abonos.length})
                  </Button>
                  <Button
                    variant={tab === "remisiones" ? "secondary" : "ghost"}
                    aria-pressed={tab === "remisiones"}
                    onClick={() => {
                      setTab("remisiones");
                      setPage(1);
                    }}
                  >
                    Remisiones ({sales.length})
                  </Button>
                </div>
              </div>
              {!count ? (
                <div className="empty-state">
                  <h3>
                    {tab === "abonos"
                      ? "Todavía no hay abonos registrados"
                      : "Todavía no hay remisiones"}
                  </h3>
                  <p>Los movimientos registrados aparecerán aquí.</p>
                </div>
              ) : (
                <>
                  <div className="order-table-wrap">
                    {tab === "abonos" ? (
                      <table className="order-table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Método</th>
                            <th>Aplicación</th>
                            <th>Monto</th>
                            <th>Comprobante</th>
                          </tr>
                        </thead>
                        <tbody>
                          {abonos
                            .slice((current - 1) * 10, current * 10)
                            .map((x) => (
                              <tr key={x.id}>
                                <td>{x.fecha.toLocaleString("es-CO")}</td>
                                <td>{x.metodo_pago}</td>
                                <td>
                                  {x.remision_id ? (
                                    <Link
                                      className="ledger-link"
                                      to={`/remisiones/${x.remision_id}`}
                                    >
                                      {saleNames.has(x.remision_id)
                                        ? `Remisión #${saleNames.get(x.remision_id)}`
                                        : "Ver remisión"}
                                    </Link>
                                  ) : (
                                    "Cartera general"
                                  )}
                                </td>
                                <td className="balance-cell">
                                  {formatCOP(x.monto)}
                                </td>
                                <td>
                                  <code className="receipt-id">{x.id}</code>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    ) : (
                      <table className="order-table">
                        <thead>
                          <tr>
                            <th>Remisión</th>
                            <th>Fecha</th>
                            <th>Pago</th>
                            <th>Estado</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sales
                            .slice((current - 1) * 10, current * 10)
                            .map((x) => (
                              <tr key={x.id}>
                                <td>
                                  <Link
                                    className="ledger-link"
                                    to={`/remisiones/${x.id}`}
                                  >
                                    #{x.consecutivo}
                                  </Link>
                                </td>
                                <td>{x.fecha.toLocaleDateString("es-CO")}</td>
                                <td>
                                  {x.tipo_pago === "CREDITO"
                                    ? "Crédito"
                                    : "Contado"}
                                </td>
                                <td>
                                  <span
                                    className={`remision-status ${x.estado.toLowerCase()}`}
                                  >
                                    {x.estado}
                                  </span>
                                </td>
                                <td>{formatCOP(x.total)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="catalog-pagination">
                    <span>{count} movimientos</span>
                    <div>
                      <Button
                        variant="outline"
                        disabled={current === 1}
                        onClick={() => setPage(current - 1)}
                      >
                        Anterior
                      </Button>
                      <span>
                        {current} / {pages}
                      </span>
                      <Button
                        variant="outline"
                        disabled={current === pages}
                        onClick={() => setPage(current + 1)}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </section>
            <p className="catalog-footnote">
              Los abonos generales reducen el saldo del cliente. No se asignan
              desde esta pantalla a remisiones específicas ni se modifican sus
              estados.
            </p>
          </>
        )
      )}
      {pay && id && (
        <RegistrarAbono
          key={id}
          clienteId={id}
          onClose={() => setPay(false)}
          onRecorded={() => setAttempt((x) => x + 1)}
        />
      )}
    </>
  );
}
