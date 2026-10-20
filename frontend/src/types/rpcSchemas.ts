import { z } from "zod";
import { uuidSchema } from "./schemas";

// ---------------------------------------------------------------------------
// Item individual para la creación de remisiones
// ---------------------------------------------------------------------------
export const RemisionItemSchema = z.object({
  producto_id: uuidSchema,
  cantidad: z
    .number()
    .positive({ message: "La cantidad debe ser un número mayor a 0." }),
});
export type RemisionItem = z.infer<typeof RemisionItemSchema>;

// ---------------------------------------------------------------------------
// 1. crear_remision
// ---------------------------------------------------------------------------
export const CrearRemisionInputSchema = z.object({
  p_cliente_id: uuidSchema,
  p_tipo_pago: z.enum(["CONTADO", "CREDITO"], {
    error: "El tipo de pago debe ser CONTADO o CREDITO.",
  }),
  p_items: z.array(RemisionItemSchema).min(1, {
    message: "La remisión debe contener al menos un producto.",
  }),
  p_aplica_iva: z.boolean().default(true),
});
export type CrearRemisionInput = z.infer<typeof CrearRemisionInputSchema>;

// ---------------------------------------------------------------------------
// 2. registrar_abono
// ---------------------------------------------------------------------------
export const RegistrarAbonoInputSchema = z.object({
  p_cliente_id: uuidSchema,
  p_monto: z
    .number()
    .positive({ message: "El monto del abono debe ser mayor a 0." }),
  p_metodo_pago: z
    .enum(["EFECTIVO", "TRANSFERENCIA", "BANCOLOMBIA"])
    .default("EFECTIVO"),
  p_remision_id: uuidSchema.nullable().optional(),
});
export type RegistrarAbonoInput = z.infer<typeof RegistrarAbonoInputSchema>;

// ---------------------------------------------------------------------------
// 2b. editar_abono_cartera
// ---------------------------------------------------------------------------
export const EditarAbonoInputSchema = z.object({
  p_abono_id: uuidSchema,
  p_cliente_id: uuidSchema,
  p_monto: z
    .number()
    .positive({ message: "El monto del abono debe ser mayor a 0." })
    .refine(
      (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.0001,
      "Usa como máximo dos decimales.",
    ),
  p_metodo_pago: z.enum(["EFECTIVO", "TRANSFERENCIA", "BANCOLOMBIA"]),
  p_remision_id: uuidSchema.nullable().optional(),
  p_motivo: z
    .string()
    .trim()
    .min(5, { message: "Describe el motivo de la corrección (mínimo 5 caracteres)." })
    .max(500),
  p_monto_anterior: z.number().positive(),
  p_saldo_esperado: z.number().nonnegative(),
});
export type EditarAbonoInput = z.infer<typeof EditarAbonoInputSchema>;

// ---------------------------------------------------------------------------
// 3. anular_remision
// ---------------------------------------------------------------------------
export const AnularRemisionInputSchema = z.object({
  p_remision_id: uuidSchema,
});
export type AnularRemisionInput = z.infer<typeof AnularRemisionInputSchema>;

// ---------------------------------------------------------------------------
// 4. resumen_financiero_mensual
// ---------------------------------------------------------------------------
export const ResumenFinancieroInputSchema = z.object({
  p_mes: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message:
      "El mes de referencia debe tener formato de fecha YYYY-MM-DD (primer día del mes).",
  }),
});
export type ResumenFinancieroInput = z.infer<
  typeof ResumenFinancieroInputSchema
>;
