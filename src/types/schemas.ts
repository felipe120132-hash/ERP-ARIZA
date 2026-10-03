import { z } from 'zod';

const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'UUID inválido');

// ---------------------------------------------------------------------------
// 2.1 perfiles
// ---------------------------------------------------------------------------
export const rolUsuarioSchema = z.enum(['ADMIN', 'VENDEDOR']);
export type RolUsuario = z.infer<typeof rolUsuarioSchema>;

export const perfilSchema = z.object({
  id:               uuidSchema,
  nombre_completo:  z.string(),
  rol:              rolUsuarioSchema,
  activo:           z.boolean(),
  created_at:       z.coerce.date(),
});
export type Perfil = z.infer<typeof perfilSchema>;

// ---------------------------------------------------------------------------
// 2.2 productos
// ---------------------------------------------------------------------------
export const productoSchema = z.object({
  id:                  uuidSchema,
  sku:                 z.string(),
  nombre:              z.string(),
  categoria:           z.string(),
  origen:              z.string().nullable(),
  precio_tienda:       z.number().nonnegative(),
  precio_distribuidor: z.number().nonnegative(),
  tasa_iva:            z.union([z.literal(0), z.literal(5), z.literal(19)]),
  imagen_path:         z.string().nullable(),
  stock_actual:        z.number().nonnegative(),
  stock_minimo:        z.number().nonnegative(),
  activo:              z.boolean(),
  created_at:          z.coerce.date(),
  updated_at:          z.coerce.date(),
});
export type Producto = z.infer<typeof productoSchema>;

// ---------------------------------------------------------------------------
// 2.3 clientes
// ---------------------------------------------------------------------------
export const clienteSchema = z.object({
  id:              uuidSchema,
  nombre_tienda:   z.string(),
  contacto:        z.string().nullable(),
  telefono:        z.string().nullable(),
  direccion:       z.string().nullable(),
  tipo_cliente:    z.enum(['TIENDA', 'DISTRIBUIDOR']),
  saldo_cartera:   z.number().nonnegative(),
  en_mora:         z.boolean(),
  activo:          z.boolean(),
  created_at:      z.coerce.date(),
  updated_at:      z.coerce.date(),
});
export type Cliente = z.infer<typeof clienteSchema>;

// ---------------------------------------------------------------------------
// 2.4 precios_cliente
// ---------------------------------------------------------------------------
export const precioClienteSchema = z.object({
  id:               uuidSchema,
  cliente_id:       uuidSchema,
  producto_id:      uuidSchema,
  precio_especial:  z.number().nonnegative(),
  created_at:       z.coerce.date(),
  updated_at:       z.coerce.date(),
});
export type PrecioCliente = z.infer<typeof precioClienteSchema>;

// ---------------------------------------------------------------------------
// 2.5 remisiones
// ---------------------------------------------------------------------------
export const remisionSchema = z.object({
  id:           uuidSchema,
  consecutivo:  z.number().int(),
  cliente_id:   uuidSchema,
  vendedor_id:  uuidSchema,
  tipo_pago:    z.enum(['CONTADO', 'CREDITO']),
  aplica_iva:   z.boolean(),
  subtotal:     z.number().nonnegative(),
  iva:          z.number().nonnegative(),
  total:        z.number().nonnegative(),
  estado:       z.enum(['PENDIENTE', 'PAGADA', 'ANULADA']),
  pdf_url:      z.string().nullable(),
  fecha:        z.coerce.date(),
  created_at:   z.coerce.date(),
});
export type Remision = z.infer<typeof remisionSchema>;

// ---------------------------------------------------------------------------
// 2.6 detalles_remision
// ---------------------------------------------------------------------------
export const detalleRemisionSchema = z.object({
  id:                  uuidSchema,
  remision_id:         uuidSchema,
  producto_id:         uuidSchema,
  cantidad:            z.number().positive(),
  precio_unitario:     z.number().nonnegative(),
  subtotal_linea:      z.number().nonnegative(),
  tasa_iva_aplicada:   z.number().nonnegative(),
  iva_linea:           z.number().nonnegative(),
  created_at:          z.coerce.date(),
});
export type DetalleRemision = z.infer<typeof detalleRemisionSchema>;

// ---------------------------------------------------------------------------
// 2.7 kardex
// ---------------------------------------------------------------------------
export const kardexSchema = z.object({
  id:                uuidSchema,
  producto_id:       uuidSchema,
  remision_id:       uuidSchema.nullable(),
  tipo_movimiento:   z.enum(['ENTRADA', 'SALIDA', 'AJUSTE']),
  cantidad:          z.number(),
  stock_resultante:  z.number(),
  observacion:       z.string().nullable(),
  created_at:        z.coerce.date(),
});
export type Kardex = z.infer<typeof kardexSchema>;

// ---------------------------------------------------------------------------
// 2.8 abonos_cartera
// ---------------------------------------------------------------------------
export const abonoCarteraSchema = z.object({
  id:              uuidSchema,
  cliente_id:      uuidSchema,
  remision_id:     uuidSchema.nullable(),
  monto:           z.number().positive(),
  metodo_pago:     z.enum(['EFECTIVO', 'TRANSFERENCIA', 'BANCOLOMBIA']),
  fecha:           z.coerce.date(),
  registrado_por:  uuidSchema,
  created_at:      z.coerce.date(),
});
export type AbonoCartera = z.infer<typeof abonoCarteraSchema>;

// ---------------------------------------------------------------------------
// 2.9 gastos
// ---------------------------------------------------------------------------
export const gastoSchema = z.object({
  id:              uuidSchema,
  concepto:        z.string(),
  categoria:       z.string(),
  monto:           z.number().nonnegative(),
  mes_referencia:  z.string(),
  recurrente:      z.boolean(),
  registrado_por:  uuidSchema,
  created_at:      z.coerce.date(),
});
export type Gasto = z.infer<typeof gastoSchema>;

// ---------------------------------------------------------------------------
// 2.10 presupuestos
// ---------------------------------------------------------------------------
export const presupuestoSchema = z.object({
  id:                   uuidSchema,
  mes_referencia:       z.string(),
  presupuesto_limite:   z.number().nonnegative(),
  created_at:           z.coerce.date(),
});
export type Presupuesto = z.infer<typeof presupuestoSchema>;

// ---------------------------------------------------------------------------
// 2.11 documentos
// ---------------------------------------------------------------------------
export const documentoSchema = z.object({
  id:              uuidSchema,
  tipo_documento:  z.enum(['FACTURA_DIAN', 'COTIZACION_CHINA', 'LEGAL', 'OTRO']),
  nombre:          z.string(),
  onedrive_url:    z.string(),
  cliente_id:      uuidSchema.nullable(),
  remision_id:     uuidSchema.nullable(),
  subido_por:      uuidSchema,
  created_at:      z.coerce.date(),
});
export type Documento = z.infer<typeof documentoSchema>;

// ---------------------------------------------------------------------------
// Vistas y Resultados RPC
// ---------------------------------------------------------------------------
export const alertaStockSchema = z.object({
  id:           uuidSchema,
  sku:          z.string(),
  nombre:       z.string(),
  categoria:    z.string(),
  stock_actual: z.number().nonnegative(),
  stock_minimo: z.number().nonnegative(),
  semaforo:     z.enum(['ROJO', 'AMARILLO', 'VERDE']),
});
export type AlertaStock = z.infer<typeof alertaStockSchema>;

export const resumenFinancieroResultSchema = z.object({
  total_ventas:       z.number(),
  total_gastos:       z.number(),
  ganancia_neta:      z.number(),
  presupuesto_limite: z.number().nullable().optional(),
  excede_presupuesto: z.boolean(),
});
export type ResumenFinancieroResult = z.infer<typeof resumenFinancieroResultSchema>;
