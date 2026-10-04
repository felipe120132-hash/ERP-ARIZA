import { z } from "zod";
import { supabase } from "./supabaseClient";
import { parsearErrorSupabase, type ServiceResponse } from "./errorHandler";
import {
  alertaStockSchema,
  remisionSchema,
  type AlertaStock,
  type Remision,
} from "@/types/schemas";
const customer = z.object({
  id: z.string(),
  nombre_tienda: z.string(),
  saldo_cartera: z.number().nonnegative(),
  en_mora: z.boolean(),
});
type Customer = z.infer<typeof customer>;
export type CarteraResumen = {
  saldo: number;
  enMora: number;
  clientesConSaldo: number;
  prioritarios: Customer[];
};
export const resumenService = {
  async cartera(): Promise<ServiceResponse<CarteraResumen>> {
    try {
      const rows: Customer[] = [];
      let expected: number | null = null;
      // Fetch every visible balance; never present a truncated REST page as a total.
      while (true) {
        const { data, error, count } = await supabase
          .from("clientes")
          .select("id,nombre_tienda,saldo_cartera,en_mora", { count: "exact" })
          .order("id")
          .range(rows.length, rows.length + 499);
        if (error) throw error;
        if (count === null || (expected !== null && expected !== count))
          throw new Error(
            "La cartera cambió durante la consulta. Actualiza el resumen.",
          );
        expected = count;
        const parsed = z.array(customer).parse(data);
        rows.push(...parsed);
        if (rows.length === expected) break;
        if (!parsed.length || rows.length > expected)
          throw new Error("No pudimos consultar la cartera completa.");
      }
      if (new Set(rows.map((x) => x.id)).size !== rows.length)
        throw new Error(
          "La cartera cambió durante la consulta. Actualiza el resumen.",
        );
      const debt = rows.filter((x) => x.saldo_cartera > 0);
      return {
        data: {
          saldo:
            rows.reduce(
              (sum, x) => sum + Math.round(x.saldo_cartera * 100),
              0,
            ) / 100,
          enMora: debt.filter((x) => x.en_mora).length,
          clientesConSaldo: debt.length,
          prioritarios: debt
            .sort(
              (a, b) =>
                Number(b.en_mora) - Number(a.en_mora) ||
                b.saldo_cartera - a.saldo_cartera ||
                a.id.localeCompare(b.id),
            )
            .slice(0, 5),
        },
        error: null,
      };
    } catch (e) {
      return { data: null, error: parsearErrorSupabase(e) };
    }
  },
  async remisiones(): Promise<
    ServiceResponse<{ recientes: Remision[]; pendientes: number }>
  > {
    try {
      const [latest, pending] = await Promise.all([
        supabase
          .from("remisiones")
          .select("*")
          .order("fecha", { ascending: false })
          .order("id", { ascending: false })
          .limit(5),
        supabase
          .from("remisiones")
          .select("id", { count: "exact", head: true })
          .eq("estado", "PENDIENTE"),
      ]);
      if (latest.error || pending.error) throw latest.error ?? pending.error;
      if (pending.count === null)
        throw new Error("No pudimos contar las remisiones pendientes.");
      return {
        data: {
          recientes: z.array(remisionSchema).parse(latest.data),
          pendientes: pending.count,
        },
        error: null,
      };
    } catch (e) {
      return { data: null, error: parsearErrorSupabase(e) };
    }
  },
  async alertas(): Promise<
    ServiceResponse<{ productos: AlertaStock[]; total: number }>
  > {
    try {
      const { data, error, count } = await supabase
        .from("vista_alertas_stock")
        .select("*", { count: "exact" })
        .in("semaforo", ["ROJO", "AMARILLO"])
        .order("semaforo", { ascending: false })
        .order("id")
        .limit(5);
      if (error) throw error;
      if (count === null) throw new Error("No pudimos contar las alertas.");
      return {
        data: {
          productos: z.array(alertaStockSchema).parse(data),
          total: count,
        },
        error: null,
      };
    } catch (e) {
      return { data: null, error: parsearErrorSupabase(e) };
    }
  },
};
