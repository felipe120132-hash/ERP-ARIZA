import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  RefreshCw,
  Plus,
  ArrowRight,
  ChartNoAxesCombined,
  Wallet,
  Files,
  BellRing,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { resumenService, type CarteraResumen } from "@/services/resumenService";
import { gastosService } from "@/services/gastosService";
import { formatCOP } from "@/lib/cartera";
import type {
  AlertaStock,
  Remision,
  ResumenFinancieroResult,
} from "@/types/schemas";
import type { ServiceResponse } from "@/services/errorHandler";
type Results = {
  cartera: ServiceResponse<CarteraResumen>;
  remisiones: ServiceResponse<{ recientes: Remision[]; pendientes: number }>;
  alertas: ServiceResponse<{ productos: AlertaStock[]; total: number }>;
  finanzas: ServiceResponse<ResumenFinancieroResult> | null;
};
const monthNow = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
export default function Resumen() {
  const { perfil } = useAuth();
  const admin = perfil?.rol === "ADMIN";
  const [attempt, setAttempt] = useState(0),
    [result, setResult] = useState<Results | null>(null),
    [loading, setLoading] = useState(true),
    [updated, setUpdated] = useState<Date | null>(null),
    [month, setMonth] = useState(monthNow);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setResult(null);
    setUpdated(null);
    const current = monthNow();
    setMonth(current);
    async function safe<T>(
      p: Promise<ServiceResponse<T>>,
    ): Promise<ServiceResponse<T>> {
      try {
        return await p;
      } catch {
        return {
          data: null,
          error: "Consulta no disponible. Intenta actualizar.",
        };
      }
    }
    Promise.all([
      safe(resumenService.cartera()),
      safe(resumenService.remisiones()),
      safe(resumenService.alertas()),
      admin
        ? safe(gastosService.resumenFinancieroMensual(current + "-01"))
        : Promise.resolve(null),
    ]).then(([cartera, remisiones, alertas, finanzas]) => {
      if (live) {
        setResult({ cartera, remisiones, alertas, finanzas });
        setUpdated(new Date());
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [attempt, admin]);
  const c = result?.cartera.data,
    r = result?.remisiones.data,
    a = result?.alertas.data,
    f = result?.finanzas?.data;
  const retry = () => setAttempt((x) => x + 1);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TU ESPACIO / RESUMEN</span>
          <h1>Tu operación, a la vista.</h1>
          <p>
            Hola, {perfil?.nombre_completo.split(" ")[0]}. Estas son las
            prioridades de tu negocio.
          </p>
        </div>
        <Button variant="outline" disabled={loading} onClick={retry}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Actualizar resumen
        </Button>
      </div>
      <div className="overview-hero">
        <div>
          <span className="eyebrow">DEL INVENTARIO AL CLIENTE</span>
          <h2>Todo listo para la próxima venta.</h2>
          <p>Consulta existencias, prepara un pedido y sigue cada remisión.</p>
        </div>
        <Button asChild>
          <Link to="/catalogo">
            <Plus size={16} />
            Preparar pedido
          </Link>
        </Button>
      </div>
      <div className={`overview-stats ${admin ? "admin" : ""}`}>
        {admin && (
          <Link to={`/finanzas?mes=${month}`}>
            <i className="overview-stat-icon">
              <ChartNoAxesCombined size={21} />
            </i>
            <small>Ventas del mes · {month}</small>
            <strong>{f ? formatCOP(f.total_ventas) : "—"}</strong>
            <span>
              {result?.finanzas?.error
                ? "Consulta no disponible"
                : "Ver finanzas"}{" "}
              <ArrowUpRight size={14} />
            </span>
          </Link>
        )}
        <Link to="/cartera?estado=saldo">
          <i className="overview-stat-icon">
            <Wallet size={21} />
          </i>
          <small>Cartera pendiente actual</small>
          <strong>{c ? formatCOP(c.saldo) : "—"}</strong>
          <span>
            {c
              ? `${c.clientesConSaldo} clientes con saldo`
              : "Consulta de cartera"}{" "}
            <ArrowUpRight size={14} />
          </span>
        </Link>
        <Link to="/remisiones?estado=PENDIENTE">
          <i className="overview-stat-icon">
            <Files size={21} />
          </i>
          <small>Remisiones pendientes</small>
          <strong>{r ? r.pendientes : "—"}</strong>
          <span>
            Según el estado registrado <ArrowUpRight size={14} />
          </span>
        </Link>
        <Link to="/inventario">
          <i className="overview-stat-icon alert">
            <BellRing size={21} />
          </i>
          <small>Referencias con alerta</small>
          <strong>{a ? a.total : "—"}</strong>
          <span>
            Críticas o por agotarse <ArrowUpRight size={14} />
          </span>
        </Link>
      </div>
      {result?.finanzas?.error && (
        <BlockError
          text="Las ventas del mes no están disponibles."
          retry={retry}
        />
      )}
      <div className="overview-grid">
        <section className="catalog-panel">
          <div className="catalog-panel-heading">
            <div>
              <h2>Remisiones recientes</h2>
              <p>Últimos cinco registros de todos los estados.</p>
            </div>
            <Link className="ledger-link" to="/remisiones">
              Ver todas <ArrowRight size={14} />
            </Link>
          </div>
          {loading ? (
            <Loading />
          ) : result?.remisiones.error ? (
            <BlockError
              text="No pudimos consultar las remisiones."
              retry={retry}
            />
          ) : !r?.recientes.length ? (
            <Empty text="Aún no hay remisiones registradas." />
          ) : (
            <div className="order-table-wrap">
              <table className="order-table">
                <thead>
                  <tr>
                    <th>Remisión</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {r.recientes.map((x) => (
                    <tr key={x.id}>
                      <td>
                        <Link
                          className="ledger-link"
                          to={`/remisiones/${x.id}`}
                        >
                          #{x.consecutivo}
                        </Link>
                      </td>
                      <td>
                        {x.fecha.toLocaleDateString("es-CO", {
                          timeZone: "America/Bogota",
                        })}
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
            </div>
          )}
        </section>
        <section className="catalog-panel">
          <div className="catalog-panel-heading">
            <div>
              <h2>Atención al inventario</h2>
              <p>Primero las referencias críticas.</p>
            </div>
            <Link className="ledger-link" to="/inventario">
              Ver inventario
            </Link>
          </div>
          {loading ? (
            <Loading />
          ) : result?.alertas.error ? (
            <BlockError
              text="No pudimos consultar las alertas."
              retry={retry}
            />
          ) : !a?.productos.length ? (
            <Empty text="No hay alertas de stock registradas." />
          ) : (
            <div className="overview-list">
              {a.productos.map((x) => (
                <Link key={x.id} to={`/inventario/${x.id}`}>
                  <div>
                    <strong>{x.nombre}</strong>
                    <small>
                      {x.sku} · {x.stock_actual.toLocaleString("es-CO")}{" "}
                      unidades · mínimo {x.stock_minimo.toLocaleString("es-CO")}
                    </small>
                  </div>
                  <span
                    className={`inventory-state ${x.semaforo.toLowerCase()}`}
                  >
                    {x.semaforo === "ROJO" ? "Crítico" : "Por agotarse"}
                  </span>
                </Link>
              ))}
              {a.total > a.productos.length && (
                <p>
                  Mostrando {a.productos.length} de {a.total} referencias con
                  alerta.
                </p>
              )}
            </div>
          )}
        </section>
        <section className="catalog-panel overview-collections">
          <div className="catalog-panel-heading">
            <div>
              <h2>Cartera para seguimiento</h2>
              <p>
                {c
                  ? `${c.enMora} clientes con saldo marcados en mora. Prioridad por mora y saldo.`
                  : "Clientes con saldo pendiente."}
              </p>
            </div>
            <Link className="ledger-link" to="/cartera">
              Ver cartera
            </Link>
          </div>
          {loading ? (
            <Loading />
          ) : result?.cartera.error ? (
            <BlockError
              text="No pudimos consultar la cartera completa."
              retry={retry}
            />
          ) : !c?.prioritarios.length ? (
            <Empty text="No hay clientes con saldo pendiente." />
          ) : (
            <div className="overview-list">
              {c.prioritarios.map((x) => (
                <Link key={x.id} to={`/cartera/${x.id}`}>
                  <div>
                    <strong>{x.nombre_tienda}</strong>
                    <small>
                      {x.en_mora ? "Marcado en mora" : "Saldo pendiente"}
                    </small>
                  </div>
                  <strong>{formatCOP(x.saldo_cartera)}</strong>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </div>
          )}
        </section>
        <aside className="overview-guide">
          <span className="eyebrow">UNA OPERACIÓN CONECTADA</span>
          <h2>Cada movimiento tiene su lugar.</h2>
          <p>
            Las remisiones muestran las ventas registradas. La cartera refleja
            los saldos actuales y el inventario conserva el historial de
            existencias.
          </p>
          <Link to="/cartera" className="ledger-link">
            Consultar pagos y saldos <ArrowRight size={15} />
          </Link>
          <p className="catalog-footnote">
            Una remisión pendiente no determina por sí sola cuánto debe un
            cliente.
          </p>
        </aside>
      </div>
      <p className="catalog-footnote">
        {loading
          ? "Consultando información…"
          : `Consulta realizada a las ${updated?.toLocaleTimeString("es-CO") ?? "—"}.`}{" "}
        Los datos corresponden a los registros visibles para tu cuenta. Cartera
        y alertas muestran su estado actual; las ventas corresponden al mes
        indicado.
      </p>
    </>
  );
}
function Loading() {
  return (
    <div className="empty-state" role="status">
      Consultando…
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
    </div>
  );
}
function BlockError({ text, retry }: { text: string; retry: () => void }) {
  return (
    <div className="overview-error" role="alert">
      <p>{text}</p>
      <Button variant="outline" onClick={retry}>
        Reintentar consulta
      </Button>
    </div>
  );
}
