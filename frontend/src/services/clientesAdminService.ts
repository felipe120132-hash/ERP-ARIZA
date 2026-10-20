import { z } from "zod";
import { supabase } from "./supabaseClient";
import {
  clienteSchema,
  precioClienteSchema,
  uuidSchema,
  type Cliente,
} from "@/types/schemas";
import { normalize } from "@/lib/catalog";

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

export class GuardadoClienteError extends Error {
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
    throw new GuardadoClienteError("La sesión no está disponible.");
  const p = await supabase
    .from("perfiles")
    .select("rol,activo")
    .eq("id", data.user.id)
    .single();
  if (p.error || p.data?.rol !== "ADMIN" || !p.data.activo)
    throw new GuardadoClienteError(
      "Solo administradores activos pueden guardar cambios.",
    );
}

export const clientesAdminService = {
  async guardar(
    id: string,
    input: DatosCliente,
    nuevo: boolean,
    onSend?: () => void,
  ) {
    const values = datosCliente.parse(input);
    if (!uuidSchema.safeParse(id).success)
      throw new GuardadoClienteError("Identificador inválido.");
    await admin();

    // Validación contra clientes duplicados (mismo nombre de tienda normalizado)
    const existentes = await supabase
      .from("clientes")
      .select("id,nombre_tienda,telefono");
    if (!existentes.error && Array.isArray(existentes.data)) {
      const targetName = normalize(values.nombre_tienda);
      const dupNombre = existentes.data.find(
        (c) => c.id !== id && normalize(c.nombre_tienda ?? "") === targetName,
      );
      if (dupNombre) {
        throw new GuardadoClienteError(
          `Ya existe un cliente registrado con el nombre "${dupNombre.nombre_tienda}". Evita duplicar clientes.`,
          false,
        );
      }
    }

    onSend?.();
    const query = nuevo
      ? supabase.from("clientes").insert({ id, ...values })
      : supabase.from("clientes").update(values).eq("id", id);
    const { data, error, status } = await query.select("*").single();
    if (error) {
      const msg =
        error.code === "23505"
          ? "Ya existe un cliente con esos datos comerciales."
          : error.message;
      throw new GuardadoClienteError(msg, !(status >= 400 && status < 500));
    }
    return clienteSchema.parse(data);
  },

  async cambiarEstadoActivo(cliente: Cliente, activo: boolean) {
    uuidSchema.parse(cliente.id);
    await admin();
    const { data, error } = await supabase
      .from("clientes")
      .update({ activo })
      .eq("id", cliente.id)
      .select("*")
      .single();
    if (error) throw new GuardadoClienteError(error.message);
    return clienteSchema.parse(data);
  },

  async eliminarODesactivar(cliente: Cliente): Promise<{
    accion: "ELIMINADO" | "DESACTIVADO";
    cliente: Cliente | null;
    mensaje: string;
  }> {
    uuidSchema.parse(cliente.id);
    await admin();

    const [remisionesRes, abonosRes, docsRes] = await Promise.all([
      supabase
        .from("remisiones")
        .select("id", { count: "exact" })
        .eq("cliente_id", cliente.id)
        .limit(1),
      supabase
        .from("abonos_cartera")
        .select("id", { count: "exact" })
        .eq("cliente_id", cliente.id)
        .limit(1),
      supabase
        .from("documentos")
        .select("id", { count: "exact" })
        .eq("cliente_id", cliente.id)
        .limit(1),
    ]);

    const tieneRemisiones =
      (remisionesRes.count ?? remisionesRes.data?.length ?? 0) > 0;
    const tieneAbonos = (abonosRes.count ?? abonosRes.data?.length ?? 0) > 0;
    const tieneDocumentos = (docsRes.count ?? docsRes.data?.length ?? 0) > 0;
    const tieneSaldo = cliente.saldo_cartera > 0;

    if (tieneSaldo || tieneRemisiones || tieneAbonos || tieneDocumentos) {
      if (!cliente.activo) {
        throw new GuardadoClienteError(
          "Este cliente ya está inactivo y no puede eliminarse físicamente porque posee historial de remisiones, abonos, documentos o saldo en cartera.",
        );
      }
      const actualizado = await this.cambiarEstadoActivo(cliente, false);
      return {
        accion: "DESACTIVADO",
        cliente: actualizado,
        mensaje:
          "El cliente tiene historial financiero o comercial (remisiones, abonos o saldo). Se desactivó lógicamente para conservar sus registros.",
      };
    }

    await supabase.from("precios_cliente").delete().eq("cliente_id", cliente.id);
    const { data, error } = await supabase
      .from("clientes")
      .delete()
      .eq("id", cliente.id)
      .eq("saldo_cartera", 0)
      .select("id");

    if (error) {
      if (error.code === "23503") {
        if (!cliente.activo) {
          throw new GuardadoClienteError(
            "Este cliente tiene relaciones históricas y ya se encuentra inactivo.",
          );
        }
        const actualizado = await this.cambiarEstadoActivo(cliente, false);
        return {
          accion: "DESACTIVADO",
          cliente: actualizado,
          mensaje:
            "El cliente tiene registros asociados. Se desactivó lógicamente para proteger el historial financiero.",
        };
      }
      throw new GuardadoClienteError(error.message);
    }

    if (!data?.length) {
      throw new GuardadoClienteError(
        "El cliente cambió o ya no está disponible para eliminar.",
      );
    }

    return {
      accion: "ELIMINADO",
      cliente: null,
      mensaje: "Cliente eliminado permanentemente.",
    };
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
    uuidSchema.parse(clienteId);
    uuidSchema.parse(productoId);
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
