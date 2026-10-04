import { z } from "zod";
import { supabase } from "./supabaseClient";
import { parsearErrorSupabase, type ServiceResponse } from "./errorHandler";
import {
  productoSchema,
  alertaStockSchema,
  type Producto,
  type AlertaStock,
} from "../types/schemas";

export const productosService = {
  /**
   * Obtiene todos los productos del catálogo ordenados por nombre.
   */
  async listarProductos(): Promise<ServiceResponse<Producto[]>> {
    try {
      const { data, error } = await supabase
        .from("productos")
        .select("*")
        .order("nombre");

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = z.array(productoSchema).safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en productos: ${parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Obtiene las alertas de stock calculadas por la vista `vista_alertas_stock`.
   * Permite filtrar opcionalmente por semáforo ('ROJO' | 'AMARILLO' | 'VERDE').
   */
  async listarAlertasStock(
    semaforo?: "ROJO" | "AMARILLO" | "VERDE",
  ): Promise<ServiceResponse<AlertaStock[]>> {
    try {
      let query = supabase.from("vista_alertas_stock").select("*");

      if (semaforo) {
        query = query.eq("semaforo", semaforo);
      }

      const { data, error } = await query;

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = z.array(alertaStockSchema).safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en alertas de stock: ${parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Obtiene un producto individual por su ID.
   */
  async obtenerProductoPorId(id: string): Promise<ServiceResponse<Producto>> {
    try {
      const { data, error } = await supabase
        .from("productos")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = productoSchema.safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en producto: ${parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },
};
