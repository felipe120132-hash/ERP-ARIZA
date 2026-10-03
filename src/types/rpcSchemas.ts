import { z } from 'zod';

// Regex permisivo 8-4-4-4-12 (acepta cualquier UUID válido para Postgres,
// incluidos los que no tienen dígito de versión estándar, ej. 10000000-0000-…)
const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'UUID inválido',
  );

// ---------------------------------------------------------------------------
// Item individual para la creación de remisiones
// ---------------------------------------------------------------------------
export const RemisionItemSchema = z.object({
  producto_id: uuidSchema,
  cantidad:    z.number().positive({ message: 'La cantidad debe ser un número mayor a 0.' }),
});
export type RemisionItem = z.infer<typeof RemisionItemSchema>;

// ---------------------------------------------------------------------------
// 1. crear_remision
// ---------------------------------------------------------------------------
export const CrearRemisionInputSchema = z.object({
  p_cliente_id: uuidSchema,
  p_tipo_pago:  z.enum(['CONTADO', 'CREDITO'], {
    error: 'El tipo de pago debe ser CONTADO o CREDITO.',
  }),
  p_items:      z.array(RemisionItemSchema).min(1, {
    message: 'La remisión debe contener al menos un producto.',
  }),
  p_aplica_iva: z.boolean().default(true),
});
export type CrearRemisionInput = z.infer<typeof CrearRemisionInputSchema>;

// ---------------------------------------------------------------------------
// 2. registrar_abono
// ---------------------------------------------------------------------------
export const RegistrarAbonoInputSchema = z.object({
  p_cliente_id:  uuidSchema,
  p_monto:       z.number().positive({ message: 'El monto del abono debe ser mayor a 0.' }),
  p_metodo_pago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'BANCOLOMBIA']).default('EFECTIVO'),
  p_remision_id: uuidSchema.nullable().optional(),
});
export type RegistrarAbonoInput = z.infer<typeof RegistrarAbonoInputSchema>;

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
    message: 'El mes de referencia debe tener formato de fecha YYYY-MM-DD (primer día del mes).',
  }),
});
export type ResumenFinancieroInput = z.infer<typeof ResumenFinancieroInputSchema>;
