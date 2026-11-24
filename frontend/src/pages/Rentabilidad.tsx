import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, Pencil, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ModulePending from "./ModulePending";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  rentabilidadService,
  roundMoney,
  type DatosRentabilidadPeriodo,
  type RentabilidadProductoItem,
  type RentabilidadVentaItem,
} from "@/services/rentabilidadService";
import { formatCOP } from "@/lib/cartera";
import { normalize } from "@/lib/catalog";

const validMonth = (v: string) => /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(v);

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("es-CO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatUnits(value: number): string {
  return value.toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

function profitClass(value: number | null): string {
  if (value === null) return "profit-neutral";
  if (value > 0) return "profit-positive";
  if (value < 0) return "profit-negative";
  return "profit-neutral";
}

export default function Rentabilidad() {
  const { perfil } = useAuth();
  return perfil?.rol === "ADMIN" ? <RentabilidadAdmin /> : <ModulePending />;
}

function RentabilidadAdmin() {
  const [params, setParams] = useSearchParams();
  const rawMonth = params.get("mes") ?? currentMonth();
  const month = validMonth(rawMonth) ? rawMonth : currentMonth();
  const activeTab = params.get("vista") === "ventas" ? "ventas" : "productos";

  const [data, setData] = useState<DatosRentabilidadPeriodo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Filtros pestaña Productos
  const [prodQuery, setProdQuery] = useState("");
  const [prodCategory, setProdCategory] = useState("");
  const [prodCostFilter, setProdCostFilter] = useState("");
  const [prodPage, setProdPage] = useState(1);

  // Filtros pestaña Ventas
  const [saleQuery, setSaleQuery] = useState("");
  const [saleStateFilter, setSaleStateFilter] = useState("ACTIVAS");
  const [salePayFilter, setSalePayFilter] = useState("");
  const [salePage, setSalePage] = useState(1);

  // Modales laterales (Sheets)
  const [editingItem, setEditingItem] =
    useState<RentabilidadProductoItem | null>(null);
  const [selectedSale, setSelectedSale] =
    useState<RentabilidadVentaItem | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    rentabilidadService
      .obtenerRentabilidadPeriodo(month)
      .then((res) => {
        if (!live) return;
        setData(res.data);
        setError(res.error);
        setLoading(false);
      })
      .catch(() => {
        if (!live) return;
        setError("No pudimos consultar los datos de rentabilidad.");
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [month, attempt]);

  const auditCostos = rentabilidadService.obtenerAuditoriaCostos();
  const resumen = data?.resumen;
  const productos = data?.productos ?? [];
  const ventas = data?.ventas ?? [];

  const setTab = (vista: "productos" | "ventas") => {
    const next: Record<string, string> = { mes: month };
    if (vista === "ventas") next.vista = "ventas";
    setParams(next);
  };

  // Filtrado de productos
  const categorias = [
    ...new Set(productos.map((x) => x.producto.categoria)),
  ].sort();
  const productosFiltrados = productos.filter((item) => {
    const qNorm = normalize(prodQuery);
    const matchesSearch =
      !qNorm ||
      normalize(item.producto.nombre).includes(qNorm) ||
      normalize(item.producto.sku).includes(qNorm);
    const matchesCategory =
      !prodCategory || item.producto.categoria === prodCategory;
    const matchesCost =
      !prodCostFilter ||
      (prodCostFilter === "CON_COSTO" && item.costo_llegada !== null) ||
      (prodCostFilter === "SIN_COSTO" && item.costo_llegada === null) ||
      (prodCostFilter === "PERDIDA" &&
        item.costo_llegada !== null &&
        ((item.ganancia_tienda !== null && item.ganancia_tienda <= 0) ||
          (item.ganancia_distribuidor !== null &&
            item.ganancia_distribuidor <= 0))) ||
      (prodCostFilter === "VENDIDOS_MES" && item.unidades_vendidas_mes > 0);

    return matchesSearch && matchesCategory && matchesCost;
  });

  const prodTotalPages = Math.max(1, Math.ceil(productosFiltrados.length / 15));
  const visibleProdPage = Math.min(prodPage, prodTotalPages);

  // Filtrado de ventas
  const ventasFiltradas = ventas.filter((v) => {
    const qNorm = normalize(saleQuery);
    const consecutivoTxt = `#${v.remision.consecutivo}`;
    const matchesSearch =
      !qNorm ||
      normalize(v.nombre_cliente).includes(qNorm) ||
      normalize(consecutivoTxt).includes(qNorm) ||
      String(v.remision.consecutivo).includes(qNorm);

    const matchesState =
      saleStateFilter === "TODAS"
        ? true
        : saleStateFilter === "ACTIVAS"
          ? v.remision.estado !== "ANULADA"
          : v.remision.estado === saleStateFilter;

    const matchesPay =
      !salePayFilter || v.remision.tipo_pago === salePayFilter;

    return matchesSearch && matchesState && matchesPay;
  });

  const saleTotalPages = Math.max(1, Math.ceil(ventasFiltradas.length / 15));
  const visibleSalePage = Math.min(salePage, saleTotalPages);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN / RENTABILIDAD</span>
          <h1>Precios de llegada y ganancias.</h1>
          <p>
            Registra a cómo llega cada producto y consulta la ganancia real por
            referencia y por venta.
          </p>
        </div>
        <div className="order-actions">
          <Button
            variant="outline"
            aria-label="Actualizar rentabilidad"
            disabled={loading}
            onClick={() => setAttempt((x) => x + 1)}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
      </div>

      <div className="finance-period">
        <Label htmlFor="rentabilidad-month">Mes de consulta</Label>
        <Input
          id="rentabilidad-month"
          type="month"
          value={month}
          onChange={(e) => {
            if (validMonth(e.target.value)) {
              const next: Record<string, string> = { mes: e.target.value };
              if (activeTab === "ventas") next.vista = "ventas";
              setParams(next);
              setProdPage(1);
              setSalePage(1);
            }
          }}
        />
        <span>Ganancias calculadas sobre el precio de venta sin IVA</span>
      </div>

      <div className="portfolio-stats rentabilidad-stats">
        <div>
          <small>Ventas sin IVA (mes)</small>
          <strong>
            {loading || !resumen
              ? "—"
              : formatCOP(resumen.ventas_activas_sin_iva)}
          </strong>
          {!loading && resumen && (
            <span className="stat-sub">
              {resumen.remisiones_activas} remisiones activas (c/IVA:{" "}
              {formatCOP(resumen.ventas_activas_con_iva)})
            </span>
          )}
        </div>
        <div>
          <small>Costo de mercancía vendida</small>
          <strong>
            {loading || !resumen
              ? "—"
              : formatCOP(resumen.costo_mercancia_vendida)}
          </strong>
          {!loading && resumen && (
            <span className="stat-sub">
              Sobre {formatCOP(resumen.ventas_costeadas_sin_iva)} en ventas
              costeadas
            </span>
          )}
        </div>
        <div>
          <small>Ganancia bruta del mes</small>
          <strong
            className={
              loading || !resumen
                ? ""
                : profitClass(resumen.ganancia_bruta_confirmada)
            }
          >
            {loading || !resumen
              ? "—"
              : formatCOP(resumen.ganancia_bruta_confirmada)}
          </strong>
          {!loading && resumen && (
            <span className="stat-sub">
              Margen promedio: {formatPct(resumen.margen_bruto_pct)}
            </span>
          )}
        </div>
        <div>
          <small>Productos con costo</small>
          <strong>
            {loading || !resumen
              ? "—"
              : `${resumen.productos_con_costo} / ${resumen.total_productos}`}
          </strong>
          {!loading && resumen && (
            <span className="stat-sub">
              {resumen.total_productos - resumen.productos_con_costo === 0
                ? "Catálogo 100% costeado"
                : `Faltan ${resumen.total_productos - resumen.productos_con_costo} por registrar`}
            </span>
          )}
        </div>
      </div>

      {!loading &&
        resumen &&
        resumen.remisiones_con_costo_incompleto > 0 && (
          <div className="warning-box" role="status">
            Hay{" "}
            <strong>
              {resumen.remisiones_con_costo_incompleto}{" "}
              {resumen.remisiones_con_costo_incompleto === 1
                ? "venta"
                : "ventas"}
            </strong>{" "}
            en este mes con productos a los que aún no se les ha registrado el
            precio de llegada. Registra esos costos en la pestaña{" "}
            <strong>Ganancia por producto</strong> para completar el cálculo.
          </div>
        )}

      <div
        className="rentabilidad-tabs"
        role="tablist"
        aria-label="Vistas de rentabilidad"
      >
        <button
          type="button"
          role="tab"
          className="rentabilidad-tab"
          aria-selected={activeTab === "productos"}
          onClick={() => setTab("productos")}
        >
          Ganancia por producto ({productos.length})
        </button>
        <button
          type="button"
          role="tab"
          className="rentabilidad-tab"
          aria-selected={activeTab === "ventas"}
          onClick={() => setTab("ventas")}
        >
          Ganancia por venta ({ventas.length})
        </button>
      </div>

      {loading ? (
        <div className="empty-state" role="status">
          Cargando rentabilidad y costos…
        </div>
      ) : error ? (
        <div className="empty-state" role="alert">
          <p>{error}</p>
          <Button onClick={() => setAttempt((x) => x + 1)}>
            Reintentar consulta
          </Button>
        </div>
      ) : activeTab === "productos" ? (
        <section className="catalog-panel">
          <div className="catalog-panel-heading">
            <div>
              <h2>Precios de llegada y margen por producto</h2>
              <p>
                Compara a cómo llega cada referencia contra sus precios de
                tienda y distribuidor, y consulta cuánto dejó en el mes.
              </p>
            </div>
          </div>

          <div className="history-filters">
            <Input
              aria-label="Buscar producto o SKU"
              placeholder="Buscar nombre o SKU…"
              value={prodQuery}
              onChange={(e) => {
                setProdQuery(e.target.value);
                setProdPage(1);
              }}
            />
            <select
              aria-label="Categoría del producto"
              value={prodCategory}
              onChange={(e) => {
                setProdCategory(e.target.value);
                setProdPage(1);
              }}
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              aria-label="Estado de costo"
              value={prodCostFilter}
              onChange={(e) => {
                setProdCostFilter(e.target.value);
                setProdPage(1);
              }}
            >
              <option value="">Todos los productos</option>
              <option value="CON_COSTO">Con costo registrado</option>
              <option value="SIN_COSTO">Sin costo registrado</option>
              <option value="PERDIDA">Margen cero o pérdida</option>
              <option value="VENDIDOS_MES">Vendidos en el mes</option>
            </select>
          </div>

          {!productosFiltrados.length ? (
            <div className="empty-state">
              <h3>No hay productos para mostrar</h3>
              <p>Ajusta la búsqueda o los filtros seleccionados.</p>
            </div>
          ) : (
            <>
              <div className="order-table-wrap">
                <table className="order-table rentabilidad-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Precio de llegada</th>
                      <th>Venta Tienda / Ganancia</th>
                      <th>Venta Distribuidor / Ganancia</th>
                      <th>Ganancia en el mes</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados
                      .slice((visibleProdPage - 1) * 15, visibleProdPage * 15)
                      .map((item) => {
                        const audit = auditCostos[item.producto.id];
                        return (
                          <tr key={item.producto.id}>
                            <td className="rentabilidad-card-head">
                              <strong>{item.producto.nombre}</strong>
                              <small className="muted block">
                                {item.producto.sku} · {item.producto.categoria}
                                {!item.producto.activo ? " · Inactivo" : ""}
                              </small>
                              {audit && (
                                <small className="muted block">
                                  Último cambio:{" "}
                                  {audit.costo_anterior === null
                                    ? "Nuevo"
                                    : formatCOP(audit.costo_anterior)}{" "}
                                  → {formatCOP(audit.costo_nuevo)}
                                </small>
                              )}
                            </td>
                            <td data-label="Precio de llegada">
                              {item.costo_llegada === null ? (
                                <span className="inventory-state amarillo">
                                  Sin registrar
                                </span>
                              ) : (
                                <strong>{formatCOP(item.costo_llegada)}</strong>
                              )}
                            </td>
                            <td data-label="Venta Tienda / Ganancia">
                              <div className="profit-cell">
                                <span>
                                  Venta: {formatCOP(item.producto.precio_tienda)}
                                </span>
                                <span
                                  className={profitClass(item.ganancia_tienda)}
                                >
                                  {item.ganancia_tienda === null
                                    ? "Define costo para ver ganancia"
                                    : `${item.ganancia_tienda >= 0 ? "+" : ""}${formatCOP(item.ganancia_tienda)} (${formatPct(item.margen_tienda_pct)})`}
                                </span>
                              </div>
                            </td>
                            <td data-label="Venta Distribuidor / Ganancia">
                              <div className="profit-cell">
                                <span>
                                  Venta:{" "}
                                  {formatCOP(item.producto.precio_distribuidor)}
                                </span>
                                <span
                                  className={profitClass(
                                    item.ganancia_distribuidor,
                                  )}
                                >
                                  {item.ganancia_distribuidor === null
                                    ? "Define costo para ver ganancia"
                                    : `${item.ganancia_distribuidor >= 0 ? "+" : ""}${formatCOP(item.ganancia_distribuidor)} (${formatPct(item.margen_distribuidor_pct)})`}
                                </span>
                              </div>
                            </td>
                            <td data-label="Ganancia en el mes">
                              <div className="profit-cell">
                                <span>
                                  {formatUnits(item.unidades_vendidas_mes)} und.
                                  vendidas
                                </span>
                                {item.unidades_vendidas_mes === 0 ? (
                                  <span className="muted">Sin ventas en el mes</span>
                                ) : item.ganancia_real_mes === null ? (
                                  <span className="profit-neutral">
                                    Falta registrar costo
                                  </span>
                                ) : (
                                  <span
                                    className={profitClass(
                                      item.ganancia_real_mes,
                                    )}
                                  >
                                    {item.ganancia_real_mes >= 0 ? "+" : ""}
                                    {formatCOP(item.ganancia_real_mes)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="rentabilidad-card-actions">
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`${item.costo_llegada === null ? "Definir costo" : "Editar costo"} de ${item.producto.nombre}`}
                                onClick={() => setEditingItem(item)}
                              >
                                {item.costo_llegada === null ? (
                                  <>
                                    <Plus size={15} />
                                    Definir costo
                                  </>
                                ) : (
                                  <>
                                    <Pencil size={15} />
                                    Editar costo
                                  </>
                                )}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {prodTotalPages > 1 && (
                <div className="catalog-pagination">
                  <Button
                    variant="outline"
                    disabled={visibleProdPage <= 1}
                    onClick={() => setProdPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <span>
                    Página {visibleProdPage} de {prodTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={visibleProdPage >= prodTotalPages}
                    onClick={() =>
                      setProdPage((p) => Math.min(prodTotalPages, p + 1))
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="catalog-panel">
          <div className="catalog-panel-heading">
            <div>
              <h2>Ganancia por cada venta (remisiones)</h2>
              <p>
                Revisa cuánto se facturó, cuánto costó la mercancía entregada y
                cuál fue la utilidad exacta de cada pedido y producto.
              </p>
            </div>
          </div>

          <div className="history-filters">
            <Input
              aria-label="Buscar venta o cliente"
              placeholder="Buscar #consecutivo o cliente…"
              value={saleQuery}
              onChange={(e) => {
                setSaleQuery(e.target.value);
                setSalePage(1);
              }}
            />
            <select
              aria-label="Estado de la remisión"
              value={saleStateFilter}
              onChange={(e) => {
                setSaleStateFilter(e.target.value);
                setSalePage(1);
              }}
            >
              <option value="ACTIVAS">Activas (Pendientes y Pagadas)</option>
              <option value="TODAS">Todas las remisiones</option>
              <option value="PENDIENTE">Solo pendientes</option>
              <option value="PAGADA">Solo pagadas</option>
              <option value="ANULADA">Solo anuladas</option>
            </select>
            <select
              aria-label="Tipo de pago"
              value={salePayFilter}
              onChange={(e) => {
                setSalePayFilter(e.target.value);
                setSalePage(1);
              }}
            >
              <option value="">Todos los pagos</option>
              <option value="CONTADO">Contado</option>
              <option value="CREDITO">Crédito</option>
            </select>
          </div>

          {!ventasFiltradas.length ? (
            <div className="empty-state">
              <h3>No hay ventas para mostrar en este período</h3>
              <p>Prueba seleccionando otro mes o cambiando los filtros.</p>
            </div>
          ) : (
            <>
              <div className="order-table-wrap">
                <table className="order-table rentabilidad-table">
                  <thead>
                    <tr>
                      <th>Remisión</th>
                      <th>Cliente</th>
                      <th>Venta (sin IVA)</th>
                      <th>Costo de productos</th>
                      <th>Ganancia de la venta</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventasFiltradas
                      .slice((visibleSalePage - 1) * 15, visibleSalePage * 15)
                      .map((venta) => {
                        const anulada = venta.remision.estado === "ANULADA";
                        return (
                          <tr key={venta.remision.id}>
                            <td className="rentabilidad-card-head">
                              <strong>#{venta.remision.consecutivo}</strong>
                              <small className="muted block">
                                {new Intl.DateTimeFormat("es-CO", {
                                  dateStyle: "medium",
                                }).format(venta.remision.fecha)}{" "}
                                · {venta.remision.tipo_pago}
                              </small>
                            </td>
                            <td data-label="Cliente">
                              <strong>{venta.nombre_cliente}</strong>
                              <small className="muted block">
                                {venta.tipo_cliente ?? "Cliente"} ·{" "}
                                {venta.remision.estado}
                              </small>
                            </td>
                            <td data-label="Venta (sin IVA)">
                              <div className="profit-cell">
                                <strong>
                                  {formatCOP(venta.remision.subtotal)}
                                </strong>
                                {venta.remision.iva > 0 && (
                                  <small className="muted">
                                    Total c/IVA:{" "}
                                    {formatCOP(venta.remision.total)}
                                  </small>
                                )}
                              </div>
                            </td>
                            <td data-label="Costo de productos">
                              {venta.lineas_sin_costo > 0 ? (
                                <div className="profit-cell">
                                  <span>{formatCOP(venta.costo_total)}</span>
                                  <small className="muted">
                                    Falta costo en {venta.lineas_sin_costo}{" "}
                                    {venta.lineas_sin_costo === 1
                                      ? "línea"
                                      : "líneas"}
                                  </small>
                                </div>
                              ) : (
                                <span>{formatCOP(venta.costo_total)}</span>
                              )}
                            </td>
                            <td data-label="Ganancia de la venta">
                              {anulada ? (
                                <span className="inventory-state rojo">
                                  Anulada (sin efecto)
                                </span>
                              ) : venta.ganancia_venta === null ? (
                                <span className="inventory-state amarillo">
                                  Costo incompleto
                                </span>
                              ) : (
                                <div className="profit-cell">
                                  <span
                                    className={profitClass(
                                      venta.ganancia_venta,
                                    )}
                                  >
                                    {venta.ganancia_venta >= 0 ? "+" : ""}
                                    {formatCOP(venta.ganancia_venta)}
                                  </span>
                                  <small className="muted">
                                    Margen: {formatPct(venta.margen_pct)}
                                  </small>
                                </div>
                              )}
                            </td>
                            <td className="rentabilidad-card-actions">
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Ver desglose de ganancia de la remisión #${venta.remision.consecutivo}`}
                                onClick={() => setSelectedSale(venta)}
                              >
                                <Eye size={15} />
                                Ver desglose
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {saleTotalPages > 1 && (
                <div className="catalog-pagination">
                  <Button
                    variant="outline"
                    disabled={visibleSalePage <= 1}
                    onClick={() => setSalePage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </Button>
                  <span>
                    Página {visibleSalePage} de {saleTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={visibleSalePage >= saleTotalPages}
                    onClick={() =>
                      setSalePage((p) => Math.min(saleTotalPages, p + 1))
                    }
                  >
                    Siguiente
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <EditarCostoSheet
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSaved={() => {
          setEditingItem(null);
          setAttempt((x) => x + 1);
        }}
      />

      <DesgloseVentaSheet
        venta={selectedSale}
        onClose={() => setSelectedSale(null)}
        onEditProductCost={(productoId) => {
          const found = productos.find((p) => p.producto.id === productoId);
          setSelectedSale(null);
          if (found) {
            setEditingItem(found);
          }
        }}
      />
    </>
  );
}

function EditarCostoSheet({
  item,
  onClose,
  onSaved,
}: {
  item: RentabilidadProductoItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [valor, setValor] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (item) {
      setValor(item.costo_llegada !== null ? String(item.costo_llegada) : "");
      setFormError(null);
      setSaving(false);
      submitting.current = false;
    }
  }, [item]);

  const parsedNum = valor.trim() === "" ? NaN : Number(valor);
  const validPreview = Number.isFinite(parsedNum) && parsedNum >= 0;

  const prevGananciaTienda =
    item && validPreview
      ? roundMoney(item.producto.precio_tienda - parsedNum)
      : null;
  const prevMargenTienda =
    item && prevGananciaTienda !== null && item.producto.precio_tienda > 0
      ? roundMoney((prevGananciaTienda / item.producto.precio_tienda) * 100)
      : null;

  const prevGananciaDist =
    item && validPreview
      ? roundMoney(item.producto.precio_distribuidor - parsedNum)
      : null;
  const prevMargenDist =
    item &&
    prevGananciaDist !== null &&
    item.producto.precio_distribuidor > 0
      ? roundMoney(
          (prevGananciaDist / item.producto.precio_distribuidor) * 100,
        )
      : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!item || submitting.current) return;

    if (valor.trim() === "" || !Number.isFinite(parsedNum) || parsedNum < 0) {
      setFormError("Ingresa un precio de llegada válido (mayor o igual a 0).");
      return;
    }
    if (Math.abs(parsedNum * 100 - Math.round(parsedNum * 100)) >= 0.0001) {
      setFormError("Usa como máximo dos decimales.");
      return;
    }

    submitting.current = true;
    setSaving(true);
    setFormError(null);

    const res = await rentabilidadService.guardarCostoProducto(
      item.producto.id,
      parsedNum,
      item.costo_llegada,
    );

    submitting.current = false;
    setSaving(false);

    if (res.error) {
      setFormError(res.error);
      return;
    }

    onSaved();
  }

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && !saving && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {item?.costo_llegada === null
              ? "Registrar precio de llegada"
              : "Actualizar precio de llegada"}
          </SheetTitle>
          <SheetDescription>
            {item
              ? `${item.producto.nombre} (${item.producto.sku}). Las próximas ventas congelarán este costo automáticamente.`
              : ""}
          </SheetDescription>
        </SheetHeader>

        {item && (
          <form className="finance-form" onSubmit={handleSubmit}>
            <Label htmlFor="costo-llegada-input">
              Precio unitario de llegada (COP)
            </Label>
            <Input
              id="costo-llegada-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Ej. 12500"
              value={valor}
              disabled={saving}
              onChange={(e) => {
                setValor(e.target.value);
                setFormError(null);
              }}
            />

            <div className="costo-preview-grid">
              <div className="costo-preview-card">
                <small>
                  Precio Tienda: {formatCOP(item.producto.precio_tienda)}
                </small>
                <strong className={profitClass(prevGananciaTienda)}>
                  {prevGananciaTienda === null
                    ? "—"
                    : `${prevGananciaTienda >= 0 ? "+" : ""}${formatCOP(prevGananciaTienda)}`}
                </strong>
                <small>Margen: {formatPct(prevMargenTienda)}</small>
              </div>
              <div className="costo-preview-card">
                <small>
                  Precio Distribuidor:{" "}
                  {formatCOP(item.producto.precio_distribuidor)}
                </small>
                <strong className={profitClass(prevGananciaDist)}>
                  {prevGananciaDist === null
                    ? "—"
                    : `${prevGananciaDist >= 0 ? "+" : ""}${formatCOP(prevGananciaDist)}`}
                </strong>
                <small>Margen: {formatPct(prevMargenDist)}</small>
              </div>
            </div>

            {validPreview &&
              ((prevGananciaTienda !== null && prevGananciaTienda < 0) ||
                (prevGananciaDist !== null && prevGananciaDist < 0)) && (
                <div className="warning-box" role="alert">
                  Atención: este costo de llegada supera al menos uno de los
                  precios actuales de venta, lo que generaría pérdida.
                </div>
              )}

            {formError && (
              <p className="error-box" role="alert">
                {formError}
              </p>
            )}

            <div className="order-actions">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={onClose}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar costo"}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DesgloseVentaSheet({
  venta,
  onClose,
  onEditProductCost,
}: {
  venta: RentabilidadVentaItem | null;
  onClose: () => void;
  onEditProductCost: (productoId: string) => void;
}) {
  return (
    <Sheet open={!!venta} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {venta
              ? `Ganancia de la remisión #${venta.remision.consecutivo}`
              : "Desglose de venta"}
          </SheetTitle>
          <SheetDescription>
            {venta
              ? `${venta.nombre_cliente} · ${new Intl.DateTimeFormat("es-CO", {
                  dateStyle: "long",
                }).format(venta.remision.fecha)} · Estado: ${venta.remision.estado}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        {venta && (
          <div>
            <div className="venta-desglose-resumen">
              <div>
                <small>Venta sin IVA</small>
                <strong>{formatCOP(venta.remision.subtotal)}</strong>
              </div>
              <div>
                <small>Costo de mercancía</small>
                <strong>{formatCOP(venta.costo_total)}</strong>
              </div>
              <div>
                <small>Ganancia de la venta</small>
                <strong
                  className={
                    venta.remision.estado === "ANULADA"
                      ? "profit-neutral"
                      : profitClass(venta.ganancia_venta)
                  }
                >
                  {venta.remision.estado === "ANULADA"
                    ? "Anulada"
                    : venta.ganancia_venta === null
                      ? "Falta costo"
                      : `${venta.ganancia_venta >= 0 ? "+" : ""}${formatCOP(venta.ganancia_venta)} (${formatPct(venta.margen_pct)})`}
                </strong>
              </div>
            </div>

            <div className="order-table-wrap">
              <table className="order-table rentabilidad-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Llegó a (u.)</th>
                    <th>Se vendió a (u.)</th>
                    <th>Ganancia total</th>
                  </tr>
                </thead>
                <tbody>
                  {venta.lineas.map((linea) => (
                    <tr key={linea.detalle_id}>
                      <td className="rentabilidad-card-head">
                        <strong>{linea.nombre_producto}</strong>
                        <small className="muted block">
                          {linea.sku} · Cant: {formatUnits(linea.cantidad)}
                        </small>
                      </td>
                      <td data-label="Llegó a (u.)">
                        {linea.costo_unitario === null ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              onEditProductCost(linea.producto_id)
                            }
                          >
                            Definir costo
                          </Button>
                        ) : (
                          <div className="profit-cell">
                            <span>{formatCOP(linea.costo_unitario)}</span>
                            <small className="muted">
                              {linea.origen_costo === "CONGELADO"
                                ? "Congelado en venta"
                                : "Costo vigente"}
                            </small>
                          </div>
                        )}
                      </td>
                      <td data-label="Se vendió a (u.)">
                        <div className="profit-cell">
                          <span>{formatCOP(linea.precio_unitario)}</span>
                          <small className="muted">
                            Subtotal: {formatCOP(linea.subtotal_linea)}
                          </small>
                        </div>
                      </td>
                      <td data-label="Ganancia total">
                        {linea.ganancia_linea === null ? (
                          <span className="muted">Sin costo</span>
                        ) : (
                          <div className="profit-cell">
                            <span className={profitClass(linea.ganancia_linea)}>
                              {linea.ganancia_linea >= 0 ? "+" : ""}
                              {formatCOP(linea.ganancia_linea)}
                            </span>
                            <small className="muted">
                              {linea.ganancia_unitaria !== null
                                ? `${formatCOP(linea.ganancia_unitaria)} c/u · ${formatPct(linea.margen_pct)}`
                                : ""}
                            </small>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="order-actions" style={{ marginTop: 18 }}>
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
              <Button asChild variant="outline">
                <Link to={`/remisiones/${venta.remision.id}`}>
                  Ir al documento de remisión
                </Link>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
