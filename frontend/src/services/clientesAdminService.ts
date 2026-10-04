import { z } from "zod";
import { supabase } from "./supabaseClient";
import { clienteSchema, precioClienteSchema } from "@/types/schemas";
export const datosCliente = clienteSchema
  .pick({
    nombre_tienda: true,
    contacto: true,
    telefono: true,
    direccion: true,
    tipo_cliente: true,
    activo: true,
  })
  .extend({
    nombre_tienda: z
      .string()
      .trim()
      .min(1, "Escribe el nombre de la tienda.")
      .max(200),
    contacto: z.string().trim().max(200).nullable(),
    telefono: z.string().trim().max(50).nullable(),
    direccion: z.string().trim().max(500).nullable(),
  })
  .strict();
export type DatosCliente = z.infer<typeof datosCliente>;
async function admin() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("La sesión no está disponible.");
  const p = await supabase
    .from("perfiles")
    .select("rol,activo")
    .eq("id", data.user.id)
    .single();
  if (p.error || p.data?.rol !== "ADMIN" || !p.data.activo)
    throw new Error("Solo administradores activos pueden guardar cambios.");
}
export const clientesAdminService = {
  async guardar(id: string, input: DatosCliente, nuevo: boolean) {
    const values = datosCliente.parse(input);
    if (!z.string().uuid().safeParse(id).success)
      throw new Error("Identificador inválido.");
    await admin();
    const query = nuevo
      ? supabase.from("clientes").insert({ id, ...values })
      : supabase.from("clientes").update(values).eq("id", id);
    const { data, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return clienteSchema.parse(data);
  },
  async precios(clienteId: string) {
    const all = [];
    let offset = 0;
    while (true) {
      const { data, error, count } = await supabase
        .from("precios_cliente")
        .select("*", { count: "exact" })
        .eq("cliente_id", clienteId)
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error(error.message);
      const rows = z.array(precioClienteSchema).parse(data);
      all.push(...rows);
      offset += rows.length;
      if (count === null)
        throw new Error("No se pudo verificar el listado completo de precios.");
      if (offset === count) return all;
      if (!rows.length || offset > count)
        throw new Error("El listado cambió; vuelve a consultarlo.");
    }
  },
  async guardarPrecio(
    clienteId: string,
    productoId: string,
    monto: number,
    existente?: { id: string; precio_especial: number },
  ) {
    z.string().uuid().parse(clienteId);
    z.string().uuid().parse(productoId);
    z.number()
      .min(0)
      .max(9999999999.99)
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.0001)
      .parse(monto);
    await admin();
    const q = existente
      ? supabase
          .from("precios_cliente")
          .update({ precio_especial: monto })
          .eq("id", existente.id)
          .eq("cliente_id", clienteId)
          .eq("producto_id", productoId)
          .eq("precio_especial", existente.precio_especial)
      : supabase
          .from("precios_cliente")
          .insert({
            cliente_id: clienteId,
            producto_id: productoId,
            precio_especial: monto,
          });
    const { data, error } = await q.select("*").single();
    if (error) throw new Error(error.message);
    return precioClienteSchema.parse(data);
  },
  async quitarPrecio(
    clienteId: string,
    precio: { id: string; precio_especial: number },
  ) {
    await admin();
    const { data, error } = await supabase
      .from("precios_cliente")
      .delete()
      .eq("id", precio.id)
      .eq("cliente_id", clienteId)
      .eq("precio_especial", precio.precio_especial)
      .select("id");
    if (error) throw new Error(error.message);
    if (data?.length !== 1)
      throw new Error(
        "El precio cambió o ya no existe. Actualiza antes de continuar.",
      );
  },
};
