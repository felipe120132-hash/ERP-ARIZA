import { z } from "zod";
import { supabase } from "./supabaseClient";
import { kardexSchema, uuidSchema, type Kardex } from "@/types/schemas";
import { parsearErrorSupabase, type ServiceResponse } from "./errorHandler";
export type TipoMovimiento = "ENTRADA" | "SALIDA" | "AJUSTE";
const filtrosSchema = z.object({
  producto_id: uuidSchema,
  tipo: z.enum(["ENTRADA", "SALIDA", "AJUSTE"]).optional(),
  pagina: z.number().int().positive().default(1),
});
const cantidadSchema = z.number().finite().min(0).max(9999999999.99)
  .refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.0001);
export const movimientoInputSchema = z.object({
  p_producto_id: uuidSchema,
  p_tipo: z.enum(["ENTRADA", "SALIDA", "AJUSTE"]),
  p_cantidad: cantidadSchema,
  p_motivo: z.string().trim().min(5).max(500),
  p_idempotency_key: uuidSchema,
  p_stock_esperado: cantidadSchema.nullable(),
}).refine(v => {
  if (v.p_tipo === "ENTRADA") return v.p_cantidad > 0;
  if (v.p_tipo === "SALIDA") return v.p_cantidad > 0 && v.p_stock_esperado !== null && v.p_cantidad <= v.p_stock_esperado;
  return v.p_stock_esperado !== null;
});
export type MovimientoInput = z.infer<typeof movimientoInputSchema>;
const movimientoRespuestaSchema = z.object({
  kardex_id: uuidSchema,
  producto_id: uuidSchema,
  tipo_movimiento: z.enum(["ENTRADA", "SALIDA", "AJUSTE"]),
  cantidad: z.number().finite(),
  stock_anterior: cantidadSchema,
  stock_resultante: cantidadSchema,
  repetido: z.boolean(),
});
export class ErrorMovimiento extends Error {
  constructor(message: string, public incierto = false, public conflicto = false) { super(message); }
}
export const inventarioService = {
  async registrarMovimiento(input: MovimientoInput) {
    const parsed = movimientoInputSchema.safeParse(input);
    if (!parsed.success) throw new ErrorMovimiento("Los datos del movimiento no son válidos.");
    const payload = parsed.data;
    let response;
    let fallbackAjuste = false;
    try {
      response = await supabase.rpc("registrar_movimiento_inventario", payload);
      if (
        response.error &&
        payload.p_tipo === "SALIDA" &&
        response.error.code === "P0001" &&
        response.error.message.includes("ENTRADA o AJUSTE")
      ) {
        fallbackAjuste = true;
        const nuevoStock = Math.round((payload.p_stock_esperado! - payload.p_cantidad) * 100) / 100;
        response = await supabase.rpc("registrar_movimiento_inventario", {
          ...payload,
          p_tipo: "AJUSTE",
          p_cantidad: nuevoStock,
          p_motivo: payload.p_motivo.startsWith("[SALIDA]") ? payload.p_motivo : `[SALIDA] ${payload.p_motivo}`,
        });
      }
    } catch {
      throw new ErrorMovimiento("No pudimos confirmar el resultado. Reintenta el mismo movimiento para consultarlo sin duplicarlo.", true);
    }
    if (response.error) {
      if (response.error.code === "P0001" && !response.error.message.includes("idempotencia"))
        throw new ErrorMovimiento(response.error.message, false, response.error.message.startsWith("El stock cambió"));
      throw new ErrorMovimiento("No pudimos confirmar el resultado. Reintenta el mismo movimiento para consultarlo sin duplicarlo.", true);
    }
    const result = movimientoRespuestaSchema.safeParse(response.data);
    const r = result.success ? result.data : null;
    const cents = (v: number) => Math.round(v * 100);
    const expectedType = fallbackAjuste ? "AJUSTE" : input.p_tipo;
    const coherent = !r
      ? false
      : r.producto_id !== input.p_producto_id || r.tipo_movimiento !== expectedType
        ? false
        : expectedType === "ENTRADA"
          ? cents(r.stock_anterior) + cents(r.cantidad) === cents(r.stock_resultante) &&
            cents(r.cantidad) === cents(input.p_cantidad)
          : expectedType === "SALIDA"
            ? cents(r.stock_anterior) - Math.abs(cents(r.cantidad)) === cents(r.stock_resultante) &&
              Math.abs(cents(r.cantidad)) === cents(input.p_cantidad) &&
              cents(r.stock_anterior) === cents(input.p_stock_esperado!)
            : cents(r.stock_anterior) + cents(r.cantidad) === cents(r.stock_resultante) &&
              cents(r.stock_resultante) === (fallbackAjuste ? cents(input.p_stock_esperado!) - cents(input.p_cantidad) : cents(input.p_cantidad)) &&
              cents(r.stock_anterior) === cents(input.p_stock_esperado!);
    if (!r || !coherent)
      throw new ErrorMovimiento("La respuesta no permite confirmar este movimiento. Reintenta con la misma solicitud.", true);
    return r;
  },
  async listarMovimientos(input: {
    producto_id: string;
    tipo?: TipoMovimiento;
    pagina?: number;
  }): Promise<ServiceResponse<{ movimientos: Kardex[]; total: number }>> {
    const parsed = filtrosSchema.safeParse(input);
    if (!parsed.success)
      return { data: null, error: "Los filtros de inventario no son válidos." };
    try {
      const { producto_id, tipo, pagina } = parsed.data;
      let query = supabase
        .from("kardex")
        .select("*", { count: "exact" })
        .eq("producto_id", producto_id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
      if (tipo) query = query.eq("tipo_movimiento", tipo);
      const { data, error, count } = await query.range(
        (pagina - 1) * 20,
        pagina * 20 - 1,
      );
      if (error) return { data: null, error: parsearErrorSupabase(error) };
      const rows = z.array(kardexSchema).safeParse(data);
      if (!rows.success)
        return {
          data: null,
          error: "El historial recibido no tiene el formato esperado.",
        };
      if (count === null)
        return {
          data: null,
          error:
            "No pudimos verificar la cantidad de movimientos. Intenta nuevamente.",
        };
      return { data: { movimientos: rows.data, total: count }, error: null };
    } catch (error) {
      return { data: null, error: parsearErrorSupabase(error) };
    }
  },
};
