import { z } from "zod";
import { supabase } from "./supabaseClient";
import { parsearErrorSupabase, type ServiceResponse } from "./errorHandler";
import {
  clienteSchema,
  costoDetalleRemisionSchema,
  costoProductoSchema,
  detalleRemisionSchema,
  precioClienteSchema,
  productoSchema,
  remisionSchema,
  type Cliente,
  type CostoDetalleRemision,
  type CostoProducto,
  type DetalleRemision,
  type PrecioCliente,
  type Producto,
  type Remision,
} from "../types/schemas";
import { GuardarCostoProductoInputSchema } from "../types/rpcSchemas";

export const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export type OrigenCostoLinea = "CONGELADO" | "ACTUAL" | "SIN_COSTO";

export interface AcuerdoEspecialRentabilidad {
  id: string;
  cliente_id: string;
  nombre_cliente: string;
  precio_especial: number;
  ganancia_especial: number | null;
  margen_especial_pct: number | null;
}

export interface RentabilidadProductoItem {
  producto: Producto;
  costo_llegada: number | null;
  updated_at_costo: Date | null;
  ganancia_tienda: number | null;
  margen_tienda_pct: number | null;
  ganancia_distribuidor: number | null;
  margen_distribuidor_pct: number | null;
  acuerdos_especiales: AcuerdoEspecialRentabilidad[];
  unidades_vendidas_mes: number;
  ventas_sin_iva_mes: number;
  costo_ventas_mes: number | null;
  ganancia_real_mes: number | null;
}

export interface LineaRentabilidadVenta {
  detalle_id: string;
  producto_id: string;
  sku: string;
  nombre_producto: string;
  cantidad: number;
  precio_unitario: number;
  subtotal_linea: number;
  iva_linea: number;
  costo_unitario: number | null;
  costo_linea: number | null;
  ganancia_unitaria: number | null;
  ganancia_linea: number | null;
  margen_pct: number | null;
  origen_costo: OrigenCostoLinea;
}

export interface RentabilidadVentaItem {
  remision: Remision;
  nombre_cliente: string;
  tipo_cliente: "TIENDA" | "DISTRIBUIDOR" | null;
  lineas: LineaRentabilidadVenta[];
  lineas_sin_costo: number;
  subtotal_costeado: number;
  costo_total: number;
  ganancia_venta: number | null;
  margen_pct: number | null;
}

export interface ResumenRentabilidadMes {
  ventas_activas_sin_iva: number;
  ventas_activas_con_iva: number;
  ventas_costeadas_sin_iva: number;
  costo_mercancia_vendida: number;
  ganancia_bruta_confirmada: number;
  margen_bruto_pct: number | null;
  remisiones_activas: number;
  remisiones_con_costo_incompleto: number;
  total_productos: number;
  productos_con_costo: number;
}

export interface DatosRentabilidadPeriodo {
  resumen: ResumenRentabilidadMes;
  productos: RentabilidadProductoItem[];
  ventas: RentabilidadVentaItem[];
}

export interface AuditoriaCosto {
  producto_id: string;
  costo_anterior: number | null;
  costo_nuevo: number;
  fecha: string;
}

const COSTOS_AUDIT_KEY = "ariza:costos-auditoria";

function registrarAuditoriaCosto(entry: AuditoriaCosto) {
  try {
    const raw = localStorage.getItem(COSTOS_AUDIT_KEY);
    const map: Record<string, AuditoriaCosto> = raw ? JSON.parse(raw) : {};
    map[entry.producto_id] = entry;
    localStorage.setItem(COSTOS_AUDIT_KEY, JSON.stringify(map));
  } catch {
    // Ignorar errores de almacenamiento local
  }
}

function traducirErrorMigracionCostos(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const err = error as { code?: string | number; message?: string };
    const code = String(err.code ?? "");
    const msg = (err.message ?? "").toLowerCase();
    if (
      code === "42P01" ||
      code === "PGRST205" ||
      (code === "PGRST202" && msg.includes("guardar_costo_producto")) ||
      msg.includes("costos_producto") ||
      msg.includes("costos_detalle_remision")
    ) {
      return "Falta aplicar la migración database/migrations/010_rentabilidad_y_costos.sql en Supabase para habilitar el módulo de costos y rentabilidad.";
    }
  }
  return parsearErrorSupabase(error);
}

function rangoMesUtc(mesYYYYMM: string): { inicio: string; fin: string } {
  const [yearStr, monthStr] = mesYYYYMM.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const inicio = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const fin = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0));
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

export const rentabilidadService = {
  obtenerAuditoriaCostos(): Record<string, AuditoriaCosto> {
    try {
      const raw = localStorage.getItem(COSTOS_AUDIT_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  /**
   * Lista los costos de llegada vigentes de todos los productos costeados (solo ADMIN).
   */
  async listarCostosProducto(): Promise<ServiceResponse<CostoProducto[]>> {
    try {
      const { data, error } = await supabase
        .from("costos_producto")
        .select("*");

      if (error) {
        return { data: null, error: traducirErrorMigracionCostos(error) };
      }

      const parsed = z.array(costoProductoSchema).safeParse(data);
      if (!parsed.success) {
        return {
          data: null,
          error: `Error de validación en costos de productos: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      return { data: parsed.data, error: null };
    } catch (err) {
      return { data: null, error: traducirErrorMigracionCostos(err) };
    }
  },

  /**
   * Registra o actualiza el precio unitario de llegada de un producto mediante la RPC `guardar_costo_producto` (solo ADMIN).
   */
  async guardarCostoProducto(
    productoId: string,
    costoLlegada: number,
    costoAnterior?: number | null,
  ): Promise<ServiceResponse<CostoProducto>> {
    try {
      const validation = GuardarCostoProductoInputSchema.safeParse({
        p_producto_id: productoId,
        p_costo_llegada: costoLlegada,
      });

      if (!validation.success) {
        return {
          data: null,
          error:
            validation.error.issues[0]?.message ??
            "Datos de costo de llegada inválidos.",
        };
      }

      const { data, error } = await supabase.rpc(
        "guardar_costo_producto",
        validation.data,
      );

      if (error) {
        return { data: null, error: traducirErrorMigracionCostos(error) };
      }

      const row = Array.isArray(data) ? data[0] : data;
      const parsed = costoProductoSchema.safeParse(row);
      if (!parsed.success) {
        return {
          data: null,
          error: `Error al validar el costo guardado: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      if (costoAnterior !== undefined && costoAnterior !== parsed.data.costo_llegada) {
        registrarAuditoriaCosto({
          producto_id: productoId,
          costo_anterior: costoAnterior,
          costo_nuevo: parsed.data.costo_llegada,
          fecha: new Date().toISOString(),
        });
      }

      return { data: parsed.data, error: null };
    } catch (err) {
      return { data: null, error: traducirErrorMigracionCostos(err) };
    }
  },

  /**
   * Obtiene el tablero consolidado de rentabilidad por producto y por venta para un mes (YYYY-MM).
   */
  async obtenerRentabilidadPeriodo(
    mesYYYYMM: string,
  ): Promise<ServiceResponse<DatosRentabilidadPeriodo>> {
    try {
      if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(mesYYYYMM)) {
        return { data: null, error: "El mes seleccionado no es válido." };
      }

      const { inicio, fin } = rangoMesUtc(mesYYYYMM);

      const [prodRes, costosRes, cliRes, remRes, preciosEspRes] =
        await Promise.all([
          supabase.from("productos").select("*").order("sku").order("id"),
          supabase.from("costos_producto").select("*"),
          supabase.from("clientes").select("*"),
          supabase
            .from("remisiones")
            .select("*")
            .gte("fecha", inicio)
            .lt("fecha", fin)
            .order("fecha", { ascending: false }),
          supabase.from("precios_cliente").select("*"),
        ]);

      if (prodRes.error) {
        return { data: null, error: parsearErrorSupabase(prodRes.error) };
      }
      if (costosRes.error) {
        return { data: null, error: traducirErrorMigracionCostos(costosRes.error) };
      }
      if (cliRes.error) {
        return { data: null, error: parsearErrorSupabase(cliRes.error) };
      }
      if (remRes.error) {
        return { data: null, error: parsearErrorSupabase(remRes.error) };
      }

      const parsedProd = z.array(productoSchema).safeParse(prodRes.data);
      if (!parsedProd.success) {
        return { data: null, error: "Error de validación al cargar productos." };
      }
      const parsedCostos = z.array(costoProductoSchema).safeParse(costosRes.data);
      if (!parsedCostos.success) {
        return { data: null, error: "Error de validación al cargar costos de llegada." };
      }
      const parsedCli = z.array(clienteSchema).safeParse(cliRes.data);
      if (!parsedCli.success) {
        return { data: null, error: "Error de validación al cargar clientes." };
      }
      const parsedRem = z.array(remisionSchema).safeParse(remRes.data);
      if (!parsedRem.success) {
        return { data: null, error: "Error de validación al cargar remisiones del período." };
      }
      const parsedPreciosEsp = z
        .array(precioClienteSchema)
        .safeParse(preciosEspRes.data ?? []);
      const preciosEspecialesList: PrecioCliente[] = parsedPreciosEsp.success
        ? parsedPreciosEsp.data
        : [];

      const productosOrdenados = parsedProd.data.sort(
        (a, b) =>
          a.sku.localeCompare(b.sku, "es", {
            numeric: true,
            sensitivity: "base",
          }) || a.id.localeCompare(b.id),
      );
      const remisiones = parsedRem.data;
      const remisionIds = remisiones.map((r) => r.id);

      let detalles: DetalleRemision[] = [];
      let snapshots: CostoDetalleRemision[] = [];

      if (remisionIds.length > 0) {
        const [detRes, snapRes] = await Promise.all([
          supabase
            .from("detalles_remision")
            .select("*")
            .in("remision_id", remisionIds),
          supabase
            .from("costos_detalle_remision")
            .select("*")
            .in("remision_id", remisionIds),
        ]);

        if (detRes.error) {
          return { data: null, error: parsearErrorSupabase(detRes.error) };
        }
        if (snapRes.error) {
          return { data: null, error: traducirErrorMigracionCostos(snapRes.error) };
        }

        const parsedDet = z.array(detalleRemisionSchema).safeParse(detRes.data);
        if (!parsedDet.success) {
          return {
            data: null,
            error: "Error de validación en detalles de remisión.",
          };
        }
        const parsedSnap = z
          .array(costoDetalleRemisionSchema)
          .safeParse(snapRes.data);
        if (!parsedSnap.success) {
          return {
            data: null,
            error: "Error de validación en costos históricos de remisión.",
          };
        }

        detalles = parsedDet.data;
        snapshots = parsedSnap.data;
      }

      const productoMap = new Map<string, Producto>(
        productosOrdenados.map((p) => [p.id, p]),
      );
      const costoActualMap = new Map<string, CostoProducto>(
        parsedCostos.data.map((c) => [c.producto_id, c]),
      );
      const clienteMap = new Map<string, Cliente>(
        parsedCli.data.map((c) => [c.id, c]),
      );
      const snapshotMap = new Map<string, CostoDetalleRemision>(
        snapshots.map((s) => [s.detalle_remision_id, s]),
      );

      const detallesPorRemision = new Map<string, DetalleRemision[]>();
      for (const det of detalles) {
        const bucket = detallesPorRemision.get(det.remision_id);
        if (bucket) bucket.push(det);
        else detallesPorRemision.set(det.remision_id, [det]);
      }

      const acuerdosPorProducto = new Map<string, PrecioCliente[]>();
      for (const pe of preciosEspecialesList) {
        const list = acuerdosPorProducto.get(pe.producto_id);
        if (list) list.push(pe);
        else acuerdosPorProducto.set(pe.producto_id, [pe]);
      }

      // Acumuladores mensuales por producto (solo remisiones no anuladas)
      const acumProd = new Map<
        string,
        {
          unidades: number;
          ventasSinIva: number;
          costoAcumulado: number;
          tieneLineaSinCosto: boolean;
          tuvoVentas: boolean;
        }
      >();

      let ventasActivasSinIva = 0;
      let ventasActivasConIva = 0;
      let ventasCosteadasSinIva = 0;
      let costoMercanciaVendida = 0;
      let gananciaBrutaConfirmada = 0;
      let remisionesActivas = 0;
      let remisionesConCostoIncompleto = 0;

      const ventasItems: RentabilidadVentaItem[] = remisiones.map((rem) => {
        const cli = clienteMap.get(rem.cliente_id);
        const rawLines = detallesPorRemision.get(rem.id) ?? [];
        const activa = rem.estado !== "ANULADA";

        let lineasSinCosto = 0;
        let subtotalCosteado = 0;
        let costoTotal = 0;

        const lineas: LineaRentabilidadVenta[] = rawLines.map((det) => {
          const prod = productoMap.get(det.producto_id);
          const snap = snapshotMap.get(det.id);
          const costoActual = costoActualMap.get(det.producto_id);

          let costoUnitario: number | null = null;
          let costoLinea: number | null = null;
          let origenCosto: OrigenCostoLinea = "SIN_COSTO";

          if (snap) {
            costoUnitario = snap.costo_unitario;
            costoLinea = snap.costo_linea;
            origenCosto = "CONGELADO";
          } else if (costoActual) {
            costoUnitario = costoActual.costo_llegada;
            costoLinea = roundMoney(costoActual.costo_llegada * det.cantidad);
            origenCosto = "ACTUAL";
          }

          const gananciaUnitaria =
            costoUnitario !== null
              ? roundMoney(det.precio_unitario - costoUnitario)
              : null;
          const gananciaLinea =
            costoLinea !== null
              ? roundMoney(det.subtotal_linea - costoLinea)
              : null;
          const margenPct =
            gananciaLinea !== null && det.subtotal_linea > 0
              ? roundMoney((gananciaLinea / det.subtotal_linea) * 100)
              : null;

          if (costoLinea === null) {
            lineasSinCosto++;
          } else {
            subtotalCosteado = roundMoney(subtotalCosteado + det.subtotal_linea);
            costoTotal = roundMoney(costoTotal + costoLinea);
          }

          if (activa) {
            const prev = acumProd.get(det.producto_id) ?? {
              unidades: 0,
              ventasSinIva: 0,
              costoAcumulado: 0,
              tieneLineaSinCosto: false,
              tuvoVentas: false,
            };
            prev.tuvoVentas = true;
            prev.unidades = roundMoney(prev.unidades + det.cantidad);
            prev.ventasSinIva = roundMoney(
              prev.ventasSinIva + det.subtotal_linea,
            );
            if (costoLinea !== null) {
              prev.costoAcumulado = roundMoney(prev.costoAcumulado + costoLinea);
            } else {
              prev.tieneLineaSinCosto = true;
            }
            acumProd.set(det.producto_id, prev);
          }

          return {
            detalle_id: det.id,
            producto_id: det.producto_id,
            sku: prod?.sku ?? "—",
            nombre_producto: prod?.nombre ?? "Producto no encontrado",
            cantidad: det.cantidad,
            precio_unitario: det.precio_unitario,
            subtotal_linea: det.subtotal_linea,
            iva_linea: det.iva_linea,
            costo_unitario: costoUnitario,
            costo_linea: costoLinea,
            ganancia_unitaria: gananciaUnitaria,
            ganancia_linea: gananciaLinea,
            margen_pct: margenPct,
            origen_costo: origenCosto,
          };
        });

        const costoCompleto = rawLines.length > 0 && lineasSinCosto === 0;
        const gananciaVenta = costoCompleto
          ? roundMoney(rem.subtotal - costoTotal)
          : null;
        const margenVentaPct =
          gananciaVenta !== null && rem.subtotal > 0
            ? roundMoney((gananciaVenta / rem.subtotal) * 100)
            : null;

        if (activa) {
          remisionesActivas++;
          ventasActivasSinIva = roundMoney(ventasActivasSinIva + rem.subtotal);
          ventasActivasConIva = roundMoney(ventasActivasConIva + rem.total);
          ventasCosteadasSinIva = roundMoney(
            ventasCosteadasSinIva + subtotalCosteado,
          );
          costoMercanciaVendida = roundMoney(
            costoMercanciaVendida + costoTotal,
          );
          gananciaBrutaConfirmada = roundMoney(
            gananciaBrutaConfirmada + (subtotalCosteado - costoTotal),
          );
          if (!costoCompleto && rawLines.length > 0) {
            remisionesConCostoIncompleto++;
          }
        }

        return {
          remision: rem,
          nombre_cliente: cli?.nombre_tienda ?? "Cliente",
          tipo_cliente: cli?.tipo_cliente ?? null,
          lineas,
          lineas_sin_costo: lineasSinCosto,
          subtotal_costeado: subtotalCosteado,
          costo_total: costoTotal,
          ganancia_venta: gananciaVenta,
          margen_pct: margenVentaPct,
        };
      });

      const productosItems: RentabilidadProductoItem[] = productosOrdenados.map(
        (prod) => {
          const costoObj = costoActualMap.get(prod.id);
          const costo = costoObj ? costoObj.costo_llegada : null;

          const gananciaTienda =
            costo !== null ? roundMoney(prod.precio_tienda - costo) : null;
          const margenTiendaPct =
            gananciaTienda !== null && prod.precio_tienda > 0
              ? roundMoney((gananciaTienda / prod.precio_tienda) * 100)
              : null;

          const gananciaDist =
            costo !== null
              ? roundMoney(prod.precio_distribuidor - costo)
              : null;
          const margenDistPct =
            gananciaDist !== null && prod.precio_distribuidor > 0
              ? roundMoney((gananciaDist / prod.precio_distribuidor) * 100)
              : null;

          const acum = acumProd.get(prod.id);
          const unidadesMes = acum?.unidades ?? 0;
          const ventasMes = acum?.ventasSinIva ?? 0;
          const costoMes =
            acum && acum.tuvoVentas && !acum.tieneLineaSinCosto
              ? acum.costoAcumulado
              : acum && !acum.tuvoVentas && costo !== null
                ? 0
                : null;
          const gananciaMes =
            costoMes !== null ? roundMoney(ventasMes - costoMes) : null;

          const acuerdosRaw = acuerdosPorProducto.get(prod.id) ?? [];
          const acuerdos_especiales: AcuerdoEspecialRentabilidad[] = acuerdosRaw
            .map((pe) => {
              const cli = clienteMap.get(pe.cliente_id);
              const ganEsp =
                costo !== null
                  ? roundMoney(pe.precio_especial - costo)
                  : null;
              const margEsp =
                ganEsp !== null && pe.precio_especial > 0
                  ? roundMoney((ganEsp / pe.precio_especial) * 100)
                  : null;
              return {
                id: pe.id,
                cliente_id: pe.cliente_id,
                nombre_cliente: cli?.nombre_tienda ?? "Cliente",
                precio_especial: pe.precio_especial,
                ganancia_especial: ganEsp,
                margen_especial_pct: margEsp,
              };
            })
            .sort((a, b) =>
              a.nombre_cliente.localeCompare(b.nombre_cliente, "es"),
            );

          return {
            producto: prod,
            costo_llegada: costo,
            updated_at_costo: costoObj?.updated_at ?? null,
            ganancia_tienda: gananciaTienda,
            margen_tienda_pct: margenTiendaPct,
            ganancia_distribuidor: gananciaDist,
            margen_distribuidor_pct: margenDistPct,
            acuerdos_especiales,
            unidades_vendidas_mes: unidadesMes,
            ventas_sin_iva_mes: ventasMes,
            costo_ventas_mes: costoMes,
            ganancia_real_mes: gananciaMes,
          };
        },
      );

      const margenBrutoPct =
        ventasCosteadasSinIva > 0
          ? roundMoney((gananciaBrutaConfirmada / ventasCosteadasSinIva) * 100)
          : null;

      return {
        data: {
          resumen: {
            ventas_activas_sin_iva: ventasActivasSinIva,
            ventas_activas_con_iva: ventasActivasConIva,
            ventas_costeadas_sin_iva: ventasCosteadasSinIva,
            costo_mercancia_vendida: costoMercanciaVendida,
            ganancia_bruta_confirmada: gananciaBrutaConfirmada,
            margen_bruto_pct: margenBrutoPct,
            remisiones_activas: remisionesActivas,
            remisiones_con_costo_incompleto: remisionesConCostoIncompleto,
            total_productos: productosOrdenados.length,
            productos_con_costo: parsedCostos.data.length,
          },
          productos: productosItems,
          ventas: ventasItems,
        },
        error: null,
      };
    } catch (err) {
      return { data: null, error: traducirErrorMigracionCostos(err) };
    }
  },
};
