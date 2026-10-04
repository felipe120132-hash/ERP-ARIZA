import Carrito from "@/components/Carrito";
import { usePedido } from "@/context/PedidoContext";
import { useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  Package,
  RefreshCw,
  ArrowUpRight,
  SlidersHorizontal,
  LayoutGrid,
  List,
  X,
  Boxes,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useCatalogo } from "@/hooks/useCatalogo";
import { filterProducts, money } from "@/lib/catalog";
import type { AlertaStock, Producto } from "@/types/schemas";
const labels = {
  ROJO: "Stock crítico",
  AMARILLO: "Por agotarse",
  VERDE: "Disponible",
};
function Stock({ alert }: { alert?: AlertaStock }) {
  return (
    <Badge
      variant="secondary"
      className={`stock-badge ${alert?.semaforo.toLowerCase() ?? ""}`}
    >
      <span />
      {alert ? labels[alert.semaforo] : "Sin alerta disponible"}
    </Badge>
  );
}
function ProductImage({ product, url }: { product: Producto; url?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`product-image category-${product.categoria.length % 4}`}>
      {url && !failed ? (
        <img
          src={url}
          alt={product.nombre}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <Package size={54} strokeWidth={1} />
          <span>Sin imagen</span>
        </>
      )}
    </div>
  );
}
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export default function Catalogo() {
  const pedido = usePedido();
  const { products, alerts, images, loading, error, warning, reload } =
    useCatalogo();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "",
    category = params.get("categoria") ?? "all",
    origin = params.get("origen") ?? "all",
    price = params.get("precio") === "distribuidor" ? "distribuidor" : "tienda";
  const [view, setView] = useState<"grid" | "list">("grid"),
    [selected, setSelected] = useState<string | null>(null);
  const deferred = useDeferredValue(search);
  const filtered = useMemo(
    () => filterProducts(products, deferred, category, origin),
    [products, deferred, category, origin],
  );
  const alertMap = useMemo(
    () => new Map(alerts.map((alert) => [alert.id, alert])),
    [alerts],
  );
  const categories = [
      ...new Set(products.map((product) => product.categoria)),
    ].sort(),
    origins = [
      ...new Set(
        products.map((product) => product.origen ?? "Sin especificar"),
      ),
    ].sort();
  const pageSize = 12,
    pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)),
    page = Math.min(Math.max(1, Number(params.get("pagina")) || 1), pageCount);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const detail = products.find((product) => product.id === selected);
  function change(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (!value || value === "all") next.delete(key);
        else next.set(key, value);
        if (key !== "pagina") next.delete("pagina");
        return next;
      },
      { replace: true },
    );
  }
  const clear = () =>
    setParams(price === "distribuidor" ? { precio: price } : {}, {
      replace: true,
    });
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PRODUCTOS / CATÁLOGO</span>
          <h1>Todo listo para vender.</h1>
          <p>Encuentra cada referencia y consulta sus existencias.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => void reload()}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Actualizar
        </Button>
      </div>
      <div className="catalog-stats">
        <div>
          <span className="stat-icon">
            <Package size={19} />
          </span>
          <div>
            <small>Productos activos</small>
            <strong>
              {loading ? "—" : products.length}
              <span> referencias</span>
            </strong>
          </div>
        </div>
        <div>
          <span className="stat-icon">
            <Boxes size={19} />
          </span>
          <div>
            <small>Categorías</small>
            <strong>
              {loading ? "—" : categories.length}
              <span> en tu catálogo</span>
            </strong>
          </div>
        </div>
        <div>
          <span className="stat-icon amber">
            <AlertTriangle size={19} />
          </span>
          <div>
            <small>Requieren atención</small>
            <strong>
              {loading || warning
                ? "—"
                : products.filter(
                    (product) => alertMap.get(product.id)?.semaforo === "ROJO",
                  ).length}
              <span> con stock crítico</span>
            </strong>
          </div>
        </div>
      </div>
      <a className="mobile-order-shortcut" href="#pedido-en-curso">
        Ver pedido · {pedido.lineas.length}
      </a>
      <div className="catalog-order-layout">
        <section className="catalog-panel" aria-label="Catálogo de productos">
          <div className="catalog-panel-heading">
            <div>
              <h2>
                Explora el catálogo{" "}
                <span>{loading ? "…" : products.length}</span>
              </h2>
              <p>Precios base en pesos colombianos.</p>
            </div>
            <div className="price-selector">
              <span>Ver precio</span>
              <FilterSelect
                label="Tipo de precio"
                value={price}
                onChange={(value) => change("precio", value)}
                options={[
                  { value: "tienda", label: "Tienda" },
                  { value: "distribuidor", label: "Distribuidor" },
                ]}
              />
            </div>
          </div>
          <div className="catalog-toolbar">
            <div className="search-field">
              <Search size={17} />
              <Input
                aria-label="Buscar producto o SKU"
                placeholder="Buscar por nombre o SKU…"
                value={search}
                onChange={(event) => change("q", event.target.value)}
              />
              {search && (
                <button
                  aria-label="Limpiar búsqueda"
                  onClick={() => change("q", "")}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <FilterSelect
              label="Categoría"
              value={category}
              onChange={(value) => change("categoria", value)}
              options={[
                { value: "all", label: "Todas las categorías" },
                ...categories.map((value) => ({ value, label: value })),
              ]}
            />
            <FilterSelect
              label="Origen"
              value={origin}
              onChange={(value) => change("origen", value)}
              options={[
                { value: "all", label: "Todos los orígenes" },
                ...origins.map((value) => ({ value, label: value })),
              ]}
            />
            <div className="view-toggle">
              <Button
                aria-label="Vista de tarjetas"
                aria-pressed={view === "grid"}
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setView("grid")}
              >
                <LayoutGrid size={17} />
              </Button>
              <Button
                aria-label="Vista de lista"
                aria-pressed={view === "list"}
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setView("list")}
              >
                <List size={18} />
              </Button>
            </div>
          </div>
          {(search || category !== "all" || origin !== "all") && (
            <div className="filter-summary">
              <SlidersHorizontal size={14} />
              <span>{filtered.length} resultados</span>
              <Button variant="ghost" size="sm" onClick={clear}>
                Limpiar filtros <X size={13} />
              </Button>
            </div>
          )}
          {warning && (
            <div className="warning-box" role="status">
              {warning}
            </div>
          )}
          {error ? (
            <div className="empty-state" role="alert">
              <AlertTriangle />
              <h3>No pudimos cargar el catálogo</h3>
              <p>{error}</p>
              <Button variant="outline" onClick={() => void reload()}>
                Volver a intentar
              </Button>
            </div>
          ) : loading ? (
            <div
              className="product-grid"
              aria-label="Cargando catálogo"
              role="status"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <div className="product-card" key={index}>
                  <Skeleton className="h-40 w-full rounded-xl" />
                  <Skeleton className="mt-5 h-5 w-3/4" />
                  <Skeleton className="mt-3 h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : !filtered.length ? (
            <div className="empty-state">
              <Package />
              <h3>
                {products.length
                  ? "No encontramos coincidencias"
                  : "Tu catálogo está por comenzar"}
              </h3>
              <p>
                {products.length
                  ? "Prueba con otro nombre, SKU o categoría."
                  : "Los productos activos aparecerán aquí cuando estén registrados."}
              </p>
              {products.length > 0 && (
                <Button variant="outline" onClick={clear}>
                  Limpiar filtros
                </Button>
              )}
            </div>
          ) : (
            <>
              <div
                className={view === "grid" ? "product-grid" : "product-list"}
              >
                {visible.map((product) => (
                  <article className="product-card" key={product.id}>
                    <ProductImage
                      key={images[product.imagen_path ?? ""] ?? product.id}
                      product={product}
                      url={images[product.imagen_path ?? ""]}
                    />
                    <div className="product-info">
                      <div className="product-meta">
                        <span>{product.sku}</span>
                        <Stock alert={alertMap.get(product.id)} />
                      </div>
                      <h3>{product.nombre}</h3>
                      <p>
                        {product.categoria} <span>·</span>{" "}
                        {product.origen ?? "Sin origen especificado"}
                      </p>
                      <div className="product-bottom">
                        <div>
                          <small>
                            Precio{" "}
                            {price === "tienda" ? "tienda" : "distribuidor"}
                          </small>
                          <strong>
                            {money(
                              price === "tienda"
                                ? product.precio_tienda
                                : product.precio_distribuidor,
                            )}
                          </strong>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label={`Ver detalle de ${product.nombre}`}
                          onClick={() => setSelected(product.id)}
                        >
                          <ArrowUpRight size={19} />
                        </Button>
                      </div>
                      <Button
                        className="add-to-order"
                        variant="secondary"
                        disabled={
                          product.stock_actual <= 0 ||
                          pedido.enviando ||
                          pedido.incierto
                        }
                        onClick={() => pedido.agregar(product)}
                        aria-label={`Agregar ${product.nombre}`}
                      >
                        {product.stock_actual > 0
                          ? "Agregar al pedido"
                          : "Sin existencias"}
                      </Button>
                      <div className="product-stock">
                        <Boxes size={13} />
                        {product.stock_actual.toLocaleString("es-CO")} unidades
                        en stock
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div className="catalog-pagination">
                <span>
                  Mostrando {(page - 1) * pageSize + 1}–
                  {Math.min(page * pageSize, filtered.length)} de{" "}
                  {filtered.length} productos
                </span>
                <div>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Página anterior"
                    disabled={page === 1}
                    onClick={() => change("pagina", String(page - 1))}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <span>
                    {page} / {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Página siguiente"
                    disabled={page === pageCount}
                    onClick={() => change("pagina", String(page + 1))}
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
        <Carrito
          products={products}
          loading={loading || !!error}
          onCreated={() => void reload()}
        />
      </div>
      <p className="catalog-footnote">
        Los precios mostrados son de catálogo. El precio acordado con cada
        cliente y el IVA se determinan al crear la remisión.
      </p>
      <Sheet
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="product-detail">
          {detail && (
            <>
              <SheetHeader>
                <SheetDescription>
                  DETALLE DE PRODUCTO · {detail.sku}
                </SheetDescription>
                <SheetTitle>{detail.nombre}</SheetTitle>
              </SheetHeader>
              <div className="detail-body">
                <ProductImage
                  product={detail}
                  url={images[detail.imagen_path ?? ""]}
                />
                <Stock alert={alertMap.get(detail.id)} />
                <dl>
                  {[
                    ["Categoría", detail.categoria],
                    ["Origen", detail.origen ?? "Sin especificar"],
                    ["Precio tienda", money(detail.precio_tienda)],
                    ["Precio distribuidor", money(detail.precio_distribuidor)],
                    ["Tasa de IVA", `${detail.tasa_iva}%`],
                    [
                      "Existencias",
                      `${detail.stock_actual.toLocaleString("es-CO")} unidades`,
                    ],
                    [
                      "Stock mínimo",
                      `${detail.stock_minimo.toLocaleString("es-CO")} unidades`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="catalog-footnote">
                  Consulta informativa. Los precios especiales se aplican al
                  generar la remisión para el cliente.
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
