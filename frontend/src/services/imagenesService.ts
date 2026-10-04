import { supabase } from "./supabaseClient";
export async function obtenerImagenes(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data, error } = await supabase.storage
    .from("productos-imagenes")
    .createSignedUrls([...new Set(paths)], 3600);
  if (error) return {} as Record<string, string>;
  return Object.fromEntries(
    (data ?? [])
      .filter((item) => item.path && item.signedUrl)
      .map((item) => [item.path!, item.signedUrl!]),
  );
}
