import type { Producto } from "@/types/schemas";
export const money = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function filterProducts(
  products: Producto[],
  search: string,
  category: string,
  origin: string,
) {
  const term = normalize(search.trim());
  return products.filter(
    (product) =>
      (category === "all" || product.categoria === category) &&
      (origin === "all" || (product.origen ?? "Sin especificar") === origin) &&
      normalize(`${product.nombre} ${product.sku}`).includes(term),
  );
}
