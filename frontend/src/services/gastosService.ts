import { z } from "zod";
import { supabase } from "./supabaseClient";
import { parsearErrorSupabase, type ServiceResponse } from "./errorHandler";
import {
  gastoSchema,
  resumenFinancieroResultSchema,
  uuidSchema,
  type Gasto,
  type ResumenFinancieroResult,
} from "../types/schemas";
import { ResumenFinancieroInputSchema } from "../types/rpcSchemas";

const montoGastoSchema = z
  .number()
  .finite({ message: "El monto debe ser un número válido." })
  .positive({ message: "El monto del gasto debe ser mayor a 0." })
  .max(9999999999.99, { message: "El monto supera el límite permitido." })
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.0001,
    "El monto admite como máximo dos decimales.",
  );

const mesReferenciaGastoSchema = z.string().regex(
  /^[1-9]\d{3}-(0[1-9]|1[0-2])-01$/,
  "El mes de referencia debe tener formato YYYY-MM-01.",
);

export const CrearGastoInputSchema = gastoSchema
  .omit({
    id: true,
    created_at: true,
  })
  .extend({
    concepto: z
      .string()
      .trim()
      .min(1, "El concepto del gasto es obligatorio.")
      .max(300, "El concepto no puede superar 300 caracteres."),
    categoria: z
      .string()
      .trim()
      .min(1, "La categoría del gasto es obligatoria.")
      .max(100, "La categoría no puede superar 100 caracteres."),
    monto: montoGastoSchema,
    mes_referencia: mesReferenciaGastoSchema,
  });
export type CrearGastoInput = z.infer<typeof CrearGastoInputSchema>;

export const ActualizarGastoInputSchema = z.object({
  concepto: z
    .string()
    .trim()
    .min(1, "El concepto del gasto es obligatorio.")
    .max(300, "El concepto no puede superar 300 caracteres."),
  categoria: z
    .string()
    .trim()
    .min(1, "La categoría del gasto es obligatoria.")
    .max(100, "La categoría no puede superar 100 caracteres."),
  monto: montoGastoSchema,
  mes_referencia: mesReferenciaGastoSchema,
  recurrente: z.boolean(),
});
export type ActualizarGastoInput = z.infer<typeof ActualizarGastoInputSchema>;

export interface AuditoriaGasto {
  gasto_id: string;
  concepto_anterior: string;
  concepto_nuevo: string;
  categoria_anterior: string;
  categoria_nueva: string;
  monto_anterior: number;
  monto_nuevo: number;
  mes_anterior: string;
  mes_nuevo: string;
  fecha: string;
}

const AUDIT_STORAGE_KEY = "ariza:gastos-auditoria";

function registrarAuditoriaGasto(entry: AuditoriaGasto) {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    const map: Record<string, AuditoriaGasto> = raw ? JSON.parse(raw) : {};
    map[entry.gasto_id] = entry;
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignorar errores de almacenamiento local
  }
}

export const gastosService = {
  obtenerAuditoriaGastos(): Record<string, AuditoriaGasto> {
    try {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

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
   * Actualiza un gasto operacional existente (solo ADMIN).
   * Incluye control de concurrencia sobre el monto previo y registro de trazabilidad.
   */
  async actualizarGasto(
    id: string,
    input: ActualizarGastoInput,
    anterior?: Gasto,
  ): Promise<ServiceResponse<Gasto>> {
    try {
      if (!uuidSchema.safeParse(id).success) {
        return { data: null, error: "Identificador de gasto inválido." };
      }

      const validation = ActualizarGastoInputSchema.safeParse(input);
      if (!validation.success) {
        return {
          data: null,
          error: `Validación de entrada fallida: ${validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      let query = supabase
        .from("gastos")
        .update(validation.data)
        .eq("id", id);

      if (anterior) {
        query = query.eq("monto", anterior.monto);
      }

      const { data, error } = await query.select("*").single();

      if (error) {
        if (error.code === "PGRST116") {
          return {
            data: null,
            error:
              "El gasto fue modificado o eliminado por otra sesión. Actualiza la lista antes de continuar.",
          };
        }
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = gastoSchema.safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en gasto actualizado: ${parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      if (anterior) {
        registrarAuditoriaGasto({
          gasto_id: id,
          concepto_anterior: anterior.concepto,
          concepto_nuevo: parseResult.data.concepto,
          categoria_anterior: anterior.categoria,
          categoria_nueva: parseResult.data.categoria,
          monto_anterior: anterior.monto,
          monto_nuevo: parseResult.data.monto,
          mes_anterior: anterior.mes_referencia,
          mes_nuevo: parseResult.data.mes_referencia,
          fecha: new Date().toISOString(),
        });
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },

  /**
   * Elimina un gasto operacional existente cuando las reglas del sistema lo permitan (solo ADMIN).
   */
  async eliminarGasto(
    id: string,
    anterior?: Gasto,
  ): Promise<ServiceResponse<{ id: string }>> {
    try {
      if (!uuidSchema.safeParse(id).success) {
        return { data: null, error: "Identificador de gasto inválido." };
      }

      let query = supabase.from("gastos").delete().eq("id", id);
      if (anterior) {
        query = query.eq("monto", anterior.monto);
      }

      const { data, error } = await query.select("id");

      if (error) {
        if (error.code === "23503") {
          return {
            data: null,
            error:
              "No se puede eliminar este gasto porque está vinculado a otros documentos o registros protegidos.",
          };
        }
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const rows = Array.isArray(data) ? data : data ? [data] : [];
      if (rows.length === 0) {
        return {
          data: null,
          error:
            "El gasto ya no existe o fue modificado por otra sesión. Actualiza la lista antes de continuar.",
        };
      }

      return { data: { id }, error: null };
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
