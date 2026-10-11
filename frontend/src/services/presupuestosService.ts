import { z } from "zod";
import { supabase } from "./supabaseClient";
import { presupuestoSchema, type Presupuesto } from "@/types/schemas";
const mesSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])-01$/);
const montoSchema = z
  .number()
  .finite()
  .min(0)
  .max(9999999999.99)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.0001);
export class ErrorPresupuesto extends Error {
  constructor(
    message: string,
    public incierto = false,
  ) {
    super(message);
  }
}
async function admin() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    throw new ErrorPresupuesto("La sesión no está disponible.");
  const p = await supabase
    .from("perfiles")
    .select("rol,activo")
    .eq("id", data.user.id)
    .single();
  if (p.error || p.data?.rol !== "ADMIN" || !p.data.activo)
    throw new ErrorPresupuesto(
      "Solo administradores activos pueden gestionar presupuestos.",
    );
}
export const presupuestosService = {
  async consultar(mes: string): Promise<Presupuesto | null> {
    mesSchema.parse(mes);
    await admin();
    const { data, error } = await supabase
      .from("presupuestos")
      .select("*")
      .eq("mes_referencia", mes)
      .maybeSingle();
    if (error) throw new Error("No pudimos consultar el presupuesto del mes.");
    if (data === null) return null;
    const p = presupuestoSchema.parse(data);
    if (p.mes_referencia !== mes)
      throw new Error("El presupuesto recibido no corresponde al mes.");
    return p;
  },
  async guardar(
    mes: string,
    monto: number,
    anterior: Presupuesto | null,
    onSend: () => void,
  ) {
    mesSchema.parse(mes);
    montoSchema.parse(monto);
    if (anterior && anterior.mes_referencia !== mes)
      throw new ErrorPresupuesto(
        "El presupuesto no corresponde al mes seleccionado.",
      );
    await admin();
    onSend();
    const q = anterior
      ? supabase
          .from("presupuestos")
          .update({ presupuesto_limite: monto })
          .eq("id", anterior.id)
          .eq("mes_referencia", mes)
          .eq("presupuesto_limite", anterior.presupuesto_limite)
      : supabase
          .from("presupuestos")
          .insert({ mes_referencia: mes, presupuesto_limite: monto });
    const { data, error, status } = await q.select("*").single();
    if (error)
      throw new ErrorPresupuesto(
        error.code === "23505" || error.code === "PGRST116"
          ? "Otro cambio modificó el presupuesto. Actualiza los datos antes de continuar."
          : status === 403
            ? "No tienes permisos para guardar este presupuesto."
            : "No se pudo confirmar el guardado del presupuesto.",
        !(status >= 400 && status < 500),
      );
    const p = presupuestoSchema.safeParse(data);
    if (
      !p.success ||
      p.data.mes_referencia !== mes ||
      p.data.presupuesto_limite !== monto
    )
      throw new ErrorPresupuesto(
        "La respuesta del guardado no pudo verificarse.",
        true,
      );
    return p.data;
  },
};
