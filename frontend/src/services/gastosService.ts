import { z } from "zod";
import { supabase } from "./supabaseClient";
import { parsearErrorSupabase, type ServiceResponse } from "./errorHandler";
import {
  gastoSchema,
  resumenFinancieroResultSchema,
  type Gasto,
  type ResumenFinancieroResult,
} from "../types/schemas";
import { ResumenFinancieroInputSchema } from "../types/rpcSchemas";

export const CrearGastoInputSchema = gastoSchema.omit({
  id: true,
  created_at: true,
});
export type CrearGastoInput = z.infer<typeof CrearGastoInputSchema>;

export const gastosService = {
  /**
   * Obtiene la lista de gastos operacionales. Permite filtrar opcionalmente por mes de referencia (YYYY-MM-01).
   * Solo accesible para usuarios con rol ADMIN (RLS).
   */
  async listarGastos(
    mesReferencia?: string,
  ): Promise<ServiceResponse<Gasto[]>> {
    try {
      let query = supabase
        .from("gastos")
        .select("*")
        .order("created_at", { ascending: false });

      if (mesReferencia) {
        query = query.eq("mes_referencia", mesReferencia);
      }

      const { data, error } = await query;

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = z.array(gastoSchema).safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en gastos: ${parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Registra un nuevo gasto operacional (solo ADMIN).
   */
  async crearGasto(input: CrearGastoInput): Promise<ServiceResponse<Gasto>> {
    try {
      const validation = CrearGastoInputSchema.safeParse(input);
      if (!validation.success) {
        return {
          data: null,
          error: `Validación de entrada fallida: ${validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      const { data, error } = await supabase
        .from("gastos")
        .insert(validation.data)
        .select("*")
        .single();

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = gastoSchema.safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en gasto creado: ${parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Obtiene el resumen financiero mensual (ventas, gastos, utilidad neta, presupuesto)
   * mediante la función RPC `resumen_financiero_mensual`.
   */
  async resumenFinancieroMensual(
    mes: string,
  ): Promise<ServiceResponse<ResumenFinancieroResult>> {
    try {
      const validation = ResumenFinancieroInputSchema.safeParse({ p_mes: mes });
      if (!validation.success) {
        return {
          data: null,
          error: `Validación de entrada fallida: ${validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      const { data, error } = await supabase.rpc(
        "resumen_financiero_mensual",
        validation.data,
      );

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      // La RPC retorna una fila o un array de filas
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        return {
          data: null,
          error:
            "No se encontraron datos financieros para el período indicado.",
        };
      }

      const parseResult = resumenFinancieroResultSchema.safeParse(row);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en resumen financiero: ${parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },
};
