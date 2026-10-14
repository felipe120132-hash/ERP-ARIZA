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

// ---------------------------------------------------------------------------
// 5. registrar_movimiento_inventario
// ---------------------------------------------------------------------------
export const MovimientoInventarioInputSchema = z
  .object({
    p_producto_id:    uuidSchema,
    p_tipo:           z.enum(['ENTRADA', 'AJUSTE'], {
      error: 'El tipo de movimiento debe ser ENTRADA o AJUSTE.',
    }),
    p_cantidad:       z.number({
      message: 'La cantidad debe ser un número.',
    }),
    p_motivo:         z
      .string({ message: 'El motivo es obligatorio.' })
      .trim()
      .min(5, { message: 'El motivo debe tener al menos 5 caracteres.' }),
    p_idempotency_key: uuidSchema,
    p_stock_esperado:  z.number().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.p_tipo === 'ENTRADA') {
      if (data.p_cantidad <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La cantidad para una ENTRADA debe ser mayor a 0.',
          path: ['p_cantidad'],
        });
      }
    } else if (data.p_tipo === 'AJUSTE') {
      if (data.p_cantidad < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La cantidad contada para un AJUSTE no puede ser negativa.',
          path: ['p_cantidad'],
        });
      }
      if (data.p_stock_esperado === undefined || data.p_stock_esperado === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El stock esperado es obligatorio cuando el tipo de movimiento es AJUSTE.',
          path: ['p_stock_esperado'],
        });
      }
    }
  });
export type MovimientoInventarioInput = z.infer<typeof MovimientoInventarioInputSchema>;

export const MovimientoInventarioRespuestaSchema = z.object({
  kardex_id:        uuidSchema,
  producto_id:      uuidSchema,
  tipo_movimiento:  z.enum(['ENTRADA', 'AJUSTE']),
  cantidad:         z.number(),
  stock_anterior:   z.number(),
  stock_resultante: z.number(),
  repetido:         z.boolean(),
});
export type MovimientoInventarioRespuesta = z.infer<typeof MovimientoInventarioRespuestaSchema>;

