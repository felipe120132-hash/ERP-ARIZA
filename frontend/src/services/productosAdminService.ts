import { z } from "zod";
import { supabase } from "./supabaseClient";
import { productoSchema, type Producto } from "@/types/schemas";

const decimal = z
  .number()
  .finite()
  .min(0)
  .max(9999999999.99)
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.0001,
    "Usa máximo dos decimales.",
  );
export const datosProducto = z
  .object({
    sku: z.string().trim().min(1, "Escribe el SKU.").max(100),
    nombre: z.string().trim().min(1, "Escribe el nombre.").max(200),
    categoria: z.string().trim().min(1, "Escribe la categoría.").max(100),
    origen: z.string().trim().max(100).nullable(),
    precio_tienda: decimal,
    precio_distribuidor: decimal,
    tasa_iva: z.union([z.literal(0), z.literal(5), z.literal(19)]),
    stock_minimo: decimal,
    activo: z.boolean(),
  })
  .strict();
export type DatosProducto = z.infer<typeof datosProducto>;
export class GuardadoProductoError extends Error {
  constructor(
    message: string,
    public incierto = false,
  ) {
    super(message);
  }
}
export async function verificarAdminProductos() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    throw new GuardadoProductoError("La sesión no está disponible.");
  const p = await supabase
    .from("perfiles")
    .select("rol,activo")
    .eq("id", data.user.id)
    .single();
  if (p.error || p.data?.rol !== "ADMIN" || !p.data.activo)
    throw new GuardadoProductoError(
      "Solo administradores activos pueden guardar productos.",
    );
}
function fallo(error: { code?: string; message: string }, status: number) {
  const message =
    error.code === "23505"
      ? "Ese SKU ya existe. Usa uno diferente."
      : status === 401 || status === 403
        ? "No tienes permisos para guardar este producto."
        : error.code === "PGRST116"
          ? "El producto cambió o no está disponible. Actualiza antes de editar."
          : "No se pudo guardar el producto. " + error.message;
  throw new GuardadoProductoError(message, !(status >= 400 && status < 500));
}
export const productosAdminService = {
  async listar() {
    const all: Producto[] = [];
    let expected: number | null = null;
    while (true) {
      const { data, error, count } = await supabase
        .from("productos")
        .select("*", { count: "exact" })
        .order("id")
        .range(all.length, all.length + 499);
      if (error) throw new Error("No pudimos consultar los productos.");
      if (count === null || (expected !== null && expected !== count))
        throw new Error(
          "El listado cambió o está incompleto. Actualiza los productos.",
        );
      expected = count;
      const rows = z.array(productoSchema).parse(data);
      all.push(...rows);
      if (all.length === count)
        return all.sort((a, b) => a.nombre.localeCompare(b.nombre));
      if (!rows.length || all.length > count)
        throw new Error("No pudimos consultar el listado completo.");
    }
  },
  async guardar(
    id: string,
    input: DatosProducto,
    previous: Producto | null,
    onSend: () => void,
  ) {
    z.string().uuid().parse(id);
    const values = datosProducto.parse(input);
    await verificarAdminProductos();
    onSend();
    let q = previous
      ? supabase.from("productos").update(values).eq("id", id)
      : supabase.from("productos").insert({ id, ...values });
    // Compare editable fields, leaving inventory movements free to update stock.
    if (previous)
      for (const name of Object.keys(values) as (keyof DatosProducto)[]) {
        const old = previous[name];
        q = old === null ? q.is(name, null) : q.eq(name, old);
      }
    const { data, error, status } = await q.select("*").single();
    if (error) fallo(error, status);
    const parsed = productoSchema.safeParse(data);
    if (!parsed.success || parsed.data.id !== id)
      throw new GuardadoProductoError(
        "La respuesta del guardado no pudo verificarse.",
        true,
      );
    return parsed.data;
  },
  async imagen(
    producto: Producto,
    file: File,
    path: string,
    onSend: () => void,
  ) {
    await validarFotoProducto(file);
    await verificarAdminProductos();
    if (
      !path.startsWith(`productos/${producto.id}/`) ||
      !/^productos\/[\da-f-]+\/[\da-f-]+\.(jpg|png|webp)$/.test(path)
    )
      throw new Error("Ruta de imagen inválida.");
    onSend();
    const upload = await supabase.storage
      .from("productos-imagenes")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (upload.error)
      throw new GuardadoProductoError(
        "No se pudo confirmar la subida de la foto. Consulta el producto antes de volver a intentar.",
        true,
      );
    let q = supabase
      .from("productos")
      .update({ imagen_path: path })
      .eq("id", producto.id);
    q =
      producto.imagen_path === null
        ? q.is("imagen_path", null)
        : q.eq("imagen_path", producto.imagen_path);
    const { data, error } = await q.select("*").single();
    if (error)
      throw new GuardadoProductoError(
        "La foto se subió, pero no se confirmó su asociación al producto. Consulta el resultado antes de intentar otra vez.",
        true,
      );
    const parsed = productoSchema.safeParse(data);
    if (
      !parsed.success ||
      parsed.data.id !== producto.id ||
      parsed.data.imagen_path !== path
    )
      throw new GuardadoProductoError(
        "No se pudo verificar la foto guardada.",
        true,
      );
    return parsed.data;
  },
};
export const extensionesFoto: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export async function validarFotoProducto(file: File) {
  if (!extensionesFoto[file.type])
    throw new Error("Selecciona una imagen JPG, PNG o WebP.");
  if (!file.size || file.size > 5 * 1024 * 1024)
    throw new Error("La imagen debe pesar entre 1 byte y 5 MB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches =
    file.type === "image/jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : file.type === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
        : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!matches)
    throw new Error(
      "El contenido del archivo no corresponde a su formato de imagen.",
    );
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("La imagen está dañada o no se puede abrir.");
  }
  const tooBig =
    bitmap.width > 8000 ||
    bitmap.height > 8000 ||
    bitmap.width * bitmap.height > 25000000;
  bitmap.close();
  if (tooBig)
    throw new Error(
      "Usa una imagen de hasta 8000 píxeles por lado y 25 megapíxeles.",
    );
}
