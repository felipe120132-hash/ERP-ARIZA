import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
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
    [open, setOpen] = useState(false),
    [editingExpense, setEditingExpense] = useState<Gasto | null>(null),
    [deletingExpense, setDeletingExpense] = useState<Gasto | null>(null);
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

  const auditMap = gastosService.obtenerAuditoriaGastos();

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
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered
                    .slice((visiblePage - 1) * 15, visiblePage * 15)
                    .map((x) => (
                      <tr key={x.id}>
                        <td>
                          <strong>{x.concepto}</strong>
                          {auditMap[x.id] && (
                            <div className="catalog-footnote">
                              Editado (antes{" "}
                              {formatCOP(auditMap[x.id].monto_anterior)})
                            </div>
                          )}
                        </td>
                        <td>{x.categoria}</td>
                        <td>{x.recurrente ? "Recurrente" : "Puntual"}</td>
                        <td>{x.created_at.toLocaleDateString("es-CO")}</td>
                        <td className="balance-cell">{formatCOP(x.monto)}</td>
                        <td>
                          <div className="order-actions">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Editar gasto ${x.concepto}`}
                              onClick={() => setEditingExpense(x)}
                            >
                              <Pencil size={14} />
                              Editar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`Eliminar gasto ${x.concepto}`}
                              onClick={() => setDeletingExpense(x)}
                            >
                              <Trash2 size={14} />
                              Eliminar
                            </Button>
                          </div>
                        </td>
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
      {editingExpense && user && (
        <EditarGasto
          key={`${user.id}:${editingExpense.id}`}
          gasto={editingExpense}
          userId={user.id}
          onClose={() => setEditingExpense(null)}
          onRecorded={() => setAttempt((x) => x + 1)}
        />
      )}
      {deletingExpense && user && (
        <EliminarGasto
          key={`${user.id}:${deletingExpense.id}`}
          gasto={deletingExpense}
          onClose={() => setDeletingExpense(null)}
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

function EditarGasto({
  gasto,
  userId,
  onClose,
  onRecorded,
}: {
  gasto: Gasto;
  userId: string;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const initialPeriod = gasto.mes_referencia.slice(0, 7);
  const key = `ariza:gasto-edicion-pendiente:${userId}:${gasto.id}`;
  const [concept, setConcept] = useState(gasto.concepto),
    [category, setCategory] = useState(gasto.categoria),
    [amount, setAmount] = useState(String(gasto.monto)),
    [period, setPeriod] = useState(initialPeriod),
    [recurring, setRecurring] = useState(gasto.recurrente),
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
    concept.trim().length <= 300 &&
    category.trim().length > 0 &&
    category.trim().length <= 100 &&
    /^\d+(\.\d{1,2})?$/.test(amount) &&
    Number(amount) > 0 &&
    Number(amount) <= 9999999999.99 &&
    Number.isSafeInteger(Math.round(Number(amount) * 100)) &&
    validMonth(period);

  const hasChanges =
    concept.trim() !== gasto.concepto ||
    category.trim() !== gasto.categoria ||
    Number(amount) !== gasto.monto ||
    period + "-01" !== gasto.mes_referencia ||
    recurring !== gasto.recurrente;

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
    if (!valid || !hasChanges || lock.current || uncertain || success) return;
    if (!review) {
      setReview(true);
      setError(null);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      sessionStorage.setItem(key, "1");
    } catch {}
    try {
      const result = await gastosService.actualizarGasto(
        gasto.id,
        {
          concepto: concept.trim(),
          categoria: category.trim(),
          monto: Number(amount),
          mes_referencia: period + "-01",
          recurrente: recurring,
        },
        gasto,
      );
      if (result.error || !result.data) {
        const msg = result.error ?? "No recibimos confirmación del cambio.";
        if (msg.includes("Error de conexión")) {
          setUncertain(true);
        } else {
          try {
            sessionStorage.removeItem(key);
          } catch {}
          setReview(false);
        }
        setError(msg);
        return;
      }
      try {
        sessionStorage.removeItem(key);
      } catch {}
      setSuccess(true);
      onRecorded();
    } catch {
      setUncertain(true);
      setError("No pudimos confirmar el resultado de la edición.");
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
          <SheetDescription>FINANZAS / EDITAR REGISTRO</SheetDescription>
          <SheetTitle>Editar gasto</SheetTitle>
        </SheetHeader>
        <div className="abono-body">
          {error && !uncertain && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          {success ? (
            <div className="empty-state" role="status">
              <h2>Gasto actualizado</h2>
              <p>
                {concept} · {formatCOP(Number(amount))} · {period}
              </p>
              <p>Monto anterior: {formatCOP(gasto.monto)}</p>
              <Button onClick={onClose}>Volver a finanzas</Button>
            </div>
          ) : uncertain ? (
            <div className="warning-box" role="alert">
              <h3>Revisa el historial antes de volver a guardar</h3>
              <p>{error ?? "Hay una actualización anterior sin confirmar."}</p>
              <p>
                Comprueba si los cambios del gasto ya aparecen reflejados en la
                tabla del mes.
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
                Revisé el listado y confirmé que el cambio no se aplicó.
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
                    <span className="eyebrow">REVISIÓN DE CAMBIOS</span>
                    <h2>{concept}</h2>
                    <p>Monto anterior: {formatCOP(gasto.monto)}</p>
                    <strong>{formatCOP(Number(amount))}</strong>
                    <p>
                      {category} · {period} ·{" "}
                      {recurring ? "Recurrente" : "Puntual"}
                    </p>
                    <p>
                      Al confirmar se actualizará el gasto y se recalcularán el
                      total gastado y el saldo disponible del presupuesto.
                    </p>
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
                    <Label htmlFor="edit-expense-concept">Concepto</Label>
                    <Input
                      id="edit-expense-concept"
                      required
                      maxLength={300}
                      value={concept}
                      onChange={(e) => setConcept(e.target.value)}
                    />
                    <Label htmlFor="edit-expense-category">Categoría</Label>
                    <Input
                      id="edit-expense-category"
                      required
                      maxLength={100}
                      placeholder="Ej. Transporte, Servicios…"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    />
                    <Label htmlFor="edit-expense-amount">Monto (COP)</Label>
                    <Input
                      id="edit-expense-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <Label htmlFor="edit-expense-period">Mes del gasto</Label>
                    <Input
                      id="edit-expense-period"
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
                      Valor registrado originalmente: {formatCOP(gasto.monto)} (
                      {initialPeriod}).
                    </p>
                  </>
                )}
                <Button type="submit" disabled={!valid || !hasChanges || busy}>
                  {busy
                    ? "Guardando…"
                    : review
                      ? "Confirmar cambios"
                      : "Revisar cambios"}
                </Button>
              </fieldset>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EliminarGasto({
  gasto,
  onClose,
  onRecorded,
}: {
  gasto: Gasto;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);

  async function confirmDelete() {
    if (lock.current || deleted) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await gastosService.eliminarGasto(gasto.id, gasto);
      if (result.error || !result.data) {
        setError(result.error ?? "No se pudo eliminar el gasto.");
        return;
      }
      setDeleted(true);
      onRecorded();
    } catch {
      setError("No pudimos confirmar la eliminación del gasto.");
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
          <SheetDescription>FINANZAS / ELIMINAR REGISTRO</SheetDescription>
          <SheetTitle>Eliminar gasto</SheetTitle>
        </SheetHeader>
        <div className="abono-body">
          {error && (
            <p role="alert" className="error-box">
              {error}
            </p>
          )}
          {deleted ? (
            <div className="empty-state" role="status">
              <h2>Gasto eliminado</h2>
              <p>
                {gasto.concepto} · {formatCOP(gasto.monto)}
              </p>
              <p>
                El monto fue descontado del total gastado y el saldo disponible
                del presupuesto se actualizó.
              </p>
              <Button onClick={onClose}>Volver a finanzas</Button>
            </div>
          ) : (
            <div className="finance-form">
              <div className="finance-review">
                <span className="eyebrow">CONFIRMACIÓN REQUERIDA</span>
                <h2>{gasto.concepto}</h2>
                <strong>{formatCOP(gasto.monto)}</strong>
                <p>
                  {gasto.categoria} · {gasto.mes_referencia.slice(0, 7)} ·{" "}
                  {gasto.recurrente ? "Recurrente" : "Puntual"}
                </p>
                <p>
                  ¿Confirmas la eliminación de este gasto? Se revertirá su
                  importe del total gastado del mes y se recalculará el saldo
                  disponible del presupuesto.
                </p>
              </div>
              <div className="order-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={onClose}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmDelete()}
                >
                  {busy ? "Eliminando…" : "Confirmar eliminación"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
