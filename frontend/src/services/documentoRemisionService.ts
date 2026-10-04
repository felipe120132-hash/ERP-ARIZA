import { z } from "zod";
import { supabase } from "./supabaseClient";
import { remisionesService } from "./remisionesService";
import { clientesService } from "./clientesService";
import { productosService } from "./productosService";
import {
  detalleRemisionSchema,
  type Remision,
  type DetalleRemision,
  type Cliente,
} from "@/types/schemas";
export interface DocumentoRemision {
  remision: Remision;
  lines: DetalleRemision[];
  cliente: Cliente | null;
  names: Record<string, string>;
  incompleteNames: boolean;
  generatedAt: Date;
}
export async function cargarDocumentoRemision(
  id: string,
): Promise<DocumentoRemision> {
  const header = await remisionesService.obtenerRemisionPorId(id);
  if (header.error || !header.data)
    throw new Error("No pudimos verificar la remisión. Intenta nuevamente.");
  const [client, products, lines] = await Promise.all([
    clientesService.obtenerClientePorId(header.data.cliente_id),
    productosService.listarProductos(),
    cargarLineas(id),
  ]);
  if (!lines.length)
    throw new Error(
      "La remisión no tiene líneas. No se puede generar un documento incompleto.",
    );
  const latest = await remisionesService.obtenerRemisionPorId(id);
  if (latest.error || !latest.data)
    throw new Error("No pudimos verificar el estado actual de la remisión.");
  const names = Object.fromEntries(
    (products.data ?? []).map((x) => [x.id, x.nombre]),
  );
  return {
    remision: latest.data,
    lines,
    cliente: client.data,
    names,
    incompleteNames:
      !!client.error ||
      !!products.error ||
      lines.some((x) => !names[x.producto_id]),
    generatedAt: new Date(),
  };
}
async function cargarLineas(id: string) {
  const rows: DetalleRemision[] = [];
  let expected: number | null = null;
  while (true) {
    const { data, error, count } = await supabase
      .from("detalles_remision")
      .select("*", { count: "exact" })
      .eq("remision_id", id)
      .order("id")
      .range(rows.length, rows.length + 499);
    if (error || count === null)
      throw new Error("No pudimos consultar todas las líneas de la remisión.");
    if (expected !== null && count !== expected)
      throw new Error(
        "La remisión cambió durante la consulta. Intenta nuevamente.",
      );
    expected = count;
    const parsed = z.array(detalleRemisionSchema).parse(data);
    rows.push(...parsed);
    if (rows.length === count) break;
    if (!parsed.length || rows.length > count)
      throw new Error("El detalle de la remisión está incompleto.");
  }
  if (new Set(rows.map((x) => x.id)).size !== rows.length)
    throw new Error(
      "Las líneas recibidas están duplicadas. Intenta nuevamente.",
    );
  return rows;
}
