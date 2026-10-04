import type { Cliente, Producto, PrecioCliente } from "@/types/schemas";
// Informational preview only. Never send these prices or totals to crear_remision.
function cents(value: number) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isSafeInteger(Math.round(value * 100)) ||
    Math.abs(value * 100 - Math.round(value * 100)) > 0.0001
  )
    throw new Error("El precio no tiene un formato válido.");
  return BigInt(Math.round(value * 100));
}
export function subtotalPedido(
  cliente: Cliente,
  lineas: { producto: Producto; cantidad: string }[],
  products: Producto[],
  precios: PrecioCliente[],
) {
  const map = new Map(precios.map((x) => [x.producto_id, x.precio_especial]));
  const catalog = new Map(products.map((x) => [x.id, x]));
  let total = 0n;
  const detalle = new Map<
    string,
    { precio: number; subtotal: number; especial: boolean }
  >();
  for (const line of lineas) {
    const p = catalog.get(line.producto.id);
    if (!p || !p.activo)
      throw new Error("Hay productos no disponibles en el pedido.");
    if (
      !/^\d+(\.\d{1,2})?$/.test(line.cantidad) ||
      Number(line.cantidad) <= 0 ||
      !Number.isSafeInteger(Math.round(Number(line.cantidad) * 100))
    )
      throw new Error("Revisa las cantidades para consultar el subtotal.");
    const quantity = BigInt(Math.round(Number(line.cantidad) * 100));
    const price =
      map.get(p.id) ??
      (cliente.tipo_cliente === "DISTRIBUIDOR"
        ? p.precio_distribuidor
        : p.precio_tienda);
    const amount = (cents(price) * quantity + 50n) / 100n;
    total += amount;
    if (total > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error(
        "El pedido supera el importe que se puede previsualizar.",
      );
    detalle.set(p.id, {
      precio: price,
      subtotal: Number(amount) / 100,
      especial: map.has(p.id),
    });
  }
  return { subtotal: Number(total) / 100, detalle };
}
