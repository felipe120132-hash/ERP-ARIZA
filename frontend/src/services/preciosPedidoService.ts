import { z } from "zod";
import { supabase } from "./supabaseClient";
import { precioClienteSchema, type PrecioCliente } from "@/types/schemas";
export async function consultarPreciosPedido(
  clienteId: string,
): Promise<PrecioCliente[]> {
  const rows: PrecioCliente[] = [];
  let expected: number | null = null;
  while (true) {
    const { data, error, count } = await supabase
      .from("precios_cliente")
      .select("*", { count: "exact" })
      .eq("cliente_id", clienteId)
      .order("id")
      .range(rows.length, rows.length + 499);
    if (error)
      throw new Error("No pudimos consultar los precios de este cliente.");
    if (count === null || (expected !== null && count !== expected))
      throw new Error(
        "No se pudo verificar el listado de precios. Actualiza la consulta.",
      );
    expected = count;
    const page = z.array(precioClienteSchema).parse(data);
    rows.push(...page);
    if (rows.length === count) break;
    if (!page.length || rows.length > count)
      throw new Error("La consulta de precios está incompleta.");
  }
  if (
    rows.some((x) => x.cliente_id !== clienteId) ||
    new Set(rows.map((x) => x.producto_id)).size !== rows.length
  )
    throw new Error("Los acuerdos de precio recibidos no son válidos.");
  return rows;
}
