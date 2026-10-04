// Tipos de base de datos para ArizaERP (espejo de docs/diccionario_datos.md)

export type RolUsuario = "ADMIN" | "VENDEDOR";
export type TipoCliente = "TIENDA" | "DISTRIBUIDOR";
export type TipoPago = "CONTADO" | "CREDITO";
export type EstadoRemision = "PENDIENTE" | "PAGADA" | "ANULADA";
export type TipoMovimientoKardex = "ENTRADA" | "SALIDA" | "AJUSTE";

export interface Perfil {
  id: string;
  rol: RolUsuario;
  nombre_completo: string;
  creado_en: string;
}

export interface Producto {
  id: string;
  codigo_barra: string | null;
  nombre: string;
  precio_base_tienda: number;
  precio_base_distribuidor: number;
  tasa_iva: number;
  stock_actual: number;
  stock_minimo: number;
  activo: boolean;
}

export interface Cliente {
  id: string;
  documento: string;
  nombre_o_razon_social: string;
  telefono: string | null;
  direccion: string | null;
  tipo_cliente: TipoCliente;
  limite_credito: number;
  saldo_cartera: number;
  activo: boolean;
}

export interface Remision {
  id: string;
  consecutivo: number;
  cliente_id: string;
  vendedor_id: string;
  tipo_pago: TipoPago;
  aplica_iva: boolean;
  subtotal: number;
  total_iva: number;
  total: number;
  estado: EstadoRemision;
  observaciones: string | null;
  creado_en: string;
}

export interface Gasto {
  id: string;
  descripcion: string;
  monto: number;
  categoria: string;
  usuario_id: string;
  creado_en: string;
}
