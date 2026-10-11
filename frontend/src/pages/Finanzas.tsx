import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ModulePending from "./ModulePending";
import PresupuestoEditor from "@/components/PresupuestoEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { gastosService } from "@/services/gastosService";
import { formatCOP } from "@/lib/cartera";
import { normalize } from "@/lib/catalog";
import type { Gasto, ResumenFinancieroResult } from "@/types/schemas";
const validMonth = (v: string) => /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(v);
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export default function Finanzas() {
  const { perfil } = useAuth();
  return perfil?.rol === "ADMIN" ? <FinanzasAdmin /> : <ModulePending />;
}
function FinanzasAdmin() {
  const [budgetMonth, setBudgetMonth] = useState<string | null>(null);
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const raw = params.get("mes") ?? currentMonth(),
    month = validMonth(raw) ? raw : currentMonth();
  const [rows, setRows] = useState<Gasto[]>([]),
    [summary, setSummary] = useState<ResumenFinancieroResult | null>(null),
    [error, setError] = useState<string | null>(null),
    [summaryError, setSummaryError] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [attempt, setAttempt] = useState(0),
    [open, setOpen] = useState(false);
  const [q, setQ] = useState(""),
    [category, setCategory] = useState(""),
    [recurring, setRecurring] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setSummaryError(null);
    setSummary(null);
    setRows([]);
    Promise.all([
      gastosService.listarGastos(month + "-01"),
      gastosService.resumenFinancieroMensual(month + "-01"),
    ])
      .then(([g, s]) => {
        if (live) {
          setRows(g.data ?? []);
          setError(g.error);
          setSummary(s.data);
          setSummaryError(s.error);
          setLoading(false);
        }
      })
      .catch(() => {
        if (live) {
          setError("No pudimos consultar los gastos.");
          setSummaryError("No pudimos consultar el resumen.");
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [month, attempt]);
  const filtered = rows.filter(
    (x) =>
      normalize(x.concepto).includes(normalize(q)) &&
      (!category || x.categoria === category) &&
      (!recurring || x.recurrente === (recurring === "si")),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 15)),
    visiblePage = Math.min(page, pages);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN / FINANZAS</span>
          <h1>Las cuentas, claras.</h1>
          <p>Ventas, gastos y presupuesto de cada mes.</p>
        </div>
        <div className="order-actions">
          <Button
            variant="outline"
            aria-label="Actualizar finanzas"
            disabled={loading}
            onClick={() => setAttempt((x) => x + 1)}
          >
            <RefreshCw size={16} />
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} />
            Registrar gasto
          </Button>
        </div>
      </div>
      <div className="finance-period">
        <Label htmlFor="finance-month">Mes de consulta</Label>
        <Input
          id="finance-month"
          type="month"
          value={month}
          onChange={(e) => {
            if (validMonth(e.target.value)) {
              setParams({ mes: e.target.value });
              setPage(1);
              setCategory("");
            }
          }}
        />
        <span>Valores en pesos colombianos</span>
      </div>
      {summaryError && (
        <div className="warning-box" role="alert">
          No pudimos cargar el resumen mensual.{" "}
          <Button variant="outline" onClick={() => setAttempt((x) => x + 1)}>
            Reintentar resumen
          </Button>
        </div>
      )}
      <div className="portfolio-stats finance-stats">
        {[
          ["Ventas del mes", summary?.total_ventas],
          ["Gastos del mes", summary?.total_gastos],
          ["Resultado del mes", summary?.ganancia_neta],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <small>{label}</small>
            <strong>
              {loading || typeof value !== "number" ? "—" : formatCOP(value)}
            </strong>
          </div>
        ))}
      </div>
      <div className="finance-budget">
        <div>
          <span className="eyebrow">PRESUPUESTO MENSUAL</span>
          <strong>
            {loading
              ? "Consultando…"
              : !summary
                ? "Sin información"
                : summary.presupuesto_limite == null
                  ? "Sin presupuesto definido"
                  : formatCOP(summary.presupuesto_limite)}
          </strong>
        </div>
        {summary && (
          <span
            className={`inventory-state ${summary.presupuesto_limite == null ? "" : summary.excede_presupuesto ? "rojo" : "verde"}`}
          >
            {summary.presupuesto_limite == null
              ? "Sin límite configurado"
              : summary.excede_presupuesto
                ? "Presupuesto excedido"
                : "Dentro del presupuesto"}
          </span>
        )}
        {summary && summary.presupuesto_limite != null && !loading && (
          <div>
            <small>
              {summary.total_gastos > summary.presupuesto_limite
                ? "Exceso sobre el límite"
                : "Disponible para gastos"}
            </small>
            <strong>
              {formatCOP(
                Math.abs(summary.presupuesto_limite - summary.total_gastos),
              )}
            </strong>
          </div>
        )}
        <Button variant="outline" onClick={() => setBudgetMonth(month)}>
          Gestionar presupuesto
        </Button>
      </div>
      <section className="catalog-panel">
        <div className="catalog-panel-heading">
          <div>
            <h2>Gastos operacionales</h2>
            <p>Registros del período seleccionado.</p>
          </div>
        </div>
        <div className="history-filters">
          <Input
            aria-label="Buscar gasto"
            placeholder="Buscar concepto…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label="Categoría del gasto"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas las categorías</option>
            {[...new Set(rows.map((x) => x.categoria))].sort().map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            aria-label="Tipo de gasto"
            value={recurring}
            onChange={(e) => {
              setRecurring(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los gastos</option>
            <option value="si">Recurrentes</option>
            <option value="no">Puntuales</option>
          </select>
        </div>
        {loading ? (
          <div className="empty-state" role="status">
            Cargando finanzas…
          </div>
        ) : error ? (
          <div className="empty-state" role="alert">
            <p>{error}</p>
            <Button onClick={() => setAttempt((x) => x + 1)}>
              Reintentar gastos
            </Button>
          </div>
        ) : !filtered.length ? (
          <div className="empty-state">
            <h3>No hay gastos para mostrar</h3>
            <p>Revisa el mes y los filtros seleccionados.</p>
          </div>
        ) : (
          <>
            <div className="order-table-wrap">
              <table className="order-table">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Categoría</th>
                    <th>Tipo</th>
                    <th>Fecha de registro</th>
                    <th>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .slice((visiblePage - 1) * 15, visiblePage * 15)
                    .map((x) => (
                      <tr key={x.id}>
                        <td>
                          <strong>{x.concepto}</strong>
                        </td>
                        <td>{x.categoria}</td>
                        <td>{x.recurrente ? "Recurrente" : "Puntual"}</td>
                        <td>{x.created_at.toLocaleDateString("es-CO")}</td>
                        <td className="balance-cell">{formatCOP(x.monto)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="catalog-pagination">
              <span>{filtered.length} gastos</span>
              <div>
                <Button
                  variant="outline"
                  disabled={visiblePage === 1}
                  onClick={() => setPage(visiblePage - 1)}
                >
                  Anterior
                </Button>
                <span>
                  {visiblePage} / {pages}
                </span>
                <Button
                  variant="outline"
                  disabled={visiblePage === pages}
                  onClick={() => setPage(visiblePage + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        )}
      </section>
      <p className="catalog-footnote">
        El resultado mensual corresponde al resumen del sistema. No representa
        el saldo de caja ni los abonos recaudados.
      </p>
      {open && user && (
        <NuevoGasto
          key={user.id}
          userId={user.id}
          month={month}
          onClose={() => setOpen(false)}
          onRecorded={() => setAttempt((x) => x + 1)}
        />
      )}
      {budgetMonth && user && (
        <PresupuestoEditor
          key={`${user.id}:${budgetMonth}`}
          month={budgetMonth}
          userId={user.id}
          onClose={() => setBudgetMonth(null)}
          onRecorded={() => setAttempt((x) => x + 1)}
        />
      )}
    </>
  );
}
function NuevoGasto({
  userId,
  month,
  onClose,
  onRecorded,
}: {
  userId: string;
  month: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const key = `ariza:gasto-pendiente:${userId}`;
  const [concept, setConcept] = useState(""),
    [category, setCategory] = useState(""),
    [amount, setAmount] = useState(""),
    [period, setPeriod] = useState(month),
    [recurring, setRecurring] = useState(false),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState(false),
    [error, setError] = useState<string | null>(null),
    [checked, setChecked] = useState(false);
  const [uncertain, setUncertain] = useState(() => {
    try {
      return sessionStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const lock = useRef(false);
  const valid =
    concept.trim().length > 0 &&
    category.trim().length > 0 &&
    /^\d+(\.\d{1,2})?$/.test(amount) &&
    Number(amount) > 0 &&
    Number.isSafeInteger(Math.round(Number(amount) * 100)) &&
    validMonth(period);
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || lock.current || uncertain || success) return;
    if (!review) {
      setReview(true);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      sessionStorage.setItem(key, "1");
    } catch {}
    try {
      const result = await gastosService.crearGasto({
        concepto: concept.trim(),
        categoria: category.trim(),
        monto: Number(amount),
        mes_referencia: period + "-01",
        recurrente: recurring,
        registrado_por: userId,
      });
      if (result.error || !result.data) {
        setUncertain(true);
        setError(result.error ?? "No recibimos confirmación del registro.");
        return;
      }
      try {
        sessionStorage.removeItem(key);
      } catch {}
      setSuccess(true);
      onRecorded();
    } catch {
      setUncertain(true);
      setError("No pudimos confirmar el resultado.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(v) => {
        if (!v && !lock.current) onClose();
      }}
    >
      <SheetContent
        className="abono-sheet"
        showCloseButton={!busy}
        onEscapeKeyDown={(e) => {
          if (lock.current) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (lock.current) e.preventDefault();
        }}
      >
        <SheetHeader>
          <SheetDescription>FINANZAS / NUEVO REGISTRO</SheetDescription>
          <SheetTitle>Registrar gasto</SheetTitle>
        </SheetHeader>
        <div className="abono-body">
          {success ? (
            <div className="empty-state" role="status">
              <h2>Gasto registrado</h2>
              <p>
                {concept} · {formatCOP(Number(amount))} · {period}
              </p>
              <Button onClick={onClose}>Volver a finanzas</Button>
            </div>
          ) : uncertain ? (
            <div className="warning-box" role="alert">
              <h3>Revisa el historial antes de volver a registrar</h3>
              <p>{error ?? "Hay un envío anterior sin confirmar."}</p>
              <p>
                Comprueba si el gasto aparece en el mes correspondiente para
                evitar duplicarlo.
              </p>
              <Button variant="outline" onClick={onClose}>
                Consultar historial
              </Button>
              <label className="finance-check">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                Revisé el historial y confirmé que el gasto no existe.
              </label>
              <Button
                disabled={!checked}
                onClick={() => {
                  try {
                    sessionStorage.removeItem(key);
                  } catch {}
                  setUncertain(false);
                  setReview(false);
                  setError(null);
                }}
              >
                Habilitar nuevo intento
              </Button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <fieldset disabled={busy} className="finance-form">
                {review ? (
                  <div className="finance-review">
                    <span className="eyebrow">REVISIÓN DEL GASTO</span>
                    <h2>{concept}</h2>
                    <strong>{formatCOP(Number(amount))}</strong>
                    <p>
                      {category} · {period} ·{" "}
                      {recurring ? "Recurrente" : "Puntual"}
                    </p>
                    <p>Al confirmar se registrará en la base de datos.</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setReview(false)}
                    >
                      Editar datos
                    </Button>
                  </div>
                ) : (
                  <>
                    <Label htmlFor="expense-concept">Concepto</Label>
                    <Input
                      id="expense-concept"
                      required
                      maxLength={300}
                      value={concept}
                      onChange={(e) => setConcept(e.target.value)}
                    />
                    <Label htmlFor="expense-category">Categoría</Label>
                    <Input
                      id="expense-category"
                      required
                      maxLength={100}
                      placeholder="Ej. Transporte, Servicios…"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    />
                    <Label htmlFor="expense-amount">Monto (COP)</Label>
                    <Input
                      id="expense-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <Label htmlFor="expense-period">Mes del gasto</Label>
                    <Input
                      id="expense-period"
                      type="month"
                      required
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                    />
                    <label className="finance-check">
                      <input
                        type="checkbox"
                        checked={recurring}
                        onChange={(e) => setRecurring(e.target.checked)}
                      />
                      Gasto recurrente
                    </label>
                    <p className="catalog-footnote">
                      La marca recurrente identifica el tipo de gasto. No genera
                      registros automáticamente para otros meses.
                    </p>
                  </>
                )}
                <Button type="submit" disabled={!valid || busy}>
                  {busy
                    ? "Registrando…"
                    : review
                      ? "Confirmar gasto"
                      : "Revisar gasto"}
                </Button>
              </fieldset>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
