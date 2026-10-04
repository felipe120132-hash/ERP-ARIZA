import { z } from "zod";
import { supabase } from "./supabaseClient";
import { kardexSchema, type Kardex } from "@/types/schemas";
import { parsearErrorSupabase, type ServiceResponse } from "./errorHandler";
export type TipoMovimiento = "ENTRADA" | "SALIDA" | "AJUSTE";
const filtrosSchema = z.object({
  producto_id: z.string().regex(/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i),
  tipo: z.enum(["ENTRADA", "SALIDA", "AJUSTE"]).optional(),
  pagina: z.number().int().positive().default(1),
});
export const inventarioService = {
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
