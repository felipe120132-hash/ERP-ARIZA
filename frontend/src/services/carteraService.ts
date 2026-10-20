import { z } from "zod";
import { supabase } from "./supabaseClient";
import { parsearErrorSupabase, type ServiceResponse } from "./errorHandler";
import { abonoCarteraSchema, type AbonoCartera } from "../types/schemas";
import {
  RegistrarAbonoInputSchema,
  EditarAbonoInputSchema,
  type RegistrarAbonoInput,
  type EditarAbonoInput,
} from "../types/rpcSchemas";

export interface FiltrosAbonos {
  cliente_id?: string;
  remision_id?: string;
}

export interface TrazaAbonoEditado {
  abono_id: string;
  cliente_id: string;
  monto_anterior: number;
  monto_nuevo: number;
  metodo_pago: string;
  remision_id: string | null;
  saldo_anterior: number;
  saldo_resultante: number;
  motivo: string;
  fecha_edicion: string;
}

const AUDIT_STORAGE_KEY = "ariza:abonos-auditoria";

export function obtenerAuditoriaAbonos(clienteId?: string): Record<string, TrazaAbonoEditado> {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TrazaAbonoEditado>;
    if (!clienteId) return parsed;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v.cliente_id === clienteId),
    );
  } catch {
    return {};
  }
}

function guardarAuditoriaAbono(traza: TrazaAbonoEditado) {
  try {
    const actual = obtenerAuditoriaAbonos();
    actual[traza.abono_id] = traza;
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(actual));
  } catch {
    /* ignore storage quota errors */
  }
}

export const carteraService = {
  /**
   * Registra un abono a la cartera de un cliente mediante la función RPC `registrar_abono`.
   * Valida la estructura y rangos de datos con `RegistrarAbonoInputSchema`.
   */
  async registrarAbono(
    input: RegistrarAbonoInput,
  ): Promise<ServiceResponse<string> & { incierto?: boolean }> {
    try {
      const validation = RegistrarAbonoInputSchema.safeParse(input);
      if (!validation.success) {
        return {
          data: null,
          error: `Validación de entrada fallida: ${validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      const { data, error } = await supabase.rpc(
        "registrar_abono",
        validation.data,
      );

      if (error) {
        return {
          data: null,
          error: parsearErrorSupabase(error),
          incierto: ![
            "P0001",
            "42501",
            "23503",
            "23505",
            "23514",
            "22P02",
            "PGRST202",
          ].includes(error.code),
        };
      }

      if (!data || typeof data !== "string") {
        return {
          data: null,
          error: "La función RPC no retornó un identificador de abono válido.",
          incierto: true,
        };
      }

      return { data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err), incierto: true };
    }
  },

  /**
   * Edita de forma controlada un abono existente y ajusta el saldo_cartera del cliente
   * manteniendo la integridad financiera.
   */
  async editarAbono(
    input: EditarAbonoInput,
  ): Promise<ServiceResponse<TrazaAbonoEditado> & { incierto?: boolean }> {
    const validation = EditarAbonoInputSchema.safeParse(input);
    if (!validation.success) {
      return {
        data: null,
        error: validation.error.issues[0]?.message ?? "Los datos de la corrección no son válidos.",
      };
    }
    const v = validation.data;
    const nuevoSaldo =
      Math.round((v.p_saldo_esperado + v.p_monto_anterior - v.p_monto) * 100) /
      100;
    if (nuevoSaldo < 0) {
      return {
        data: null,
        error:
          "El nuevo monto supera el saldo total adeudado por el cliente (generaría un saldo negativo).",
      };
    }

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authData.user) {
        return { data: null, error: "La sesión no está disponible." };
      }
      const perfilRes = await supabase
        .from("perfiles")
        .select("rol,activo")
        .eq("id", authData.user.id)
        .single();
      if (
        perfilRes.error ||
        perfilRes.data?.rol !== "ADMIN" ||
        !perfilRes.data.activo
      ) {
        return {
          data: null,
          error: "Solo administradores activos pueden editar abonos de cartera.",
        };
      }

      // 1. Intentar primero mediante la RPC atómica editar_abono_cartera si existe
      const rpcRes = await supabase.rpc("editar_abono_cartera", {
        p_abono_id: v.p_abono_id,
        p_cliente_id: v.p_cliente_id,
        p_monto: v.p_monto,
        p_metodo_pago: v.p_metodo_pago,
        p_remision_id: v.p_remision_id ?? null,
        p_motivo: v.p_motivo,
        p_monto_anterior: v.p_monto_anterior,
      });

      if (!rpcRes.error && rpcRes.data) {
        const traza: TrazaAbonoEditado = {
          abono_id: v.p_abono_id,
          cliente_id: v.p_cliente_id,
          monto_anterior: v.p_monto_anterior,
          monto_nuevo: v.p_monto,
          metodo_pago: v.p_metodo_pago,
          remision_id: v.p_remision_id ?? null,
          saldo_anterior: v.p_saldo_esperado,
          saldo_resultante:
            typeof (rpcRes.data as any).saldo_resultante === "number"
              ? (rpcRes.data as any).saldo_resultante
              : nuevoSaldo,
          motivo: v.p_motivo,
          fecha_edicion: new Date().toISOString(),
        };
        guardarAuditoriaAbono(traza);
        return { data: traza, error: null };
      }

      if (
        rpcRes.error &&
        rpcRes.error.code !== "PGRST202" &&
        !rpcRes.error.message?.includes("Could not find the function")
      ) {
        return {
          data: null,
          error: parsearErrorSupabase(rpcRes.error),
          incierto: !["P0001", "42501", "23503", "23514", "22P02"].includes(
            rpcRes.error.code,
          ),
        };
      }

      // 2. Respaldo controlado vía tablas con verificación de concurrencia (ADMIN RLS)
      const abonoRes = await supabase
        .from("abonos_cartera")
        .update({
          monto: v.p_monto,
          metodo_pago: v.p_metodo_pago,
          remision_id: v.p_remision_id ?? null,
        })
        .eq("id", v.p_abono_id)
        .eq("cliente_id", v.p_cliente_id)
        .eq("monto", v.p_monto_anterior)
        .select("*")
        .single();

      if (abonoRes.error || !abonoRes.data) {
        return {
          data: null,
          error:
            abonoRes.error?.code === "PGRST116"
              ? "El abono cambió o ya no está disponible. Actualiza el historial antes de volver a editar."
              : parsearErrorSupabase(
                  abonoRes.error ?? new Error("No se pudo actualizar el abono."),
                ),
          incierto: false,
        };
      }

      const clienteRes = await supabase
        .from("clientes")
        .update({
          saldo_cartera: nuevoSaldo,
          ...(nuevoSaldo === 0 ? { en_mora: false } : {}),
        })
        .eq("id", v.p_cliente_id)
        .select("*")
        .single();

      if (clienteRes.error || !clienteRes.data) {
        return {
          data: null,
          error:
            "El abono se actualizó, pero no pudimos confirmar el nuevo saldo del cliente. Verifica el historial antes de continuar.",
          incierto: true,
        };
      }

      const traza: TrazaAbonoEditado = {
        abono_id: v.p_abono_id,
        cliente_id: v.p_cliente_id,
        monto_anterior: v.p_monto_anterior,
        monto_nuevo: v.p_monto,
        metodo_pago: v.p_metodo_pago,
        remision_id: v.p_remision_id ?? null,
        saldo_anterior: v.p_saldo_esperado,
        saldo_resultante: nuevoSaldo,
        motivo: v.p_motivo,
        fecha_edicion: new Date().toISOString(),
      };
      guardarAuditoriaAbono(traza);
      return { data: traza, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err), incierto: true };
    }
  },

  /**
   * Lista el histórico de abonos con filtros opcionales (cliente o remisión).
   */
  async listarAbonos(
    filtros?: FiltrosAbonos,
  ): Promise<ServiceResponse<AbonoCartera[]>> {
    try {
      let query = supabase
        .from("abonos_cartera")
        .select("*")
        .order("fecha", { ascending: false });

      if (filtros?.cliente_id) {
        query = query.eq("cliente_id", filtros.cliente_id);
      }
      if (filtros?.remision_id) {
        query = query.eq("remision_id", filtros.remision_id);
      }

      const { data, error } = await query;

      if (error) {
        return { data: null, error: parsearErrorSupabase(error) };
      }

      const parseResult = z.array(abonoCarteraSchema).safeParse(data);
      if (!parseResult.success) {
        return {
          data: null,
          error: `Error de validación en abonos: ${parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      return { data: parseResult.data, error: null };
    } catch (err) {
      return { data: null, error: parsearErrorSupabase(err) };
    }
  },
};
